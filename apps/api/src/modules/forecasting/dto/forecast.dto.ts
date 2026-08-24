import { z } from 'zod';
import { unsignedAmountMinor } from '../../../common/validation/amount.schema';

export const cashflowForecastSchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).default(6),
  })
  .strict();
export type CashflowForecastDto = z.infer<typeof cashflowForecastSchema>;

export const netWorthForecastSchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).default(12),
  })
  .strict();
export type NetWorthForecastDto = z.infer<typeof netWorthForecastSchema>;

// docs/12 Lot 9: hypothetical override of an existing recurrence's amount, applied to every
// occurrence of that rule within the scenario's horizon — the rule itself is never touched.
const forecastOverrideSchema = z
  .object({
    ruleId: z.string().uuid(),
    amountMinor: unsignedAmountMinor(),
  })
  .strict();

// A hypothetical future amount not tied to any recurrence, applied once in the given month.
const forecastOneOffSchema = z
  .object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    type: z.enum(['INCOME', 'EXPENSE']),
    amountMinor: unsignedAmountMinor(),
  })
  .strict();

export const scenarioForecastSchema = z
  .object({
    months: z.coerce.number().int().min(1).max(24).default(6),
    overrides: z.array(forecastOverrideSchema).max(50).default([]),
    oneOffs: z.array(forecastOneOffSchema).max(50).default([]),
  })
  .strict();
export type ScenarioForecastDto = z.infer<typeof scenarioForecastSchema>;
