/**
 * The query engine both builders run on.
 *
 * One implementation of filtering, sorting, grouping, aggregation and top-N,
 * so a filter means the same thing in a chart as in a report — and so a saved
 * template produces the same numbers wherever it is opened.
 *
 * Everything runs in memory over rows the visitor dropped. That bounds the
 * problem usefully: there is no query planner to write, but there is also no
 * server to fall back on, so the passes below stay single-scan where they can.
 */

import type {
  Aggregation,
  Dataset,
  Field,
  FilterGroup,
  FilterNode,
  FilterRule,
  Measure,
  QueryConfig,
  Row,
  SortRule,
} from './types';

// ------------------------------------------------------------- coercion

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[\s,$£€¥%]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function asDate(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(asText(value));
  return Number.isNaN(parsed) ? null : parsed;
}

/** Comparison that keeps numbers numeric and text case-insensitive. */
function compare(a: unknown, b: unknown, type: Field['type']): number {
  if (type === 'number') {
    const left = asNumber(a);
    const right = asNumber(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  }
  if (type === 'date') {
    const left = asDate(a);
    const right = asDate(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  }
  return asText(a).localeCompare(asText(b), undefined, { numeric: true, sensitivity: 'base' });
}

// --------------------------------------------------------------- filtering

function testRule(row: Row, rule: FilterRule, fields: Field[]): boolean {
  const field = fields.find((f) => f.key === rule.field);
  const raw = row[rule.field];
  const type = field?.type ?? 'text';

  switch (rule.operator) {
    case 'isEmpty':
      return raw === null || raw === undefined || asText(raw).trim() === '';
    case 'notEmpty':
      return !(raw === null || raw === undefined || asText(raw).trim() === '');
    case 'in': {
      // Comma-separated list, so a multi-value filter needs no special widget.
      const wanted = asText(rule.value)
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      return wanted.includes(asText(raw).toLowerCase());
    }
    case 'contains':
      return asText(raw).toLowerCase().includes(asText(rule.value).toLowerCase());
    case 'notContains':
      return !asText(raw).toLowerCase().includes(asText(rule.value).toLowerCase());
    case 'startsWith':
      return asText(raw).toLowerCase().startsWith(asText(rule.value).toLowerCase());
    case 'endsWith':
      return asText(raw).toLowerCase().endsWith(asText(rule.value).toLowerCase());
    case 'between': {
      const order = compare(raw, rule.value, type);
      const order2 = compare(raw, rule.value2 ?? rule.value, type);
      return order >= 0 && order2 <= 0;
    }
    case 'eq':
      return compare(raw, rule.value, type) === 0;
    case 'ne':
      return compare(raw, rule.value, type) !== 0;
    case 'gt':
      return compare(raw, rule.value, type) > 0;
    case 'gte':
      return compare(raw, rule.value, type) >= 0;
    case 'lt':
      return compare(raw, rule.value, type) < 0;
    case 'lte':
      return compare(raw, rule.value, type) <= 0;
    default:
      return true;
  }
}

function testNode(row: Row, node: FilterNode, fields: Field[]): boolean {
  if (node.kind === 'rule') return testRule(row, node, fields);
  if (node.children.length === 0) return true;
  return node.combinator === 'and'
    ? node.children.every((child) => testNode(row, child, fields))
    : node.children.some((child) => testNode(row, child, fields));
}

export function applyFilters(rows: Row[], filters: FilterGroup, fields: Field[]): Row[] {
  if (filters.children.length === 0) return rows;
  return rows.filter((row) => testNode(row, filters, fields));
}

export function applySearch(rows: Row[], search: string, fields: Field[]): Row[] {
  const query = search.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => fields.some((f) => asText(row[f.key]).toLowerCase().includes(query)));
}

export function applySort(rows: Row[], sort: SortRule[], fields: Field[]): Row[] {
  if (sort.length === 0) return rows;
  const typed = sort.map((rule) => ({
    ...rule,
    type: fields.find((f) => f.key === rule.field)?.type ?? 'text',
  }));

  // Sorted on a copy: the caller's array is the parsed file and is reused.
  return [...rows].sort((a, b) => {
    for (const rule of typed) {
      const order = compare(a[rule.field], b[rule.field], rule.type);
      if (order !== 0) return rule.direction === 'asc' ? order : -order;
    }
    return 0;
  });
}

// ------------------------------------------------------------- aggregation

export function aggregate(values: unknown[], how: Aggregation): number {
  if (how === 'count') return values.length;
  if (how === 'distinct') return new Set(values.map(asText)).size;

  const numbers = values.map(asNumber).filter((n): n is number => n !== null);
  if (numbers.length === 0) return 0;

  switch (how) {
    case 'sum':
      return numbers.reduce((total, n) => total + n, 0);
    case 'avg':
      return numbers.reduce((total, n) => total + n, 0) / numbers.length;
    case 'min':
      return Math.min(...numbers);
    case 'max':
      return Math.max(...numbers);
    case 'median': {
      const sorted = [...numbers].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[middle - 1]! + sorted[middle]!) / 2
        : sorted[middle]!;
    }
    default:
      return 0;
  }
}

export type GroupedRow = {
  /** The group key values, in the order the dimensions were given. */
  keys: string[];
  /** Aggregated measures, by measure id. */
  values: Record<string, number>;
  /** The rows that fed this group, for drill-down. */
  rows: Row[];
};

/**
 * Groups by one or more dimensions and aggregates each measure.
 *
 * With no dimensions this produces a single row — the grand total — which is
 * what both the report footer and a KPI tile need.
 */
export function groupBy(
  rows: Row[],
  dimensions: string[],
  measures: Measure[],
): GroupedRow[] {
  if (dimensions.length === 0) {
    return [
      {
        keys: [],
        values: Object.fromEntries(
          measures.map((m) => [m.id, aggregate(rows.map((r) => r[m.field]), m.aggregation)]),
        ),
        rows,
      },
    ];
  }

  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    // Unit separator: safe against a value that itself contains the delimiter.
    const key = dimensions.map((d) => asText(row[d])).join('');
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()].map(([key, bucketRows]) => ({
    keys: key.split(''),
    values: Object.fromEntries(
      measures.map((m) => [m.id, aggregate(bucketRows.map((r) => r[m.field]), m.aggregation)]),
    ),
    rows: bucketRows,
  }));
}

export function applyTopN(groups: GroupedRow[], config: QueryConfig, measures: Measure[]): GroupedRow[] {
  if (!config.topN.enabled || groups.length <= config.topN.count) return groups;

  const measureId = config.topN.measure ?? measures[0]?.id;
  if (!measureId) return groups.slice(0, config.topN.count);

  const ranked = [...groups].sort((a, b) => (b.values[measureId] ?? 0) - (a.values[measureId] ?? 0));
  return config.topN.direction === 'top'
    ? ranked.slice(0, config.topN.count)
    : ranked.slice(-config.topN.count).reverse();
}

/** Filter, search and sort in one pass, before any grouping. */
export function runQuery(dataset: Dataset, config: QueryConfig): Row[] {
  let rows = dataset.rows;
  rows = applySearch(rows, config.search ?? '', dataset.fields);
  rows = applyFilters(rows, config.filters, dataset.fields);
  rows = applySort(rows, config.sort, dataset.fields);
  return rows;
}

/** Distinct values of a field, for populating a filter's option list. */
export function distinctValues(rows: Row[], field: string, limit = 500): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const value = asText(row[field]);
    if (value) seen.add(value);
    if (seen.size >= limit) break;
  }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export { asNumber, asText, asDate };
