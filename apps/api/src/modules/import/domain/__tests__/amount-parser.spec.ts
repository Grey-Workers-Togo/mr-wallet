import { describe, expect, it } from 'vitest';
import { AmountParseError, parseAmountToMinor } from '../amount-parser';

describe('parseAmountToMinor (docs/06 §5)', () => {
  it('parses a plain decimal amount', () => {
    expect(parseAmountToMinor('1250,50', 2, ',', ' ')).toBe(125050n);
  });

  it('strips thousand separators', () => {
    expect(parseAmountToMinor('1 250,50', 2, ',', ' ')).toBe(125050n);
  });

  it('handles accounting-format negatives: (1 250,00)', () => {
    expect(parseAmountToMinor('(1 250,00)', 2, ',', ' ')).toBe(-125000n);
  });

  it('handles a leading minus sign', () => {
    expect(parseAmountToMinor('-1250,50', 2, ',', ' ')).toBe(-125050n);
  });

  it('strips currency symbols', () => {
    expect(parseAmountToMinor('1250,50 €', 2, ',', ' ')).toBe(125050n);
  });

  it('supports zero-decimal currencies (XOF)', () => {
    expect(parseAmountToMinor('5000', 0, ',', ' ')).toBe(5000n);
  });

  it('rejects more decimals than the currency supports rather than rounding', () => {
    expect(() => parseAmountToMinor('12,555', 2, ',', ' ')).toThrow(AmountParseError);
  });

  it('rejects non-numeric content', () => {
    expect(() => parseAmountToMinor('N/A', 2, ',', ' ')).toThrow(AmountParseError);
  });
});
