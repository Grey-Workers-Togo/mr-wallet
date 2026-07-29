import { describe, expect, it } from 'vitest';
import { toDecimalString } from '../decimal-format';

describe('toDecimalString', () => {
  it('formats a 2-decimal currency', () => {
    expect(toDecimalString(125050n, 2)).toBe('1250.50');
  });

  it('formats a 0-decimal currency (XOF)', () => {
    expect(toDecimalString(5000n, 0)).toBe('5000');
  });

  it('formats a negative amount', () => {
    expect(toDecimalString(-250n, 2)).toBe('-2.50');
  });
});
