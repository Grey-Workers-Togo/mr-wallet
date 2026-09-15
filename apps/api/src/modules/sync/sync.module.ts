import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { CategoriesModule } from '../categories/categories.module';
import { TagsModule } from '../tags/tags.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { GoalsModule } from '../goals/goals.module';
import { DebtsModule } from '../debts/debts.module';
import { RecurrenceModule } from '../recurrence/recurrence.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

/**
 * Cross-cutting: depends on every business module's facade, depended on by none
 * (docs/02-architecture.md § 4). Owns no business rule of its own (docs/14-sync-protocol.md § 5).
 */
@Module({
  imports: [
    AccountsModule,
    TransactionsModule,
    CategoriesModule,
    TagsModule,
    BudgetsModule,
    GoalsModule,
    DebtsModule,
    RecurrenceModule,
    NotificationsModule,
  ],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
