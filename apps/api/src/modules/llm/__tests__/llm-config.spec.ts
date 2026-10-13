import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { envSchema } from '../../../common/config/env.schema';
import { toolSchemaFromZod } from '../domain/tool-schema';
import { z } from 'zod';

const requiredEnv = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 's', IP_HASH_SALT: 's' };

describe('LLM environment (ADR-0017 §2)', () => {
  it('defaults to the fake adapter with bounded calls (RG-LL2)', () => {
    const env = envSchema.parse(requiredEnv);
    expect(env).toMatchObject({
      LLM_PROVIDER: 'fake',
      LLM_TIMEOUT_MS: 20_000,
      LLM_MAX_OUTPUT_TOKENS: 512,
      LLM_PRICE_INPUT_MICROS_PER_MTOK: 0,
      LLM_PRICE_OUTPUT_MICROS_PER_MTOK: 0,
    });
  });

  it('refuses to boot an openai-compatible provider without a model and a base URL', () => {
    expect(envSchema.safeParse({ ...requiredEnv, LLM_PROVIDER: 'openai-compatible' }).success).toBe(false);
    expect(
      envSchema.safeParse({ ...requiredEnv, LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'm' }).success,
    ).toBe(false);
    expect(
      envSchema.safeParse({
        ...requiredEnv,
        LLM_PROVIDER: 'openai-compatible',
        LLM_MODEL: 'm',
        LLM_BASE_URL: 'http://localhost:11434/v1',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown provider and non-positive limits', () => {
    expect(envSchema.safeParse({ ...requiredEnv, LLM_PROVIDER: 'vendor-sdk' }).success).toBe(false);
    expect(envSchema.safeParse({ ...requiredEnv, LLM_TIMEOUT_MS: '0' }).success).toBe(false);
    expect(envSchema.safeParse({ ...requiredEnv, LLM_MAX_OUTPUT_TOKENS: '-1' }).success).toBe(false);
  });
});

describe('toolSchemaFromZod (RG-LL4)', () => {
  const argsSchema = z
    .object({
      period: z.enum(['this_month', 'last_month']),
      category: z.string().regex(/^c\d+$/).optional(),
      limit: z.number().int().min(1).max(5).default(5),
    })
    .strict();

  it('derives the provider schema from the Zod schema, with defaults optional on input', () => {
    const tool = toolSchemaFromZod('top_expenses', 'Biggest expenses', argsSchema);
    expect(tool.name).toBe('top_expenses');
    expect(tool.description).toBe('Biggest expenses');
    expect(tool.parameters).not.toHaveProperty('$schema');
    expect(tool.parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['period'],
      properties: {
        period: { enum: ['this_month', 'last_month'] },
        limit: { type: 'integer', minimum: 1, maximum: 5 },
      },
    });
  });

  it('cannot drift from the validator: a value the schema rejects is rejected by the generated bounds too', () => {
    const { properties } = toolSchemaFromZod('t', 'd', argsSchema).parameters as {
      properties: { limit: { maximum: number } };
    };
    expect(argsSchema.safeParse({ period: 'this_month', limit: properties.limit.maximum + 1 }).success).toBe(false);
  });
});

describe('RG-LL1: the llm module depends on no other module', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return entry === '__tests__' ? [] : sourceFiles(path);
      return path.endsWith('.ts') ? [path] : [];
    });
  }

  it('imports nothing from sibling modules', () => {
    const root = resolve(__dirname, '..');
    for (const file of sourceFiles(root)) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => m[1] as string);
      for (const target of imports) {
        const resolved = resolve(file, '..', target);
        const inside = resolved.startsWith(root);
        const isCommon = resolved.includes(`${join('src', 'common')}`);
        expect(inside || isCommon, `${file} imports ${target}`).toBe(true);
      }
    }
  });
});
