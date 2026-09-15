import { NotFoundAppError } from '../../../common/errors/app-error';

/**
 * The two conflict-shaped outcomes (docs/14-sync-protocol.md § 4.1): both carry a `current`
 * server state the client can diff against, unlike a plain rejection (RG-SY11 — no automatic
 * resolution, ever; the client decides).
 */
export class SyncConflictError extends Error {
  constructor(
    public readonly code: 'STALE_WRITE' | 'TARGET_GONE',
    public readonly current?: unknown,
  ) {
    super(code);
  }
}

/**
 * Loads the entity an update/delete operation targets and enforces optimistic concurrency
 * against the operation's `baseVersion` (the replica row's `updatedAt` at read time).
 * RG-SY6 note: the caller runs this inside the same `$transaction` as the mutation itself.
 */
export async function checkVersion<T extends { updatedAt: Date }>(
  loadCurrent: () => Promise<T>,
  baseVersion: string | undefined,
): Promise<T> {
  let current: T;
  try {
    current = await loadCurrent();
  } catch (error) {
    if (error instanceof NotFoundAppError) {
      throw new SyncConflictError('TARGET_GONE');
    }
    throw error;
  }
  if (baseVersion && current.updatedAt.toISOString() !== baseVersion) {
    throw new SyncConflictError('STALE_WRITE', current);
  }
  return current;
}
