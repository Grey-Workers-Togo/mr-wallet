import { Module } from '@nestjs/common';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { DebtsModule } from '../debts/debts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ReportingModule } from '../reporting/reporting.module';
import { ForecastingController } from './forecasting.controller';
import { ForecastingService } from './forecasting.service';

@Module({
  imports: [RecurrenceModule, DebtsModule, TransactionsModule, ReportingModule],
  controllers: [ForecastingController],
  providers: [ForecastingService],
})
export class ForecastingModule {}
