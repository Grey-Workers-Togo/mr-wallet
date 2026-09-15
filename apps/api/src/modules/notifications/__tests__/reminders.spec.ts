import { ConfigService } from '@nestjs/config';
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
import { SavedSearchesService } from '../../transactions/saved-searches.service';
import { RecurrenceService } from '../../recurrence/recurrence.service';
import { RecurrenceFacade } from '../../recurrence/recurrence.facade';
import { MailService } from '../../../common/mail/mail.service';
import { NotificationsService } from '../notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function buildService(prisma: PrismaService) {
  const accountsFacade = new AccountsFacade(new AccountsService(prisma));
  const categoriesFacade = new CategoriesFacade(new CategoriesService(prisma));
  const rulesFacade = new RulesFacade(new RulesService(prisma));
  const transactionsFacade = new TransactionsFacade(
    new TransactionsService(prisma, accountsFacade, categoriesFacade, rulesFacade, new EventEmitter2(), new SavedSearchesService(prisma)),
  );
  const recurrenceFacade = new RecurrenceFacade(new RecurrenceService(prisma, transactionsFacade));
  return {
    service: new NotificationsService(prisma, recurrenceFacade, new ConfigService(), new MailService(new ConfigService({ SMTP_FROM: 'test@example.com' }))),
    accountsFacade,
    transactionsFacade,
  };
}

/** Lot 20 (docs/04 §K, RG-N12..RG-N16) — entry and reconciliation reminders. */
describe('reminders', () => {
  const prisma = new PrismaService();
  const { service, accountsFacade, transactionsFacade } = buildService(prisma);

  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const user = await prisma.user.create({
      data: {
        email: `reminders-${Date.now()}@example.com`,
        passwordHash: 'x',
        baseCurrency: 'EUR',
        entryReminderDays: 3,
      },
    });
    userId = user.id;

    const account = await accountsFacade.create(userId, {
      name: 'Mobile money',
      type: 'MOBILE_MONEY',
      currency: 'EUR',
      openingBalanceMinor: '10000',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId } });
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('RG-N12: fires exactly once for 5 days of inactivity, not five times', async () => {
    const entry = await transactionsFacade.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '500',
      occurredAt: new Date('2026-02-01'),
      description: 'Coffee',
      status: 'CLEARED',
      tagIds: [],
    });
    const entryAt = new Date();
    await prisma.transaction.update({ where: { id: entry.id }, data: { createdAt: entryAt } });

    const fiveDaysLater = new Date(entryAt.getTime() + 5 * DAY_MS);

    // Two runs of the same day-5 "now" simulate the job running daily without a new entry —
    // RG-N13 requires exactly one notification for the whole streak, not one per run.
    await service.notifyEntryReminders(fiveDaysLater, userId);
    await service.notifyEntryReminders(fiveDaysLater, userId);

    const list = await prisma.notification.findMany({ where: { userId, type: 'ENTRY_REMINDER' } });
    expect(list).toHaveLength(1);
    expect(list[0]?.params).toMatchObject({ daysSinceLastEntry: 5 });
  }, 20_000);

  it('RG-N13: re-arms after a new entry, so a later stale streak reminds again', async () => {
    const secondEntry = await transactionsFacade.create(userId, {
      accountId,
      type: 'EXPENSE',
      amountMinor: '300',
      occurredAt: new Date('2026-02-10'),
      description: 'Bread',
      status: 'CLEARED',
      tagIds: [],
    });
    const secondEntryAt = new Date();
    await prisma.transaction.update({ where: { id: secondEntry.id }, data: { createdAt: secondEntryAt } });

    const fourDaysAfterSecondEntry = new Date(secondEntryAt.getTime() + 4 * DAY_MS);
    await service.notifyEntryReminders(fourDaysAfterSecondEntry, userId);

    const list = await prisma.notification.findMany({ where: { userId, type: 'ENTRY_REMINDER' } });
    expect(list).toHaveLength(2);
  }, 20_000);

  it('RG-N12: entryReminderDays = null disables the reminder for that user', async () => {
    const other = await prisma.user.create({
      data: { email: `reminders-off-${Date.now()}@example.com`, passwordHash: 'x', baseCurrency: 'EUR', entryReminderDays: null },
    });
    await service.notifyEntryReminders(new Date(Date.now() + 365 * DAY_MS), other.id);
    const list = await prisma.notification.findMany({ where: { userId: other.id, type: 'ENTRY_REMINDER' } });
    expect(list).toHaveLength(0);
    await prisma.user.deleteMany({ where: { id: other.id } });
  }, 20_000);

  it('RG-N14: the reminder payload never carries an amount', async () => {
    const list = await prisma.notification.findFirst({ where: { userId, type: 'ENTRY_REMINDER' } });
    const params = list?.params as Record<string, unknown>;
    expect(Object.keys(params)).toEqual(['daysSinceLastEntry']);
  });

  it('RG-N16: the in-app reminder still fires even with push disabled by default', async () => {
    const prefs = await service.preferences(userId);
    const entryPref = prefs.find((p) => p.type === 'ENTRY_REMINDER');
    expect(entryPref?.inAppEnabled).toBe(true);
    expect(entryPref?.pushEnabled).toBe(false);
  });

  it('RG-N15: reconcile reminder fires for a MOBILE_MONEY account never reconciled', async () => {
    await service.notifyReconcileReminders(new Date('2026-03-01'), userId);
    const list = await prisma.notification.findMany({ where: { userId, type: 'RECONCILE_REMINDER' } });
    expect(list).toHaveLength(1);
    expect(list[0]?.params).toEqual({ accountName: 'Mobile money' });
  }, 20_000);

  it('RG-N15: does not re-fire the same calendar month, but does the next', async () => {
    await service.notifyReconcileReminders(new Date('2026-03-15'), userId);
    let list = await prisma.notification.findMany({ where: { userId, type: 'RECONCILE_REMINDER' } });
    expect(list).toHaveLength(1);

    await service.notifyReconcileReminders(new Date('2026-04-01'), userId);
    list = await prisma.notification.findMany({ where: { userId, type: 'RECONCILE_REMINDER' } });
    expect(list).toHaveLength(2);
  }, 20_000);

  it('RG-N15: an account reconciled this month is skipped', async () => {
    await accountsFacade.updateLastReconciledAt(userId, accountId, new Date('2026-05-10'));
    await service.notifyReconcileReminders(new Date('2026-05-20'), userId);
    const list = await prisma.notification.findMany({ where: { userId, type: 'RECONCILE_REMINDER' } });
    expect(list).toHaveLength(2); // unchanged from the previous test
  }, 20_000);

  it('RG-N15: a BANK account is never sent a reconcile reminder', async () => {
    const bank = await accountsFacade.create(userId, {
      name: 'Bank',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: '0',
      openingBalanceAt: new Date('2026-01-01'),
      includeInNetWorth: true,
    });
    await service.notifyReconcileReminders(new Date('2026-06-01'), userId);
    const list = await prisma.notification.findMany({
      where: { userId, type: 'RECONCILE_REMINDER', entityId: { startsWith: bank.id } },
    });
    expect(list).toHaveLength(0);
  }, 20_000);
});
