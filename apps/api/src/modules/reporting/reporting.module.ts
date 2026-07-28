import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { DebtsModule } from '../debts/debts.module';
import { CurrencyModule } from '../currency/currency.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { ReportingFacade } from './reporting.facade';

@Module({
  imports: [AccountsModule, DebtsModule, CurrencyModule, BudgetsModule],
  controllers: [ReportingController],
  providers: [ReportingService, ReportingFacade],
  exports: [ReportingFacade],
})
export class ReportingModule {}
