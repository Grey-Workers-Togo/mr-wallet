import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmUnavailableError } from '../../llm/llm.errors';
import { defineTool } from '../tools/tool-definition';
import { DECLINE_TOOL_NAME, MAX_HISTORY_TURNS, MAX_TOOL_CALLS_PER_ROUND, type AskInput } from '../assistant.orchestrator';
import { contextFor, harness, spendingTool, SYSTEM_PROMPT, type ToolSpy } from './harness';

const USER_A = 'user-a-secret-id';

function input(overrides: Partial<AskInput> = {}): AskInput {
  return {
    question: 'Combien ai-je dépensé ce mois-ci ?',
    systemPrompt: SYSTEM_PROMPT,
    context: contextFor(USER_A),
    ...overrides,
  };
}

const callSpending = (id = 'call_a', args: unknown = { period: 'this_month' }) => ({
  toolCalls: [{ id, name: 'spending_by_category', arguments: args }],
});

describe('AssistantOrchestrator — end to end with the fake adapter', () => {
  it('runs tool call, binding, template and validation (A0 exit criterion)', async () => {
    const { orchestrator, fake } = harness([
      callSpending(),
      { text: 'Ce mois-ci, vous avez dépensé {{r1.total}}, soit {{r1.share}} de vos dépenses.' },
    ]);

    const { answer, stats } = await orchestrator.ask(input());

    expect(answer).toEqual({
      kind: 'template',
      template: 'Ce mois-ci, vous avez dépensé {{r1.total}}, soit {{r1.share}} de vos dépenses.',
      bindings: {
        'r1.total': { type: 'money', amountMinor: '64500', currency: 'XOF' },
        'r1.share': { type: 'percent', basisPoints: 10_000 },
      },
      labels: {
        'r1.total': { key: 'assistant.binding.spending_total' },
        'r1.share': { key: 'assistant.binding.spending_share' },
      },
      sources: [{ tool: 'spending_by_category', period: { from: '2026-09-01', to: '2026-09-30' } }],
    });
    expect(stats).toMatchObject({
      llmCalls: 2,
      toolRounds: 1,
      toolNames: ['spending_by_category'],
      outcome: 'accepted',
      inputTokens: 200,
      outputTokens: 40,
      violations: [],
    });
    expect(fake.remainingSteps).toBe(0);
  });

  it('is bounded on every call: timeout, output tokens, temperature 0 (RG-LL2)', async () => {
    const { orchestrator, fake } = harness([callSpending(), { text: '{{r1.total}}' }]);
    await orchestrator.ask(input());
    for (const request of fake.requests) {
      expect(request).toMatchObject({ maxOutputTokens: 512, temperature: 0 });
      expect(request.timeoutMs).toBeLessThanOrEqual(20_000);
    }
  });

  it('falls back on a forced violation, never returning the rejected text (RG-AT4)', async () => {
    const { orchestrator } = harness([
      callSpending(),
      { text: 'Vous avez dépensé 64 500 francs.' },
      { text: 'Vous avez dépensé 64500 francs.' },
    ]);

    const { answer, stats } = await orchestrator.ask(input());

    expect(answer).toEqual({
      kind: 'fallback',
      bindings: {
        'r1.total': { type: 'money', amountMinor: '64500', currency: 'XOF' },
        'r1.share': { type: 'percent', basisPoints: 10_000 },
      },
      labels: {
        'r1.total': { key: 'assistant.binding.spending_total' },
        'r1.share': { key: 'assistant.binding.spending_share' },
      },
      sources: [{ tool: 'spending_by_category', period: { from: '2026-09-01', to: '2026-09-30' } }],
    });
    expect(JSON.stringify(answer)).not.toContain('francs');
    expect(stats).toMatchObject({
      outcome: 'fallback',
      fallbackReason: 'VALIDATION',
      llmCalls: 3,
      violations: ['DIGIT_OUTSIDE_PLACEHOLDER', 'DIGIT_OUTSIDE_PLACEHOLDER'],
    });
  });

  it('accepts the answer after exactly one corrective retry (RG-AT4)', async () => {
    const { orchestrator, fake } = harness([
      callSpending(),
      { text: 'Vous avez dépensé 64 500.' },
      { text: 'Vous avez dépensé {{r1.total}}.' },
    ]);

    const { answer, stats } = await orchestrator.ask(input());

    expect(answer).toMatchObject({ kind: 'template', template: 'Vous avez dépensé {{r1.total}}.' });
    expect(stats).toMatchObject({ outcome: 'accepted_after_correction', llmCalls: 3 });
    const correction = fake.requests[2]?.messages.at(-1);
    expect(correction).toMatchObject({ role: 'user' });
    expect((correction as { content: string }).content).toContain('DIGIT_OUTSIDE_PLACEHOLDER');
  });

  it('rejects a placeholder that belongs to no binding of this question (RG-AT2)', async () => {
    const { orchestrator } = harness([
      callSpending(),
      { text: 'Vous avez dépensé {{r2.total}}.' },
      { text: 'Vous avez dépensé {{r1.total}}.' },
    ]);
    const { answer, stats } = await orchestrator.ask(input());
    expect(answer.kind).toBe('template');
    expect(stats.violations).toEqual(['UNKNOWN_PLACEHOLDER']);
  });

  it('answers a question that needs no tool, when the text is clean', async () => {
    const { orchestrator } = harness([{ text: 'Posez-moi une question sur vos dépenses ou vos budgets.' }]);
    const { answer, stats } = await orchestrator.ask(input({ question: 'Bonjour' }));
    expect(answer).toMatchObject({ kind: 'template', bindings: {}, sources: [] });
    expect(stats.llmCalls).toBe(1);
  });
});

