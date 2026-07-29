import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundAppError, ValidationAppError } from '../../common/errors/app-error';
import { AccountsFacade } from '../accounts/accounts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { computeRequiredSavings } from './domain/required-savings';
import { CreateContributionDto, CreateGoalDto, UpdateGoalDto } from './dto/goal.dto';

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsFacade: AccountsFacade,
    private readonly transactionsFacade: TransactionsFacade,
    private readonly events: EventEmitter2,
  ) {}

  list(userId: string) {
    return this.prisma.savingsGoal.findMany({ where: { userId, deletedAt: null }, orderBy: [{ priority: 'desc' }, { name: 'asc' }] });
  }

  async getById(userId: string, id: string) {
    const goal = await this.prisma.savingsGoal.findFirst({ where: { id, userId, deletedAt: null } });
    if (!goal) throw new NotFoundAppError('GOAL_NOT_FOUND');
    return goal;
  }

  async create(userId: string, dto: CreateGoalDto) {
    if (dto.linkedAccountId) {
      await this.accountsFacade.getById(userId, dto.linkedAccountId);
    }
    return this.prisma.savingsGoal.create({
      data: {
        userId,
        name: dto.name,
        targetMinor: BigInt(dto.targetMinor),
        currency: dto.currency,
        targetDate: dto.targetDate,
        linkedAccountId: dto.linkedAccountId,
        priority: dto.priority,
        color: dto.color,
        icon: dto.icon,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateGoalDto) {
    const existing = await this.getById(userId, id);
    return this.prisma.savingsGoal.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        targetMinor: dto.targetMinor !== undefined ? BigInt(dto.targetMinor) : undefined,
        targetDate: dto.targetDate,
        priority: dto.priority,
        color: dto.color,
        icon: dto.icon,
        status: dto.status,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.getById(userId, id);
    await this.prisma.savingsGoal.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  contributions(userId: string, goalId: string) {
    return this.prisma.goalContribution.findMany({ where: { userId, goalId, deletedAt: null }, orderBy: { contributedAt: 'desc' } });
  }

  /** RG-G1: `currentMinor` is always recomputed from non-deleted contributions, never stored as a mere counter. */
  private async recomputeCurrent(userId: string, goalId: string): Promise<void> {
    const goal = await this.getById(userId, goalId);
    const sum = await this.prisma.goalContribution.aggregate({
      where: { userId, goalId, deletedAt: null },
      _sum: { amountMinor: true },
    });
    const currentMinor = sum._sum.amountMinor ?? 0n;
    const nowCompleted = currentMinor >= goal.targetMinor;

    await this.prisma.savingsGoal.update({
      where: { id: goalId },
      data: {
        currentMinor,
        ...(nowCompleted && goal.status === 'ACTIVE' && { status: 'COMPLETED', completedAt: new Date() }),
        // A later withdrawal (removed contribution) can drop back under target — RG-G4 only fires forward.
        ...(!nowCompleted && goal.status === 'COMPLETED' && { status: 'ACTIVE', completedAt: null }),
      },
    });

    // RG-G4: emit once, on the ACTIVE -> COMPLETED transition.
    if (nowCompleted && goal.status === 'ACTIVE') {
      await this.events.emitAsync('goal.reached', { userId, goalId, goalName: goal.name });
    }
  }

  /** RG-G5: a contribution may stay a simple marking, or generate a real transfer when `fromAccountId` is given. */
  async addContribution(userId: string, goalId: string, dto: CreateContributionDto) {
    const goal = await this.getById(userId, goalId);
    const amountMinor = BigInt(dto.amountMinor);
    if (amountMinor <= 0n) {
      throw new ValidationAppError('GOAL_CONTRIBUTION_AMOUNT_MUST_BE_POSITIVE');
    }

    let transactionId: string | null = null;
    if (dto.fromAccountId) {
      if (!goal.linkedAccountId) {
        throw new ValidationAppError('GOAL_NO_LINKED_ACCOUNT');
      }
      const { toLeg } = await this.transactionsFacade.transfer(userId, {
        fromAccountId: dto.fromAccountId,
        toAccountId: goal.linkedAccountId,
        amountMinor: amountMinor.toString(),
        occurredAt: dto.contributedAt,
        description: goal.name,
        notes: dto.notes,
      });
      transactionId = toLeg.id;
    }

    const contribution = await this.prisma.goalContribution.create({
      data: {
        userId,
        goalId,
        amountMinor,
        contributedAt: dto.contributedAt,
        transactionId,
        notes: dto.notes,
      },
    });

    await this.recomputeCurrent(userId, goalId);
    return contribution;
  }

  async removeContribution(userId: string, goalId: string, contributionId: string): Promise<void> {
    const contribution = await this.prisma.goalContribution.findFirst({
      where: { id: contributionId, userId, goalId, deletedAt: null },
    });
    if (!contribution) throw new NotFoundAppError('GOAL_CONTRIBUTION_NOT_FOUND');

    if (contribution.transactionId) {
      await this.transactionsFacade.remove(userId, contribution.transactionId);
    }
    await this.prisma.goalContribution.update({ where: { id: contributionId }, data: { deletedAt: new Date() } });
    await this.recomputeCurrent(userId, goalId);
  }

  async progress(userId: string, goalId: string) {
    const goal = await this.getById(userId, goalId);
    const required = computeRequiredSavings(goal.targetMinor, goal.currentMinor, goal.targetDate, new Date());
    return {
      targetMinor: goal.targetMinor.toString(),
      currentMinor: goal.currentMinor.toString(),
      status: goal.status,
      monthsRemaining: required.monthsRemaining,
      requiredMonthlyMinor: required.requiredMonthlyMinor?.toString() ?? null,
      isOverdue: required.isOverdue,
    };
  }
}
