import { z } from 'zod';

/**
 * A client-supplied entity id (RG-SY3, docs/14-sync-protocol.md § 2.1): UUIDv7, so ids sort
 * chronologically and double as the sync idempotency key. Version nibble is checked explicitly
 * rather than accepting any UUID, since a v4 id here would silently defeat that ordering.
 */
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function clientSuppliedId() {
  return z.string().regex(UUID_V7_PATTERN, 'id must be a UUIDv7');
}
