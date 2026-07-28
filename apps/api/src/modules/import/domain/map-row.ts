import { AmountParseError, parseAmountToMinor } from './amount-parser';
import { DateParseError, parseDateWithFormat } from './parse-date';

export interface ColumnMapping {
  occurredAt: string;
  description: string;
  amount?: string;
  debit?: string;
  credit?: string;
  typeAmount?: string;
  typeColumn?: string;
  typeDebitValues?: string[];
  payee?: string;
  externalRef?: string;
  notes?: string;
  accountName?: string;
}

export interface MappedRow {
  occurredAt: Date;
  description: string;
  amountMinor: bigint;
  type: 'EXPENSE' | 'INCOME';
  payee?: string;
  externalRef?: string;
  notes?: string;
  accountName?: string;
}

export class RowMappingError extends Error {
  constructor(
    public readonly column: string,
    public readonly raw: string,
    message: string,
  ) {
    super(message);
  }
}

function cell(headers: string[], row: string[], columnName: string | undefined): string {
  if (!columnName) return '';
  const index = headers.indexOf(columnName);
  return index >= 0 ? (row[index] ?? '') : '';
}

/** docs/06 §4-5: turns one raw row into a typed candidate transaction, per the configured mapping/amountStrategy. */
export function mapRow(
  headers: string[],
  row: string[],
  mapping: ColumnMapping,
  amountStrategy: 'SIGNED_SINGLE_COLUMN' | 'DEBIT_CREDIT_COLUMNS' | 'TYPE_COLUMN',
  dateFormat: string,
  decimalSeparator: string,
  thousandSeparator: string,
  minorUnits: number,
): MappedRow {
  const rawDate = cell(headers, row, mapping.occurredAt);
  const description = cell(headers, row, mapping.description).trim();
  if (!description) {
    throw new RowMappingError(mapping.description, description, 'DESCRIPTION_EMPTY');
  }

  let occurredAt: Date;
  try {
    occurredAt = parseDateWithFormat(rawDate, dateFormat);
  } catch (error) {
    if (error instanceof DateParseError) {
      throw new RowMappingError(mapping.occurredAt, rawDate, error.message);
    }
    throw error;
  }

  let signedMinor: bigint;
  try {
    if (amountStrategy === 'SIGNED_SINGLE_COLUMN') {
      const raw = cell(headers, row, mapping.amount);
      signedMinor = parseAmountToMinor(raw, minorUnits, decimalSeparator, thousandSeparator);
    } else if (amountStrategy === 'DEBIT_CREDIT_COLUMNS') {
      const debitRaw = cell(headers, row, mapping.debit).trim();
      const creditRaw = cell(headers, row, mapping.credit).trim();
      if (debitRaw) {
        const magnitude = parseAmountToMinor(debitRaw, minorUnits, decimalSeparator, thousandSeparator);
        signedMinor = magnitude < 0n ? magnitude : -magnitude;
      } else if (creditRaw) {
        const magnitude = parseAmountToMinor(creditRaw, minorUnits, decimalSeparator, thousandSeparator);
        signedMinor = magnitude < 0n ? -magnitude : magnitude;
      } else {
        throw new RowMappingError(mapping.debit ?? mapping.credit ?? '', '', 'AMOUNT_EMPTY');
      }
    } else {
      const amountRaw = cell(headers, row, mapping.typeAmount);
      const typeRaw = cell(headers, row, mapping.typeColumn).trim();
      const magnitude = parseAmountToMinor(amountRaw, minorUnits, decimalSeparator, thousandSeparator);
      const isDebit = (mapping.typeDebitValues ?? []).some((v) => v.toLowerCase() === typeRaw.toLowerCase());
      const absolute = magnitude < 0n ? -magnitude : magnitude;
      signedMinor = isDebit ? -absolute : absolute;
    }
  } catch (error) {
    if (error instanceof AmountParseError) {
      throw new RowMappingError(mapping.amount ?? mapping.debit ?? mapping.typeAmount ?? '', '', error.message);
    }
    throw error;
  }

  if (signedMinor === 0n) {
    throw new RowMappingError(mapping.amount ?? mapping.debit ?? mapping.typeAmount ?? '', '0', 'AMOUNT_ZERO');
  }

  return {
    occurredAt,
    description,
    amountMinor: signedMinor < 0n ? -signedMinor : signedMinor,
    type: signedMinor < 0n ? 'EXPENSE' : 'INCOME',
    payee: cell(headers, row, mapping.payee).trim() || undefined,
    externalRef: cell(headers, row, mapping.externalRef).trim() || undefined,
    notes: cell(headers, row, mapping.notes).trim() || undefined,
    accountName: cell(headers, row, mapping.accountName).trim() || undefined,
  };
}
