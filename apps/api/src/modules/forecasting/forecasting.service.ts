import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RecurrenceFacade } from '../recurrence/recurrence.facade';
import { DebtsFacade } from '../debts/debts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { ReportingFacade } from '../reporting/reporting.facade';
import { estimateMonthlyNonRecurring } from './domain/estimate';

const CACHE_TTL_MS = 60 * 60 * 1000; // RG-F1: 1h TTL.

interface ForecastMonth {
  month: string;
  balanceMinor: string;
  recurrentIncomeMinor: string;
  recurrentExpenseMinor: string;
  debtInstallmentsMinor: string;
  estimatedMinor: string;
  cashWarning: boolean;
}

interface ForecastResult {
  currency: string;
  historyIncomplete: boolean;
  months: ForecastMonth[];
}

@Injectable()
export class ForecastingService {
  private readonly cache = new Map<string, { expiresAt: number; data: ForecastResult }>();

  constructor(
    private readonly recurrenceFacade: RecurrenceFacade,
    private readonly debtsFacade: DebtsFacade,
    private readonly transactionsFacade: TransactionsFacade,
    private readonly reportingFacade: ReportingFacade,
  ) {}

  private cacheKey(userId: string, months: number): string {
    return `${userId}:${months}`;
  }

  /** RG-F1: cache invalidated by any transaction/budget/debt-related event, not just its own TTL. */
  @OnEvent(['transaction.created', 'transaction.updated', 'transaction.deleted', 'budget.threshold_crossed', 'debt.paid_off'])
  invalidateForUser(payload: { userId: string }): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${payload.userId}:`)) this.cache.delete(key);
    }
  }

  /**
   * docs/04 §I: projects the balance forward month by month from recurring income/expenses,
   * upcoming debt installments, and an estimated non-recurring expense part (RG-F2 composition,
   * RG-F3 insufficient-history flag, RG-F4 cash-flow warning). Starts from the current net worth
   * (RG-F5: an estimate, not a prediction) since `forecasting` has no direct dependency on `accounts`.
   */
  async cashflowForecast(userId: string, months: number): Promise<ForecastResult> {
    const cacheKey = this.cacheKey(userId, months);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const netWorth = await this.reportingFacade.netWorth(userId);
    const currency = netWorth.currency;
    let balance = BigInt(netWorth.netWorthMinor);

    const now = new Date();
    const horizonEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months + 1, 0));

    const [historyRows, occurrences, installments] = await Promise.all([
      this.transactionsFacade.monthlyNonRecurringExpenseTotals(userId, 6),
      this.recurrenceFacade.forecastOccurrences(userId, horizonEnd),
      this.debtsFacade.upcomingInstallments(userId, horizonEnd),
    ]);

    const historyForCurrency = historyRows.filter((r) => r.currency === currency).map((r) => r.amountMinor);
    const historyIncomplete = historyForCurrency.length < 2;
    const estimatedMonthly = historyIncomplete ? 0n : (estimateMonthlyNonRecurring(historyForCurrency) ?? 0n);

    const monthResults: ForecastMonth[] = [];
    for (let k = 1; k <= months; k += 1) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k + 1, 1));

      const inMonth = (date: Date) => date.getTime() >= monthStart.getTime() && date.getTime() < monthEnd.getTime();

      const recurrentIncomeMinor = occurrences
        .filter((o) => o.type === 'INCOME' && o.currency === currency && inMonth(o.occurrenceDate))
        .reduce((acc, o) => acc + o.amountMinor, 0n);
      const recurrentExpenseMinor = occurrences
        .filter((o) => o.type === 'EXPENSE' && o.currency === currency && inMonth(o.occurrenceDate))
        .reduce((acc, o) => acc + o.amountMinor, 0n);
      const debtInstallmentsMinor = installments
        .filter((i) => i.currency === currency && inMonth(i.dueOn))
        .reduce((acc, i) => acc + i.totalMinor, 0n);

      balance = balance + recurrentIncomeMinor - recurrentExpenseMinor - debtInstallmentsMinor - estimatedMonthly;

      monthResults.push({
        month: monthStart.toISOString().slice(0, 7),
        balanceMinor: balance.toString(),
        recurrentIncomeMinor: recurrentIncomeMinor.toString(),
        recurrentExpenseMinor: recurrentExpenseMinor.toString(),
        debtInstallmentsMinor: debtInstallmentsMinor.toString(),
        estimatedMinor: estimatedMonthly.toString(),
        cashWarning: balance < 0n, // RG-F4
      });
    }

    const result: ForecastResult = { currency, historyIncomplete, months: monthResults };
    this.cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: result });
    return result;
  }

  /** Same projection, renamed for the net-worth view (docs/04 §I lists both endpoints). */
  async netWorthForecast(userId: string, months: number) {
    const forecast = await this.cashflowForecast(userId, months);
    return {
      currency: forecast.currency,
      historyIncomplete: forecast.historyIncomplete,
      months: forecast.months.map((m) => ({
        month: m.month,
        netWorthMinor: m.balanceMinor,
        cashWarning: m.cashWarning,
      })),
    };
  }
}
