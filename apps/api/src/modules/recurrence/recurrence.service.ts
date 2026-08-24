import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictAppError, NotFoundAppError } from '../../common/errors/app-error';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { computeOccurrences } from './domain/occurrences';
import { detectSuggestions } from './domain/suggestions';
import { CreateRecurrenceDto, UpdateRecurrenceDto } from './dto/recurrence.dto';

@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionsFacade: TransactionsFacade,
  ) {}

  list(userId: string) {
    return this.prisma.recurrenceRule.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  async getById(userId: string, id: string) {
    const rule = await this.prisma.recurrenceRule.findFirst({ where: { id, userId } });
    if (!rule) throw new NotFoundAppError('RECURRENCE_NOT_FOUND');
    return rule;
  }

  create(userId: string, dto: CreateRecurrenceDto) {
    return this.prisma.recurrenceRule.create({
      data: {
        userId,
        name: dto.name,
        type: dto.type,
        accountId: dto.accountId,
        categoryId: dto.categoryId,
        amountMinor: BigInt(dto.amountMinor),
        currency: dto.currency,
        amountIsEstimate: dto.amountIsEstimate,
        frequency: dto.frequency,
        interval: dto.interval,
        dayOfMonth: dto.dayOfMonth,
        dayOfWeek: dto.dayOfWeek,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        maxOccurrences: dto.maxOccurrences,
        autoCreate: dto.autoCreate,
        reminderDaysBefore: dto.reminderDaysBefore,
      },
    });
  }

  /** RG-R5: updating a rule never touches transactions already created from it. */
  async update(userId: string, id: string, dto: UpdateRecurrenceDto) {
    const existing = await this.getById(userId, id);
    return this.prisma.recurrenceRule.update({
      where: { id: existing.id },
      data: {
        name: dto.name,
        type: dto.type,
        accountId: dto.accountId,
        categoryId: dto.categoryId,
        amountMinor: dto.amountMinor !== undefined ? BigInt(dto.amountMinor) : undefined,
        currency: dto.currency,
        amountIsEstimate: dto.amountIsEstimate,
        frequency: dto.frequency,
        interval: dto.interval,
        dayOfMonth: dto.dayOfMonth,
        dayOfWeek: dto.dayOfWeek,
        startsOn: dto.startsOn,
        endsOn: dto.endsOn,
        maxOccurrences: dto.maxOccurrences,
        autoCreate: dto.autoCreate,
        reminderDaysBefore: dto.reminderDaysBefore,
        isActive: dto.isActive,
      },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.getById(userId, id);
    await this.prisma.recurrenceRule.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  async occurrences(userId: string, id: string, until: Date) {
    const rule = await this.getById(userId, id);
    const skipped = new Set(rule.skippedOccurrences.map((d) => d.toISOString()));
    return computeOccurrences(
      {
        startsOn: rule.startsOn,
        endsOn: rule.endsOn,
        frequency: rule.frequency,
        interval: rule.interval,
        dayOfMonth: rule.dayOfMonth,
        maxOccurrences: rule.maxOccurrences,
      },
      until,
    )
      .filter((date) => !skipped.has(date.toISOString()))
      .map((date) => ({ occurrenceDate: date }));
  }

  /** RG-R6: an occurrence can be skipped ad hoc without disabling the rule. */
  async skip(userId: string, id: string, occurrenceDate: Date) {
    const rule = await this.getById(userId, id);
    return this.prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { skippedOccurrences: { push: occurrenceDate } },
    });
  }

  /** RG-R3: manual confirmation creates one transaction for the given occurrence. */
  async materialize(userId: string, id: string, occurrenceDate: Date) {
    const rule = await this.getById(userId, id);
    const already = await this.prisma.transaction.findFirst({
      where: { userId, recurrenceId: rule.id, occurredAt: occurrenceDate },
    });
    if (already) {
      throw new ConflictAppError('RECURRENCE_OCCURRENCE_ALREADY_MATERIALIZED');
    }
    const transaction = await this.transactionsFacade.createFromRecurrence(
      userId,
      {
        accountId: rule.accountId,
        type: rule.type as 'EXPENSE' | 'INCOME',
        amountMinor: rule.amountMinor.toString(),
        occurredAt: occurrenceDate,
        description: rule.name,
        categoryId: rule.categoryId ?? undefined,
        status: 'CLEARED',
        tagIds: [],
      },
      rule.id,
    );
    await this.prisma.recurrenceRule.update({ where: { id: rule.id }, data: { lastGeneratedAt: occurrenceDate } });
    return transaction;
  }

  /** RG-R4: idempotent daily materialization for `autoCreate = true` rules — gated by `lastGeneratedAt`. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDueMaterializations(now: Date = new Date()): Promise<{ createdCount: number }> {
    const rules = await this.prisma.recurrenceRule.findMany({
      where: { autoCreate: true, isActive: true, deletedAt: null },
    });
    let createdCount = 0;
    for (const rule of rules) {
      const skipped = new Set(rule.skippedOccurrences.map((d) => d.toISOString()));
      const due = computeOccurrences(
        {
          startsOn: rule.startsOn,
          endsOn: rule.endsOn,
          frequency: rule.frequency,
          interval: rule.interval,
          dayOfMonth: rule.dayOfMonth,
          maxOccurrences: rule.maxOccurrences,
        },
        now,
      ).filter((date) => !skipped.has(date.toISOString()) && (!rule.lastGeneratedAt || date.getTime() > rule.lastGeneratedAt.getTime()));

      for (const occurrenceDate of due) {
        try {
          await this.materialize(rule.userId, rule.id, occurrenceDate);
          createdCount += 1;
        } catch (error) {
          this.logger.warn(`Failed to materialize recurrence ${rule.id} at ${occurrenceDate.toISOString()}: ${error}`);
        }
      }
    }
    return { createdCount };
  }

  async upcoming(userId: string, days: number) {
    const rules = await this.prisma.recurrenceRule.findMany({ where: { userId, isActive: true, deletedAt: null } });
    const until = new Date(Date.now() + days * 86_400_000);
    const results: { recurrenceId: string; name: string; occurrenceDate: Date }[] = [];
    for (const rule of rules) {
      const skipped = new Set(rule.skippedOccurrences.map((d) => d.toISOString()));
      const upcomingOccurrences = computeOccurrences(
        {
          startsOn: rule.startsOn,
          endsOn: rule.endsOn,
          frequency: rule.frequency,
          interval: rule.interval,
          dayOfMonth: rule.dayOfMonth,
          maxOccurrences: rule.maxOccurrences,
        },
        until,
      ).filter((date) => date.getTime() >= Date.now() && !skipped.has(date.toISOString()));
      for (const occurrenceDate of upcomingOccurrences) {
        results.push({ recurrenceId: rule.id, name: rule.name, occurrenceDate });
      }
    }
    return results.sort((a, b) => a.occurrenceDate.getTime() - b.occurrenceDate.getTime());
  }

  /** docs/04 §I: recurring income/expense occurrences with their amount, for `forecasting`. */
  async forecastOccurrences(userId: string, until: Date) {
    const rules = await this.prisma.recurrenceRule.findMany({ where: { userId, isActive: true, deletedAt: null } });
    const results: {
      ruleId: string;
      name: string;
      type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
      amountMinor: bigint;
      currency: string;
      occurrenceDate: Date;
    }[] = [];
    for (const rule of rules) {
      const skipped = new Set(rule.skippedOccurrences.map((d) => d.toISOString()));
      const occurrences = computeOccurrences(
        {
          startsOn: rule.startsOn,
          endsOn: rule.endsOn,
          frequency: rule.frequency,
          interval: rule.interval,
          dayOfMonth: rule.dayOfMonth,
          maxOccurrences: rule.maxOccurrences,
        },
        until,
      ).filter((date) => date.getTime() >= Date.now() && !skipped.has(date.toISOString()));
      for (const occurrenceDate of occurrences) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          type: rule.type,
          amountMinor: rule.amountMinor,
          currency: rule.currency,
          occurrenceDate,
        });
      }
    }
    return results;
  }

  /** RG-N: rules whose next occurrence falls within their own `reminderDaysBefore` window — feeds `RECURRENCE_DUE` notifications. */
  async dueForReminders(now: Date = new Date()) {
    const rules = await this.prisma.recurrenceRule.findMany({ where: { isActive: true, deletedAt: null } });
    const results: { userId: string; recurrenceId: string; name: string; occurrenceDate: Date }[] = [];
    for (const rule of rules) {
      const reminderDays = rule.reminderDaysBefore ?? 3;
      const horizon = new Date(now.getTime() + reminderDays * 86_400_000);
      const skipped = new Set(rule.skippedOccurrences.map((d) => d.toISOString()));
      const next = computeOccurrences(
        {
          startsOn: rule.startsOn,
          endsOn: rule.endsOn,
          frequency: rule.frequency,
          interval: rule.interval,
          dayOfMonth: rule.dayOfMonth,
          maxOccurrences: rule.maxOccurrences,
        },
        horizon,
      ).filter((date) => date.getTime() >= now.getTime() && !skipped.has(date.toISOString()));
      if (next.length > 0) {
        results.push({ userId: rule.userId, recurrenceId: rule.id, name: rule.name, occurrenceDate: next[0] as Date });
      }
    }
    return results;
  }

  async suggestions(userId: string) {
    const transactions = await this.transactionsFacade.listAllForExport(userId, {});
    const candidates = transactions.filter((tx) => tx.source === 'MANUAL' && !tx.recurrenceId && !tx.transferGroupId);
    return detectSuggestions(candidates);
  }
}
