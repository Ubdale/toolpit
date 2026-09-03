'use client';

import { formatNumber } from '@/lib/chart/apex';

import { aggregate, applyFilters, applySearch, applySort, asNumber, asText } from './query';
import type {
  CellFormat,
  ConditionalRule,
  Dataset,
  Field,
  Measure,
  QueryConfig,
  Row,
} from './types';

/**
 * Building and exporting a tabular report.
 *
 * The shape below is what both the on-screen table and the Excel file are
 * rendered from, so what opens in Excel is what was on screen — including the
 * grouping, the subtotals and the conditional formatting, rather than a flat
 * dump of the same numbers.
 */

export type ReportConfig = {
  /** Columns shown, in order. */
  columns: string[];
  /** Rows are grouped by these, in order, with subtotals per group. */
  groupBy: string[];
  /** Pivot: values of this field become columns. */
  pivotBy: string | null;
  measures: Measure[];
  query: QueryConfig;
  formats: Record<string, CellFormat>;
  conditional: ConditionalRule[];
  /** Widths in pixels, by column key. */
  widths: Record<string, number>;
  pinned: string[];
  showGrandTotal: boolean;
  showSubtotals: boolean;
  title: string;
  footer: string;
  pageSize: number;
};

export type ReportCell = {
  value: string | number | boolean | null;
  display: string;
  numeric: number | null;
  /** Resolved from the conditional rules. */
  background?: string;
  color?: string;
  /** 0-1, for a data bar. */
  bar?: number;
  icon?: 'up' | 'down' | 'flat';
};

export type ReportRow = {
  kind: 'data' | 'group' | 'subtotal' | 'total';
  /** Indent level for grouped output. */
  depth: number;
  label?: string;
  cells: ReportCell[];
  /** Rows behind a subtotal, for drill-down. */
  source?: Row[];
};

export type ReportResult = {
  columns: { key: string; label: string; numeric: boolean }[];
  rows: ReportRow[];
  totalRows: number;
};

const DEFAULT_CELL: CellFormat = { format: 'plain', decimals: 2, thousands: true };

function display(value: unknown, format: CellFormat): string {
  if (value === null || value === undefined || value === '') return '';
  if (format.format === 'date') return asText(value);

  const numeric = asNumber(value);
  if (numeric === null) return asText(value);

  // 'date' is handled above; everything else maps straight onto the shared
  // number formatter so a column reads the same here as in a chart.
  return formatNumber(numeric, {
    format: format.format,
    currency: format.currency,
    decimals: format.decimals,
  });
}

/** Paints a cell from whichever conditional rules apply to its column. */
function decorate(
  cell: ReportCell,
  field: string,
  rules: ConditionalRule[],
  range: { min: number; max: number },
): ReportCell {
  for (const rule of rules) {
    if (rule.field !== field) continue;

    if (rule.kind === 'dataBar' && cell.numeric !== null) {
      const span = range.max - range.min || 1;
      cell.bar = Math.max(0, Math.min(1, (cell.numeric - range.min) / span));
      continue;
    }

    if (rule.kind === 'colorScale' && cell.numeric !== null && rule.scale) {
      const span = range.max - range.min || 1;
      const t = Math.max(0, Math.min(1, (cell.numeric - range.min) / span));
      cell.background = mixScale(rule.scale, t);
      continue;
    }

    if (rule.kind === 'iconSet' && cell.numeric !== null) {
      const mid = (range.min + range.max) / 2;
      cell.icon = cell.numeric > mid * 1.05 ? 'up' : cell.numeric < mid * 0.95 ? 'down' : 'flat';
      continue;
    }

    if (rule.kind === 'cell') {
      const target = asNumber(rule.value);
      const value = cell.numeric;
      let hit = false;

      if (value !== null && target !== null) {
        if (rule.operator === 'gt') hit = value > target;
        else if (rule.operator === 'gte') hit = value >= target;
        else if (rule.operator === 'lt') hit = value < target;
        else if (rule.operator === 'lte') hit = value <= target;
        else if (rule.operator === 'eq') hit = value === target;
        else if (rule.operator === 'between') hit = value >= target && value <= (asNumber(rule.value2) ?? target);
      } else if (rule.operator === 'contains') {
        hit = cell.display.toLowerCase().includes(asText(rule.value).toLowerCase());
      }

      if (hit) cell.background = rule.color ?? '#fde7dd';
    }
  }
  return cell;
}

