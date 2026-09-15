import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushOperationResult, PushRequest } from '@budget-manager/sync-protocol';
import { isClientVersionSupported } from '@budget-manager/sync-protocol';
import { PrismaService, RawPrismaService } from '../../common/prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { AccountsFacade } from '../accounts/accounts.facade';
import { TransactionsFacade } from '../transactions/transactions.facade';
import { CategoriesFacade } from '../categories/categories.facade';
import { TagsFacade } from '../tags/tags.facade';
import { BudgetsFacade } from '../budgets/budgets.facade';
import { GoalsFacade } from '../goals/goals.facade';
import { DebtsFacade } from '../debts/debts.facade';
import { RecurrenceFacade } from '../recurrence/recurrence.facade';
import { NotificationsFacade } from '../notifications/notifications.facade';
import { buildDispatchTable, OperationHandler } from './domain/dispatch';
import { SyncConflictError } from './domain/sync-conflict.error';
import { decodeCursor, encodeCursor, loadChangesPage } from './domain/changes-feed';
import { toJsonSafe } from './domain/json-safe';

const IDEMPOTENCY_ENDPOINT = 'sync.push';
// Long enough to cover a realistic offline window; short enough that the table doesn't grow forever.
const IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly dispatch: Record<string, OperationHandler>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly raw: RawPrismaService,
    private readonly config: ConfigService,
    accounts: AccountsFacade,
    transactions: TransactionsFacade,
    categories: CategoriesFacade,
    tags: TagsFacade,
    budgets: BudgetsFacade,
    goals: GoalsFacade,
    debts: DebtsFacade,
    recurrence: RecurrenceFacade,
    notifications: NotificationsFacade,
  ) {
    this.dispatch = buildDispatchTable({
      accounts,
      transactions,
      categories,
      tags,
      budgets,
      goals,
      debts,
      recurrence,
      notifications,
    });
  }

  private minimumVersionFor(platform: PushRequest['platform']): string {
    const key = `MIN_CLIENT_VERSION_${platform}` as const;
    return this.config.get<string>(key) ?? '0.0.0';
  }

  async push(userId: string, request: PushRequest): Promise<{ results: PushOperationResult[]; stoppedAt: number | null }> {
    const minimumVersion = this.minimumVersionFor(request.platform);
    if (!isClientVersionSupported(request.clientVersion, minimumVersion)) {
      // RG-SY14: blocking — nothing in the batch is attempted.
      return {
        results: request.operations.map((op) => ({ id: op.id, status: 'rejected', code: 'CLIENT_TOO_OLD' })),
        stoppedAt: 0,
      };
    }

    const results: PushOperationResult[] = [];
    let stoppedAt: number | null = null;

    for (let index = 0; index < request.operations.length; index++) {
      const operation = request.operations[index];
      if (!operation) continue;

      const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: operation.id } });
      if (existingKey && existingKey.userId === userId && existingKey.endpoint === IDEMPOTENCY_ENDPOINT) {
        // RG-SY2: replaying an already-applied operation returns the original response, unapplied again.
        results.push({ id: operation.id, status: 'duplicate', entity: existingKey.responseBody });
        continue;
      }

      const handler = this.dispatch[operation.op];
      if (!handler) {
        // Unreachable if the dispatch table stays complete (see the completeness test) — a
        // real crash is the honest outcome for a catalogue/dispatch drift, not a silent skip.
        throw new Error(`No sync dispatch handler registered for op "${operation.op}"`);
      }
      try {
        const entity = await handler(userId, operation.payload, operation.baseVersion);
        const responseBody = toJsonSafe(entity);
        await this.prisma.idempotencyKey.create({
          data: {
            key: operation.id,
            userId,
            endpoint: IDEMPOTENCY_ENDPOINT,
            requestHash: operation.op,
            responseStatus: 200,
            responseBody: responseBody as object,
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          },
        });
        results.push({ id: operation.id, status: 'applied', entity });
      } catch (error) {
        if (error instanceof SyncConflictError) {
          results.push({ id: operation.id, status: 'conflict', code: error.code, current: toJsonSafe(error.current) });
          stoppedAt = index;
          break;
        }
        if (error instanceof AppError) {
          results.push({ id: operation.id, status: 'rejected', code: error.code, params: error.params });
          stoppedAt = index;
          break;
        }
        this.logger.error(`sync push operation ${operation.op} crashed: ${error instanceof Error ? error.message : error}`);
        throw error;
      }
    }

    return { results, stoppedAt };
  }

  async changes(userId: string, since: string | undefined, limit: number) {
    const after = since ? decodeCursor(since) : null;
    const page = await loadChangesPage(this.raw, userId, after, limit);
    return {
      changes: page.changes,
      cursor: page.nextCursor ? encodeCursor(page.nextCursor) : encodeCursor({ updatedAt: new Date(0), id: '' }),
      hasMore: page.hasMore,
    };
  }

  /** Full replica for a first login on a device — same feed, starting from the beginning of time. */
  async snapshot(userId: string, limit: number) {
    return this.changes(userId, undefined, limit);
  }
}
