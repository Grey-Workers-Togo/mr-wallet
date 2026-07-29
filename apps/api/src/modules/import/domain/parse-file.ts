import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { detectDelimiter, detectHeaderRowIndex, stripBom } from './sniff';

export interface ParsedFile {
  headers: string[];
  rows: string[][];
  headerRowIndex: number;
  delimiter: string | null;
}

/** docs/06 §2-3: delimited text (CSV/TSV), encoding assumed UTF-8 (BOM stripped), delimiter auto-detected. */
export function parseDelimitedText(buffer: Buffer): ParsedFile {
  const content = stripBom(buffer.toString('utf-8'));
  const sampleLines = content.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 20);
  const delimiter = detectDelimiter(sampleLines);

  const allRows = parseCsv(content, { delimiter, relax_column_count: true, skip_empty_lines: true }) as string[][];
  const headerRowIndex = detectHeaderRowIndex(allRows);
  const headers = (allRows[headerRowIndex] ?? []).map((h) => h.trim());
  const rows = allRows.slice(headerRowIndex + 1);
  return { headers, rows, headerRowIndex, delimiter };
}

/** XLSX/XLS: first worksheet, cells stringified so the same downstream mapping pipeline applies. */
export async function parseSpreadsheet(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [], headerRowIndex: 0, delimiter: null };
  }

  const allRows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (c) => {
      const value = c.value;
      if (value instanceof Date) {
        cells.push(value.toISOString().slice(0, 10));
      } else if (value && typeof value === 'object' && 'text' in value) {
        cells.push(String((value as { text: unknown }).text ?? ''));
      } else {
        cells.push(value === null || value === undefined ? '' : String(value));
      }
    });
    allRows.push(cells);
  });

  const headerRowIndex = detectHeaderRowIndex(allRows);
  const headers = (allRows[headerRowIndex] ?? []).map((h) => h.trim());
  const rows = allRows.slice(headerRowIndex + 1);
  return { headers, rows, headerRowIndex, delimiter: null };
}