describe('AssistantOrchestrator — bounds (RG-AS4, ADR-0022 §2)', () => {
  it('allows 3 tool rounds, then withholds the tools and asks for the answer', async () => {
    const { orchestrator, fake } = harness([
      callSpending('c1'),
      callSpending('c2'),
      callSpending('c3'),
      { text: '{{r3.total}}' },
    ]);

    const { answer, stats } = await orchestrator.ask(input());

    expect(answer.kind).toBe('template');
    expect(stats).toMatchObject({ toolRounds: 3, llmCalls: 4 });
    expect(fake.requests.map((r) => r.tools !== undefined)).toEqual([true, true, true, false]);
  });

  it('degrades to the fallback when the model keeps calling tools after the third round', async () => {
    const { orchestrator, fake } = harness([
      callSpending('c1'),
      callSpending('c2'),
      callSpending('c3'),
      callSpending('c4'),
      { text: 'never reached' },
    ]);

    const { answer, stats } = await orchestrator.ask(input());

    expect(answer.kind).toBe('fallback');
    expect(stats).toMatchObject({ fallbackReason: 'TOOL_ROUNDS_EXHAUSTED', toolRounds: 3, llmCalls: 4 });
    expect(fake.remainingSteps).toBe(1);
    if (answer.kind === 'fallback') expect(Object.keys(answer.bindings)).toHaveLength(6);
  });

  it('caps the calls executed inside one round and still answers every tool call id', async () => {
    const spy: ToolSpy = { executions: [] };
    const calls = Array.from({ length: MAX_TOOL_CALLS_PER_ROUND + 2 }, (_, i) => ({
      id: `call_${i}`,
      name: 'spending_by_category',
      arguments: { period: 'this_month' },
    }));
    const { orchestrator, fake } = harness([{ toolCalls: calls }, { text: '{{r1.total}}' }], [spendingTool(spy)]);

    await orchestrator.ask(input());

    expect(spy.executions).toHaveLength(MAX_TOOL_CALLS_PER_ROUND);
    const toolMessages = fake.requests[1]?.messages.filter((m) => m.role === 'tool') ?? [];
    expect(toolMessages).toHaveLength(calls.length);
    expect(JSON.stringify(toolMessages.at(-1))).toContain('TOOL_CALL_LIMIT_EXCEEDED');
  });

  it('stops at the end-to-end deadline and returns the fallback with what it has (ADR-0022 §2)', async () => {
    // Clock readings: deadline set (0), first iteration (0), then past the 18 s budget.
    const readings = [0, 0];
    const clock = () => readings.shift() ?? 19_000;
    const { orchestrator, fake } = harness([callSpending(), { text: 'never reached' }]);

    const { answer, stats } = await orchestrator.ask(input(), { deadlineMs: 18_000, clock });

    expect(answer).toMatchObject({ kind: 'fallback', bindings: { 'r1.total': { amountMinor: '64500' } } });
    expect(stats.fallbackReason).toBe('DEADLINE');
    expect(fake.requests).toHaveLength(1);
    expect(fake.remainingSteps).toBe(1);
  });

  it('caps each call at the time left, not the configured timeout', async () => {
    const readings = [0, 0, 12_000];
    const clock = () => readings.shift() ?? 12_000;
    const { orchestrator, fake } = harness([callSpending(), { text: '{{r1.total}}' }]);
    await orchestrator.ask(input(), { deadlineMs: 18_000, clock });
    expect(fake.requests.map((r) => r.timeoutMs)).toEqual([18_000, 6_000]);
  });

  it('caps the first call at the remaining budget when it is below the configured timeout', async () => {
    const { orchestrator, fake } = harness([{ text: 'ok' }]);
    await orchestrator.ask(input(), { deadlineMs: 5_000, clock: () => 0 });
    expect(fake.requests[0]?.timeoutMs).toBe(5_000);
  });

  it('keeps only the last 6 turns of history (RG-AP2)', async () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `turn-${i}`,
    }));
    const { orchestrator, fake } = harness([{ text: 'ok' }]);
    await orchestrator.ask(input({ history }));
    const sent = fake.requests[0]?.messages ?? [];
    expect(sent).toHaveLength(MAX_HISTORY_TURNS + 1);
    expect(sent[0]).toMatchObject({ content: 'turn-4' });
  });
});

