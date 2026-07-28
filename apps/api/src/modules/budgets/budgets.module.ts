import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetsFacade } from './budgets.facade';

@Module({
  imports: [CategoriesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetsFacade],
  exports: [BudgetsFacade],
})
export class BudgetsModule {}
