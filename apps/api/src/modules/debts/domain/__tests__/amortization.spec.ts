import { describe, expect, it } from 'vitest';
import { generateAmortizationSchedule } from '../amortization';

function sumCapital(lines: ReturnType<typeof generateAmortizationSchedule>): bigint {
  return lines.reduce((acc, l) => acc + l.principalMinor, 0n);
}

describe('generateAmortizationSchedule (RG-D1/RG-D2)', () => {
  const cases: { name: string; input: Parameters<typeof generateAmortizationSchedule>[0] }[] = [
    {
      name: 'monthly loan, 5%, 12 months',
      input: {
        principalMinor: 1_200_000n,
        annualRatePct: 5,
        rateType: 'FIXED',
        termMonths: 12,
        paymentFrequency: 'MONTHLY',
        startedOn: new Date('2026-01-31'),
      },
    },
    {
      name: 'zero-rate loan, non-divisible amount',
      input: {
        principalMinor: 100_000n,
        annualRatePct: 0,
        rateType: 'ZERO',
        termMonths: 7,
        paymentFrequency: 'MONTHLY',
        startedOn: new Date('2026-01-15'),
      },
    },
    {
      name: 'high rate, short term',
      input: {
        principalMinor: 5_000_000n,
        annualRatePct: 24,
        rateType: 'FIXED',
        termMonths: 6,
        paymentFrequency: 'MONTHLY',
        startedOn: new Date('2026-03-31'),
      },
    },
    {
      name: 'quarterly payments',
      input: {
        principalMinor: 3_333_333n,
        annualRatePct: 8.5,
        rateType: 'FIXED',
        termMonths: 24,
        paymentFrequency: 'QUARTERLY',
        startedOn: new Date('2026-06-30'),
      },
    },
    {
      name: 'single-cent principal, rate 0',
      input: {
        principalMinor: 7n,
        annualRatePct: 0,
        rateType: 'ZERO',
        termMonths: 3,
        paymentFrequency: 'MONTHLY',
        startedOn: new Date('2026-01-01'),
      },
    },
  ];

  for (const { name, input } of cases) {
    it(`${name}: sum of principal = principal, last balance = 0`, () => {
      const lines = generateAmortizationSchedule(input);
      expect(sumCapital(lines)).toBe(input.principalMinor);
      expect(lines[lines.length - 1]?.balanceAfterMinor).toBe(0n);
      for (const line of lines) {
        expect(line.totalMinor).toBe(line.principalMinor + line.interestMinor);
      }
    });
  }

  it('RG-D3: no termMonths → empty schedule', () => {
    expect(
      generateAmortizationSchedule({
        principalMinor: 100_000n,
        annualRatePct: 10,
        rateType: 'FIXED',
        termMonths: null,
        paymentFrequency: 'MONTHLY',
        startedOn: new Date('2026-01-01'),
      }),
    ).toHaveLength(0);
  });

  it('clamps the day-31 due date to the last day of shorter months', () => {
    const lines = generateAmortizationSchedule({
      principalMinor: 100_000n,
      annualRatePct: 0,
      rateType: 'ZERO',
      termMonths: 2,
      paymentFrequency: 'MONTHLY',
      startedOn: new Date(Date.UTC(2026, 0, 31)),
    });
    expect(lines[0]?.dueOn.getUTCMonth()).toBe(1); // Feb
    expect(lines[0]?.dueOn.getUTCDate()).toBe(28);
  });
});
