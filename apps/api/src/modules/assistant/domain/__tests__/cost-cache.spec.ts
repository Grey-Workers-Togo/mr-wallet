import { describe, expect, it } from 'vitest';
import { AnswerCache, cacheKey, normalizeQuestion } from '../answer-cache';
import type { AssistantAnswer } from '../bindings';
import { estimateCostMicros, microUsdToXof, usageDay, usageMonthStart, usageNextMonthStart } from '../cost';

describe('estimateCostMicros (RG-AQ3)', () => {
  it('prices input and output tokens separately, per million tokens', () => {
    // 1 000 000 input tokens at 150 000 micro-USD + 2 000 000 output at 600 000.
    expect(
      estimateCostMicros(
        { inputTokens: 1_000_000, outputTokens: 2_000_000 },
        { inputMicrosPerMTok: 150_000, outputMicrosPerMTok: 600_000 },
      ),
    ).toBe(1_350_000n);
  });

  it('rounds a fraction of a micro-dollar up, never down', () => {
    expect(estimateCostMicros({ inputTokens: 1, outputTokens: 0 }, { inputMicrosPerMTok: 150_000, outputMicrosPerMTok: 0 })).toBe(1n);
  });

  it('is zero for an unpriced model or no usage', () => {
    expect(estimateCostMicros({ inputTokens: 900, outputTokens: 80 }, { inputMicrosPerMTok: 0, outputMicrosPerMTok: 0 })).toBe(0n);
    expect(estimateCostMicros({ inputTokens: 0, outputTokens: 0 }, { inputMicrosPerMTok: 5, outputMicrosPerMTok: 5 })).toBe(0n);
  });
});

describe('microUsdToXof (display only)', () => {
  it('converts micro-USD to whole francs at the configured rate', () => {
    expect(microUsdToXof(1_000_000n, 600)).toBe(600n);
    expect(microUsdToXof(5_000_000n, 598.5)).toBe(2993n); // 2992.5 rounds half up
    expect(microUsdToXof(0n, 600)).toBe(0n);
  });
});

describe('usage periods', () => {
  it('uses the UTC day and month', () => {
    expect(usageDay(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09-30');
    expect(usageMonthStart(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09-01');
    expect(usageNextMonthStart(new Date('2026-09-30T23:59:59Z'))).toBe('2026-10-01');
    expect(usageNextMonthStart(new Date('2026-12-31T23:59:59Z'))).toBe('2027-01-01');
  });
});

describe('answer cache (ADR-0022 §3)', () => {
  const answer: AssistantAnswer = { kind: 'declined', code: 'OFF_TOPIC' };
  const parts = { userId: 'u1', question: 'Combien ce mois-ci ?', dataVersion: 'v1', localDate: '2026-09-15' };

  it('normalizes the question: case and spacing do not make another one', () => {
    expect(normalizeQuestion('  Combien   ce MOIS-ci ? ')).toBe('combien ce mois-ci ?');
    expect(cacheKey({ ...parts, question: '  combien ce  mois-ci ?' })).toBe(cacheKey(parts));
  });

  it('keys on user, data version and local date', () => {
    const base = cacheKey(parts);
    expect(cacheKey({ ...parts, userId: 'u2' })).not.toBe(base);
    expect(cacheKey({ ...parts, dataVersion: 'v2' })).not.toBe(base);
    expect(cacheKey({ ...parts, localDate: '2026-09-16' })).not.toBe(base);
  });

  it('never holds the text of a question in its key', () => {
    expect(cacheKey(parts)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires after ten minutes', () => {
    let now = 0;
    const cache = new AnswerCache(() => now);
    cache.set('k', answer);
    now = 10 * 60 * 1000 - 1;
    expect(cache.get('k')).toEqual(answer);
    now = 10 * 60 * 1000;
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('returns a copy: a caller cannot alter what is cached', () => {
    const cache = new AnswerCache();
    cache.set('k', { kind: 'fallback', bindings: {}, labels: {}, sources: [] });
    const first = cache.get('k');
    if (first?.kind === 'fallback') first.bindings['x'] = { type: 'count', value: 1 };
    expect(cache.get('k')).toEqual({ kind: 'fallback', bindings: {}, labels: {}, sources: [] });
  });

  it('evicts the oldest entry beyond its bound', () => {
    const cache = new AnswerCache(() => 0, 1000, 2);
    cache.set('a', answer);
    cache.set('b', answer);
    cache.set('c', answer);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toEqual(answer);
    expect(cache.get('c')).toEqual(answer);
  });
});
