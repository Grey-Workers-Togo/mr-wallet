import { z } from 'zod';
import { operationEnvelopeSchema } from './operations';

/**
 * docs/14-sync-protocol.md § 3.1 — POST /sync/push request. Max 100 ops, processed in order.
 * `platform` isn't shown in the doc's illustrative JSON but is required in practice: RG-SY14's
 * minimum-version floor is per-platform, and nothing else in the request identifies one.
 */
export const pushRequestSchema = z.object({
  deviceId: z.string().min(1),
  platform: z.enum(['WEB', 'IOS', 'ANDROID']),
  clientVersion: z.string().min(1),
  operations: z.array(operationEnvelopeSchema).min(1).max(100),
});

export type PushRequest = z.infer<typeof pushRequestSchema>;

export type PushResultStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected';

export interface PushOperationResult {
  id: string;
  status: PushResultStatus;
  entity?: unknown;
  code?: string;
  params?: Record<string, unknown>;
  current?: unknown;
}

export interface PushResponse {
  results: PushOperationResult[];
  stoppedAt: number | null;
}

/** docs/14-sync-protocol.md § 3.2 — one entry of the GET /sync/changes feed. */
export interface ChangeEntry {
  entity: string;
  id: string;
  op: 'upsert' | 'tombstone';
  data?: unknown;
  deletedAt?: string;
}

export interface ChangesResponse {
  changes: ChangeEntry[];
  cursor: string;
  hasMore: boolean;
}
