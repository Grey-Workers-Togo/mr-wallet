import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../tools/tool-definition';
import { contextFor, harness, spendingTool } from './harness';

const noop = { values: {} };

describe('defineTool (RG-AS2, RG-AS3)', () => {
  it('refuses a schema that lets the model supply a user identifier, at any depth', () => {
    for (const shape of [
      { userId: z.string() },
      { user_id: z.string() },
      { UserId: z.string() },
      { filter: z.object({ userId: z.string() }) },
      { filters: z.array(z.object({ user_id: z.string() })) },
    ]) {
      expect(() =>
        defineTool({ name: 't', description: 'd', argsSchema: z.object(shape), execute: async () => noop }),
      ).toThrow(/user identifier/);
    }
  });

  it('refuses arguments that are not an object', () => {
    expect(() => defineTool({ name: 't', description: 'd', argsSchema: z.string(), execute: async () => noop })).toThrow(
      /must be an object/,
    );
  });

  it('never runs execute on invalid arguments and reports field and code only', async () => {
    let executed = 0;
    const tool = defineTool({
      name: 't',
      description: 'd',
      argsSchema: z.object({ limit: z.number().int().max(5) }).strict(),
      execute: async () => {
        executed += 1;
        return noop;
      },
    });

    const result = await tool.run(contextFor('user-a-secret-id'), { limit: 500, injected: 'value' });

    expect(executed).toBe(0);
    expect(result).toMatchObject({ ok: false, error: { code: 'TOOL_INVALID_ARGUMENTS' } });
    const details = (result as { error: { details: { field: string; code: string }[] } }).error.details;
    expect(details).toEqual(expect.arrayContaining([{ field: 'limit', code: 'TOO_BIG' }]));
    // Values the model sent are never echoed back.
    expect(JSON.stringify(result)).not.toContain('500');
    expect(JSON.stringify(result)).not.toContain('value');
  });

  it('rejects arguments that are not even an object (an unparseable JSON string from the provider)', async () => {
    const result = await spendingTool().run(contextFor('user-a-secret-id'), '{not json');
    expect(result).toMatchObject({ ok: false, error: { code: 'TOOL_INVALID_ARGUMENTS' } });
  });
});

describe('ToolRegistry (RG-LL4)', () => {
  it('generates provider schemas from the tools’ Zod schemas, in registration order', () => {
    const { registry } = harness([], [spendingTool()]);
    const [schema] = registry.schemas();
    expect(schema).toMatchObject({
      name: 'spending_by_category',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['period'],
        properties: { category: { type: 'string' } },
      },
    });
    expect(JSON.stringify(schema)).not.toMatch(/user_?id/i);
  });

  it('refuses two tools with the same name', () => {
    const { registry } = harness([], [spendingTool()]);
    expect(() => registry.register(spendingTool())).toThrow(/already registered/);
  });

  it('answers an unknown tool name with an error instead of throwing', async () => {
    const { registry } = harness([], []);
    await expect(registry.run('drop_table', contextFor('user-a-secret-id'), {})).resolves.toEqual({
      ok: false,
      error: { code: 'TOOL_UNKNOWN' },
    });
  });
});
