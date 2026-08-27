'use client';

import { loadSheetJs, readWorkbook, type SheetTable } from './runtime';

/**
 * Style-aware workbook reading.
 *
 * SheetJS's community build deliberately does not parse cell styles — fonts,
 * fills, colours and borders are a paid feature — so the values-only reader in
 * runtime.ts cannot see formatting at all, no matter how the renderer is tuned.
 * ExcelJS (MIT) does read them, so `.xlsx` goes through it.
 *
 * It cannot read the legacy `.xls` BIFF format or `.ods`, though, and SheetJS
 * can. So each reader handles what it is good at, and a workbook that only
 * SheetJS can open still converts — just without formatting, which the UI says
 * out loud rather than leaving the visitor to wonder.
 */

export type Align = 'left' | 'center' | 'right';

export type CellStyle = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** Points. */
  size?: number;
  /** 0-1 RGB. */
  color?: [number, number, number];
  fill?: [number, number, number];
  align?: Align;
};

export type StyledCell = {
  text: string;
  style: CellStyle;
  /** Columns this cell spans, from a merge. 1 for an ordinary cell. */
  colSpan: number;
  /** Rows this cell spans. 1 for an ordinary cell. */
  rowSpan: number;
  /** True for cells swallowed by a merge above or to the left. */
  covered: boolean;
};

/**
 * Excel's default body size. Anything at this size is "unstyled" as far as the
 * renderer is concerned, so a workbook using the default throughout lands at
 * Toolpit's own body size rather than a slightly different one.
 */
export const DEFAULT_XLSX_FONT_SIZE = 11;

export type StyledTable = {
  name: string;
  rows: StyledCell[][];
  /** Author's column widths in points, or null where unset. */
  columnWidths: (number | null)[];
  /** Whether the source actually carried formatting we could read. */
  styled: boolean;
};

type ExcelJsModule = typeof import('exceljs');

let excelJsPromise: Promise<ExcelJsModule> | null = null;

function loadExcelJs(): Promise<ExcelJsModule> {
  excelJsPromise ??= import('exceljs');
  return excelJsPromise;
}

