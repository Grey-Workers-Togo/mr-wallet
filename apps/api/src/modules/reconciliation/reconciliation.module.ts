import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationFacade } from './reconciliation.facade';

@Module({
  imports: [AccountsModule, TransactionsModule, CategoriesModule],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationFacade],
  exports: [ReconciliationFacade],
})
export class ReconciliationModule {}
