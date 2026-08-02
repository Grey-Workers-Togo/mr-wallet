import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccountsFacade } from '../accounts/accounts.facade';
import { DebtsFacade } from '../debts/debts.facade';
import { CurrencyFacade } from '../currency/currency.facade';
import { BudgetsFacade } from '../budgets/budgets.facade';
import { consolidateToBase } from './domain/consolidate';
import { computeStreak, Streak } from './domain/streak';
import { ComparisonDto, DateRangeDto, MonthlySummaryDto, TopTransactionsDto } from './dto/report.dto';

interface MonthRow {
  month: Date;
  type: 'EXPENSE' | 'INCOME';
  currency: string;
  total: bigint;
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

  /** RG-RP1: aggregated in SQL via `groupBy`, never loaded row-by-row into memory. */
  async spendingByCategory(userId: string, range: DateRangeDto) {
    const baseCurrency = await this.baseCurrency(userId);
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId', 'currency'],
      where: {
        userId,
        type: 'EXPENSE',
        transferGroupId: null,
        ...((range.from || range.to) && {
          occurredAt: { ...(range.from && { gte: range.from }), ...(range.to && { lte: range.to }) },
        }),
      },
      _sum: { amountMinor: true },
    });

    const byCategory = new Map<string | null, { currency: string; amountMinor: bigint }[]>();
    for (const row of rows) {
      const list = byCategory.get(row.categoryId) ?? [];
      list.push({ currency: row.currency, amountMinor: row._sum.amountMinor ?? 0n });
      byCategory.set(row.categoryId, list);
    }

    const at = range.to ?? new Date();
    const lookup = this.rateLookup(userId, baseCurrency, at);
    const items: { categoryId: string | null; totalMinor: string }[] = [];
    let grandTotal = 0n;
    for (const [categoryId, amounts] of byCategory) {
      const totalMinor = await consolidateToBase(amounts, baseCurrency, lookup);
      items.push({ categoryId, totalMinor: totalMinor.toString() });
      grandTotal += totalMinor;
    }

    return {
      currency: baseCurrency,
      totalMinor: grandTotal.toString(),
      items: items.map((item) => ({
        ...item,
        pct: grandTotal > 0n ? Number((BigInt(item.totalMinor) * 10000n) / grandTotal) / 100 : 0,
      })),
    };
  }

  private async monthlyRows(userId: string, from: Date, to: Date): Promise<MonthRow[]> {
    // `pg` returns NUMERIC/BIGINT aggregates as strings, never as JS bigint — cast explicitly.
    const rows = await this.prisma.$queryRaw<{ month: Date; type: 'EXPENSE' | 'INCOME'; currency: string; total: string }[]>(Prisma.sql`
      SELECT date_trunc('month', "occurredAt") AS month, "type" AS type, "currency" AS currency, SUM("amountMinor")::text AS total
      FROM "Transaction"
      WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "transferGroupId" IS NULL
        AND "occurredAt" >= ${from} AND "occurredAt" < ${to}
      GROUP BY month, "type", "currency"
      ORDER BY month ASC
    `);
    return rows.map((r) => ({ ...r, total: BigInt(r.total) }));
  }

  private async consolidateMonths(userId: string, baseCurrency: string, rows: MonthRow[], from: Date, to: Date) {
    const months: { month: string; incomeMinor: string; expenseMinor: string; netMinor: string }[] = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

    while (cursor.getTime() <= end.getTime()) {
      const key = cursor.toISOString().slice(0, 7);
      const monthRows = rows.filter((r) => new Date(r.month).toISOString().slice(0, 7) === key);
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

  async monthlySummary(userId: string, dto: MonthlySummaryDto) {
    const baseCurrency = await this.baseCurrency(userId);
    const to = new Date();
    const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - dto.months + 1, 1));
    const rows = await this.monthlyRows(userId, from, to);
    return { currency: baseCurrency, months: await this.consolidateMonths(userId, baseCurrency, rows, from, to) };
  }

  async cashflow(userId: string, range: DateRangeDto) {
    const baseCurrency = await this.baseCurrency(userId);
    const to = range.to ?? new Date();
    const from = range.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
    const rows = await this.monthlyRows(userId, from, to);
    return { currency: baseCurrency, months: await this.consolidateMonths(userId, baseCurrency, rows, from, to) };
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

  async comparison(userId: string, dto: ComparisonDto) {
    const baseCurrency = await this.baseCurrency(userId);
    const currentRows = await this.monthlyRows(userId, dto.currentFrom, dto.currentTo);
    const previousRows = await this.monthlyRows(userId, dto.previousFrom, dto.previousTo);

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

    return {
      currency: baseCurrency,
      current: { incomeMinor: currentIncome.toString(), expenseMinor: currentExpense.toString() },
      previous: { incomeMinor: previousIncome.toString(), expenseMinor: previousExpense.toString() },
      deltaIncomeMinor: (currentIncome - previousIncome).toString(),
      deltaExpenseMinor: (currentExpense - previousExpense).toString(),
    };
  }

  topTransactions(userId: string, dto: TopTransactionsDto) {
    return this.prisma.transaction.findMany({
      where: {
        userId,
        type: 'EXPENSE',
        transferGroupId: null,
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