/** ExcelJS reports colours as ARGB hex; theme colours arrive without one. */
function argbToRgb(argb: string | undefined): [number, number, number] | undefined {
  if (!argb || argb.length < 6) return undefined;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  const value = Number.parseInt(hex, 16);
  if (Number.isNaN(value)) return undefined;
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * ExcelJS column widths are in character units, the same unit Excel shows.
 * The conventional pixel conversion is `width * 7 + 5`, and PDF points are
 * three quarters of a CSS pixel.
 */
function widthToPoints(width: number | undefined): number | null {
  if (!width || width <= 0) return null;
  return (width * 7 + 5) * 0.75;
}

function alignmentOf(horizontal: string | undefined, isNumber: boolean): Align | undefined {
  if (horizontal === 'center' || horizontal === 'centerContinuous') return 'center';
  if (horizontal === 'right') return 'right';
  if (horizontal === 'left') return 'left';
  // Spreadsheets right-align numbers by default, and a column of figures that
  // arrives left-aligned looks wrong even though every value is correct.
  return isNumber ? 'right' : undefined;
}

const blank = (): StyledCell => ({
  text: '',
  style: {},
  colSpan: 1,
  rowSpan: 1,
  covered: false,
});

/** Excel serial day 1 is 1900-01-01, offset by its famous phantom leap day. */
function dateToSerial(date: Date): number {
  return date.getTime() / 86_400_000 + 25_569;
}

/**
 * Renders a cell the way Excel displays it.
 *
 * ExcelJS exposes the number format string but never applies it — `cell.text`
 * on a currency cell is the bare number. SheetJS ships the SSF formatter that
 * does exactly this job, so the two are combined: ExcelJS for structure and
 * style, SSF for the displayed value.
 */
function displayText(
  cell: { value: unknown; text?: string; numFmt?: string },
  format: (fmt: string, value: number) => string,
): string {
  const raw = cell.value;
  const numFmt = cell.numFmt;

  if (numFmt && typeof raw === 'number') {
    try {
      return format(numFmt, raw).trim();
    } catch {
      /* fall through to the plain text */
    }
  }

  if (raw instanceof Date) {
    try {
      return format(numFmt || 'yyyy-mm-dd', dateToSerial(raw)).trim();
    } catch {
      return raw.toISOString().slice(0, 10);
    }
  }

  return (cell.text ?? '').toString().trim();
}

/** Reads an .xlsx with its formatting intact. */
async function readStyled(file: File): Promise<StyledTable[]> {
  const ExcelJS = await loadExcelJs();
  const XLSX = await loadSheetJs();
  const format = (fmt: string, value: number) => XLSX.SSF.format(fmt, value) as string;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const tables: StyledTable[] = [];

  workbook.eachSheet((sheet) => {
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') return;

    const rowCount = sheet.rowCount;
    const columnCount = sheet.columnCount;
    if (rowCount === 0 || columnCount === 0) return;

    // Merge ranges are the only place spans are recorded; individual cells only
    // know that they are merged, not how far.
    const spans = new Map<string, { colSpan: number; rowSpan: number }>();
    const covered = new Set<string>();
    const merges = (sheet.model as { merges?: string[] }).merges ?? [];

    for (const range of merges) {
      const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
      if (!match) continue;
      const toIndex = (letters: string) =>
        [...letters].reduce((sum, c) => sum * 26 + (c.charCodeAt(0) - 64), 0);
      const left = toIndex(match[1]!);
      const top = Number(match[2]);
      const right = toIndex(match[3]!);
      const bottom = Number(match[4]);

      spans.set(`${top}:${left}`, { colSpan: right - left + 1, rowSpan: bottom - top + 1 });
      for (let r = top; r <= bottom; r += 1) {
        for (let c = left; c <= right; c += 1) {
          if (r === top && c === left) continue;
          covered.add(`${r}:${c}`);
        }
      }
    }

    const hiddenColumns = new Set<number>();
    for (let c = 1; c <= columnCount; c += 1) {
      if (sheet.getColumn(c).hidden) hiddenColumns.add(c);
    }

    const keptColumns: number[] = [];
    for (let c = 1; c <= columnCount; c += 1) if (!hiddenColumns.has(c)) keptColumns.push(c);
    if (keptColumns.length === 0) return;

    let styled = false;
    const rows: StyledCell[][] = [];

    for (let r = 1; r <= rowCount; r += 1) {
      const row = sheet.getRow(r);
      if (row.hidden) continue;

      const line: StyledCell[] = [];
      let anyText = false;

      for (const c of keptColumns) {
        const cell = row.getCell(c);
        const out = blank();

        if (covered.has(`${r}:${c}`)) {
          out.covered = true;
          line.push(out);
          continue;
        }

        const span = spans.get(`${r}:${c}`);
        if (span) {
          out.colSpan = span.colSpan;
          out.rowSpan = span.rowSpan;
        }

        out.text = displayText(
          cell as { value: unknown; text?: string; numFmt?: string },
          format,
        );
        if (out.text) anyText = true;

        const font = cell.font;
        if (font) {
          if (font.bold) out.style.bold = true;
          if (font.italic) out.style.italic = true;
          if (font.underline) out.style.underline = true;
          // A cell sitting at Excel's default size is not styled; recording
          // it would render half a table at 9.3pt and the rest at 8.5pt.
          if (font.size && font.size !== DEFAULT_XLSX_FONT_SIZE) out.style.size = font.size;
          const color = argbToRgb((font.color as { argb?: string } | undefined)?.argb);
          if (color) out.style.color = color;
          if (font.bold || font.italic || out.style.size || color) styled = true;
        }

        const fill = cell.fill as { type?: string; fgColor?: { argb?: string } } | undefined;
        if (fill?.type === 'pattern') {
          const background = argbToRgb(fill.fgColor?.argb);
          // White fills are the default look; painting them wastes ink and
          // makes a plain sheet look banded.
          if (background && !(background[0] > 0.98 && background[1] > 0.98 && background[2] > 0.98)) {
            out.style.fill = background;
            styled = true;
          }
        }

        const align = alignmentOf(
          cell.alignment?.horizontal,
          typeof cell.value === 'number' || cell.type === 2,
        );
        if (align) out.style.align = align;

        line.push(out);
      }

      // Trailing empty rows are noise; interior blank rows are layout.
      if (anyText || rows.length > 0) rows.push(line);
    }

    while (rows.length > 0 && rows[rows.length - 1]!.every((cell) => !cell.text)) rows.pop();
    if (rows.length === 0) return;

    tables.push({
      name: sheet.name,
      rows,
      columnWidths: keptColumns.map((c) => widthToPoints(sheet.getColumn(c).width)),
      styled,
    });
  });

  return tables;
}

/** Wraps a values-only table in the styled shape, with no formatting. */
export function unstyled(tables: SheetTable[]): StyledTable[] {
  return tables.map((table) => ({
    name: table.name,
    rows: table.rows.map((row) =>
      row.map((text) => ({ ...blank(), text })),
    ),
    columnWidths: (table.rows[0] ?? []).map(() => null),
    styled: false,
  }));
}

const XLSX_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
];

/**
 * Reads a workbook with as much fidelity as its format allows: ExcelJS for
 * `.xlsx` (formatting intact), SheetJS for everything else (values only).
 */
export async function readAnyWorkbook(file: File): Promise<StyledTable[]> {
  const isXlsx = XLSX_TYPES.includes(file.type) || /\.xlsx$|\.xlsm$/i.test(file.name);

  if (isXlsx) {
    try {
      const styled = await readStyled(file);
      if (styled.length > 0) return styled;
    } catch {
      // A workbook ExcelJS chokes on is still worth converting without its
      // formatting, so fall through rather than fail the whole file.
    }
  }

  return unstyled(await readWorkbook(file));
}
