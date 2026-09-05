import { FormulaError, isError, type Column, type FormulaValue, type Scalar } from './types';

/**
 * Excel's coercion rules, which are lenient by design: "5" + 1 is 6, TRUE
 * counts as 1, and an empty cell is 0 in arithmetic but "" in text. Copying
 * that behaviour matters more than being principled, because a spreadsheet
 * user's intuition is calibrated to it.
 */

const CURRENCY = /^[$£€]\s?/;
const STRIPPABLE = /[,$£€%]/g;

export function toNumber(value: FormulaValue): number | FormulaError {
  if (isError(value)) return value;
  if (value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : new FormulaError('#NUM!');
  if (typeof value === 'boolean') return value ? 1 : 0;

  if (Array.isArray(value)) {
    // A column used where one number is wanted collapses to its first cell,
    // rather than erroring - this is what makes `[Amount] * 2` work.
    return toNumber(value[0] ?? null);
  }

  const text = String(value).trim().replace(/,/g, '');
  // Percentages and currency are what people actually paste in.
  const percent = /^-?[\d.]+%$/.test(text);
  const cleaned = text.replace(CURRENCY, '').replace(/%$/, '');
  const parsed = Number(cleaned);
  if (cleaned === '' || Number.isNaN(parsed)) {
    const date = Date.parse(text);
    if (!Number.isNaN(date)) return date / 86_400_000;
    return new FormulaError('#VALUE!', `"${text}" is not a number.`);
  }
  return percent ? parsed / 100 : parsed;
}

export function toText(value: FormulaValue): string {
  if (isError(value)) return value.code;
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (Array.isArray(value)) return toText(value[0] ?? null);
  return String(value);
}

export function toBoolean(value: FormulaValue): boolean {
  if (isError(value)) return false;
  if (value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (Array.isArray(value)) return toBoolean(value[0] ?? null);
  const text = String(value).trim().toLowerCase();
  if (text === 'false' || text === 'no' || text === '0') return false;
  return text !== '';
}

/** Flattens arguments into a column, so SUM([A], [B], 5) behaves. */
export function toColumn(values: FormulaValue[]): Column {
  const out: Column = [];
  for (const value of values) {
    if (Array.isArray(value)) out.push(...value);
    else if (isError(value)) out.push(value.code);
    else out.push(value);
  }
  return out;
}

/** The numbers in a column, skipping blanks and text - as Excel's SUM does. */
export function numbersIn(values: FormulaValue[]): number[] {
  return toColumn(values)
    .filter((cell) => cell !== null && cell !== '' && typeof cell !== 'boolean')
    .map((cell) => (typeof cell === 'number' ? cell : Number(String(cell).replace(STRIPPABLE, ''))))
    .filter((n) => Number.isFinite(n));
}

/** Dates round-trip as ISO strings elsewhere in the app, so parse leniently. */
export function toDate(value: FormulaValue): Date | FormulaError {
  if (isError(value)) return value;
  if (typeof value === 'number') {
    // Excel serial dates: day 1 is 1900-01-01, with the 1900 leap-year bug
    // baked in, which is why the epoch below is 30 December rather than 31.
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
  }
  const parsed = Date.parse(toText(value));
  if (Number.isNaN(parsed)) return new FormulaError('#VALUE!', `"${toText(value)}" is not a date.`);
  return new Date(parsed);
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/;

function escapeChar(char: string): string {
  return REGEX_SPECIAL.test(char) ? `\\${char}` : char;
}

/**
 * Excel's wildcards: `*` is any run of characters, `?` is exactly one, and `~`
 * escapes either.
 *
 * Walked one character at a time rather than chained `.replace()` calls,
 * because escaping the escape character through several passes is where that
 * approach quietly goes wrong.
 */
function wildcardToRegex(text: string): RegExp {
  let pattern = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    const following = text[i + 1];

    if (char === '~' && (following === '*' || following === '?')) {
      pattern += escapeChar(following);
      i += 1;
      continue;
    }
    if (char === '*') {
      pattern += '.*';
      continue;
    }
    if (char === '?') {
      pattern += '.';
      continue;
    }
    pattern += escapeChar(char);
  }
  return new RegExp(`^${pattern}$`, 'i');
}

/** Matches one cell against a criteria argument from the *IF family. */
export function matchesCriteria(cell: Scalar, criteria: FormulaValue): boolean {
  const text = toText(criteria).trim();

  // A leading comparison operator turns the criteria into a numeric test.
  const comparison = /^(<>|>=|<=|>|<|=)\s*(.*)$/.exec(text);
  if (comparison) {
    const operator = comparison[1]!;
    const operand = comparison[2] ?? '';
    const right = toNumber(operand);
    const left = toNumber(cell);

    if (isError(left) || isError(right) || operand === '') {
      // Fall back to text comparison, which is what Excel does for "<>abc".
      const l = toText(cell).toLowerCase();
      const r = operand.toLowerCase();
      return operator === '<>' ? l !== r : l === r;
    }

    switch (operator) {
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '<>': return left !== right;
      default: return left === right;
    }
  }

  if (/[*?]/.test(text)) return wildcardToRegex(text).test(toText(cell));

  // Numeric equality when both sides look numeric, text equality otherwise.
  const left = toNumber(cell);
  const right = toNumber(text);
  if (!isError(left) && !isError(right) && text !== '' && cell !== null && cell !== '') {
    return left === right;
  }
  return toText(cell).toLowerCase() === text.toLowerCase();
}

/** Excel compares text case-insensitively and sorts numbers before text. */
export function compareValues(a: Scalar, b: Scalar): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  const left = toNumber(a);
  const right = toNumber(b);
  if (!isError(left) && !isError(right)) return left === right ? 0 : left < right ? -1 : 1;

  const l = toText(a).toLowerCase();
  const r = toText(b).toLowerCase();
  return l === r ? 0 : l < r ? -1 : 1;
}
