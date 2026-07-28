import { describe, expect, it } from 'vitest';
import { resolveRate } from '../resolve-rate';

describe('resolveRate', () => {
  it('prefers PEGGED over MANUAL regardless of date', () => {
    const result = resolveRate(
      [
        { rate: '600', validFrom: new Date('2026-01-01'), source: 'MANUAL' },
        { rate: '655.957', validFrom: new Date('2020-01-01'), source: 'PEGGED' },
      ],
      new Date('2026-07-01'),
    );
    expect(result?.source).toBe('PEGGED');
    expect(result?.rate).toBe('655.957');
  });

  it('picks the most recent MANUAL rate with validFrom <= at', () => {
    const result = resolveRate(
      [
        { rate: '600', validFrom: new Date('2026-01-01'), source: 'MANUAL' },
        { rate: '610', validFrom: new Date('2026-06-01'), source: 'MANUAL' },
        { rate: '620', validFrom: new Date('2026-08-01'), source: 'MANUAL' }, // future, excluded
      ],
      new Date('2026-07-01'),
    );
    expect(result?.rate).toBe('610');
  });

  it('returns null when no candidate qualifies', () => {
    expect(resolveRate([], new Date())).toBeNull();
    expect(
      resolveRate([{ rate: '1', validFrom: new Date('2099-01-01'), source: 'MANUAL' }], new Date('2026-01-01')),
    ).toBeNull();
  });
});
