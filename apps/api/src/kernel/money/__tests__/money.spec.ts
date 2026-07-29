import { describe, expect, it } from 'vitest';
import * as Money from '../money';
import { CurrencyMismatchError } from '../money.types';

describe('money kernel', () => {
  it('adds two amounts in the same currency', () => {
    const a = Money.of(1000n, 'EUR');
    const b = Money.of(250n, 'EUR');
    expect(Money.add(a, b)).toEqual({ amountMinor: 1250n, currency: 'EUR' });
  });

  it('subtracts two amounts in the same currency', () => {
    const a = Money.of(1000n, 'EUR');
    const b = Money.of(250n, 'EUR');
    expect(Money.subtract(a, b)).toEqual({ amountMinor: 750n, currency: 'EUR' });
  });

  it('throws CurrencyMismatchError when adding different currencies', () => {
    const a = Money.of(1000n, 'EUR');
    const b = Money.of(1000n, 'XOF');
    expect(() => Money.add(a, b)).toThrow(CurrencyMismatchError);
  });

  it('throws CurrencyMismatchError when comparing different currencies', () => {
    const a = Money.of(1000n, 'EUR');
    const b = Money.of(1000n, 'XOF');
    expect(() => Money.compare(a, b)).toThrow(CurrencyMismatchError);
  });

  it('negates an amount', () => {
    expect(Money.negate(Money.of(500n, 'EUR'))).toEqual({ amountMinor: -500n, currency: 'EUR' });
  });

  it('detects zero, positive and negative amounts', () => {
    expect(Money.isZero(Money.of(0n, 'EUR'))).toBe(true);
    expect(Money.isPositive(Money.of(1n, 'EUR'))).toBe(true);
    expect(Money.isNegative(Money.of(-1n, 'EUR'))).toBe(true);
  });

  it('compares amounts', () => {
    expect(Money.compare(Money.of(100n, 'EUR'), Money.of(200n, 'EUR'))).toBe(-1);
    expect(Money.compare(Money.of(200n, 'EUR'), Money.of(100n, 'EUR'))).toBe(1);
    expect(Money.compare(Money.of(100n, 'EUR'), Money.of(100n, 'EUR'))).toBe(0);
  });

  it('multiplies by an integer factor', () => {
    expect(Money.multiplyByInt(Money.of(300n, 'EUR'), 3n)).toEqual({
      amountMinor: 900n,
      currency: 'EUR',
    });
  });

  describe('allocate', () => {
    it('splits an amount evenly with no remainder', () => {
      const shares = Money.allocate(Money.of(900n, 'EUR'), [1, 1, 1]);
      expect(shares.map((s) => s.amountMinor)).toEqual([300n, 300n, 300n]);
    });

    it('distributes the remainder deterministically (largest-remainder)', () => {
      const shares = Money.allocate(Money.of(100n, 'EUR'), [1, 1, 1]);
      const total = shares.reduce((sum, s) => sum + s.amountMinor, 0n);
      expect(total).toBe(100n);
      expect(shares.map((s) => s.amountMinor).sort()).toEqual([33n, 33n, 34n].sort());
    });

    it('handles unequal ratios and still sums exactly', () => {
      const shares = Money.allocate(Money.of(1000n, 'EUR'), [50, 30, 20]);
      const total = shares.reduce((sum, s) => sum + s.amountMinor, 0n);
      expect(total).toBe(1000n);
    });

    it('preserves sign for negative amounts', () => {
      const shares = Money.allocate(Money.of(-100n, 'EUR'), [1, 1, 1]);
      const total = shares.reduce((sum, s) => sum + s.amountMinor, 0n);
      expect(total).toBe(-100n);
      shares.forEach((s) => expect(s.amountMinor).toBeLessThanOrEqual(0n));
    });

    it('rejects an empty ratio list', () => {
      expect(() => Money.allocate(Money.of(100n, 'EUR'), [])).toThrow();
    });
  });

  describe('convert', () => {
    it('converts 10.00 EUR to XOF at the fixed peg 655.957', () => {
      const eur = Money.of(1000n, 'EUR'); // 10.00 EUR
      const xof = Money.convert(eur, 'XOF', '655.957', 2, 0);
      expect(xof).toEqual({ amountMinor: 6560n, currency: 'XOF' }); // 6 560 XOF
    });

    it('applies banker\'s rounding exactly at the .5 boundary', () => {
      // 5 minor units at rate 0.5, no unit shift: 2.5 rounds to even -> 2
      const source = Money.of(5n, 'EUR');
      expect(Money.convert(source, 'EUR', '0.5', 2, 2).amountMinor).toBe(2n);
      // 3 minor units at rate 0.5: 1.5 rounds to even -> 2
      expect(Money.convert(Money.of(3n, 'EUR'), 'EUR', '0.5', 2, 2).amountMinor).toBe(2n);
    });

    it('handles a currency with 3 minor units (TND)', () => {
      const eur = Money.of(100000n, 'EUR'); // 1000.00 EUR
      const tnd = Money.convert(eur, 'TND', '3.1', 2, 3);
      expect(tnd).toEqual({ amountMinor: 3100000n, currency: 'TND' }); // 3100.000 TND
    });
  });

  describe('format', () => {
    it('formats EUR with 2 decimals', () => {
      const formatted = Money.format(Money.of(123450n, 'EUR'), { code: 'EUR', minorUnits: 2 }, 'en-US');
      expect(formatted).toContain('1,234.50');
    });

    it('formats XOF with 0 decimals, never dividing by 100', () => {
      const formatted = Money.format(Money.of(12345n, 'XOF'), { code: 'XOF', minorUnits: 0 }, 'fr-FR');
      expect(formatted.replace(/\s/g, '')).toContain('12345');
    });

    it('throws when formatting with mismatched currency metadata', () => {
      expect(() =>
        Money.format(Money.of(100n, 'EUR'), { code: 'XOF', minorUnits: 0 }, 'en-US'),
      ).toThrow(CurrencyMismatchError);
    });
  });
});
