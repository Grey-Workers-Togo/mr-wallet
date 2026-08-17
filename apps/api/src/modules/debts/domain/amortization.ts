import { bankersRoundToBigInt } from './rounding';
import { addPeriodUTC, installmentCount, periodsPerYear } from './schedule-dates';

type Frequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'YEARLY';
type RateType = 'FIXED' | 'VARIABLE' | 'ZERO';

export interface AmortizationInput {
  principalMinor: bigint;
  annualRatePct: number | null;
  rateType: RateType;
  termDays: number | null;
  paymentFrequency: Frequency;
  startedOn: Date;
  startSequence?: number; // for regeneration (RG-D5): resume numbering after already-settled installments.
}

export interface AmortizationLine {
  sequence: number;
  dueOn: Date;
  totalMinor: bigint;
  principalMinor: bigint;
  interestMinor: bigint;
  balanceAfterMinor: bigint;
}

function periodicRate(annualRatePct: number | null, rateType: RateType, frequency: Frequency): number {
  return rateType === 'ZERO' ? 0 : ((annualRatePct ?? 0) / 100) / periodsPerYear(frequency);
}

/**
 * Core amortization loop for a fixed number of periods `n` with a fixed periodic rate `i`.
 * RG-D1: rounding error is absorbed by the last installment, so Σ principal_k = principal exactly.
 * RG-D2: the last `balanceAfterMinor` is forced to 0 by construction (not merely by rounding luck).
 */
function generateForCount(
  principalMinor: bigint,
  i: number,
  n: number,
  frequency: Frequency,
  startedOn: Date,
  startSequence: number,
): AmortizationLine[] {
  if (n <= 0 || principalMinor <= 0n) return [];
  const principal = Number(principalMinor);
  const installmentAmount = i > 0 ? (principal * i) / (1 - (1 + i) ** -n) : principal / n;
  const installmentMinor = bankersRoundToBigInt(installmentAmount);

  const lines: AmortizationLine[] = [];
  let balance = principalMinor;
  for (let k = 0; k < n; k += 1) {
    const isLast = k === n - 1;
    const interestMinor = i > 0 ? bankersRoundToBigInt(Number(balance) * i) : 0n;
    let principalMinorK = isLast ? balance : installmentMinor - interestMinor;
    if (principalMinorK > balance) principalMinorK = balance;
    const balanceAfterMinor = balance - principalMinorK;

    lines.push({
      sequence: startSequence + k,
      dueOn: addPeriodUTC(startedOn, frequency, k + 1),
      totalMinor: principalMinorK + interestMinor,
      principalMinor: principalMinorK,
      interestMinor,
      balanceAfterMinor,
    });
    balance = balanceAfterMinor;
  }
  return lines;
}

/** RG-D3: no `termDays` → no schedule, only the running balance is tracked. */
export function generateAmortizationSchedule(input: AmortizationInput): AmortizationLine[] {
  if (!input.termDays || input.principalMinor <= 0n) return [];
  const n = installmentCount(input.termDays, input.paymentFrequency);
  const i = periodicRate(input.annualRatePct, input.rateType, input.paymentFrequency);
  return generateForCount(input.principalMinor, i, n, input.paymentFrequency, input.startedOn, input.startSequence ?? 1);
}

/**
 * Manual schedule mode: installments are hand-typed by the user rather than computed. Each line
 * is treated as pure principal (no interest split) — the caller is responsible for validating
 * that dates are strictly ascending and totals sum to `principalMinor` before calling this.
 */
export function buildManualSchedule(
  lines: { dueOn: Date; totalMinor: bigint }[],
  principalMinor: bigint,
  startSequence = 1,
): AmortizationLine[] {
  let balance = principalMinor;
  return lines.map((line, k) => {
    balance -= line.totalMinor;
    return {
      sequence: startSequence + k,
      dueOn: line.dueOn,
      totalMinor: line.totalMinor,
      principalMinor: line.totalMinor,
      interestMinor: 0n,
      balanceAfterMinor: balance,
    };
  });
}

/**
 * RG-D4 "reduce duration" (default): keep the original installment amount fixed and pay off the
 * (reduced) balance in fewer periods.
 */
export function generateFixedInstallmentSchedule(
  principalMinor: bigint,
  i: number,
  installmentMinor: bigint,
  frequency: Frequency,
  startedOn: Date,
  startSequence: number,
  maxPeriods = 1200,
): AmortizationLine[] {
  const lines: AmortizationLine[] = [];
  let balance = principalMinor;
  let k = 0;
  while (balance > 0n && k < maxPeriods) {
    const interestMinor = i > 0 ? bankersRoundToBigInt(Number(balance) * i) : 0n;
    const remainingAfterInterest = installmentMinor > interestMinor ? installmentMinor - interestMinor : 0n;
    const principalMinorK = remainingAfterInterest >= balance ? balance : remainingAfterInterest;
    const balanceAfterMinor = balance - principalMinorK;

    lines.push({
      sequence: startSequence + k,
      dueOn: addPeriodUTC(startedOn, frequency, k + 1),
      totalMinor: principalMinorK + interestMinor,
      principalMinor: principalMinorK,
      interestMinor,
      balanceAfterMinor,
    });
    balance = balanceAfterMinor;
    k += 1;
  }
  return lines;
}

/** RG-D4 "reduce installment": keep the original remaining period count, recompute a smaller installment amount. */
export function generateForRemainingCount(
  principalMinor: bigint,
  annualRatePct: number | null,
  rateType: RateType,
  remainingCount: number,
  frequency: Frequency,
  startedOn: Date,
  startSequence: number,
): AmortizationLine[] {
  const i = periodicRate(annualRatePct, rateType, frequency);
  return generateForCount(principalMinor, i, remainingCount, frequency, startedOn, startSequence);
}

export { periodicRate };