describe('AssistantOrchestrator — tool errors go back to the model (RG-AS2)', () => {
  it('returns invalid arguments as an error, never executes, and lets the model correct', async () => {
    const spy: ToolSpy = { executions: [] };
    const { orchestrator, fake } = harness(
      [
        callSpending('bad', { period: 'yesterday' }),
        callSpending('good', { period: 'last_month' }),
        { text: '{{r2.total}}' },
      ],
      [spendingTool(spy)],
    );

    const { answer, stats } = await orchestrator.ask(input());

    expect(spy.executions).toEqual([{ userId: USER_A, args: { period: 'last_month' } }]);
    expect(answer).toMatchObject({ kind: 'template', sources: [{ period: { from: '2026-08-01', to: '2026-08-31' } }] });
    expect(stats.toolRounds).toBe(2);
    const error = JSON.parse((fake.requests[1]?.messages.at(-1) as { content: string }).content);
    expect(error).toEqual({ error: { code: 'TOOL_INVALID_ARGUMENTS', details: [{ field: 'period', code: 'INVALID_FORMAT' }] } });
  });

  it('answers an unknown tool with TOOL_UNKNOWN', async () => {
    const { orchestrator, fake } = harness([
      { toolCalls: [{ id: 'x', name: 'run_sql', arguments: { query: 'select 1' } }] },
      { text: 'Je ne peux pas répondre.' },
    ]);
    await orchestrator.ask(input());
    const reply = JSON.parse((fake.requests[1]?.messages.at(-1) as { content: string }).content);
    expect(reply).toEqual({ error: { code: 'TOOL_UNKNOWN' } });
  });

  it('turns an unexpected exception into TOOL_FAILED without leaking its message', async () => {
    const failing = defineTool({
      name: 'net_worth',
      description: 'd',
      argsSchema: z.object({}).strict(),
      async execute() {
        throw new Error('connection to db-prod-7 refused for user-a-secret-id');
      },
    });
    const { orchestrator, fake } = harness(
      [{ toolCalls: [{ id: 'x', name: 'net_worth', arguments: {} }] }, { text: 'Je ne peux pas répondre.' }],
      [failing],
    );
    await orchestrator.ask(input());
    const sent = JSON.stringify(fake.requests[1]?.messages);
    expect(sent).toContain('TOOL_FAILED');
    expect(sent).not.toContain('db-prod-7');
  });

  it('lets an LLM_UNAVAILABLE error propagate unchanged for the endpoint to map (RG-LL3)', async () => {
    const { orchestrator } = harness([new LlmUnavailableError('TIMEOUT')]);
    await expect(orchestrator.ask(input())).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
  });
});

