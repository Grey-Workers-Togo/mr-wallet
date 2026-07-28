import { describe, expect, it } from 'vitest';
import { RowMappingError, mapRow } from '../map-row';

const headers = ['Date', 'Libelle', 'Montant'];
const mapping = { occurredAt: 'Date', description: 'Libelle', amount: 'Montant' };

describe('mapRow — SIGNED_SINGLE_COLUMN', () => {
  it('maps a negative amount to EXPENSE', () => {
    const row = ['12/07/2026', 'Cafe', '-2,50'];
    const result = mapRow(headers, row, mapping, 'SIGNED_SINGLE_COLUMN', 'dd/MM/yyyy', ',', ' ', 2);
    expect(result.type).toBe('EXPENSE');
    expect(result.amountMinor).toBe(250n);
    expect(result.description).toBe('Cafe');
  });

  it('maps a positive amount to INCOME', () => {
    const row = ['12/07/2026', 'Salaire', '1500,00'];
    const result = mapRow(headers, row, mapping, 'SIGNED_SINGLE_COLUMN', 'dd/MM/yyyy', ',', ' ', 2);
    expect(result.type).toBe('INCOME');
    expect(result.amountMinor).toBe(150000n);
  });

  it('rejects a zero amount', () => {
    const row = ['12/07/2026', 'Cafe', '0,00'];
    expect(() => mapRow(headers, row, mapping, 'SIGNED_SINGLE_COLUMN', 'dd/MM/yyyy', ',', ' ', 2)).toThrow(RowMappingError);
  });

  it('rejects an empty description', () => {
    const row = ['12/07/2026', '', '-2,50'];
    expect(() => mapRow(headers, row, mapping, 'SIGNED_SINGLE_COLUMN', 'dd/MM/yyyy', ',', ' ', 2)).toThrow(RowMappingError);
  });
});

describe('mapRow — DEBIT_CREDIT_COLUMNS', () => {
  const dcHeaders = ['Date', 'Libelle', 'Debit', 'Credit'];
  const dcMapping = { occurredAt: 'Date', description: 'Libelle', debit: 'Debit', credit: 'Credit' };

  it('treats a filled debit column as EXPENSE', () => {
    const row = ['12/07/2026', 'Cafe', '2,50', ''];
    const result = mapRow(dcHeaders, row, dcMapping, 'DEBIT_CREDIT_COLUMNS', 'dd/MM/yyyy', ',', ' ', 2);
    expect(result.type).toBe('EXPENSE');
    expect(result.amountMinor).toBe(250n);
  });

  it('treats a filled credit column as INCOME', () => {
    const row = ['12/07/2026', 'Salaire', '', '1500,00'];
    const result = mapRow(dcHeaders, row, dcMapping, 'DEBIT_CREDIT_COLUMNS', 'dd/MM/yyyy', ',', ' ', 2);
    expect(result.type).toBe('INCOME');
    expect(result.amountMinor).toBe(150000n);
  });
});

describe('mapRow — TYPE_COLUMN', () => {
  const typeHeaders = ['Date', 'Libelle', 'Montant', 'Sens'];
  const typeMapping = {
    occurredAt: 'Date',
    description: 'Libelle',
    typeAmount: 'Montant',
    typeColumn: 'Sens',
    typeDebitValues: ['D', 'Débit'],
  };

  it('applies the debit value table to derive the sign', () => {
    const row = ['12/07/2026', 'Cafe', '2,50', 'D'];
    const result = mapRow(typeHeaders, row, typeMapping, 'TYPE_COLUMN', 'dd/MM/yyyy', ',', ' ', 2);
    expect(result.type).toBe('EXPENSE');
  });

  it('treats anything outside the debit table as credit', () => {
    const row = ['12/07/2026', 'Salaire', '1500,00', 'C'];
    const result = mapRow(typeHeaders, row, typeMapping, 'TYPE_COLUMN', 'dd/MM/yyyy', ',', ' ', 2);
    expect(result.type).toBe('INCOME');
  });
});
