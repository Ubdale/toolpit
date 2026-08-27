'use client';

/**
 * Lazy loader for SheetJS, memoised per session.
 *
 * Same rule as every other engine on Toolpit: never imported at module scope,
 * so a visitor who only merges PDFs never downloads a spreadsheet parser.
 */

type SheetJs = typeof import('xlsx');

let promise: Promise<SheetJs> | null = null;

export function loadSheetJs(): Promise<SheetJs> {
  promise ??= import('xlsx');
  return promise;
}

export type SheetTable = {
  name: string;
  /** Rows of cell strings, already rectangular. */
  rows: string[][];
};

/** Formats used by the spreadsheet tools, for `accept` attributes. */
export const SPREADSHEET_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
  '.xlsx',
  '.xls',
  '.ods',
  '.csv',
];

/**
 * Reads every sheet of a workbook into plain string rows.
 *
 * Values are taken as *formatted* text, not raw — a date should land in the PDF
 * looking like the date the author saw, not like the serial number Excel stores
 * underneath it. Formulas resolve to their last cached result, which is what a
 * reader wants and all a file can offer without a calculation engine.
 */
export async function readWorkbook(file: File): Promise<SheetTable[]> {
  const XLSX = await loadSheetJs();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });

  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return { name, rows: [] };

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    });

    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    return {
      name,
      rows: rows.map((row) =>
        Array.from({ length: width }, (_, i) => String(row[i] ?? '').trim()),
      ),
    };
  }).filter((table) => table.rows.length > 0);
}

/** Builds an .xlsx workbook from extracted tables. */
export async function writeWorkbook(tables: SheetTable[]): Promise<Blob> {
  const XLSX = await loadSheetJs();
  const workbook = XLSX.utils.book_new();

  for (const [index, table] of tables.entries()) {
    const sheet = XLSX.utils.aoa_to_sheet(table.rows);

    // Size columns to their content so the file is readable on open rather
    // than a wall of ### and truncation.
    const widths = table.rows.reduce<number[]>((acc, row) => {
      row.forEach((cell, i) => {
        acc[i] = Math.min(60, Math.max(acc[i] ?? 8, cell.length + 2));
      });
      return acc;
    }, []);
    sheet['!cols'] = widths.map((width) => ({ wch: width }));

    // Excel rejects sheet names over 31 characters or containing []:*?/\
    const safe = (table.name || `Sheet ${index + 1}`)
      .replace(/[[\]:*?/\\]/g, '-')
      .slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, sheet, safe);
  }

  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Builds a CSV from one table. */
export async function writeCsv(table: SheetTable): Promise<Blob> {
  const XLSX = await loadSheetJs();
  const sheet = XLSX.utils.aoa_to_sheet(table.rows);
  return new Blob([XLSX.utils.sheet_to_csv(sheet)], { type: 'text/csv;charset=utf-8' });
}
