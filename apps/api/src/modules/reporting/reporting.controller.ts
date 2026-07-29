import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, RequestUser } from '../../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../../common/validation/zod-validation.pipe';
import { ReportingService } from './reporting.service';
import {
  ComparisonDto,
  DateRangeDto,
  MonthlySummaryDto,
  TopTransactionsDto,
  comparisonSchema,
  dateRangeSchema,
  monthlySummarySchema,
  topTransactionsSchema,
} from './dto/report.dto';

@Controller('reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  @Get('spending-by-category')
  spendingByCategory(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(dateRangeSchema)) query: DateRangeDto) {
    return this.reportingService.spendingByCategory(user.id, query);
  }

  @Get('monthly-summary')
  monthlySummary(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(monthlySummarySchema)) query: MonthlySummaryDto) {
    return this.reportingService.monthlySummary(user.id, query);
  }

  @Get('net-worth')
  netWorth(@CurrentUser() user: RequestUser) {
    return this.reportingService.netWorth(user.id);
  }

  @Get('cashflow')
  cashflow(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(dateRangeSchema)) query: DateRangeDto) {
    return this.reportingService.cashflow(user.id, query);
  }

  @Get('comparison')
  comparison(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(comparisonSchema)) query: ComparisonDto) {
    return this.reportingService.comparison(user.id, query);
  }

  @Get('top-transactions')
  topTransactions(@CurrentUser() user: RequestUser, @Query(new ZodValidationPipe(topTransactionsSchema)) query: TopTransactionsDto) {
    return this.reportingService.topTransactions(user.id, query);
  }

  @Get('budget-vs-actual')
  budgetVsActual(@CurrentUser() user: RequestUser) {
    return this.reportingService.budgetVsActual(user.id);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: RequestUser) {
    return this.reportingService.dashboard(user.id);
  }
}
