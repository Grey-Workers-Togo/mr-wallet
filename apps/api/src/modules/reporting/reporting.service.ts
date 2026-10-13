import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountsFacade } from '../accounts/accounts.facade';
import { DebtsFacade } from '../debts/debts.facade';
import { CurrencyFacade } from '../currency/currency.facade';
import { BudgetsFacade } from '../budgets/budgets.facade';
import { consolidateToBase } from './domain/consolidate';
import { isValidTimeZone, localMonthKey, localMonthStart } from './domain/local-month';
import { computeStreak, Streak } from './domain/streak';
import { ComparisonDto, DateRangeDto, MonthlySummaryDto, TopTransactionsDto } from './dto/report.dto';

interface MonthRow {
  /** `YYYY-MM` in the user's timezone. */
  key: string;
  type: 'EXPENSE' | 'INCOME';
  currency: string;
  total: bigint;
}

interface AdjustmentTotals {
  incomeMinor: string;
  expenseMinor: string;
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly debtsFacade: DebtsFacade,
    private readonly currencyFacade: CurrencyFacade,
    private readonly budgetsFacade: BudgetsFacade,
  ) {}

  private async baseCurrency(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { baseCurrency: true } });
    return user.baseCurrency;
  }

  /**
   * Months are the user's local months (docs/02-architecture.md §7). `users.timezone` is not validated as an
   * IANA name at input (docs/QUESTIONS.md): a stored value that is not one keeps the report working,
   * bucketed by UTC as before, rather than failing it.
   */
  private async reportingTimeZone(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    return isValidTimeZone(user.timezone) ? user.timezone : 'UTC';
  }

  /** RG-RP2 (simplified — docs/QUESTIONS.md): one applicable rate per currency, not per transaction. */
  private rateLookup(userId: string, baseCurrency: string, at: Date) {
    return async (currency: string) => {
      const [rate, fromMinorUnits, toMinorUnits] = await Promise.all([
        this.currencyFacade.getApplicableRate(userId, currency, baseCurrency, at),
        this.currencyFacade.getMinorUnits(currency),
        this.currencyFacade.getMinorUnits(baseCurrency),
      ]);
      return { rate: rate.rate, fromMinorUnits, toMinorUnits };
    };
  }

  /** `categoryId` to `parentId` for the user's subcategories; a top-level category is absent. */
  private async parentIds(userId: string): Promise<Map<string, string>> {
    const categories = await this.prisma.category.findMany({
      where: { userId, parentId: { not: null } },
      select: { id: true, parentId: true },
    });
    return new Map(categories.flatMap((c) => (c.parentId === null ? [] : [[c.id, c.parentId] as const])));
  }

  /**
   * RG-RP1: aggregated in SQL via `groupBy`, never loaded row-by-row into memory.
   * RG-A10 (lot 19): a reconciliation adjustment is not identified spending — excluded from the
   * per-category breakdown, surfaced instead as its own explicit `unaccountedMinor` line.
   *
   * `includeDescendants` (optional, off by default): each item also carries what is booked on its
   * subcategories, and says which category it sits under (`parentId`). A subcategory stays listed on its
   * own, so items overlap; `totalMinor` is still the true total, counted once. The assistant sets it;
   * the existing endpoint is unchanged.
   */
  async spendingByCategory(userId: string, range: DateRangeDto, options: { includeDescendants?: boolean } = {}) {
    const baseCurrency = await this.baseCurrency(userId);
    const dateFilter = (range.from || range.to) && {
      occurredAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) },
    };
    const [rows, adjustmentRows] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['categoryId', 'currency'],
        where: { userId, type: 'EXPENSE', transferGroupId: null, source: { not: 'ADJUSTMENT' }, ...dateFilter },
        _sum: { amountMinor: true },
      }),
      this.prisma.transaction.groupBy({
        by: ['currency'],
        where: { userId, type: 'EXPENSE', transferGroupId: null, source: 'ADJUSTMENT', ...dateFilter },
        _sum: { amountMinor: true },
      }),
    ]);

    const byCategory = new Map<string | null, { currency: string; amountMinor: bigint }[]>();
    for (const row of rows) {
      const list = byCategory.get(row.categoryId) ?? [];
      list.push({ currency: row.currency, amountMinor: row._sum.amountMinor ?? 0n });
      byCategory.set(row.categoryId, list);
    }

    const at = range.to ?? new Date();
    const lookup = this.rateLookup(userId, baseCurrency, at);
    const items: { categoryId: string | null; totalMinor: string; parentId?: string | null }[] = [];
    let grandTotal = 0n;
    for (const [categoryId, amounts] of byCategory) {
      const totalMinor = await consolidateToBase(amounts, baseCurrency, lookup);
      grandTotal += totalMinor;
      if (!options.includeDescendants) items.push({ categoryId, totalMinor: totalMinor.toString() });
    }

    if (options.includeDescendants) {
      // A subcategory's amounts join its parent's before consolidation: one conversion per currency,
      // so the parent's figure is what consolidating the whole family would give.
      const parentOf = await this.parentIds(userId);
      const family = new Map<string | null, { currency: string; amountMinor: bigint }[]>();
      const add = (categoryId: string | null, amounts: { currency: string; amountMinor: bigint }[]) => {
        family.set(categoryId, [...(family.get(categoryId) ?? []), ...amounts]);
      };
      for (const [categoryId, amounts] of byCategory) {
        add(categoryId, amounts);
        const parentId = categoryId === null ? null : (parentOf.get(categoryId) ?? null);
        if (parentId !== null) add(parentId, amounts);
      }
      for (const [categoryId, amounts] of family) {
        const totalMinor = await consolidateToBase(amounts, baseCurrency, lookup);
        const parentId = categoryId === null ? null : (parentOf.get(categoryId) ?? null);
        items.push({ categoryId, totalMinor: totalMinor.toString(), parentId });
      }
    }

    const unaccountedMinor = await consolidateToBase(
      adjustmentRows.map((row) => ({ currency: row.currency, amountMinor: row._sum.amountMinor ?? 0n })),
      baseCurrency,
      lookup,
    );

    return {
      currency: baseCurrency,
      totalMinor: grandTotal.toString(),
      unaccountedMinor: unaccountedMinor.toString(),
      items: items.map((item) => ({
        ...item,
        pct: grandTotal > 0n ? Number((BigInt(item.totalMinor) * 10000n) / grandTotal) / 100 : 0,
      })),
    };
  }

  private async monthlyRows(
    userId: string,
    from: Date,
    to: Date,
    timeZone: string,
    excludeAdjustments = false,
  ): Promise<MonthRow[]> {
    // `pg` returns NUMERIC/BIGINT aggregates as strings, never as JS bigint — cast explicitly.
    // The month is cut in the user's timezone: `date_trunc` alone would use the database session's.
    const rows = await this.prisma.$queryRaw<{ key: string; type: 'EXPENSE' | 'INCOME'; currency: string; total: string }[]>(Prisma.sql`
      SELECT to_char(date_trunc('month', "occurredAt" AT TIME ZONE ${timeZone}), 'YYYY-MM') AS key,
        "type" AS type, "currency" AS currency, SUM("amountMinor")::text AS total
      FROM "Transaction"
      WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "transferGroupId" IS NULL
        AND "occurredAt" >= ${from} AND "occurredAt" < ${to}
        ${excludeAdjustments ? Prisma.sql`AND "source" <> 'ADJUSTMENT'` : Prisma.empty}
      GROUP BY key, "type", "currency"
      ORDER BY key ASC
    `);
    return rows.map((r) => ({ ...r, total: BigInt(r.total) }));
  }

  private async consolidateMonths(
    userId: string,
    baseCurrency: string,
    rows: MonthRow[],
    from: Date,
    to: Date,
    timeZone: string,
  ) {
    const months: { month: string; incomeMinor: string; expenseMinor: string; netMinor: string }[] = [];
    const [fromKey, toKey] = [localMonthKey(from, timeZone), localMonthKey(to, timeZone)];
    const cursor = new Date(Date.UTC(Number(fromKey.slice(0, 4)), Number(fromKey.slice(5, 7)) - 1, 1));
    const end = new Date(Date.UTC(Number(toKey.slice(0, 4)), Number(toKey.slice(5, 7)) - 1, 1));

    while (cursor.getTime() <= end.getTime()) {
      const key = cursor.toISOString().slice(0, 7);
      const monthRows = rows.filter((r) => r.key === key);
      const at = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      const lookup = this.rateLookup(userId, baseCurrency, at);

      const incomeMinor = await consolidateToBase(
        monthRows.filter((r) => r.type === 'INCOME').map((r) => ({ currency: r.currency, amountMinor: r.total })),
        baseCurrency,
        lookup,
      );
      const expenseMinor = await consolidateToBase(
        monthRows.filter((r) => r.type === 'EXPENSE').map((r) => ({ currency: r.currency, amountMinor: r.total })),
        baseCurrency,
        lookup,
      );

      months.push({
        month: key,
        incomeMinor: incomeMinor.toString(),
        expenseMinor: expenseMinor.toString(),
        netMinor: (incomeMinor - expenseMinor).toString(),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
  }

  /**
   * RG-A10: the reconciliation adjustments of `[from, to)`, by direction, in the base currency. What a
   * report opted into `excludeAdjustments` leaves out is shown here rather than dropped.
   */
  private async adjustmentTotals(userId: string, baseCurrency: string, from: Date, to: Date): Promise<AdjustmentTotals> {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type', 'currency'],
      where: { userId, source: 'ADJUSTMENT', transferGroupId: null, occurredAt: { gte: from, lt: to } },
      _sum: { amountMinor: true },
    });
    const lookup = this.rateLookup(userId, baseCurrency, to);
    const total = (type: 'INCOME' | 'EXPENSE') =>
      consolidateToBase(
        rows.filter((r) => r.type === type).map((r) => ({ currency: r.currency, amountMinor: r._sum.amountMinor ?? 0n })),
        baseCurrency,
        lookup,
      );
    const [income, expense] = await Promise.all([total('INCOME'), total('EXPENSE')]);
    return { incomeMinor: income.toString(), expenseMinor: expense.toString() };
  }

  async monthlySummary(userId: string, dto: MonthlySummaryDto) {
    const [baseCurrency, timeZone] = await Promise.all([this.baseCurrency(userId), this.reportingTimeZone(userId)]);
    const to = new Date();
    const from = localMonthStart(to, timeZone, dto.months - 1);
    const rows = await this.monthlyRows(userId, from, to, timeZone);
    return { currency: baseCurrency, months: await this.consolidateMonths(userId, baseCurrency, rows, from, to, timeZone) };
  }

  /**
   * `excludeAdjustments` (optional, off by default): RG-A10 — the months leave out reconciliation
   * adjustments, which come back as `unaccounted` over `[from, to)`. The assistant sets it; the existing
   * endpoint is unchanged and keeps counting them.
   */
  async cashflow(userId: string, range: DateRangeDto, options: { excludeAdjustments?: boolean } = {}) {
    const [baseCurrency, timeZone] = await Promise.all([this.baseCurrency(userId), this.reportingTimeZone(userId)]);
    const to = range.to ?? new Date();
    const from = range.from ?? localMonthStart(to, timeZone, 11);
    const rows = await this.monthlyRows(userId, from, to, timeZone, options.excludeAdjustments);
    const months = await this.consolidateMonths(userId, baseCurrency, rows, from, to, timeZone);
    if (!options.excludeAdjustments) return { currency: baseCurrency, months };
    return { currency: baseCurrency, months, unaccounted: await this.adjustmentTotals(userId, baseCurrency, from, to) };
  }

  /** RG-RP3/RG-RP4: reconstructed from live account balances and debts — never a stored snapshot. */
  async netWorth(userId: string) {
    const baseCurrency = await this.baseCurrency(userId);
    const at = new Date();
    const lookup = this.rateLookup(userId, baseCurrency, at);

    const accounts = await this.accountsFacade.list(userId);
    const eligible = accounts.filter((a) => a.includeInNetWorth);
    const assetsFromAccounts = await consolidateToBase(
      eligible.map((a) => ({ currency: a.currency, amountMinor: a.currentBalanceMinor })),
      baseCurrency,
      lookup,
    );

    const debtSummary = await this.debtsFacade.summary(userId);
    const receivables = await consolidateToBase(
      debtSummary.map((d) => ({ currency: d.currency, amountMinor: BigInt(d.owedToMeMinor) })),
      baseCurrency,
      lookup,
    );
    const payables = await consolidateToBase(
      debtSummary.map((d) => ({ currency: d.currency, amountMinor: BigInt(d.owedByMeMinor) })),
      baseCurrency,
      lookup,
    );

    return {
      currency: baseCurrency,
      assetsMinor: (assetsFromAccounts + receivables).toString(),
      liabilitiesMinor: payables.toString(),
      netWorthMinor: (assetsFromAccounts + receivables - payables).toString(),
    };
  }

  /** `excludeAdjustments`: as for `cashflow`; the adjustments come back as `unaccounted`, per period. */
  async comparison(userId: string, dto: ComparisonDto, options: { excludeAdjustments?: boolean } = {}) {
    const [baseCurrency, timeZone] = await Promise.all([this.baseCurrency(userId), this.reportingTimeZone(userId)]);
    const exclude = options.excludeAdjustments;
    const currentRows = await this.monthlyRows(userId, dto.currentFrom, dto.currentTo, timeZone, exclude);
    const previousRows = await this.monthlyRows(userId, dto.previousFrom, dto.previousTo, timeZone, exclude);

    const sum = async (rows: MonthRow[], type: 'INCOME' | 'EXPENSE', at: Date) =>
      consolidateToBase(
        rows.filter((r) => r.type === type).map((r) => ({ currency: r.currency, amountMinor: r.total })),
        baseCurrency,
        this.rateLookup(userId, baseCurrency, at),
      );

    const [currentIncome, currentExpense, previousIncome, previousExpense] = await Promise.all([
      sum(currentRows, 'INCOME', dto.currentTo),
      sum(currentRows, 'EXPENSE', dto.currentTo),
      sum(previousRows, 'INCOME', dto.previousTo),
      sum(previousRows, 'EXPENSE', dto.previousTo),
    ]);

    const report: {
      currency: string;
      current: { incomeMinor: string; expenseMinor: string };
      previous: { incomeMinor: string; expenseMinor: string };
      deltaIncomeMinor: string;
      deltaExpenseMinor: string;
      unaccounted?: { current: AdjustmentTotals; previous: AdjustmentTotals };
    } = {
      currency: baseCurrency,
      current: { incomeMinor: currentIncome.toString(), expenseMinor: currentExpense.toString() },
      previous: { incomeMinor: previousIncome.toString(), expenseMinor: previousExpense.toString() },
      deltaIncomeMinor: (currentIncome - previousIncome).toString(),
      deltaExpenseMinor: (currentExpense - previousExpense).toString(),
    };
    if (!exclude) return report;
    const [current, previous] = await Promise.all([
      this.adjustmentTotals(userId, baseCurrency, dto.currentFrom, dto.currentTo),
      this.adjustmentTotals(userId, baseCurrency, dto.previousFrom, dto.previousTo),
    ]);
    report.unaccounted = { current, previous };
    return report;
  }

  /**
   * `excludeAdjustments` (optional, off by default): RG-A10 — a reconciliation adjustment is not an
   * identified expense. The assistant sets it; the existing endpoint is unchanged.
   */
  topTransactions(userId: string, dto: TopTransactionsDto, options: { excludeAdjustments?: boolean } = {}) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        transferGroupId: null,
        ...(options.excludeAdjustments && { source: { not: 'ADJUSTMENT' as const } }),
        ...((dto.from || dto.to) && {
          occurredAt: { ...(dto.from && { gte: dto.from }), ...(dto.to && { lte: dto.to }) },
        }),
      },
      orderBy: { amountMinor: 'desc' },
      take: dto.limit,
    });
  }

  async budgetVsActual(userId: string) {
    const current = await this.budgetsFacade.current(userId);
    return current.map(({ budget, period }) => ({
      budgetId: budget.id,
      budgetName: budget.name,
      allocatedMinor: period.allocatedMinor.toString(),
      spentMinor: period.spentMinor.toString(),
      varianceMinor: (period.allocatedMinor - period.spentMinor).toString(),
    }));
  }

  /** Consecutive local-calendar days with at least one non-deleted transaction (fidelization nudge). */
  async streak(userId: string): Promise<Streak> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { timezone: true } });
    const rows = await this.prisma.transaction.findMany({
      where: { userId, deletedAt: null },
      select: { occurredAt: true },
    });
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: user.timezone });
    const dates = rows.map((row) => formatter.format(row.occurredAt));
    const today = formatter.format(new Date());
    return computeStreak(dates, today);
  }

  async dashboard(userId: string) {
    const [netWorth, budgetVsActual, monthly, streak] = await Promise.all([
      this.netWorth(userId),
      this.budgetVsActual(userId),
      this.monthlySummary(userId, { months: 1 }),
      this.streak(userId),
    ]);
    return {
      netWorth,
      budgets: budgetVsActual,
      currentMonth: monthly.months[monthly.months.length - 1] ?? null,
      streak,
    };
  }
}
