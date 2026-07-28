export type CurrencyCode = string;

export interface Money {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
}

export interface CurrencyMeta {
  readonly code: CurrencyCode;
  readonly minorUnits: number;
}

export class CurrencyMismatchError extends Error {
  constructor(
    public readonly expected: CurrencyCode,
    public readonly received: CurrencyCode,
  ) {
    super(`Currency mismatch: expected ${expected}, received ${received}`);
    this.name = 'CurrencyMismatchError';
  }
}
