import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL: z.string().default('30d'),
  ARGON_MEMORY_COST: z.coerce.number().int().positive().default(19456),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(10_485_760),
  UPLOAD_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  /** Local-disk root for attachment files (docs/12 Lot 13). Relative paths resolve from the process cwd. */
  STORAGE_DIR: z.string().default('./storage/attachments'),
  AUDIT_RETENTION_MONTHS: z.coerce.number().int().positive().default(24),
  EXCHANGE_RATE_PROVIDER: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default(''),
  /** Empty disables transactional email (password reset, etc.) - dev default, logs instead of sending. */
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('Mr Wallet <no-reply@mister-wallet.com>'),
  /** Base URL of the web app, used to build links in transactional emails (e.g. password reset). */
  WEB_APP_URL: z.string().default('http://localhost:3001'),
  IP_HASH_SALT: z.string().min(1),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Empty disables Sentry (dev default). */
  SENTRY_DSN: z.string().default(''),
  /** Comma-separated allowed origins for CORS. Empty in dev only (falls back to reflecting the request origin). */
  CORS_ORIGIN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

/** In production, secrets that default to '' for local dev convenience become mandatory. */
function assertRequiredInProduction(env: Env): void {
  if (env.NODE_ENV !== 'production') return;
  const requiredInProd: (keyof Env)[] = [
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
    'CORS_ORIGIN',
    'SMTP_HOST',
  ];
  const missing = requiredInProd.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Invalid environment configuration: missing required production values: ${missing.join(', ')}`);
  }
}

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    // Boot must fail loudly here — never fall back to a default for an obligatory secret.
    throw new Error(`Invalid environment configuration: ${result.error.toString()}`);
  }
  assertRequiredInProduction(result.data);
  return result.data;
}
