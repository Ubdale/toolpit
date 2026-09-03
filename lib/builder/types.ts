/**
 * The vocabulary shared by the Chart Builder and the Report Builder.
 *
 * Both tools describe the same operations — pick a dataset, filter it, sort it,
 * group it, aggregate it, take the top N — so they describe them with the same
 * types and run them through the same engine. A filter built in one is a filter
 * the other understands, and a saved template moves between them.
 *
 * "Dataset" here means the file the visitor dropped. Toolpit has no server and
 * no accounts, so there is nothing else it could mean: the rows live in this
 * tab, and templates live in this browser.
 */

export type FieldType = 'text' | 'number' | 'date' | 'boolean';

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  /** Distinct value count, for choosing sensible defaults in the UI. */
  cardinality?: number;
};

export type Row = Record<string, string | number | boolean | null>;

export type Dataset = {
  name: string;
  fields: Field[];
  rows: Row[];
  /** True when `rows` is a sample rather than the whole file. */
  sampled?: boolean;
  totalRows?: number;
};

// ------------------------------------------------------------ aggregation

export type Aggregation =
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'count'
  | 'distinct'
  | 'median';

export const AGGREGATIONS: { value: Aggregation; label: string; description: string; numeric: boolean }[] = [
  { value: 'sum', label: 'Sum', description: 'Adds the values together.', numeric: true },
  { value: 'avg', label: 'Average', description: 'The arithmetic mean.', numeric: true },
  { value: 'min', label: 'Minimum', description: 'The smallest value.', numeric: true },
  { value: 'max', label: 'Maximum', description: 'The largest value.', numeric: true },
  { value: 'median', label: 'Median', description: 'The middle value — resists outliers.', numeric: true },
  { value: 'count', label: 'Count', description: 'How many rows.', numeric: false },
  { value: 'distinct', label: 'Distinct count', description: 'How many different values.', numeric: false },
];

export type Measure = {
  id: string;
  field: string;
  aggregation: Aggregation;
  /** Overrides the generated "Sum of Revenue" label. */
  label?: string;
};

// ---------------------------------------------------------------- filters

export type FilterOperator =
  | 'eq' | 'ne'
  | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'between'
  | 'in'
  | 'isEmpty' | 'notEmpty';

export const OPERATORS: Record<FieldType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'eq', label: 'is' },
    { value: 'ne', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'endsWith', label: 'ends with' },
    { value: 'in', label: 'is one of' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'notEmpty', label: 'is not empty' },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'ne', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'between', label: 'between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'notEmpty', label: 'is not empty' },
  ],
  date: [
    { value: 'eq', label: 'on' },
    { value: 'gt', label: 'after' },
    { value: 'lt', label: 'before' },
    { value: 'between', label: 'between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'notEmpty', label: 'is not empty' },
  ],
  boolean: [
    { value: 'eq', label: 'is' },
    { value: 'ne', label: 'is not' },
  ],
};

export type FilterRule = {
  id: string;
  kind: 'rule';
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
  /** Second operand, for `between`. */
  value2?: string | number | null;
};

export type FilterGroup = {
  id: string;
  kind: 'group';
  combinator: 'and' | 'or';
  children: FilterNode[];
};

export type FilterNode = FilterRule | FilterGroup;

export function emptyFilterGroup(id: string): FilterGroup {
  return { id, kind: 'group', combinator: 'and', children: [] };
}

// ------------------------------------------------------------------ sort

export type SortRule = {
  field: string;
  direction: 'asc' | 'desc';
};

export type TopN = {
  enabled: boolean;
  count: number;
  direction: 'top' | 'bottom';
  /** Which measure decides the ranking. Defaults to the first. */
  measure?: string;
};

// ------------------------------------------------------------ formatting

export type CellFormat = {
  format: 'plain' | 'compact' | 'currency' | 'percent' | 'bytes' | 'date';
  currency?: string;
  decimals?: number;
  thousands?: boolean;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
  /** For date columns. */
  datePattern?: string;
};

export const DEFAULT_FORMAT: CellFormat = {
  format: 'plain',
  decimals: 2,
  thousands: true,
};

// ------------------------------------------------- conditional formatting

export type ConditionalRule = {
  id: string;
  /** Which column the rule paints. */
  field: string;
  kind: 'colorScale' | 'dataBar' | 'iconSet' | 'cell';
  /** For `cell`: the condition that must hold. */
  operator?: FilterOperator;
  value?: string | number | null;
  value2?: string | number | null;
  /** Paint the whole row rather than the cell. */
  wholeRow?: boolean;
  color?: string;
  /** Two- or three-stop scale for `colorScale`. */
  scale?: [string, string] | [string, string, string];
};

// --------------------------------------------------------- shared config

/** Everything both builders have in common. */
export type QueryConfig = {
  filters: FilterGroup;
  sort: SortRule[];
  topN: TopN;
  /** Global free-text search across every field. */
  search?: string;
};

export function emptyQuery(): QueryConfig {
  return {
    filters: emptyFilterGroup('root'),
    sort: [],
    topN: { enabled: false, count: 10, direction: 'top' },
    search: '',
  };
}

let counter = 0;
export const nextId = (prefix: string) => `${prefix}-${(counter += 1)}`;

/** The label a measure shows when it has not been renamed. */
export function measureLabel(measure: Measure, fields: Field[]): string {
  if (measure.label) return measure.label;
  const field = fields.find((f) => f.key === measure.field);
  const name = field?.label ?? measure.field;
  const aggregation = AGGREGATIONS.find((a) => a.value === measure.aggregation);
  return `${aggregation?.label ?? measure.aggregation} of ${name}`;
}
