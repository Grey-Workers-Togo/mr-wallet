import { z } from 'zod';
import { signedAmountMinor } from '../../../common/validation/amount.schema';

/** RG-A8/RG-A13 (docs/04 §B): the client sends the declared actual balance and a date — never a
 * pre-computed delta. The server computes the difference itself (ADR-0010 §1's "intent, not a
 * derived value", applied to this endpoint even though it predates the sync client). */
export const reconcileAccountSchema = z
  .object({
    actualBalanceMinor: signedAmountMinor(),
    asOfDate: z.coerce.date(),
  })
  .strict();
export type ReconcileAccountDto = z.infer<typeof reconcileAccountSchema>;
