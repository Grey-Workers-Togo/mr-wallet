import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType, Prisma, Severity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RecurrenceFacade } from '../recurrence/recurrence.facade';
import { UpdatePreferencesDto } from './dto/notification.dto';

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
  ) {}

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
    // RG-N8/docs §17: absence of a row = in-app on, push off (default).
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
        },
        update: {
          ...(update.inAppEnabled !== undefined && { inAppEnabled: update.inAppEnabled }),
          ...(update.pushEnabled !== undefined && { pushEnabled: update.pushEnabled }),
        },
      });
    }
    return this.preferences(userId);
  }

  private async isInAppEnabled(userId: string, type: NotificationType): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
    return pref?.inAppEnabled ?? true;
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
