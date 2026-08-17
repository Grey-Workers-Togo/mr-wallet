import { describe, expect, it } from 'vitest';
import { buildManualSchedule, generateAmortizationSchedule } from '../amortization';

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
        termDays: 360,
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
        termDays: 210,
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
        termDays: 180,
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
        termDays: 720,
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
        termDays: 90,
        paymentFrequency: 'MONTHLY',
        startedOn: new Date('2026-01-01'),
      },
    },
    {
      name: 'short-term daily loan, 10 days',
      input: {
        principalMinor: 50_000n,
        annualRatePct: 0,
        rateType: 'ZERO',
        termDays: 10,
        paymentFrequency: 'DAILY',
        startedOn: new Date('2026-01-01'),
      },
    },
    {
      name: 'short-term weekly loan, 2 weeks',
      input: {
        principalMinor: 20_000n,
        annualRatePct: 12,
        rateType: 'FIXED',
        termDays: 14,
        paymentFrequency: 'WEEKLY',
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

  it('RG-D3: no termDays → empty schedule', () => {
    expect(
      generateAmortizationSchedule({
        principalMinor: 100_000n,
        annualRatePct: 10,
        rateType: 'FIXED',
        termDays: null,
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
      termDays: 60,
      paymentFrequency: 'MONTHLY',
      startedOn: new Date(Date.UTC(2026, 0, 31)),
    });
    expect(lines[0]?.dueOn.getUTCMonth()).toBe(1); // Feb
    expect(lines[0]?.dueOn.getUTCDate()).toBe(28);
  });
});

describe('buildManualSchedule', () => {
  it('sums to principal, zero interest, last balance = 0, sequence in input order', () => {
    const lines = buildManualSchedule(
      [
        { dueOn: new Date('2026-01-05'), totalMinor: 10_000n },
        { dueOn: new Date('2026-01-12'), totalMinor: 15_000n },
        { dueOn: new Date('2026-02-01'), totalMinor: 25_000n },
      ],
      50_000n,
    );

    expect(lines.map((l) => l.sequence)).toEqual([1, 2, 3]);
    expect(lines.reduce((acc, l) => acc + l.principalMinor, 0n)).toBe(50_000n);
    expect(lines.every((l) => l.interestMinor === 0n)).toBe(true);
    expect(lines.every((l) => l.totalMinor === l.principalMinor)).toBe(true);
    expect(lines[lines.length - 1]?.balanceAfterMinor).toBe(0n);
  });

  it('resumes numbering from startSequence', () => {
    const lines = buildManualSchedule([{ dueOn: new Date('2026-03-01'), totalMinor: 5_000n }], 5_000n, 4);
    expect(lines[0]?.sequence).toBe(4);
  });
});
