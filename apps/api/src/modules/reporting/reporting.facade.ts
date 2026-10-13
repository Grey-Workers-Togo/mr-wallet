import { Injectable } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import type { ComparisonDto, DateRangeDto, MonthlySummaryDto, TopTransactionsDto } from './dto/report.dto';

/**
 * Public interface of the `reporting` module (docs/02-architecture.md §4) — consumed by `forecasting`
 * and `assistant`. The report methods are pass-throughs to the service the endpoints already use
 * (ADR-0016 §1): same computation, same result, no second implementation.
 */
@Injectable()
export class ReportingFacade {
  constructor(private readonly reportingService: ReportingService) {}

  netWorth(userId: string) {
    return this.reportingService.netWorth(userId);
  }

  spendingByCategory(userId: string, range: DateRangeDto) {
    return this.reportingService.spendingByCategory(userId, range);
  }

  monthlySummary(userId: string, dto: MonthlySummaryDto) {
    return this.reportingService.monthlySummary(userId, dto);
  }

  cashflow(userId: string, range: DateRangeDto) {
    return this.reportingService.cashflow(userId, range);
  }

  comparison(userId: string, dto: ComparisonDto) {
    return this.reportingService.comparison(userId, dto);
  }

  topTransactions(userId: string, dto: TopTransactionsDto, options?: { excludeAdjustments?: boolean }) {
    return this.reportingService.topTransactions(userId, dto, options);
  }

  budgetVsActual(userId: string) {
    return this.reportingService.budgetVsActual(userId);
  }
}
