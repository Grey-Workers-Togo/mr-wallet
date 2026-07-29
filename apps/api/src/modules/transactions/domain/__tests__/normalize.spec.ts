import { describe, expect, it } from 'vitest';
import { computeFingerprint, normalizeLabel } from '../normalize';

describe('normalizeLabel (RG-T6)', () => {
  it('lowercases, strips accents and punctuation, normalizes spaces', () => {
    expect(normalizeLabel('Café-Restaurant  Épicerie!')).toBe('cafe restaurant epicerie');
  });

  it('masks reference numbers of 5+ digits', () => {
    expect(normalizeLabel('Virement REF123456789 vers compte')).toBe('virement ref# vers compte');
  });

  it('keeps short numbers untouched', () => {
    expect(normalizeLabel('Lunch 12 Jul')).toBe('lunch 12 jul');
  });
});

describe('computeFingerprint (RG-T7)', () => {
  const base = {
    accountId: 'acc-1',
    occurredAt: new Date('2026-07-12T10:00:00Z'),
    type: 'EXPENSE',
    amountMinor: 1500n,
    normalizedLabel: 'lunch',
  };

  it('is deterministic for identical inputs', () => {
    expect(computeFingerprint(base)).toBe(computeFingerprint({ ...base }));
  });

  it('ignores the time-of-day component of occurredAt', () => {
    const other = { ...base, occurredAt: new Date('2026-07-12T23:59:00Z') };
    expect(computeFingerprint(base)).toBe(computeFingerprint(other));
  });

  it('changes when the amount changes', () => {
    expect(computeFingerprint(base)).not.toBe(computeFingerprint({ ...base, amountMinor: 1600n }));
  });
});
