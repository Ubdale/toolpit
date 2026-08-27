'use client';

import type { SheetTable } from './runtime';

/**
 * Writing extracted tables back out as a real workbook.
 *
 * SheetJS's community build cannot write cell styles any more than it can read
 * them, so this goes through ExcelJS — the same library the styled reader uses.
 *
 * Two things matter more here than colour. First, numbers must arrive as
 * numbers: a column of "1,200.00" strings looks right and cannot be summed,
 * which is usually the entire reason someone wanted the spreadsheet. Second,
 * they must still *display* the way they did in the PDF, so each detected
 * number carries a format that reproduces its original appearance.
 */

type ExcelJsModule = typeof import('exceljs');

let excelJsPromise: Promise<ExcelJsModule> | null = null;

function loadExcelJs(): Promise<ExcelJsModule> {
  excelJsPromise ??= import('exceljs');
  return excelJsPromise;
}

export type ParsedNumber = { value: number; format: string };

/**
 * Recognises a formatted number and rebuilds the format string that displays
 * it the same way.
 *
 * Deliberately conservative: anything with letters, or a bare run of digits
 * long enough to be an invoice number, account number or ID, stays text.
 * Turning "0012345" into 12345 would destroy data, and that is worse than
 * leaving a cell uncomputable.
 */
export function parseNumeric(raw: string): ParsedNumber | null {
  const text = raw.trim();
  if (!text || text.length > 24) return null;

  const match = /^([($£€¥-]*)\s*([\d,\s]*\d(?:\.\d+)?)\s*([%)]*)$/.exec(text);
  if (!match) return null;

  const [, prefix, digits, suffix] = match;
  const negative = prefix!.includes('-') || (prefix!.includes('(') && suffix!.includes(')'));
  const percent = suffix!.includes('%');
  const currency = (prefix!.match(/[$£€¥]/) ?? [''])[0];

  // A long unseparated digit run is an identifier, not a quantity.
  if (!currency && !percent && !digits!.includes(',') && !digits!.includes('.')) {
    if (digits!.length > 9 || /^0\d/.test(digits!)) return null;
  }

  const cleaned = digits!.replace(/[,\s]/g, '');
  let value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  if (percent) value /= 100;
  if (negative) value = -value;

  const decimals = cleaned.includes('.') ? cleaned.split('.')[1]!.length : 0;
  const grouped = digits!.includes(',');
  const body = `${grouped ? '#,##0' : '0'}${decimals > 0 ? `.${'0'.repeat(decimals)}` : ''}`;

  return {
    value,
    format: percent ? `${body}%` : currency ? `"${currency}"${body}` : body,
  };
}

export type ExcelStyleOptions = {
  /** Type numeric-looking cells as numbers, keeping their displayed format. */
  typeNumbers: boolean;
  /** Bold the first row and freeze it. */
  markHeader: boolean;
};

export const defaultExcelStyleOptions: ExcelStyleOptions = {
  typeNumbers: true,
  markHeader: true,
};

/**
 * Finds the header row.
 *
 * Row 0 is often the document's title — "Statement of Account" spanning one
 * cell with the rest blank — and bolding that while leaving the real column
 * headings plain looks broken. A header is the first row within the opening few
 * where every column actually has a value.
 */
export function headerRowIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 5);
  for (let index = 0; index < limit; index += 1) {
    const row = rows[index]!;
    if (row.length > 1 && row.every((cell) => cell.trim().length > 0)) return index;
  }
  return 0;
}

export async function writeStyledWorkbook(
  tables: SheetTable[],
  options: ExcelStyleOptions,
): Promise<Blob> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Toolpit';

  for (const [index, table] of tables.entries()) {
    // Excel rejects sheet names over 31 characters or containing []:*?/\
    const safe = (table.name || `Sheet ${index + 1}`)
      .replace(/[[\]:*?/\\]/g, '-')
      .slice(0, 31);
    const sheet = workbook.addWorksheet(safe);
    const headerIndex = options.markHeader ? headerRowIndex(table.rows) : -1;

    for (const [rowIndex, row] of table.rows.entries()) {
      const line = sheet.getRow(rowIndex + 1);

      for (const [columnIndex, text] of row.entries()) {
        const cell = line.getCell(columnIndex + 1);
        const numeric =
          options.typeNumbers && rowIndex !== headerIndex ? parseNumeric(text) : null;

        if (numeric) {
          cell.value = numeric.value;
          cell.numFmt = numeric.format;
          cell.alignment = { horizontal: 'right' };
        } else {
          cell.value = text;
        }

        if (rowIndex === headerIndex) {
          cell.font = { bold: true };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF4F1EC' },
          };
        }
      }

      line.commit();
    }

    // Width columns to their content, so the file opens readable rather than as
    // a wall of ### and truncation.
    //
    // Indexed loops rather than forEach: a row that arrived with a hole in it
    // silently skips that index, leaving one column with no width at all while
    // its neighbours get one.
    const columnCount = table.rows.reduce((max, row) => Math.max(max, row.length), 0);
    const widths: number[] = new Array(columnCount).fill(8);
    for (const row of table.rows) {
      for (let i = 0; i < columnCount; i += 1) {
        const cell = row[i] ?? '';
        widths[i] = Math.min(60, Math.max(widths[i]!, cell.length + 2));
      }
    }
    // Address columns by index rather than through `sheet.columns`, whose
    // length tracks what ExcelJS has materialised and can be short.
    for (let i = 0; i < widths.length; i += 1) {
      sheet.getColumn(i + 1).width = widths[i] ?? 12;
    }

    if (headerIndex >= 0 && table.rows.length > headerIndex + 1) {
      sheet.views = [{ state: 'frozen', ySplit: headerIndex + 1 }];
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
