import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, Prisma, Severity } from '@prisma/client';
import * as webpush from 'web-push';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError } from '../../common/errors/app-error';
import { MailService } from '../../common/mail/mail.service';
import { RecurrenceFacade } from '../recurrence/recurrence.facade';
import { SubscribePushDto, UnsubscribePushDto, UpdatePreferencesDto } from './dto/notification.dto';
import { pushContentFor } from './domain/push-content';

/** Failed pushes past this count mark the device inactive (docs/09 Lot 7: "failureCount → désactivation à 5"). */
const MAX_PUSH_FAILURES = 5;

const DEFAULT_TYPES: NotificationType[] = [
  'BUDGET_THRESHOLD',
  'BUDGET_EXCEEDED',
  'DEBT_DUE_SOON',
  'DEBT_OVERDUE',
  'DEBT_PAID_OFF',
  'GOAL_REACHED',
  'RECURRENCE_DUE',
  'IMPORT_COMPLETED',
  'IMPORT_FAILED',
  'BALANCE_MISMATCH',
  'ENTRY_REMINDER',
  'RECONCILE_REMINDER',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface BudgetThresholdCrossedPayload {
  userId: string;
  budgetId: string;
  budgetPeriodId: string;
  budgetName: string;
  percentUsed: number;
  exceeded: boolean;
}

interface DebtInstallmentEventPayload {
  userId: string;
  debtId: string;
  debtName: string;
  installmentId: string;
  dueOn: Date;
}

interface DebtPaidOffPayload {
  userId: string;
  debtId: string;
  debtName: string;
}

interface GoalReachedPayload {
  userId: string;
  goalId: string;
  goalName: string;
}

interface AccountBalanceMismatchPayload {
  userId: string;
  accountId: string;
  accountName: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrenceFacade: RecurrenceFacade,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT');
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    }
  }

  list(userId: string, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly && { readAt: null }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  async preferences(userId: string) {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const byType = new Map(stored.map((p) => [p.type, p]));
    // RG-N8/docs §17: absence of a row = in-app on, push/email off (default).
    return DEFAULT_TYPES.map(
      (type) =>
        byType.get(type) ?? {
          userId,
          type,
          inAppEnabled: true,
          pushEnabled: false,
          emailEnabled: false,
        },
    );
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    for (const update of dto) {
      await this.prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: update.type } },
        create: {
          userId,
          type: update.type,
          inAppEnabled: update.inAppEnabled ?? true,
          pushEnabled: update.pushEnabled ?? false,
          emailEnabled: update.emailEnabled ?? false,
        },
        update: {
          ...(update.inAppEnabled !== undefined && { inAppEnabled: update.inAppEnabled }),
          ...(update.pushEnabled !== undefined && { pushEnabled: update.pushEnabled }),
          ...(update.emailEnabled !== undefined && { emailEnabled: update.emailEnabled }),
        },
      });
    }
    return this.preferences(userId);
  }

  private async isInAppEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return pref?.inAppEnabled ?? true;
  }

  private async isPushEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return pref?.pushEnabled ?? false;
  }

  private async isEmailEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return pref?.emailEnabled ?? false;
  }

  publicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    return this.prisma.deviceToken.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        platform: 'WEB_PUSH',
        endpoint: dto.endpoint,
        p256dhKey: dto.p256dhKey,
        authKey: dto.authKey,
        deviceLabel: dto.deviceLabel,
      },
      update: {
        userId,
        p256dhKey: dto.p256dhKey,
        authKey: dto.authKey,
        deviceLabel: dto.deviceLabel,
        isActive: true,
        failureCount: 0,
        revokedAt: null,
      },
    });
  }

  async unsubscribe(userId: string, dto: UnsubscribePushDto): Promise<void> {
    await this.prisma.deviceToken.updateMany({
      where: { userId, endpoint: dto.endpoint },
      data: { isActive: false, revokedAt: new Date() },
    });
  }

  listDevices(userId: string) {
    return this.prisma.deviceToken.findMany({ where: { userId, isActive: true }, orderBy: { createdAt: 'desc' } });
  }

  async removeDevice(userId: string, id: string): Promise<void> {
    const device = await this.prisma.deviceToken.findFirst({ where: { id, userId } });
    if (!device) {
      throw new NotFoundAppError('DEVICE_TOKEN_NOT_FOUND');
    }
    await this.prisma.deviceToken.update({ where: { id }, data: { isActive: false, revokedAt: new Date() } });
  }

  private async sendPushToUser(userId: string, type: NotificationType): Promise<void> {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return;
    if (!(await this.isPushEnabled(userId, type))) return;

    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId, platform: 'WEB_PUSH', isActive: true },
    });
    const { title, body } = pushContentFor(type, user?.locale ?? 'fr');
    const payload = JSON.stringify({ title, body });

    for (const device of devices) {
      if (!device.p256dhKey || !device.authKey) continue;
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dhKey, auth: device.authKey } },
          payload,
        );
        if (device.failureCount > 0) {
          await this.prisma.deviceToken.update({ where: { id: device.id }, data: { failureCount: 0 } });
        }
      } catch (error) {
        const failureCount = device.failureCount + 1;
        await this.prisma.deviceToken.update({
          where: { id: device.id },
          data: { failureCount, isActive: failureCount < MAX_PUSH_FAILURES },
        });
        this.logger.warn(`Push delivery failed for device ${device.id}: ${error}`);
      }
    }
  }

  /** Content is the same generic (type, locale) pair as push (CLAUDE.md "Langues"/"Sécurité") — no amount, no label. */
  private async sendEmailToUser(userId: string, type: NotificationType): Promise<void> {
    if (!(await this.isEmailEnabled(userId, type))) return;

    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    if (!user || !user.emailVerifiedAt) return;

    const { title, body } = pushContentFor(type, user.locale ?? 'fr');
    await this.mail.send({ to: user.email, subject: title, text: body });
  }

  async sendTestPush(userId: string): Promise<void> {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return;

    const user = await this.prisma.user.findFirst({ where: { id: userId } });
    const devices = await this.prisma.deviceToken.findMany({
      where: { userId, platform: 'WEB_PUSH', isActive: true },
    });
    const { title, body } = pushContentFor('BALANCE_MISMATCH', user?.locale ?? 'fr');
    const payload = JSON.stringify({ title, body });
    for (const device of devices) {
      if (!device.p256dhKey || !device.authKey) continue;
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dhKey, auth: device.authKey } },
        payload,
      );
    }
  }

  /** RG-N1: one notification per (type, entity) — `entityId` should already encode any period/occurrence disambiguation. */
  async create(input: {
    userId: string;
    type: NotificationType;
    params: Prisma.InputJsonValue;
    entityType?: string;
    entityId?: string;
    severity?: Severity;
  }): Promise<void> {
    if (!(await this.isInAppEnabled(input.userId, input.type))) return;

    if (input.entityId) {
      const existing = await this.prisma.notification.findFirst({
        where: { userId: input.userId, type: input.type, entityType: input.entityType, entityId: input.entityId },
      });
      if (existing) return;
    }

    await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        params: input.params,
        entityType: input.entityType,
        entityId: input.entityId,
        severity: input.severity ?? 'INFO',
      },
    });

    try {
      await this.sendPushToUser(input.userId, input.type);
    } catch (error) {
      this.logger.warn(`Push dispatch failed for user ${input.userId}, type ${input.type}: ${error}`);
    }

    try {
      await this.sendEmailToUser(input.userId, input.type);
    } catch (error) {
      this.logger.warn(`Email dispatch failed for user ${input.userId}, type ${input.type}: ${error}`);
    }
  }

  @OnEvent('budget.threshold_crossed')
  async onBudgetThresholdCrossed(payload: BudgetThresholdCrossedPayload): Promise<void> {
    try {
      await this.create({
        userId: payload.userId,
        type: payload.exceeded ? 'BUDGET_EXCEEDED' : 'BUDGET_THRESHOLD',
        params: { budgetName: payload.budgetName, percentUsed: payload.percentUsed },
        entityType: 'BudgetPeriod',
        entityId: payload.budgetPeriodId,
        severity: payload.exceeded ? 'CRITICAL' : 'WARNING',
      });
    } catch (error) {
      this.logger.warn(`Failed to create budget notification for period ${payload.budgetPeriodId}: ${error}`);
    }
  }

  @OnEvent('debt.installment_overdue')
  async onDebtInstallmentOverdue(payload: DebtInstallmentEventPayload): Promise<void> {
    try {
      await this.create({
        userId: payload.userId,
        type: 'DEBT_OVERDUE',
        params: { debtName: payload.debtName, dueOn: payload.dueOn.toISOString() },
        entityType: 'DebtInstallment',
        entityId: payload.installmentId,
        severity: 'CRITICAL',
      });
    } catch (error) {
      this.logger.warn(`Failed to create overdue notification for installment ${payload.installmentId}: ${error}`);
    }
  }

  @OnEvent('debt.installment_due_soon')
  async onDebtInstallmentDueSoon(payload: DebtInstallmentEventPayload): Promise<void> {
    try {
      await this.create({
        userId: payload.userId,
        type: 'DEBT_DUE_SOON',
        params: { debtName: payload.debtName, dueOn: payload.dueOn.toISOString() },
        entityType: 'DebtInstallment',
        entityId: payload.installmentId,
        severity: 'WARNING',
      });
    } catch (error) {
      this.logger.warn(`Failed to create due-soon notification for installment ${payload.installmentId}: ${error}`);
    }
  }

  @OnEvent('debt.paid_off')
  async onDebtPaidOff(payload: DebtPaidOffPayload): Promise<void> {
    try {
      await this.create({
        userId: payload.userId,
        type: 'DEBT_PAID_OFF',
        params: { debtName: payload.debtName },
        entityType: 'Debt',
        entityId: payload.debtId,
        severity: 'INFO',
      });
    } catch (error) {
      this.logger.warn(`Failed to create paid-off notification for debt ${payload.debtId}: ${error}`);
    }
  }

  @OnEvent('goal.reached')
  async onGoalReached(payload: GoalReachedPayload): Promise<void> {
    try {
      await this.create({
        userId: payload.userId,
        type: 'GOAL_REACHED',
        params: { goalName: payload.goalName },
        entityType: 'SavingsGoal',
        entityId: payload.goalId,
        severity: 'INFO',
      });
    } catch (error) {
      this.logger.warn(`Failed to create goal-reached notification for goal ${payload.goalId}: ${error}`);
    }
  }

  /**
   * RG-A11 (docs/04 §B, lot 19): the nightly drift check (`reconciliation` module) only ever logs
   * and notifies — it never reaches this class directly, so it cannot create an adjustment itself.
   * `entityId` encodes the day so a persisting drift notifies once per day, not once per account ever.
   */
  @OnEvent('account.balance_mismatch')
  async onAccountBalanceMismatch(payload: AccountBalanceMismatchPayload): Promise<void> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await this.create({
        userId: payload.userId,
        type: 'BALANCE_MISMATCH',
        params: { accountName: payload.accountName },
        entityType: 'Account',
        entityId: `${payload.accountId}:${today}`,
        severity: 'WARNING',
      });
    } catch (error) {
      this.logger.warn(`Failed to create balance-mismatch notification for account ${payload.accountId}: ${error}`);
    }
  }

  /** RG-N1/RG-R: daily sweep — creates `RECURRENCE_DUE` once per (recurrence, occurrence). */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async notifyDueRecurrences(): Promise<void> {
    const due = await this.recurrenceFacade.dueForReminders();
    for (const item of due) {
      await this.create({
        userId: item.userId,
        type: 'RECURRENCE_DUE',
        params: { recurrenceName: item.name, occurrenceDate: item.occurrenceDate.toISOString() },
        entityType: 'RecurrenceRule',
        entityId: `${item.recurrenceId}:${item.occurrenceDate.toISOString()}`,
        severity: 'INFO',
      });
    }
  }

  /**
   * RG-N12/RG-N13 (docs/04 §K, lot 20): daily sweep, one notification per inactivity streak.
   * "Last entry" is when a transaction was recorded (`createdAt`), not its business date
   * (`occurredAt`) — a backdated entry still counts as activity today. Re-arm state needs no new
   * table: the most recent ENTRY_REMINDER's `createdAt` is the last-fired marker (mirrors
   * RECURRENCE_DUE's per-occurrence dedupe), compared against the last entry rather than a fixed
   * entityId, since the "entity" here is a moving streak, not a stable id.
   *
   * `now` and `onlyUserId` are test-only seams: tests run against the real shared dev database
   * (docs/10-conventions-dev.md §6) — `onlyUserId` keeps an unscoped sweep from touching every
   * real user (same reasoning as `ReconciliationService.runNightlyDriftChecks`), and `now` lets a
   * test simulate the passage of days without sleeping. The real `@Cron` entry point omits both.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async notifyEntryReminders(now: Date = new Date(), onlyUserId?: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { entryReminderDays: { not: null }, ...(onlyUserId && { id: onlyUserId }) },
      select: { id: true, entryReminderDays: true, createdAt: true },
    });

    for (const user of users) {
      const reminderDays = user.entryReminderDays;
      if (reminderDays === null) continue;

      const lastTransaction = await this.prisma.transaction.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      // A user who has never entered anything is maximally inactive since they registered —
      // exactly the D+30 drop-off this reminder exists to catch (docs/04 §K), not an edge case to skip.
      const lastEntryAt = lastTransaction?.createdAt ?? user.createdAt;

      const daysSinceLastEntry = Math.floor((now.getTime() - lastEntryAt.getTime()) / MS_PER_DAY);
      if (daysSinceLastEntry < reminderDays) continue;

      const lastReminder = await this.prisma.notification.findFirst({
        where: { userId: user.id, type: 'ENTRY_REMINDER' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      // RG-N13: already reminded for this streak — re-arm only once a new entry postdates it.
      if (lastReminder && lastReminder.createdAt > lastEntryAt) continue;

      await this.create({
        userId: user.id,
        type: 'ENTRY_REMINDER',
        params: { daysSinceLastEntry },
        severity: 'INFO',
      });
    }
  }

  /**
   * RG-N15 (docs/04 §K, lot 20): monthly, CASH/MOBILE_MONEY only — where drift is expected
   * (RG-A8). Skips an account already reconciled this calendar month; `entityId` also dedupes
   * per (account, month) as a safety net against a same-day rerun.
   *
   * `now` and `onlyUserId` are the same test-only seams as `notifyEntryReminders` above.
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_NOON)
  async notifyReconcileReminders(now: Date = new Date(), onlyUserId?: string): Promise<void> {
    const accounts = await this.prisma.account.findMany({
      where: {
        isArchived: false,
        type: { in: ['CASH', 'MOBILE_MONEY'] },
        ...(onlyUserId && { userId: onlyUserId }),
      },
    });
    const monthKey = now.toISOString().slice(0, 7);

    for (const account of accounts) {
      if (account.lastReconciledAt && account.lastReconciledAt.toISOString().slice(0, 7) === monthKey) continue;

      await this.create({
        userId: account.userId,
        type: 'RECONCILE_REMINDER',
        params: { accountName: account.name },
        entityType: 'Account',
        entityId: `${account.id}:${monthKey}`,
        severity: 'INFO',
      });
    }
  }
}
