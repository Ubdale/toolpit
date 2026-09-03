import type { Dataset } from './types';

/**
 * Turns pasted or dropped tabular text into a chart-ready dataset.
 *
 * The input is whatever came out of a spreadsheet, so this has to cope with
 * tabs or commas or semicolons, quoted fields containing the delimiter,
 * thousands separators, currency symbols, percentages, parenthesised negatives
 * and blank cells — without asking the visitor to clean any of it up first.
 */

export type ParseResult = {
  data: Dataset;
  /** Non-fatal notes worth surfacing, e.g. "3 cells weren't numbers". */
  warnings: string[];
};

export class ChartDataError extends Error {}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const candidates = ['\t', ',', ';', '|'];

  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    // Count only delimiters outside quotes, so "Smith, Jane" doesn't win a vote.
    let count = 0;
    let inQuotes = false;
    for (const char of firstLine) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/** A single row of delimited text, honouring "" escaping inside quoted fields. */
function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/**
 * Reads a number the way a person wrote it: "1,234", "$1.2k", "45%", "(300)".
 * Returns null for anything that isn't a number, including empty cells.
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const negative = /^\(.*\)$/.test(text);
  let body = negative ? text.slice(1, -1) : text;

  body = body.replace(/[\s$£€¥₹%]/g, '');

  // A trailing magnitude suffix, as spreadsheets and dashboards often export.
  let multiplier = 1;
  const suffix = /([kmbKMB])$/.exec(body);
  if (suffix) {
    multiplier = { k: 1e3, m: 1e6, b: 1e9 }[suffix[1]!.toLowerCase()]!;
    body = body.slice(0, -1);
  }

  // Strip thousands separators, but only where they really are separators.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(body)) body = body.replace(/,/g, '');
  // A lone comma in an otherwise numeric string is a decimal point in most of
  // the world; treat it as one.
  else if (/^-?\d+,\d+$/.test(body)) body = body.replace(',', '.');

  if (!/^-?\d*\.?\d+([eE][-+]?\d+)?$/.test(body)) return null;

  const value = Number(body) * multiplier;
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

export function parseTable(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new ChartDataError('Paste some data to chart.');
  if (lines.length === 1) {
    throw new ChartDataError('That is only a header row — add at least one row of data.');
  }

  const delimiter = detectDelimiter(text);
  const rows = lines.map((line) => splitRow(line, delimiter));
  const columnCount = Math.max(...rows.map((row) => row.length));
  if (columnCount < 2) {
    throw new ChartDataError(
      'Each row needs a label and at least one number, separated by tabs or commas.',
    );
  }

  const warnings: string[] = [];
  const header = rows[0]!;
  const bodyRows = rows.slice(1);

  // A header row whose value cells are numbers is really a data row — the
  // spreadsheet just had no header. Fall back to generic series names.
  const headerIsData = header.slice(1).every((cell) => parseNumber(cell) !== null);
  const dataRows = headerIsData ? rows : bodyRows;
  const seriesNames = headerIsData
    ? Array.from({ length: columnCount - 1 }, (_, i) => `Series ${i + 1}`)
    : header.slice(1, columnCount).map((name, i) => name || `Series ${i + 1}`);

  if (headerIsData) {
    warnings.push('No header row found, so the columns are named Series 1, 2, 3…');
  }

  const labels: string[] = [];
  const series = seriesNames.map((name) => ({ name, values: [] as (number | null)[] }));

  let unreadable = 0;
  for (const row of dataRows) {
    labels.push(row[0]?.trim() || `Row ${labels.length + 1}`);
    for (const [index] of seriesNames.entries()) {
      const cell = row[index + 1] ?? '';
      const value = parseNumber(cell);
      if (value === null && cell.trim() !== '') unreadable += 1;
      series[index]!.values.push(value);
    }
  }

  if (unreadable > 0) {
    warnings.push(
      `${unreadable} cell${unreadable === 1 ? '' : 's'} could not be read as a number and ` +
        `${unreadable === 1 ? 'was' : 'were'} left as a gap.`,
    );
  }

  const hasAnyNumber = series.some((s) => s.values.some((value) => value !== null));
  if (!hasAnyNumber) {
    throw new ChartDataError(
      'None of those cells are numbers. Check that the first column holds labels and the rest hold values.',
    );
  }

  return { data: { labels, series }, warnings };
}

export async function readTableFile(file: File): Promise<string> {
  const text = await file.text();
  // Strip a UTF-8 BOM, which Excel adds to CSV exports and which would
  // otherwise become part of the first header cell.
  return text.replace(/^﻿/, '');
}

export const sampleTable = `Quarter\tRevenue\tCosts
Q1 2025\t184000\t121000
Q2 2025\t212500\t128400
Q3 2025\t241000\t139900
Q4 2025\t298750\t151200`;

/** Renders the dataset back to TSV, for the "copy the data" affordance. */
export function toDelimited(data: Dataset, delimiter = '\t'): string {
  const header = ['', ...data.series.map((s) => s.name)].join(delimiter);
  const rows = data.labels.map((label, index) =>
    [label, ...data.series.map((s) => s.values[index] ?? '')].join(delimiter),
  );
  return [header, ...rows].join('\n');
}