/** Two- or three-stop linear interpolation in sRGB. */
function mixScale(scale: [string, string] | [string, string, string], t: number): string {
  const stops = scale.map(hexToRgb);
  if (stops.length === 2) return rgbToHex(lerp(stops[0]!, stops[1]!, t));
  const mid = 0.5;
  return t <= mid
    ? rgbToHex(lerp(stops[0]!, stops[1]!, t / mid))
    : rgbToHex(lerp(stops[1]!, stops[2]!, (t - mid) / mid));
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function lerp(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

// ------------------------------------------------------------------ build

export function buildReport(dataset: Dataset, config: ReportConfig): ReportResult {
  let rows = applySearch(dataset.rows, config.query.search ?? '', dataset.fields);
  rows = applyFilters(rows, config.query.filters, dataset.fields);
  rows = applySort(rows, config.query.sort, dataset.fields);

  const fieldByKey = new Map(dataset.fields.map((f) => [f.key, f]));

  // ---- pivot: one column per distinct value of the pivot field
  if (config.pivotBy && config.measures.length > 0) {
    return buildPivot(rows, dataset.fields, config);
  }

  const columns = config.columns
    .map((key) => fieldByKey.get(key))
    .filter((field): field is Field => Boolean(field))
    .map((field) => ({ key: field.key, label: field.label, numeric: field.type === 'number' }));

  // Ranges per column drive the data bars and colour scales.
  const ranges = new Map<string, { min: number; max: number }>();
  for (const column of columns) {
    const numbers = rows.map((r) => asNumber(r[column.key])).filter((n): n is number => n !== null);
    ranges.set(column.key, {
      min: numbers.length ? Math.min(...numbers) : 0,
      max: numbers.length ? Math.max(...numbers) : 1,
    });
  }

  const toCells = (row: Row): ReportCell[] =>
    columns.map((column) => {
      const format = config.formats[column.key] ?? DEFAULT_CELL;
      const raw = row[column.key] ?? null;
      const cell: ReportCell = {
        value: raw,
        display: display(raw, format),
        numeric: asNumber(raw),
      };
      return decorate(cell, column.key, config.conditional, ranges.get(column.key)!);
    });

  const out: ReportRow[] = [];

  if (config.groupBy.length === 0) {
    for (const row of rows) out.push({ kind: 'data', depth: 0, cells: toCells(row) });
  } else {
    // One level of grouping with a subtotal; deeper nesting is expressible by
    // adding another field, which groups within the first.
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key = config.groupBy.map((g) => asText(row[g])).join(' · ');
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }

    for (const [key, bucketRows] of buckets) {
      out.push({ kind: 'group', depth: 0, label: key, cells: [], source: bucketRows });
      for (const row of bucketRows) out.push({ kind: 'data', depth: 1, cells: toCells(row) });

      if (config.showSubtotals) {
        out.push({
          kind: 'subtotal',
          depth: 1,
          label: `${key} total`,
          source: bucketRows,
          cells: columns.map((column) => {
            if (!column.numeric) return { value: null, display: '', numeric: null };
            const total = aggregate(bucketRows.map((r) => r[column.key]), 'sum');
            return {
              value: total,
              display: display(total, config.formats[column.key] ?? DEFAULT_CELL),
              numeric: total,
            };
          }),
        });
      }
    }
  }

  if (config.showGrandTotal) {
    out.push({
      kind: 'total',
      depth: 0,
      label: 'Grand total',
      cells: columns.map((column) => {
        if (!column.numeric) return { value: null, display: '', numeric: null };
        const total = aggregate(rows.map((r) => r[column.key]), 'sum');
        return {
          value: total,
          display: display(total, config.formats[column.key] ?? DEFAULT_CELL),
          numeric: total,
        };
      }),
    });
  }

  return { columns, rows: out, totalRows: rows.length };
}

function buildPivot(rows: Row[], fields: Field[], config: ReportConfig): ReportResult {
  const rowField = config.groupBy[0] ?? config.columns[0]!;
  const pivotField = config.pivotBy!;
  const measure = config.measures[0]!;

  const rowKeys = [...new Set(rows.map((r) => asText(r[rowField])))];
  const pivotKeys = [...new Set(rows.map((r) => asText(r[pivotField])))].sort();

  const columns = [
    { key: rowField, label: fields.find((f) => f.key === rowField)?.label ?? rowField, numeric: false },
    ...pivotKeys.map((key) => ({ key, label: key || '—', numeric: true })),
    { key: '__total', label: 'Total', numeric: true },
  ];

  const format = config.formats[measure.field] ?? DEFAULT_CELL;

  const out: ReportRow[] = rowKeys.map((rowKey) => {
    const matching = rows.filter((r) => asText(r[rowField]) === rowKey);
    const values = pivotKeys.map((pivotKey) =>
      aggregate(
        matching.filter((r) => asText(r[pivotField]) === pivotKey).map((r) => r[measure.field]),
        measure.aggregation,
      ),
    );
    const total = aggregate(matching.map((r) => r[measure.field]), measure.aggregation);

    return {
      kind: 'data' as const,
      depth: 0,
      source: matching,
      cells: [
        { value: rowKey, display: rowKey, numeric: null },
        ...values.map((value) => ({ value, display: display(value, format), numeric: value })),
        { value: total, display: display(total, format), numeric: total },
      ],
    };
  });

  if (config.showGrandTotal) {
    out.push({
      kind: 'total',
      depth: 0,
      label: 'Grand total',
      cells: [
        { value: 'Grand total', display: 'Grand total', numeric: null },
        ...pivotKeys.map((pivotKey) => {
          const value = aggregate(
            rows.filter((r) => asText(r[pivotField]) === pivotKey).map((r) => r[measure.field]),
            measure.aggregation,
          );
          return { value, display: display(value, format), numeric: value };
        }),
        (() => {
          const value = aggregate(rows.map((r) => r[measure.field]), measure.aggregation);
          return { value, display: display(value, format), numeric: value };
        })(),
      ],
    });
  }

  return { columns, rows: out, totalRows: rows.length };
}

// ----------------------------------------------------------------- exports

export function reportToCsv(result: ReportResult): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [result.columns.map((c) => escape(c.label)).join(',')];

  for (const row of result.rows) {
    if (row.kind === 'group') {
      lines.push(escape(row.label ?? ''));
      continue;
    }
    lines.push(
      [
        ...(row.kind === 'subtotal' || row.kind === 'total'
          ? [escape(row.label ?? '')]
          : [escape(row.cells[0]?.display ?? '')]),
        ...row.cells.slice(1).map((cell) => escape(cell.display)),
      ].join(','),
    );
  }

  return lines.join('\n');
}