describe('AssistantOrchestrator — declining (RG-AS5)', () => {
  it('returns a stable reason code, not model prose', async () => {
    const { orchestrator } = harness([
      { toolCalls: [{ id: 'd', name: DECLINE_TOOL_NAME, arguments: { reason: 'WRITE_REQUEST' } }] },
    ]);
    const result = await orchestrator.ask(input({ question: 'Supprime ma dernière dépense' }));
    expect(result.answer).toEqual({ kind: 'declined', code: 'WRITE_REQUEST' });
    expect(result.stats.outcome).toBe('declined');
  });

  it('treats an invalid reason as an unknown tool call, so the model must still answer', async () => {
    const { orchestrator } = harness([
      { toolCalls: [{ id: 'd', name: DECLINE_TOOL_NAME, arguments: { reason: 'BECAUSE_I_SAY_SO' } }] },
      { text: 'Je ne peux pas répondre à cela.' },
    ]);
    const { answer } = await orchestrator.ask(input());
    expect(answer.kind).toBe('template');
  });
});

describe('AssistantOrchestrator — what leaves the server (ADR-0019, RG-AS3, RG-AS6)', () => {
  it('never sends the user id, internal ids or another user’s data to the provider', async () => {
    const { orchestrator, fake } = harness([callSpending(), { text: 'Vous avez dépensé {{r1.total}}.' }]);
    await orchestrator.ask(input());

    const everything = JSON.stringify(fake.requests);
    expect(everything).not.toContain('user-a-secret-id');
    expect(everything).not.toContain('cat-a-transport');
    expect(everything).not.toContain('acc-user-a');
    // No tool result value, no amount: only names, types and descriptions travel to the provider.
    expect(everything).not.toContain('64500');
    expect(everything).not.toContain('23500');
    // The alias legend is the only link between the model and the user's categories.
    expect(fake.requests[0]?.system).toContain('c1: Alimentation');
    expect(fake.requests[0]?.system).toContain('c2: Transport');
    expect(fake.requests[0]?.system).toContain('a1: Flooz');
  });

  it('runs a tool for the authenticated user only, whatever the model asks for', async () => {
    const spy: ToolSpy = { executions: [] };
    const { orchestrator } = harness(
      [
        // The model tries to supply another user's id: rejected by the strict schema, never executed.
        callSpending('x', { period: 'this_month', userId: 'user-b-secret-id' }),
        // And to address a category it was never given: refused by the alias mapper.
        callSpending('y', { period: 'this_month', category: 'c7' }),
        callSpending('z', { period: 'this_month' }),
        { text: '{{r3.total}}' },
      ],
      [spendingTool(spy)],
    );

    const { answer } = await orchestrator.ask(input({ context: contextFor('user-a-secret-id') }));

    expect(spy.executions.map((e) => e.userId)).toEqual(['user-a-secret-id', 'user-a-secret-id']);
    expect(JSON.stringify(spy.executions)).not.toContain('user-b-secret-id');
    expect(answer).toMatchObject({ kind: 'template' });
    expect(JSON.stringify(answer)).not.toContain('999000');
  });

  it('gives user B only B’s figures from the same tool (RG-AS6)', async () => {
    const run = async (userId: string) => {
      const { orchestrator } = harness([callSpending(), { text: '{{r1.total}}' }]);
      const { answer } = await orchestrator.ask(input({ context: contextFor(userId) }));
      return answer;
    };
    const a = await run('user-a-secret-id');
    const b = await run('user-b-secret-id');
    expect(a).toMatchObject({ bindings: { 'r1.total': { amountMinor: '64500' } } });
    expect(b).toMatchObject({ bindings: { 'r1.total': { amountMinor: '999000' } } });
  });
});
