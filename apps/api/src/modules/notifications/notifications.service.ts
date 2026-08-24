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
];

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
}
