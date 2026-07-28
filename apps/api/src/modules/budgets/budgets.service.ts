import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError } from '../../common/errors/app-error';
import { CategoriesFacade } from '../categories/categories.facade';
import { nextPeriodStart, periodStart } from './domain/period-bounds';
import { CreateBudgetDto, FromTemplateDto, UpdateBudgetDto } from './dto/budget.dto';

const PERIODS_AHEAD = 12; // RG-B8: periods are materialized 12 rolling months ahead.

interface TransactionEventPayload {
  userId: string;
  transaction: { id: string; type: string; accountId: string; categoryId: string | null; amountMinor: bigint; occurredAt: Date; transferGroupId: string | null };
}

interface TransactionUpdatedPayload {
  userId: string;
  before: TransactionEventPayload['transaction'];
  after: TransactionEventPayload['transaction'];
}

@Injectable()
export class BudgetsService {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesFacade: CategoriesFacade,
    private readonly events: EventEmitter2,
  ) {}

  list(userId: string) {
    return this.prisma.budget.findMany({ where: { userId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async getById(userId: string, id: string) {
    const budget = await this.prisma.budget.findFirst({ where: { id, userId, deletedAt: null } });
    if (!budget) throw new NotFoundAppError('BUDGET_NOT_FOUND');
    return budget;
  }

  private async assertNoOverlap(userId: string, categoryId: string | null, startsOn: Date, endsOn: Date | null, excludeId?: string) {
    // RG-B4: two active budgets can't target the same category on overlapping periods.
    const candidates = await this.prisma.budget.findMany({
      where: { userId, categoryId, isActive: true, deletedAt: null, ...(excludeId && { id: { not: excludeId } }) },
    });
    const overlap = candidates.some((budget) => {
      const otherEnd = budget.endsOn ?? new Date('9999-12-31');
      const thisEnd = endsOn ?? new Date('9999-12-31');
      return startsOn.getTime() <= otherEnd.getTime() && budget.startsOn.getTime() <= thisEnd.getTime();
    });
    if (overlap) throw new ConflictAppError('BUDGET_CATEGORY_OVERLAP');
  }

  async create(userId: string, dto: CreateBudgetDto) {
    await this.assertNoOverlap(userId, dto.categoryId ?? null, dto.startsOn, dto.endsOn ?? null);

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { monthStartDay: true } });

    const budget = await this.prisma.budget.create({
      data: {
        userId,
        name: dto.name,
        categoryId: dto.categoryId,
        amountMinor: BigInt(dto.amountMinor),
        currency: dto.currency,
        period: dto.period,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        rollover: dto.rollover,
        alertThresholds: dto.alertThresholds,
      },
    });

    await this.generatePeriods(budget.id, user.monthStartDay);
    return budget;
  }

  async update(userId: string, id: string, dto: UpdateBudgetDto) {
    const existing = await this.getById(userId, id);
    return this.prisma.budget.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        amountMinor: dto.amountMinor !== undefined ? BigInt(dto.amountMinor) : undefined,
        endsOn: dto.endsOn,
        rollover: dto.rollover,
        alertThresholds: dto.alertThresholds,
        isActive: dto.isActive,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.getById(userId, id);
    await this.prisma.budget.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  /** RG-B8: generates (or extends) the materialized `BudgetPeriod` rows, `rollover` cascading period to period (RG-B5). */
  async generatePeriods(budgetId: string, monthStartDay: number): Promise<void> {
    const budget = await this.prisma.budget.findUniqueOrThrow({ where: { id: budgetId } });
    const existingPeriods = await this.prisma.budgetPeriod.findMany({
      where: { budgetId },
      orderBy: { periodStart: 'asc' },
    });

    const lastPeriod = existingPeriods.length > 0 ? existingPeriods[existingPeriods.length - 1] : undefined;
    let cursorStart = lastPeriod
      ? nextPeriodStart(budget.period, lastPeriod.periodStart, monthStartDay)
      : periodStart(budget.period, budget.startsOn, monthStartDay);
    let previousRolloverOut = lastPeriod ? lastPeriod.allocatedMinor - lastPeriod.spentMinor : 0n;

    const horizon = new Date();
    horizon.setUTCMonth(horizon.getUTCMonth() + PERIODS_AHEAD);

    let guard = 0;
    while (cursorStart.getTime() <= horizon.getTime() && (!budget.endsOn || cursorStart.getTime() <= budget.endsOn.getTime()) && guard < 60) {
      guard += 1;
      const periodEnd = nextPeriodStart(budget.period, cursorStart, monthStartDay);
      const rolloverIn = budget.rollover ? previousRolloverOut : 0n;
      const created = await this.prisma.budgetPeriod.create({
        data: {
          userId: budget.userId,
          budgetId: budget.id,
          periodStart: cursorStart,
          periodEnd,
          allocatedMinor: budget.amountMinor + rolloverIn,
          rolloverInMinor: rolloverIn,
        },
      });
      previousRolloverOut = created.allocatedMinor - created.spentMinor;
      cursorStart = periodEnd;
    }
  }

  /** RG-B8: nightly extension of the rolling 12-month horizon for every active budget. */
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async extendAllPeriods(): Promise<void> {
    const budgets = await this.prisma.budget.findMany({ where: { isActive: true, deletedAt: null } });
    for (const budget of budgets) {
      const user = await this.prisma.user.findUnique({ where: { id: budget.userId }, select: { monthStartDay: true } });
      await this.generatePeriods(budget.id, user?.monthStartDay ?? 1);
    }
  }

  async current(userId: string) {
    const budgets = await this.list(userId);
    const now = new Date();
    const results = [];
    for (const budget of budgets) {
      const period = await this.prisma.budgetPeriod.findFirst({
        where: { budgetId: budget.id, periodStart: { lte: now }, periodEnd: { gt: now } },
      });
      if (period) results.push({ budget, period });
    }
    return results;
  }

  async periods(userId: string, budgetId: string) {
    await this.getById(userId, budgetId);
    return this.prisma.budgetPeriod.findMany({ where: { budgetId }, orderBy: { periodStart: 'asc' } });
  }

  async periodById(userId: string, budgetId: string, periodId: string) {
    await this.getById(userId, budgetId);
    const period = await this.prisma.budgetPeriod.findFirst({ where: { id: periodId, budgetId } });
    if (!period) throw new NotFoundAppError('BUDGET_PERIOD_NOT_FOUND');
    return period;
  }

  async fromTemplate(userId: string, dto: FromTemplateDto) {
    const totalIncome = BigInt(dto.totalIncomeMinor);
    const created = [];

    if (dto.template === 'FIFTY_THIRTY_TWENTY') {
      const splits: { name: string; pct: bigint }[] = [
        { name: 'Needs (50%)', pct: 50n },
        { name: 'Wants (30%)', pct: 30n },
        { name: 'Savings (20%)', pct: 20n },
      ];
      for (const split of splits) {
        const amountMinor = (totalIncome * split.pct) / 100n;
        created.push(
          await this.create(userId, {
            name: split.name,
            amountMinor: amountMinor.toString(),
            currency: dto.currency,
            period: dto.period,
            startsOn: dto.startsOn,
            rollover: false,
            alertThresholds: [80, 100],
          }),
        );
      }
      return created;
    }

    // ZERO_BASED / CUSTOM: caller supplies explicit per-category allocations that must sum to the income.
    for (const allocation of dto.categoryAllocations ?? []) {
      created.push(
        await this.create(userId, {
          name: 'Budget',
          categoryId: allocation.categoryId,
          amountMinor: allocation.amountMinor,
          currency: dto.currency,
          period: dto.period,
          startsOn: dto.startsOn,
          rollover: false,
          alertThresholds: [80, 100],
        }),
      );
    }
    return created;
  }

  /** RG-B3: only non-deleted `EXPENSE` transactions, outside transfers, feed `spentMinor`. */
  private async recomputePeriodFor(userId: string, categoryId: string | null, occurredAt: Date): Promise<void> {
    if (!categoryId) return;
    const budgets = await this.prisma.budget.findMany({ where: { userId, isActive: true, deletedAt: null } });
    for (const budget of budgets) {
      if (!budget.categoryId) continue; // global budgets (categoryId null) are out of scope for per-category recompute
      const scopeIds = await this.categoriesFacade.descendantIds(userId, budget.categoryId);
      if (!scopeIds.includes(categoryId)) continue;

      const period = await this.prisma.budgetPeriod.findFirst({
        where: { budgetId: budget.id, periodStart: { lte: occurredAt }, periodEnd: { gt: occurredAt } },
      });
      if (!period) continue;

      const sum = await this.prisma.transaction.aggregate({
        where: {
          userId,
          categoryId: { in: scopeIds },
          type: 'EXPENSE',
          transferGroupId: null,
          occurredAt: { gte: period.periodStart, lt: period.periodEnd },
        },
        _sum: { amountMinor: true },
      });
      const spentMinor = sum._sum.amountMinor ?? 0n;
      const updated = await this.prisma.budgetPeriod.update({ where: { id: period.id }, data: { spentMinor } });
      await this.evaluateAlert(userId, budget, updated);
    }
  }

  /** RG-B6: alerts fire once per (period, threshold) — tracked via `lastAlertPct`. */
  private async evaluateAlert(
    userId: string,
    budget: { id: string; name: string; alertThresholds: number[] },
    period: { id: string; allocatedMinor: bigint; spentMinor: bigint; lastAlertPct: number | null },
  ): Promise<void> {
    if (period.allocatedMinor <= 0n) return;
    const pct = Number((period.spentMinor * 10000n) / period.allocatedMinor) / 100;
    const crossedThresholds = budget.alertThresholds.filter((t) => pct >= t).sort((a, b) => b - a);
    if (crossedThresholds.length === 0) return;
    const highest = crossedThresholds[0] as number;
    if (period.lastAlertPct !== null && period.lastAlertPct >= highest) return;

    await this.prisma.budgetPeriod.update({ where: { id: period.id }, data: { lastAlertPct: highest } });
    await this.events.emitAsync('budget.threshold_crossed', {
      userId,
      budgetId: budget.id,
      budgetPeriodId: period.id,
      budgetName: budget.name,
      percentUsed: Math.round(pct),
      exceeded: highest >= 100,
    });
  }

  @OnEvent('transaction.created')
  async onTransactionCreated(payload: TransactionEventPayload): Promise<void> {
    try {
      await this.recomputePeriodFor(payload.userId, payload.transaction.categoryId, payload.transaction.occurredAt);
    } catch (error) {
      this.logger.warn(`Failed to recompute budget for created transaction ${payload.transaction.id}: ${error}`);
    }
  }

  @OnEvent('transaction.updated')
  async onTransactionUpdated(payload: TransactionUpdatedPayload): Promise<void> {
    try {
      await this.recomputePeriodFor(payload.userId, payload.before.categoryId, payload.before.occurredAt);
      await this.recomputePeriodFor(payload.userId, payload.after.categoryId, payload.after.occurredAt);
    } catch (error) {
      this.logger.warn(`Failed to recompute budget for updated transaction ${payload.after.id}: ${error}`);
    }
  }

  @OnEvent('transaction.deleted')
  async onTransactionDeleted(payload: TransactionEventPayload): Promise<void> {
    try {
      await this.recomputePeriodFor(payload.userId, payload.transaction.categoryId, payload.transaction.occurredAt);
    } catch (error) {
      this.logger.warn(`Failed to recompute budget for deleted transaction ${payload.transaction.id}: ${error}`);
    }
  }
}
