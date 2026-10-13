import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * ADR-0022 §3: the most recent `updatedAt` across the user's financial entities, read through the
 * existing `(userId, updatedAt, id)` indexes. A soft delete bumps `updatedAt` and raw SQL does not
 * filter it out, so the value only moves forward: any write invalidates a cached answer by construction.
 *
 * Reading other modules' tables here is deliberate and read-only: it is a single timestamp, and the
 * alternative (a façade method per module) would add a dependency for no data the assistant uses.
 */
@Injectable()
export class AssistantDataVersionService {
  constructor(private readonly prisma: PrismaService) {}

  async current(userId: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ version: string | null }[]>(Prisma.sql`
      SELECT to_char(
        GREATEST(
          (SELECT max("updatedAt") FROM "Transaction" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "Account" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "Category" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "Budget" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "BudgetPeriod" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "SavingsGoal" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "Debt" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "DebtInstallment" WHERE "userId" = ${userId}),
          (SELECT max("updatedAt") FROM "RecurrenceRule" WHERE "userId" = ${userId}),
          (SELECT max("createdAt") FROM "ExchangeRate" WHERE "userId" = ${userId} OR "userId" IS NULL),
          (SELECT "updatedAt" FROM "User" WHERE "id" = ${userId})
        ) AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US'
      ) AS version
    `);
    return rows[0]?.version ?? 'none';
  }
}
