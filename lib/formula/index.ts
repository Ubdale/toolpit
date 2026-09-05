import { displayValue, evaluate } from './evaluate';
import { dependencies, parse } from './parser';
import {
  FormulaError,
  isError,
  type Column,
  type EvalContext,
  type FormulaTable,
  type FormulaValue,
  type Node,
  type ParseIssue,
  type Scalar,
} from './types';

export { FUNCTIONS, CATEGORIES, lookupFunction, popularFunctions, searchFunctions } from './functions';
export { FormulaError, isError };
export type { FormulaTable, FormulaValue, ParseIssue, Scalar };
export type { ArgSpec, FunctionDef, FunctionCategory } from './types';

/**
 * The engine's public surface.
 *
 * A formula is compiled once and evaluated per row, because parsing 50,000
 * times to fill one column would be the difference between a tool that feels
 * instant and one that hangs the tab.
 */

export type CompiledFormula = {
  source: string;
  node: Node | null;
  issues: ParseIssue[];
  /** Columns of the formula's own table that it reads. */
  fields: string[];
  /** Columns of other tables that it reads. */
  refs: { table: string; field: string }[];
  ok: boolean;
};

export function compile(source: string): CompiledFormula {
  const { node, issues } = parse(source);
  const { fields, refs } = dependencies(node);
  return {
    source,
    node,
    issues,
    fields,
    refs,
    ok: issues.length === 0 && node !== null,
  };
}

/** Tables keyed for lookup by name, case-insensitively. */
export function tableIndex(tables: FormulaTable[]): Map<string, FormulaTable> {
  const index = new Map<string, FormulaTable>();
  for (const table of tables) {
    index.set(table.name.toLowerCase(), table);
    index.set(table.id.toLowerCase(), table);
  }
  return index;
}

export type RunOptions = {
  tables: FormulaTable[];
  self: FormulaTable;
  /** Calculated columns already produced for this table, in order. */
  computed?: Map<string, Column>;
};

/**
 * Runs a compiled formula down every row of its table.
 *
 * Returns a column the same length as the table, so the result slots straight
 * into the report as if it had been in the file all along.
 */
export function runFormula(formula: CompiledFormula, options: RunOptions): Column {
  const { self } = options;
  if (!formula.ok || !formula.node) return self.rows.map(() => null);

  const ctx: EvalContext = {
    tables: tableIndex(options.tables),
    self,
    rowIndex: 0,
    computed: options.computed ?? new Map(),
  };

  const out: Column = new Array(self.rows.length);
  for (let row = 0; row < self.rows.length; row += 1) {
    ctx.rowIndex = row;
    out[row] = displayValue(evaluate(formula.node, ctx));
  }
  return out;
}

/**
 * Evaluates one row only, for the live preview beside the formula bar.
 *
 * Kept separate from `runFormula` so typing in the editor never walks a large
 * dataset just to show one example value.
 */
export function previewFormula(
  formula: CompiledFormula,
  options: RunOptions & { rowIndex?: number },
): { value: Scalar; error: string | null } {
  if (!formula.ok || !formula.node) {
    return { value: null, error: formula.issues[0]?.message ?? null };
  }

  const ctx: EvalContext = {
    tables: tableIndex(options.tables),
    self: options.self,
    rowIndex: options.rowIndex ?? 0,
    computed: options.computed ?? new Map(),
  };

  const result = evaluate(formula.node, ctx);
  if (isError(result)) return { value: result.code, error: result.detail ?? result.code };
  return { value: displayValue(result), error: null };
}

/**
 * Orders calculated columns so each is computed after anything it depends on,
 * and reports any cycle rather than looping forever.
 */
export function resolveOrder(
  columns: { id: string; name: string; formula: CompiledFormula }[],
): { order: string[]; cycles: string[] } {
  const byName = new Map(columns.map((column) => [column.name.toLowerCase(), column]));
  const state = new Map<string, 'visiting' | 'done'>();
  const order: string[] = [];
  const cycles: string[] = [];

  const visit = (column: (typeof columns)[number]) => {
    const status = state.get(column.id);
    if (status === 'done') return;
    if (status === 'visiting') {
      cycles.push(column.name);
      return;
    }
    state.set(column.id, 'visiting');

    for (const field of column.formula.fields) {
      const dependency = byName.get(field.toLowerCase());
      if (dependency && dependency.id !== column.id) visit(dependency);
    }

    state.set(column.id, 'done');
    order.push(column.id);
  };

  for (const column of columns) visit(column);
  return { order, cycles: [...new Set(cycles)] };
}
