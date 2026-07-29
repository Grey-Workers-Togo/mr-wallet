const BOM = '﻿';

function escapeCell(value: unknown, delimiter: string): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** docs/06 §10: UTF-8 with BOM (Excel-safe accents), `;` delimiter by default. */
export function toCsv(rows: Record<string, unknown>[], columns: string[], delimiter = ';'): string {
  const header = columns.join(delimiter);
  const body = rows.map((row) => columns.map((col) => escapeCell(row[col], delimiter)).join(delimiter));
  return BOM + [header, ...body].join('\r\n');
}
