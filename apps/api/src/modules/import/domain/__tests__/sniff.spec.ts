import { describe, expect, it } from 'vitest';
import { detectDelimiter, detectHeaderRowIndex, stripBom } from '../sniff';

describe('detectDelimiter (docs/06 §3)', () => {
  it('picks the semicolon when it is the most regular delimiter', () => {
    const lines = ['Date;Libelle;Montant', '01/01/2026;Cafe;-2,50', '02/01/2026;Salaire;1500,00'];
    expect(detectDelimiter(lines)).toBe(';');
  });

  it('picks the comma for a CSV file', () => {
    const lines = ['Date,Description,Amount', '2026-01-01,Coffee,-2.50', '2026-01-02,Salary,1500.00'];
    expect(detectDelimiter(lines)).toBe(',');
  });
});

describe('stripBom', () => {
  it('removes a leading UTF-8 BOM', () => {
    expect(stripBom('﻿Date;Montant')).toBe('Date;Montant');
  });

  it('leaves content without a BOM untouched', () => {
    expect(stripBom('Date;Montant')).toBe('Date;Montant');
  });
});

describe('detectHeaderRowIndex', () => {
  it('finds the first row of distinct text cells', () => {
    const rows = [
      ['Relevé de compte', '', ''],
      ['Date', 'Libelle', 'Montant'],
      ['01/01/2026', 'Cafe', '-2,50'],
    ];
    expect(detectHeaderRowIndex(rows)).toBe(1);
  });
});
