import { describe, expect, it } from 'vitest';
import { ruleMatches } from '../match-rule';

const candidate = {
  accountId: 'acc-1',
  amountMinor: 5000n,
  description: 'Netflix Subscription',
  payee: 'Netflix',
  externalRef: null,
};

describe('ruleMatches (RG-T8)', () => {
  it('matches CONTAINS on description, case-insensitive', () => {
    const rule = {
      matchField: 'DESCRIPTION' as const,
      matchType: 'CONTAINS' as const,
      matchValue: 'netflix',
      minAmountMinor: null,
      maxAmountMinor: null,
      accountId: null,
    };
    expect(ruleMatches(rule, candidate)).toBe(true);
  });

  it('rejects when amount is outside the min/max bounds', () => {
    const rule = {
      matchField: 'DESCRIPTION' as const,
      matchType: 'CONTAINS' as const,
      matchValue: 'netflix',
      minAmountMinor: 6000n,
      maxAmountMinor: null,
      accountId: null,
    };
    expect(ruleMatches(rule, candidate)).toBe(false);
  });

  it('rejects when scoped to a different account', () => {
    const rule = {
      matchField: 'DESCRIPTION' as const,
      matchType: 'CONTAINS' as const,
      matchValue: 'netflix',
      minAmountMinor: null,
      maxAmountMinor: null,
      accountId: 'acc-2',
    };
    expect(ruleMatches(rule, candidate)).toBe(false);
  });
});
