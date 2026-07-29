import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';
import { DebtsFacade } from './debts.facade';

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [DebtsController],
  providers: [DebtsService, DebtsFacade],
  exports: [DebtsFacade],
})
export class DebtsModule {}
