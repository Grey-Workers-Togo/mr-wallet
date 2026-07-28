import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AccountsService } from '../../accounts/accounts.service';
import { AccountsFacade } from '../../accounts/accounts.facade';
import { CategoriesService } from '../../categories/categories.service';
import { CategoriesFacade } from '../../categories/categories.facade';
import { RulesService } from '../../rules/rules.service';
import { RulesFacade } from '../../rules/rules.facade';
import { TransactionsService } from '../../transactions/transactions.service';
import { TransactionsFacade } from '../../transactions/transactions.facade';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import { NotificationsService } from '../notifications.service';

describe('notifications', () => {
  const prisma = new PrismaService();
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const transactionsFacade = new TransactionsFacade(
    new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, new EventEmitter2()),
  );
  const recurrenceFacade = new RecurrenceFacade(new RecurrenceService(prisma, transactionsFacade));
  const service = new NotificationsService(prisma, recurrenceFacade);

  let userId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({ data: { email: `notif-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.notificationPreference.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('RG-N1: creating twice for the same (type, entity) only stores one notification', async () => {
    await service.create({
      userId,
      type: 'BUDGET_THRESHOLD',
      params: { budgetName: 'Food', percentUsed: 80 },
      entityType: 'BudgetPeriod',
      entityId: 'period-1',
    });
    await service.create({
      userId,
      type: 'BUDGET_THRESHOLD',
      params: { budgetName: 'Food', percentUsed: 85 },
      entityType: 'BudgetPeriod',
      entityId: 'period-1',
    });

    const list = await service.list(userId, false);
    expect(list).toHaveLength(1);
  });

  it('RG-N8: push is disabled by default, in-app is enabled', async () => {
    const preferences = await service.preferences(userId);
    const budgetPref = preferences.find((p) => p.type === 'BUDGET_THRESHOLD');
    expect(budgetPref?.inAppEnabled).toBe(true);
    expect(budgetPref?.pushEnabled).toBe(false);
  });

  it('disabling in-app for a type suppresses new notifications of that type', async () => {
    await service.updatePreferences(userId, [{ type: 'BUDGET_EXCEEDED', inAppEnabled: false }]);
    await service.create({ userId, type: 'BUDGET_EXCEEDED', params: {}, entityType: 'BudgetPeriod', entityId: 'period-2' });
    const list = await service.list(userId, false);
    expect(list.find((n) => n.type === 'BUDGET_EXCEEDED')).toBeUndefined();
  });
});
