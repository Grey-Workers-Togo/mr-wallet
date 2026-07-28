import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('30d'),
  ARGON_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
  UPLOAD_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  AUDIT_RETENTION_MONTHS: z.coerce.number().int().positive().default(24),
  EXCHANGE_RATE_PROVIDER: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default(''),
  IP_HASH_SALT: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    // Boot must fail loudly here — never fall back to a default for an obligatory secret.
    throw new Error(`Invalid environment configuration: ${result.error.toString()}`);
  }
  return result.data;
}
