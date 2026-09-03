'use client';

import { parseNumber } from '@/lib/chart/data';

import type { Dataset, Field, FieldType, Row } from './types';

/**
 * Turning a dropped file into a dataset.
 *
 * CSV and TSV are parsed here; XLSX goes through SheetJS, which the project
 * already carries for the spreadsheet tools. Column types are inferred by
 * sampling rather than by reading every row, because the type only decides
 * which operators and aggregations the UI offers — a wrong guess is a
 * corrected dropdown, not a wrong number.
 */

/** Rows are sampled beyond this, so a preview of a huge file stays instant. */
export const PREVIEW_ROW_LIMIT = 5000;

type Loaded = { name: string; header: string[]; rows: (string | number | boolean | null)[][] };

async function loadSpreadsheet(file: File): Promise<Loaded> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheetName = book.SheetNames[0];
  if (!sheetName) throw new Error('That workbook has no sheets.');

  const sheet = book.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
  });

  const [header, ...rows] = matrix;
  if (!header) throw new Error('That sheet is empty.');

  return {
    name: `${file.name} — ${sheetName}`,
    header: header.map((cell, index) => String(cell ?? `Column ${index + 1}`)),
    rows,
  };
}

function splitDelimited(text: string): Loaded['rows'] {
  const delimiter = detectDelimiter(text);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => splitRow(line, delimiter));
}

function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of ['\t', ',', ';', '|']) {
    let count = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]!;
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = '';
    } else current += char;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

/** Samples a column to decide what it holds. */
function inferType(values: unknown[]): FieldType {
  const sample = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 200);
  if (sample.length === 0) return 'text';

  let numbers = 0;
  let dates = 0;
  let booleans = 0;

  for (const value of sample) {
    if (value instanceof Date) {
      dates += 1;
      continue;
    }
    const text = String(value).trim();
    if (/^(true|false|yes|no)$/i.test(text)) booleans += 1;
    if (parseNumber(text) !== null) numbers += 1;
    // Only accept a date when it looks like one, or every number would parse.
    else if (/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}/.test(text) && !Number.isNaN(Date.parse(text))) {
      dates += 1;
    }
  }

  const threshold = sample.length * 0.8;
  if (booleans >= threshold) return 'boolean';
  if (dates >= threshold) return 'date';
  if (numbers >= threshold) return 'number';
  return 'text';
}

function coerce(value: unknown, type: FieldType): Row[string] {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'number') {
    return typeof value === 'number' ? value : parseNumber(String(value));
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    return /^(true|yes)$/i.test(String(value).trim());
  }
  if (type === 'date') {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  }
  return String(value);
}

export async function datasetFromFile(file: File): Promise<Dataset> {
  const isSpreadsheet = /\.(xlsx|xls|ods)$/i.test(file.name);

  const loaded: Loaded = isSpreadsheet
    ? await loadSpreadsheet(file)
    : (() => {
        const rows = splitDelimited(file.name.endsWith('.json') ? '' : '');
        void rows;
        return { name: file.name, header: [], rows: [] };
      })();

  if (!isSpreadsheet) {
    const text = (await file.text()).replace(/^﻿/, '');
    const matrix = splitDelimited(text);
    const [header, ...rest] = matrix;
    if (!header) throw new Error('That file has no rows.');
    loaded.header = header.map((cell, index) => String(cell || `Column ${index + 1}`));
    loaded.rows = rest;
    loaded.name = file.name;
  }

  return buildDataset(loaded);
}

export function datasetFromText(text: string, name = 'Pasted data'): Dataset {
  const matrix = splitDelimited(text.replace(/^﻿/, ''));
  const [header, ...rest] = matrix;
  if (!header) throw new Error('Paste at least a header row and one row of data.');
  return buildDataset({
    name,
    header: header.map((cell, index) => String(cell || `Column ${index + 1}`)),
    rows: rest,
  });
}

function buildDataset(loaded: Loaded): Dataset {
  const total = loaded.rows.length;
  if (total === 0) throw new Error('That file has a header but no rows.');

  const sampled = total > PREVIEW_ROW_LIMIT;
  const body = sampled ? loaded.rows.slice(0, PREVIEW_ROW_LIMIT) : loaded.rows;

  // Keys are made unique and safe; the original heading stays as the label.
  const seen = new Map<string, number>();
  const fields: Field[] = loaded.header.map((label, index) => {
    const base = label.trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const key = count === 0 ? base : `${base} (${count + 1})`;

    const column = body.map((row) => row[index]);
    const type = inferType(column);
    return {
      key,
      label: key,
      type,
      cardinality: new Set(column.map((v) => String(v ?? ''))).size,
    };
  });

  const rows: Row[] = body.map((raw) => {
    const row: Row = {};
    for (const [index, field] of fields.entries()) {
      row[field.key] = coerce(raw[index], field.type);
    }
    return row;
  });

  return { name: loaded.name, fields, rows, sampled, totalRows: total };
}

/** A small built-in dataset, so both builders open with something on screen. */
export function sampleDataset(): Dataset {
  const regions = ['North', 'South', 'East', 'West'];
  const channels = ['Online', 'Retail', 'Partner'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const rows: Row[] = [];
  let seed = 7;
  // A tiny deterministic generator, so the example is identical every load and
  // a screenshot of it can be compared against another.
  const random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  for (const [monthIndex, month] of months.entries()) {
    for (const region of regions) {
      for (const channel of channels) {
        const base = 8000 + monthIndex * 620 + regions.indexOf(region) * 1500;
        const revenue = Math.round(base * (0.7 + random() * 0.7));
        rows.push({
          Month: month,
          Quarter: `Q${Math.floor(monthIndex / 3) + 1}`,
          Region: region,
          Channel: channel,
          Revenue: revenue,
          Cost: Math.round(revenue * (0.52 + random() * 0.22)),
          Orders: Math.round(revenue / (90 + random() * 60)),
          Returns: Math.round(random() * 14),
        });
      }
    }
  }

  const fields: Field[] = [
    { key: 'Month', label: 'Month', type: 'text', cardinality: 12 },
    { key: 'Quarter', label: 'Quarter', type: 'text', cardinality: 4 },
    { key: 'Region', label: 'Region', type: 'text', cardinality: 4 },
    { key: 'Channel', label: 'Channel', type: 'text', cardinality: 3 },
    { key: 'Revenue', label: 'Revenue', type: 'number' },
    { key: 'Cost', label: 'Cost', type: 'number' },
    { key: 'Orders', label: 'Orders', type: 'number' },
    { key: 'Returns', label: 'Returns', type: 'number' },
  ];

  return { name: 'Example sales data', fields, rows, totalRows: rows.length };
}
