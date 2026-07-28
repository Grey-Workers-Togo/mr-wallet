import { describe, expect, it } from 'vitest';
import { monthlyPeriodStart, nextPeriodStart, periodStart } from '../period-bounds';

describe('monthlyPeriodStart', () => {
  it('anchors on monthStartDay = 25 (RG-B1)', () => {
    const start = monthlyPeriodStart(new Date(Date.UTC(2026, 6, 10)), 25); // July 10 → period started June 25
    expect(start.getUTCFullYear()).toBe(2026);
    expect(start.getUTCMonth()).toBe(5);
    expect(start.getUTCDate()).toBe(25);
  });

  it('rolls into the current month once past the anchor day', () => {
    const start = monthlyPeriodStart(new Date(Date.UTC(2026, 6, 30)), 25);
    expect(start.getUTCMonth()).toBe(6);
    expect(start.getUTCDate()).toBe(25);
  });

  it('clamps the anchor day to the shorter month — Feb 20 is still inside the period that started Jan 31', () => {
    const start = monthlyPeriodStart(new Date(Date.UTC(2026, 1, 20)), 31);
    expect(start.getUTCMonth()).toBe(0);
    expect(start.getUTCDate()).toBe(31);
  });

  it('clamps the anchor day to the shorter month once past it', () => {
    const start = monthlyPeriodStart(new Date(Date.UTC(2026, 1, 28)), 31);
    expect(start.getUTCMonth()).toBe(1);
    expect(start.getUTCDate()).toBe(28);
  });
});

describe('nextPeriodStart', () => {
  it('advances a monthly period by one anchored month', () => {
    const start = periodStart('MONTHLY', new Date(Date.UTC(2026, 6, 10)), 25);
    const next = nextPeriodStart('MONTHLY', start, 25);
    expect(next.getUTCMonth()).toBe(6);
    expect(next.getUTCDate()).toBe(25);
  });
});
