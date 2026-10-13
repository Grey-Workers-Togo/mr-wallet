import { describe, expect, it } from 'vitest';
import { FakeLlmProvider, FAKE_MODEL } from '../adapters/fake.adapter';
import type { LlmRequest } from '../llm.types';

const request: LlmRequest = {
  system: 's',
  messages: [{ role: 'user', content: 'q' }],
  maxOutputTokens: 100,
  temperature: 0,
  timeoutMs: 1_000,
};

describe('FakeLlmProvider', () => {
  it('replays the script in order and fills deterministic defaults', async () => {
    const fake = new FakeLlmProvider([
      { toolCalls: [{ name: 'cashflow', arguments: { period: 'this_month' } }] },
      { text: 'done', usage: { inputTokens: 7, outputTokens: 3 }, model: 'm' },
    ]);

    const first = await fake.complete(request);
    expect(first.toolCalls).toEqual([{ id: 'call_1_1', name: 'cashflow', arguments: { period: 'this_month' } }]);
    expect(first.model).toBe(FAKE_MODEL);
    expect(first.usage.inputTokens).toBeGreaterThan(0);

    const second = await fake.complete(request);
    expect(second).toMatchObject({ text: 'done', toolCalls: [], usage: { inputTokens: 7, outputTokens: 3 }, model: 'm' });
    expect(fake.remainingSteps).toBe(0);
  });

  it('records a snapshot of every request, so later mutation of the history does not alter it', async () => {
    const fake = new FakeLlmProvider([{ text: 'a' }]);
    const mutable: LlmRequest = { ...request, messages: [{ role: 'user', content: 'before' }] };
    await fake.complete(mutable);
    mutable.messages.push({ role: 'user', content: 'after' });
    expect(fake.requests[0]?.messages).toHaveLength(1);
  });

  it('throws a scripted error and fails loudly when the script is exhausted', async () => {
    const fake = new FakeLlmProvider([new Error('boom')]);
    await expect(fake.complete(request)).rejects.toThrow('boom');
    await expect(fake.complete(request)).rejects.toMatchObject({
      code: 'LLM_UNAVAILABLE',
      params: { reason: 'FAKE_SCRIPT_EXHAUSTED' },
    });
  });

  it('lets a step inspect the request it answers', async () => {
    const fake = new FakeLlmProvider([(req) => ({ text: `saw ${req.messages.length} message(s)` })]);
    expect((await fake.complete(request)).text).toBe('saw 1 message(s)');
  });
});
