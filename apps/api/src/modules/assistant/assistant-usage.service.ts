import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { usageDay, usageMonthStart, usageNextMonthStart } from './domain/cost';

/**
 * ADR-0022 §4 / RG-AP3: the only thing the assistant persists. Counters per user per UTC day, no text.
 * The service holds no business rule beyond the quota arithmetic; limits come from the caller.
 */
@Injectable()
export class AssistantUsageService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * RG-AQ1: takes one question from the daily quota, atomically. False when the quota is spent: the
   * conditional `DO UPDATE ... WHERE` leaves the row untouched and returns nothing, so two concurrent
   * requests can never both take the last unit.
   */
  async reserve(userId: string, now: Date, dailyLimit: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ requests: number }[]>(Prisma.sql`
      INSERT INTO "AssistantUsage" ("userId", "day", "requests", "updatedAt")
      VALUES (${userId}, ${usageDay(now)}::date, 1, now())
      ON CONFLICT ("userId", "day") DO UPDATE
        SET "requests" = "AssistantUsage"."requests" + 1, "updatedAt" = now()
        WHERE "AssistantUsage"."requests" < ${dailyLimit}
      RETURNING "requests"
    `);
    return rows.length > 0;
  }

  /** Gives a unit back when the provider failed: an outage does not consume the user's questions. */
  async release(userId: string, now: Date): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "AssistantUsage" SET "requests" = GREATEST("requests" - 1, 0), "updatedAt" = now()
      WHERE "userId" = ${userId} AND "day" = ${usageDay(now)}::date
    `);
  }

  /** RG-AQ3: tokens and estimated cost of the calls a question made. */
  async record(
    userId: string,
    now: Date,
    usage: { inputTokens: number; outputTokens: number; costMicros: bigint },
  ): Promise<void> {
    await this.prisma.assistantUsage.update({
      where: { userId_day: { userId, day: new Date(usageDay(now)) } },
      data: {
        inputTokens: { increment: usage.inputTokens },
        outputTokens: { increment: usage.outputTokens },
        estimatedCostMicros: { increment: usage.costMicros },
      },
    });
  }

  async requestsToday(userId: string, now: Date): Promise<number> {
    const row = await this.prisma.assistantUsage.findUnique({
      where: { userId_day: { userId, day: new Date(usageDay(now)) } },
      select: { requests: true },
    });
    return row?.requests ?? 0;
  }

  /** RG-AQ2: estimated cost of the current UTC month, across all users. */
  async monthCostMicros(now: Date): Promise<bigint> {
    const result = await this.prisma.assistantUsage.aggregate({
      where: { day: { gte: new Date(usageMonthStart(now)), lt: new Date(usageNextMonthStart(now)) } },
      _sum: { estimatedCostMicros: true },
    });
    return result._sum.estimatedCostMicros ?? 0n;
  }
}
