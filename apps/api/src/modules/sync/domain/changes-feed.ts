import { RawPrismaService } from '../../../common/prisma/prisma.service';

/** Replicated tables (docs/14-sync-protocol.md § 5) — every entity a sync client can create/edit. */
const REPLICATED_MODELS = [
  { entity: 'account', delegate: 'account' },
  { entity: 'transaction', delegate: 'transaction' },
  { entity: 'category', delegate: 'category' },
  { entity: 'tag', delegate: 'tag' },
  { entity: 'budget', delegate: 'budget' },
  { entity: 'goal', delegate: 'savingsGoal' },
  { entity: 'debt', delegate: 'debt' },
  { entity: 'recurrence', delegate: 'recurrenceRule' },
] as const;

export interface Cursor {
  updatedAt: Date;
  id: string;
}

interface ReplicatedRow {
  id: string;
  updatedAt: Date;
  deletedAt: Date | null;
  [key: string]: unknown;
}

export interface FeedChangeEntry {
  entity: string;
  id: string;
  op: 'upsert' | 'tombstone';
  data?: unknown;
  deletedAt?: string;
}

/** Opaque per RG-SY8 — the client stores it as an unread token, never parses or constructs one. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify({ u: cursor.updatedAt.toISOString(), i: cursor.id }), 'utf8').toString('base64url');
}

export function decodeCursor(token: string): Cursor {
  const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as { u: string; i: string };
  return { updatedAt: new Date(parsed.u), id: parsed.i };
}

interface ReplicatedDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, 'asc'>[];
    take: number;
  }): Promise<ReplicatedRow[]>;
}

function getDelegate(raw: RawPrismaService, delegate: string): ReplicatedDelegate {
  const found = (raw as unknown as Record<string, ReplicatedDelegate | undefined>)[delegate];
  if (!found) throw new Error(`Unknown replicated model delegate: ${delegate}`);
  return found;
}

/**
 * Single ordered feed across every replicated table (RG-SY9), merged by `(updatedAt, id)`.
 * Uses the raw (soft-delete-bypassing) client so a `deletedAt` row still surfaces as a
 * tombstone (RG-SY9/RG-MD4) instead of silently disappearing.
 */
export async function loadChangesPage(
  raw: RawPrismaService,
  userId: string,
  after: Cursor | null,
  limit: number,
): Promise<{ changes: FeedChangeEntry[]; nextCursor: Cursor | null; hasMore: boolean }> {
  const perModel = await Promise.all(
    REPLICATED_MODELS.map(async ({ entity, delegate }) => {
      const where: Record<string, unknown> = { userId };
      if (after) {
        where.OR = [{ updatedAt: { gt: after.updatedAt } }, { updatedAt: after.updatedAt, id: { gt: after.id } }];
      }
      const rows = await getDelegate(raw, delegate).findMany({
        where,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: limit,
      });
      return { entity, rows };
    }),
  );

  const candidates = perModel.flatMap(({ entity, rows }) =>
    rows.map((row) => ({ entity, row })),
  );
  candidates.sort((a, b) => {
    const byTime = a.row.updatedAt.getTime() - b.row.updatedAt.getTime();
    if (byTime !== 0) return byTime;
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });

  // Any model returning a full page means there may be more beyond this window — conservative
  // (may say true one call too many, never silently drops a change).
  const anyModelFull = perModel.some(({ rows }) => rows.length === limit);
  const page = candidates.slice(0, limit);
  const hasMore = anyModelFull || candidates.length > limit;

  const changes: FeedChangeEntry[] = page.map(({ entity, row }) =>
    row.deletedAt
      ? { entity, id: row.id, op: 'tombstone', deletedAt: row.deletedAt.toISOString() }
      : { entity, id: row.id, op: 'upsert', data: row },
  );

  const last = page[page.length - 1];
  const nextCursor = last ? { updatedAt: last.row.updatedAt, id: last.row.id } : after;

  return { changes, nextCursor, hasMore };
}
