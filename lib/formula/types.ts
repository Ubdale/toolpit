/**
 * The vocabulary of the formula engine.
 *
 * Toolpit's formulas are column-oriented rather than cell-oriented. There is no
 * A1 notation, because there is no grid — a dataset is rows of named fields, so
 * `[Amount]` means "this row's Amount" and `Orders[Amount]` means "the Amount
 * column of the Orders table". That is Excel's own structured-reference syntax,
 * which is the readable half of Excel, and it removes the entire class of bugs
 * where inserting a row silently repoints a reference.
 */

// ------------------------------------------------------------------ values

/**
 * What a formula can evaluate to. `Column` is a whole column handed to
 * functions like SUM that operate over many values at once.
 */
export type Scalar = string | number | boolean | null;
export type Column = Scalar[];
export type FormulaValue = Scalar | Column;

/**
 * Errors are values, exactly as in Excel: a bad lookup produces #N/A in one
 * cell rather than failing the whole column. They print as themselves and
 * propagate through arithmetic.
 */
export const ERROR_CODES = ['#DIV/0!', '#VALUE!', '#REF!', '#N/A', '#NAME?', '#NUM!'] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class FormulaError {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
  ) {}
  toString() {
    return this.code;
  }
}

export function isError(value: unknown): value is FormulaError {
  return value instanceof FormulaError;
}

// --------------------------------------------------------------------- AST

export type Node =
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  /** `[Amount]` — a column of the table the formula belongs to. */
  | { kind: 'field'; field: string }
  /** `Orders[Amount]` — a column of another table. */
  | { kind: 'ref'; table: string; field: string }
  | { kind: 'unary'; op: '-' | '+'; operand: Node }
  | { kind: 'binary'; op: BinaryOp; left: Node; right: Node }
  /** Trailing `%`, which in Excel divides by 100. */
  | { kind: 'percent'; operand: Node }
  | { kind: 'call'; name: string; args: Node[] };

export type BinaryOp =
  | '+' | '-' | '*' | '/' | '^'
  /** String concatenation. */
  | '&'
  | '=' | '<>' | '<' | '>' | '<=' | '>=';

// --------------------------------------------------------------- functions

/**
 * How an argument is fed to a function.
 *
 * This is the pivot the whole design turns on. `value` collapses a column
 * reference to the current row's cell; `range` hands over the entire column.
 * It is why `SUM([Amount])` totals a column while `[Amount] * 2` doubles one
 * cell, with no special syntax for the reader to learn — and the same metadata
 * tells the picker UI whether to show a "column" dropdown or a value input.
 */
export type ArgMode = 'value' | 'range' | 'table';

export type ArgSpec = {
  name: string;
  mode: ArgMode;
  /** Shown as the field label in the guided picker. */
  label: string;
  description: string;
  optional?: boolean;
  /** Accepts any number of further arguments of this shape. */
  variadic?: boolean;
  /** Narrows the column dropdown in the picker. */
  accepts?: 'number' | 'text' | 'date' | 'any';
  /** Prefilled when the picker inserts the function. */
  placeholder?: string;
};

export type FunctionCategory =
  | 'Lookup'
  | 'Math'
  | 'Statistical'
  | 'Logical'
  | 'Text'
  | 'Date'
  | 'Finance';

export type FunctionDef = {
  name: string;
  category: FunctionCategory;
  /** One line, written for someone who does not already know the function. */
  summary: string;
  /** The plain-English sentence the guided picker builds around. */
  pattern: string;
  args: ArgSpec[];
  example: string;
  /** Other names people search for — "average" finds AVG, "if" finds IFS. */
  aliases?: string[];
  /** Ranked into the picker's "Popular" section. */
  popular?: boolean;
  evaluate: (args: FormulaValue[], ctx: EvalContext) => FormulaValue | FormulaError;
};

// ------------------------------------------------------------------ context

/** One table the formula can see. */
export type FormulaTable = {
  id: string;
  name: string;
  fields: { key: string; type: 'text' | 'number' | 'date' | 'boolean' }[];
  rows: Record<string, Scalar>[];
};

export type EvalContext = {
  /** Every table in the workbook, by name and by id. */
  tables: Map<string, FormulaTable>;
  /** The table the formula belongs to. */
  self: FormulaTable;
  /** Index of the row being evaluated. */
  rowIndex: number;
  /**
   * Columns produced by earlier calculated columns in the same table, so one
   * calculated column can build on another.
   */
  computed: Map<string, Column>;
};

// ------------------------------------------------------------------ errors

/** A parse failure, with the offset so the formula bar can underline it. */
export type ParseIssue = {
  message: string;
  start: number;
  end: number;
};
