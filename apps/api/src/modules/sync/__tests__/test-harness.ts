import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RawPrismaService } from '../../../common/prisma/prisma.service';
import { MailService } from '../../../common/mail/mail.service';
import { AccountsService } from '../../accounts/accounts.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { TransactionsService } from '../../transactions/transactions.service';
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { CategoriesService } from '../../categories/categories.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { TagsService } from '../../tags/tags.service';
import { TagsFacade } from '../../tags/tags.facade';
import { RulesService } from '../../rules/rules.service';
import { RulesFacade } from '../../rules/rules.facade';
import { BudgetsService } from '../../budgets/budgets.service';
import { BudgetsFacade } from '../../budgets/budgets.facade';
import { GoalsService } from '../../goals/goals.service';
import { GoalsFacade } from '../../goals/goals.facade';
import { DebtsService } from '../../debts/debts.service';
import { DebtsFacade } from '../../debts/debts.facade';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationsFacade } from '../../notifications/notifications.facade';
import { ReconciliationService } from '../../reconciliation/reconciliation.service';
import { ReconciliationFacade } from '../../reconciliation/reconciliation.facade';
import { SyncService } from '../sync.service';

/**
 * Wires every dependency SyncService needs by hand (no Nest DI container), the same way the
 * existing *.isolation.spec.ts files construct a single service directly against the real dev
 * database (docs/10-conventions-dev.md § 6).
 */
export function buildSyncTestHarness(prisma: PrismaService, raw: RawPrismaService) {
  const events = new EventEmitter2();
  const config = new ConfigService({
    SMTP_FROM: 'Test <test@example.com>',
    MIN_CLIENT_VERSION_WEB: '0.0.0',
    MIN_CLIENT_VERSION_IOS: '0.0.0',
    MIN_CLIENT_VERSION_ANDROID: '0.0.0',
  });

  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const tagsFacade = new TagsFacade(new TagsService(prisma));

  const transactionsService = new TransactionsService(
    prisma,
    accountsFacade,
    categoriesFacade,
    rulesFacade,
    events,
    new SavedSearchesService(prisma),
  );
  const transactionsFacade = new TransactionsFacade(transactionsService);

  const budgetsFacade = new BudgetsFacade(new BudgetsService(prisma, categoriesFacade, events));
  const goalsFacade = new GoalsFacade(new GoalsService(prisma, accountsFacade, transactionsFacade, events));
  const debtsFacade = new DebtsFacade(new DebtsService(prisma, accountsFacade, transactionsFacade, events));
  const recurrenceFacade = new RecurrenceFacade(new RecurrenceService(prisma, transactionsFacade));

  const notificationsFacade = new NotificationsFacade(
    new NotificationsService(prisma, recurrenceFacade, config, new MailService(config)),
  );
  const reconciliationFacade = new ReconciliationFacade(
    new ReconciliationService(prisma, accountsFacade, transactionsFacade, categoriesFacade, events),
  );

  const syncService = new SyncService(
    prisma,
    raw,
    config,
    accountsFacade,
    transactionsFacade,
    categoriesFacade,
    tagsFacade,
    budgetsFacade,
    goalsFacade,
    debtsFacade,
    recurrenceFacade,
    notificationsFacade,
    reconciliationFacade,
  );

  return {
    syncService,
    accountsFacade,
    transactionsFacade,
    categoriesFacade,
    tagsFacade,
    budgetsFacade,
    goalsFacade,
    debtsFacade,
    recurrenceFacade,
    notificationsFacade,
    reconciliationFacade,
  };
}
