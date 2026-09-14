/** Sync-specific result/conflict codes (docs/14-sync-protocol.md § 4.1). */
export const SYNC_ERROR_CODES = [
  'STALE_WRITE',
  'TARGET_GONE',
  'VALIDATION_FAILED',
  'CLIENT_TOO_OLD',
] as const;

export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];
