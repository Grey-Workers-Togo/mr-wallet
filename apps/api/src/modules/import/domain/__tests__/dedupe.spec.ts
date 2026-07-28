import { describe, expect, it } from 'vitest';
import { findProbableDuplicate } from '../dedupe';

const existing = [
  {
    id: 'tx-1',
    accountId: 'acc-1',
    amountMinor: 2500n,
    occurredAt: new Date('2026-07-10T00:00:00Z'),
    normalizedLabel: 'carrefour paris 15',
    fingerprint: 'abc',
  },
];

describe('findProbableDuplicate (docs/06 §7 level 3)', () => {
  it('flags same account/amount, close date, similar label', () => {
    const candidate = {
      accountId: 'acc-1',
      amountMinor: 2500n,
      occurredAt: new Date('2026-07-12T00:00:00Z'),
      normalizedLabel: 'carrefour paris 16',
    };
    expect(findProbableDuplicate(candidate, existing)?.id).toBe('tx-1');
  });

  it('does not flag a different account', () => {
    const candidate = {
      accountId: 'acc-2',
      amountMinor: 2500n,
      occurredAt: new Date('2026-07-12T00:00:00Z'),
      normalizedLabel: 'carrefour paris 16',
    };
    expect(findProbableDuplicate(candidate, existing)).toBeNull();
  });

  it('does not flag a date more than 3 days apart', () => {
    const candidate = {
      accountId: 'acc-1',
      amountMinor: 2500n,
      occurredAt: new Date('2026-07-20T00:00:00Z'),
      normalizedLabel: 'carrefour paris 16',
    };
    expect(findProbableDuplicate(candidate, existing)).toBeNull();
  });

  it('does not flag a dissimilar label (avoids the "two identical coffees" false positive)', () => {
    const candidate = {
      accountId: 'acc-1',
      amountMinor: 2500n,
      occurredAt: new Date('2026-07-10T00:00:00Z'),
      normalizedLabel: 'boulangerie du coin',
    };
    expect(findProbableDuplicate(candidate, existing)).toBeNull();
  });
});
