import { compareValues, toBoolean, toNumber, toText } from './coerce';
import { lookupFunction } from './functions';
import {
  FormulaError,
  isError,
  type Column,
  type EvalContext,
  type FormulaValue,
  type Node,
  type Scalar,
} from './types';

/**
 * Evaluating one node for one row.
 *
 * The interesting decision is in `evaluateArgument`: a column reference means
 * this row's cell in most positions but the whole column when the function
 * declares that argument as a range. That is what lets `[Amount] * 2` and
 * `SUM([Amount])` both read naturally without the user learning any syntax to
 * distinguish them, and it is driven entirely by the function metadata that
 * also renders the picker.
 */

function columnOf(node: Node, ctx: EvalContext): Column | FormulaError {
  if (node.kind === 'field') {
    const computed = ctx.computed.get(node.field);
    if (computed) return computed;
    if (!ctx.self.fields.some((f) => f.key === node.field)) {
      return new FormulaError('#REF!', `There is no column called "${node.field}".`);
    }
    return ctx.self.rows.map((row) => row[node.field] ?? null);
  }

  if (node.kind === 'ref') {
    const table = ctx.tables.get(node.table.toLowerCase());
    if (!table) return new FormulaError('#REF!', `There is no table called "${node.table}".`);
    if (!table.fields.some((f) => f.key === node.field)) {
      return new FormulaError('#REF!', `"${node.table}" has no column called "${node.field}".`);
    }
    return table.rows.map((row) => row[node.field] ?? null);
  }

  return new FormulaError('#VALUE!', 'A whole column was expected here.');
}

function arithmetic(op: string, left: FormulaValue, right: FormulaValue): FormulaValue | FormulaError {
  const a = toNumber(left);
  if (isError(a)) return a;
  const b = toNumber(right);
  if (isError(b)) return b;

  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) return new FormulaError('#DIV/0!');
      return a / b;
    case '^': {
      const result = a ** b;
      return Number.isFinite(result) ? result : new FormulaError('#NUM!');
    }
    default:
      return new FormulaError('#VALUE!');
  }
}

function comparison(op: string, left: FormulaValue, right: FormulaValue): boolean {
  const order = compareValues(left as Scalar, right as Scalar);
  switch (op) {
    case '=': return order === 0;
    case '<>': return order !== 0;
    case '<': return order < 0;
    case '>': return order > 0;
    case '<=': return order <= 0;
    case '>=': return order >= 0;
    default: return false;
  }
}

export function evaluate(node: Node | null, ctx: EvalContext): FormulaValue | FormulaError {
  if (!node) return null;

  switch (node.kind) {
    case 'number':
      return node.value;
    case 'string':
      return node.value;
    case 'boolean':
      return node.value;

    case 'field': {
      const computed = ctx.computed.get(node.field);
      if (computed) return computed[ctx.rowIndex] ?? null;
      if (!ctx.self.fields.some((f) => f.key === node.field)) {
        return new FormulaError('#REF!', `There is no column called "${node.field}".`);
      }
      return ctx.self.rows[ctx.rowIndex]?.[node.field] ?? null;
    }

    case 'ref': {
      // A cross-table reference outside a range argument takes the row at the
      // same index, which is what a side-by-side comparison wants.
      const column = columnOf(node, ctx);
      if (isError(column)) return column;
      return column[ctx.rowIndex] ?? null;
    }

    case 'unary': {
      const operand = evaluate(node.operand, ctx);
      if (isError(operand)) return operand;
      const value = toNumber(operand);
      if (isError(value)) return value;
      return node.op === '-' ? -value : value;
    }

    case 'percent': {
      const operand = evaluate(node.operand, ctx);
      if (isError(operand)) return operand;
      const value = toNumber(operand);
      return isError(value) ? value : value / 100;
    }

    case 'binary': {
      const left = evaluate(node.left, ctx);
      if (isError(left)) return left;
      const right = evaluate(node.right, ctx);
      if (isError(right)) return right;

      if (node.op === '&') return toText(left) + toText(right);
      if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
        return comparison(node.op, left, right);
      }
      return arithmetic(node.op, left, right);
    }

    case 'call': {
      const fn = lookupFunction(node.name);
      if (!fn) return new FormulaError('#NAME?', `There is no function called ${node.name}.`);

      const required = fn.args.filter((arg) => !arg.optional && !arg.variadic).length;
      if (node.args.length < required) {
        return new FormulaError('#VALUE!', `${fn.name} needs at least ${required} value${required === 1 ? '' : 's'}.`);
      }

      // Past the declared list, arguments repeat the trailing run of variadic
      // specs as a group. Clamping to the last spec instead would read
      // SUMIFS' second test *column* as a scalar, because its final declared
      // argument is the criteria rather than the column.
      const firstVariadic = fn.args.findIndex((arg) => arg.variadic);
      const groupStart = firstVariadic === -1 ? fn.args.length - 1 : firstVariadic;
      const groupLength = Math.max(1, fn.args.length - groupStart);

      const values: FormulaValue[] = [];
      for (const [index, argNode] of node.args.entries()) {
        const spec =
          index < fn.args.length
            ? fn.args[index]
            : fn.args[groupStart + ((index - groupStart) % groupLength)];
        const value =
          spec?.mode === 'range' && (argNode.kind === 'field' || argNode.kind === 'ref')
            ? columnOf(argNode, ctx)
            : evaluate(argNode, ctx);

        // IFERROR and ISERROR must see the error rather than inherit it.
        if (isError(value) && fn.name !== 'IFERROR' && fn.name !== 'ISERROR' && fn.name !== 'IFNA') {
          return value;
        }
        values.push(value as FormulaValue);
      }

      try {
        return fn.evaluate(values, ctx);
      } catch {
        // A function throwing is a bug on our side, but a whole report going
        // blank over one bad cell is worse than a single #VALUE! in it.
        return new FormulaError('#VALUE!', `${fn.name} could not handle those values.`);
      }
    }

    default:
      return new FormulaError('#VALUE!');
  }
}

/** True when the value should be shown as an error rather than a result. */
export function displayValue(value: FormulaValue | FormulaError): Scalar {
  if (isError(value)) return value.code;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export { toBoolean };
