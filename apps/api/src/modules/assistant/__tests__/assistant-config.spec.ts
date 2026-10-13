import { describe, expect, it } from 'vitest';
import { envSchema } from '../../../common/config/env.schema';

const requiredEnv = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 's', IP_HASH_SALT: 's' };
const realProvider = { LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'm', LLM_BASE_URL: 'http://localhost:11434/v1' };

describe('assistant environment (ADR-0022 §4–§5)', () => {
  it('is off by default, with nobody allowed and bounded quotas', () => {
    expect(envSchema.parse(requiredEnv)).toMatchObject({
      ASSISTANT_ENABLED: false,
      ASSISTANT_ALLOWLIST: '',
      ASSISTANT_DAILY_QUESTION_QUOTA: 20,
      ASSISTANT_MONTHLY_COST_CEILING_MICROS: 0,
    });
  });

  it('parses the flag as a boolean, not as a truthy string', () => {
    expect(envSchema.parse({ ...requiredEnv, NODE_ENV: 'test', ASSISTANT_ENABLED: 'false' }).ASSISTANT_ENABLED).toBe(false);
    expect(envSchema.parse({ ...requiredEnv, NODE_ENV: 'test', ASSISTANT_ENABLED: 'true' }).ASSISTANT_ENABLED).toBe(true);
    expect(envSchema.safeParse({ ...requiredEnv, ASSISTANT_ENABLED: 'yes' }).success).toBe(false);
  });

  it('refuses to start enabled on the fake provider outside the test environment', () => {
    const enabled = { ...requiredEnv, ASSISTANT_ENABLED: 'true' };
    expect(envSchema.safeParse({ ...enabled, NODE_ENV: 'production' }).success).toBe(false);
    expect(envSchema.safeParse({ ...enabled, NODE_ENV: 'development' }).success).toBe(false);
    expect(envSchema.safeParse({ ...enabled, NODE_ENV: 'test' }).success).toBe(true);
    expect(envSchema.safeParse({ ...enabled, NODE_ENV: 'production', ...realProvider }).success).toBe(true);
  });

  it('requires a cost ceiling when the model is priced (RG-AQ2)', () => {
    const priced = { ...requiredEnv, ...realProvider, ASSISTANT_ENABLED: 'true', LLM_PRICE_INPUT_MICROS_PER_MTOK: '150000' };
    expect(envSchema.safeParse(priced).success).toBe(false);
    expect(envSchema.safeParse({ ...priced, ASSISTANT_MONTHLY_COST_CEILING_MICROS: '5000000' }).success).toBe(true);
  });

  it('requires a trace secret and complete credentials when Langfuse is configured (RG-AP4)', () => {
    const langfuse = { LANGFUSE_HOST: 'https://langfuse.example', LANGFUSE_PUBLIC_KEY: 'pk', LANGFUSE_SECRET_KEY: 'sk' };
    expect(envSchema.safeParse({ ...requiredEnv, ...langfuse }).success).toBe(false);
    expect(envSchema.safeParse({ ...requiredEnv, ...langfuse, ASSISTANT_TRACE_SECRET: 'x' }).success).toBe(true);
    expect(envSchema.safeParse({ ...requiredEnv, LANGFUSE_HOST: 'https://langfuse.example', ASSISTANT_TRACE_SECRET: 'x' }).success).toBe(false);
  });
});
