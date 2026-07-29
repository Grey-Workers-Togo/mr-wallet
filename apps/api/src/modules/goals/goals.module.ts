import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { GoalsFacade } from './goals.facade';

@Module({
  imports: [AccountsModule, TransactionsModule],
  controllers: [GoalsController],
  providers: [GoalsService, GoalsFacade],
  exports: [GoalsFacade],
})
export class GoalsModule {}
