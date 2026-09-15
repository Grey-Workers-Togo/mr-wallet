import { z } from 'zod';

export const changesQuerySchema = z
  .object({
    since: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type ChangesQueryDto = z.infer<typeof changesQuerySchema>;

export const snapshotQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type SnapshotQueryDto = z.infer<typeof snapshotQuerySchema>;
