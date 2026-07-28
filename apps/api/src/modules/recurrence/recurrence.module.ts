import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { RecurrenceController } from './recurrence.controller';
import { RecurrenceService } from './recurrence.service';
import { RecurrenceFacade } from './recurrence.facade';

@Module({
  imports: [TransactionsModule],
  controllers: [RecurrenceController],
  providers: [RecurrenceService, RecurrenceFacade],
  exports: [RecurrenceFacade],
})
export class RecurrenceModule {}
