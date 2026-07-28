import { z } from 'zod';

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