/**
 * A real .xlsx, with the formatting carried across.
 *
 * Number formats are written as Excel format codes rather than as pre-rendered
 * strings, so the cells arrive as numbers Excel can sum — a report exported as
 * text looks right and is useless.
 */
export async function reportToXlsx(
  result: ReportResult,
  config: ReportConfig,
  meta: { title: string; generatedAt: Date },
): Promise<Blob> {
  const ExcelJS = await import('exceljs');
  const book = new ExcelJS.Workbook();
  book.creator = 'Toolpit';
  book.created = meta.generatedAt;

  const sheet = book.addWorksheet(meta.title.slice(0, 28) || 'Report', {
    views: [{ state: 'frozen', ySplit: config.title ? 3 : 1, xSplit: config.pinned.length }],
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: config.footer || '&C&P of &N' },
  });

  let cursor = 1;

  if (config.title) {
    sheet.mergeCells(1, 1, 1, Math.max(1, result.columns.length));
    const cell = sheet.getCell(1, 1);
    cell.value = config.title;
    cell.font = { size: 14, bold: true };
    sheet.mergeCells(2, 1, 2, Math.max(1, result.columns.length));
    const stamp = sheet.getCell(2, 1);
    stamp.value = `Generated ${meta.generatedAt.toLocaleString()}`;
    stamp.font = { size: 9, color: { argb: 'FF6A6355' } };
    cursor = 3;
  }

  const header = sheet.getRow(cursor);
  result.columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF191712' } };
    cell.alignment = { vertical: 'middle', horizontal: column.numeric ? 'right' : 'left' };
  });
  header.height = 20;
  // Repeats the header on every printed page.
  sheet.autoFilter = {
    from: { row: cursor, column: 1 },
    to: { row: cursor, column: result.columns.length },
  };
  cursor += 1;

  const excelFormat = (key: string): string | undefined => {
    const format = config.formats[key];
    if (!format) return undefined;
    const decimals = '0'.repeat(format.decimals ?? 0);
    const suffix = decimals ? `.${decimals}` : '';
    switch (format.format) {
      case 'currency':
        return `"${format.currency === 'EUR' ? '€' : format.currency === 'GBP' ? '£' : '$'}"#,##0${suffix}`;
      case 'percent':
        return `0${suffix}"%"`;
      case 'compact':
      case 'plain':
        return format.thousands ? `#,##0${suffix}` : `0${suffix}`;
      default:
        return undefined;
    }
  };

  for (const row of result.rows) {
    const sheetRow = sheet.getRow(cursor);

    if (row.kind === 'group') {
      const cell = sheetRow.getCell(1);
      cell.value = row.label ?? '';
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F1EC' } };
      sheet.mergeCells(cursor, 1, cursor, Math.max(1, result.columns.length));
      cursor += 1;
      continue;
    }

    result.columns.forEach((column, index) => {
      const source = row.cells[index];
      const cell = sheetRow.getCell(index + 1);

      if (index === 0 && (row.kind === 'subtotal' || row.kind === 'total')) {
        cell.value = row.label ?? '';
      } else if (source?.numeric !== null && source?.numeric !== undefined) {
        // Written as a number with a format code, so Excel can total it.
        cell.value = source.numeric;
        const code = excelFormat(column.key);
        if (code) cell.numFmt = code;
      } else {
        cell.value = source?.display ?? '';
      }

      cell.alignment = {
        horizontal: config.formats[column.key]?.align ?? (column.numeric ? 'right' : 'left'),
        wrapText: config.formats[column.key]?.wrap ?? false,
        indent: row.depth,
      };

      if (source?.background) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${source.background.replace('#', '').toUpperCase()}` },
        };
      }

      if (row.kind === 'subtotal' || row.kind === 'total') {
        cell.font = { bold: true };
        cell.border = { top: { style: row.kind === 'total' ? 'double' : 'thin' } };
      }
    });

    cursor += 1;
  }

  result.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(
      12,
      Math.min(42, Math.round((config.widths[column.key] ?? 140) / 8)),
    );
  });

  const buffer = await book.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
