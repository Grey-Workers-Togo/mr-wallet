import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { RulesModule } from '../rules/rules.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionsFacade } from './transactions.facade';

@Module({
  imports: [AccountsModule, CategoriesModule, RulesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsFacade],
  exports: [TransactionsFacade],
})
export class TransactionsModule {}
