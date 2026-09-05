import { matchesCriteria, numbersIn, toNumber } from '../coerce';
import { FormulaError, isError, type Column, type FormulaDef, type FormulaValue } from './shared';

/**
 * Arithmetic and statistics.
 *
 * The conditional family (SUMIF, COUNTIFS and friends) is where spreadsheets
 * get genuinely hard to read, so the criteria argument accepts the same
 * shorthand Excel does - ">100", "North", "*ltd" - and the guided picker
 * offers an operator dropdown that writes it for you.
 */

function column(value: FormulaValue | undefined): Column {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Rows surviving every (column, criteria) pair. Shared by SUMIFS/COUNTIFS. */
function matchingIndices(pairs: FormulaValue[], length: number): number[] {
  const keep: number[] = [];
  for (let row = 0; row < length; row += 1) {
    let ok = true;
    for (let p = 0; p + 1 < pairs.length; p += 2) {
      const target = column(pairs[p]);
      if (!matchesCriteria(target[row] ?? null, pairs[p + 1] as FormulaValue)) {
        ok = false;
        break;
      }
    }
    if (ok) keep.push(row);
  }
  return keep;
}

function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const list = sorted(values);
  const position = (list.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return list[lower]!;
  return list[lower]! + (list[upper]! - list[lower]!) * (position - lower);
}

/** Wraps a one-number-in, one-number-out function with error propagation. */
function numeric(
  name: string,
  category: 'Math' | 'Statistical',
  summary: string,
  pattern: string,
  label: string,
  apply: (n: number) => number,
  extras: Partial<FormulaDef> = {},
): FormulaDef {
  return {
    name,
    category,
    summary,
    pattern,
    args: [{ name: 'number', mode: 'value', label, description: 'The number to work on.', accepts: 'number' }],
    example: `${name}([Amount])`,
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      if (isError(n)) return n;
      const result = apply(n);
      return Number.isFinite(result) ? result : new FormulaError('#NUM!');
    },
    ...extras,
  };
}

export const MATH_FUNCTIONS: FormulaDef[] = [
  {
    name: 'SUM',
    category: 'Math',
    summary: 'Adds up every number in a column.',
    pattern: 'Add up {0}',
    popular: true,
    aliases: ['total', 'add', 'plus'],
    args: [{ name: 'values', mode: 'range', label: 'Add up', description: 'One or more columns or numbers.', accepts: 'number', variadic: true }],
    example: 'SUM(Sales[Amount])',
    evaluate: (args) => numbersIn(args).reduce((total, n) => total + n, 0),
  },
  {
    name: 'SUMIF',
    category: 'Math',
    summary: 'Adds up only the rows that meet a condition.',
    pattern: 'Add up {2} where {0} is {1}',
    popular: true,
    aliases: ['conditional sum', 'total where', 'sum where'],
    args: [
      { name: 'testColumn', mode: 'range', label: 'Where this column', description: 'The column to test.', accepts: 'any' },
      { name: 'criteria', mode: 'value', label: 'Meets', description: 'A value, or a test like ">100" or "North*".', placeholder: '">100"' },
      { name: 'sumColumn', mode: 'range', label: 'Add up', description: 'Leave blank to add the tested column itself.', accepts: 'number', optional: true },
    ],
    example: 'SUMIF(Sales[Region], "North", Sales[Amount])',
    evaluate: (args) => {
      const test = column(args[0]);
      const target = args[2] === undefined ? test : column(args[2]);
      const keep = matchingIndices([args[0]!, args[1]!], test.length);
      return keep.reduce((total, row) => {
        const n = toNumber(target[row] ?? null);
        return isError(n) ? total : total + n;
      }, 0);
    },
  },
  {
    name: 'SUMIFS',
    category: 'Math',
    summary: 'Adds up rows meeting several conditions at once.',
    pattern: 'Add up {0} where every condition holds',
    aliases: ['sum multiple conditions', 'sum where and'],
    args: [
      { name: 'sumColumn', mode: 'range', label: 'Add up', description: 'The column of numbers to total.', accepts: 'number' },
      { name: 'testColumn', mode: 'range', label: 'Where this column', description: 'A column to test.', accepts: 'any', variadic: true },
      { name: 'criteria', mode: 'value', label: 'Meets', description: 'A value or a test like ">100".', variadic: true },
    ],
    example: 'SUMIFS(Sales[Amount], Sales[Region], "North", Sales[Year], 2026)',
    evaluate: (args) => {
      const target = column(args[0]);
      const keep = matchingIndices(args.slice(1), target.length);
      return keep.reduce((total, row) => {
        const n = toNumber(target[row] ?? null);
        return isError(n) ? total : total + n;
      }, 0);
    },
  },
  {
    name: 'PRODUCT',
    category: 'Math',
    summary: 'Multiplies every number together.',
    pattern: 'Multiply {0} together',
    aliases: ['multiply', 'times'],
    args: [{ name: 'values', mode: 'range', label: 'Multiply', description: 'Columns or numbers.', accepts: 'number', variadic: true }],
    example: 'PRODUCT([Price], [Quantity])',
    evaluate: (args) => numbersIn(args).reduce((total, n) => total * n, 1),
  },
  {
    name: 'ROUND',
    category: 'Math',
    summary: 'Rounds to a set number of decimal places.',
    pattern: 'Round {0} to {1} decimal places',
    popular: true,
    aliases: ['decimal places', 'rounding'],
    args: [
      { name: 'number', mode: 'value', label: 'Round', description: 'The number to round.', accepts: 'number' },
      { name: 'digits', mode: 'value', label: 'Decimal places', description: '0 for whole numbers. Negative rounds to tens, hundreds.', accepts: 'number', placeholder: '2' },
    ],
    example: 'ROUND([Price], 2)',
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      const digits = toNumber(args[1] ?? 0);
      if (isError(n)) return n;
      if (isError(digits)) return digits;
      const factor = 10 ** Math.trunc(digits);
      return Math.round(n * factor) / factor;
    },
  },
  {
    name: 'ROUNDUP',
    category: 'Math',
    summary: 'Always rounds away from zero.',
    pattern: 'Round {0} up to {1} decimal places',
    aliases: ['ceiling', 'round up'],
    args: [
      { name: 'number', mode: 'value', label: 'Round up', description: 'The number to round.', accepts: 'number' },
      { name: 'digits', mode: 'value', label: 'Decimal places', description: '0 for whole numbers.', accepts: 'number', placeholder: '0' },
    ],
    example: 'ROUNDUP([Hours], 0)',
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      const digits = toNumber(args[1] ?? 0);
      if (isError(n)) return n;
      if (isError(digits)) return digits;
      const factor = 10 ** Math.trunc(digits);
      return (n < 0 ? -1 : 1) * Math.ceil(Math.abs(n) * factor) / factor;
    },
  },
  {
    name: 'ROUNDDOWN',
    category: 'Math',
    summary: 'Always rounds towards zero.',
    pattern: 'Round {0} down to {1} decimal places',
    aliases: ['floor', 'truncate', 'round down'],
    args: [
      { name: 'number', mode: 'value', label: 'Round down', description: 'The number to round.', accepts: 'number' },
      { name: 'digits', mode: 'value', label: 'Decimal places', description: '0 for whole numbers.', accepts: 'number', placeholder: '0' },
    ],
    example: 'ROUNDDOWN([Score], 0)',
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      const digits = toNumber(args[1] ?? 0);
      if (isError(n)) return n;
      if (isError(digits)) return digits;
      const factor = 10 ** Math.trunc(digits);
      return (n < 0 ? -1 : 1) * Math.floor(Math.abs(n) * factor) / factor;
    },
  },
  {
    name: 'MOD',
    category: 'Math',
    summary: 'The remainder after dividing.',
    pattern: 'Remainder of {0} divided by {1}',
    aliases: ['remainder', 'modulo'],
    args: [
      { name: 'number', mode: 'value', label: 'Divide this', description: 'The number to divide.', accepts: 'number' },
      { name: 'divisor', mode: 'value', label: 'By', description: 'The divisor.', accepts: 'number', placeholder: '2' },
    ],
    example: 'MOD([Row], 2)',
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      const d = toNumber(args[1] ?? null);
      if (isError(n)) return n;
      if (isError(d)) return d;
      if (d === 0) return new FormulaError('#DIV/0!');
      return n - d * Math.floor(n / d);
    },
  },
  {
    name: 'POWER',
    category: 'Math',
    summary: 'Raises a number to a power.',
    pattern: 'Raise {0} to the power of {1}',
    aliases: ['exponent', 'squared', 'cubed'],
    args: [
      { name: 'number', mode: 'value', label: 'Raise this', description: 'The base.', accepts: 'number' },
      { name: 'power', mode: 'value', label: 'To the power of', description: 'The exponent.', accepts: 'number', placeholder: '2' },
    ],
    example: 'POWER([Side], 2)',
    evaluate: (args) => {
      const base = toNumber(args[0] ?? null);
      const exponent = toNumber(args[1] ?? null);
      if (isError(base)) return base;
      if (isError(exponent)) return exponent;
      const result = base ** exponent;
      return Number.isFinite(result) ? result : new FormulaError('#NUM!');
    },
  },
  {
    name: 'CEILING',
    category: 'Math',
    summary: 'Rounds up to the nearest multiple.',
    pattern: 'Round {0} up to a multiple of {1}',
    aliases: ['round up to nearest'],
    args: [
      { name: 'number', mode: 'value', label: 'Round up', description: 'The number.', accepts: 'number' },
      { name: 'multiple', mode: 'value', label: 'To a multiple of', description: 'For example 5, or 0.25.', accepts: 'number', placeholder: '1' },
    ],
    example: 'CEILING([Hours], 0.25)',
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      const step = toNumber(args[1] ?? 1);
      if (isError(n)) return n;
      if (isError(step)) return step;
      if (step === 0) return 0;
      return Math.ceil(n / step) * step;
    },
  },
  {
    name: 'FLOOR',
    category: 'Math',
    summary: 'Rounds down to the nearest multiple.',
    pattern: 'Round {0} down to a multiple of {1}',
    aliases: ['round down to nearest'],
    args: [
      { name: 'number', mode: 'value', label: 'Round down', description: 'The number.', accepts: 'number' },
      { name: 'multiple', mode: 'value', label: 'To a multiple of', description: 'For example 5, or 0.25.', accepts: 'number', placeholder: '1' },
    ],
    example: 'FLOOR([Price], 0.05)',
    evaluate: (args) => {
      const n = toNumber(args[0] ?? null);
      const step = toNumber(args[1] ?? 1);
      if (isError(n)) return n;
      if (isError(step)) return step;
      if (step === 0) return 0;
      return Math.floor(n / step) * step;
    },
  },
  numeric('ABS', 'Math', 'Strips the minus sign off a number.', 'The size of {0}, ignoring sign', 'Number', Math.abs, {
    aliases: ['absolute', 'positive', 'magnitude'],
  }),
  numeric('INT', 'Math', 'Drops the decimal part.', 'The whole-number part of {0}', 'Number', Math.floor, {
    aliases: ['whole number', 'integer'],
  }),
  numeric('SQRT', 'Math', 'The square root.', 'The square root of {0}', 'Number', Math.sqrt, {
    aliases: ['square root', 'root'],
  }),
];

export const STAT_FUNCTIONS: FormulaDef[] = [
  {
    name: 'AVERAGE',
    category: 'Statistical',
    summary: 'The arithmetic mean of a column.',
    pattern: 'The average of {0}',
    popular: true,
    aliases: ['mean', 'avg'],
    args: [{ name: 'values', mode: 'range', label: 'Average', description: 'Columns or numbers.', accepts: 'number', variadic: true }],
    example: 'AVERAGE(Scores[Result])',
    evaluate: (args) => {
      const numbers = numbersIn(args);
      if (numbers.length === 0) return new FormulaError('#DIV/0!', 'There are no numbers to average.');
      return numbers.reduce((total, n) => total + n, 0) / numbers.length;
    },
  },
  {
    name: 'AVERAGEIF',
    category: 'Statistical',
    summary: 'Averages only the rows that meet a condition.',
    pattern: 'Average {2} where {0} is {1}',
    aliases: ['conditional average', 'mean where'],
    args: [
      { name: 'testColumn', mode: 'range', label: 'Where this column', description: 'The column to test.', accepts: 'any' },
      { name: 'criteria', mode: 'value', label: 'Meets', description: 'A value or a test like ">100".', placeholder: '">100"' },
      { name: 'averageColumn', mode: 'range', label: 'Average', description: 'Leave blank to average the tested column.', accepts: 'number', optional: true },
    ],
    example: 'AVERAGEIF(Sales[Region], "North", Sales[Amount])',
    evaluate: (args) => {
      const test = column(args[0]);
      const target = args[2] === undefined ? test : column(args[2]);
      const keep = matchingIndices([args[0]!, args[1]!], test.length);
      const numbers = keep
        .map((row) => toNumber(target[row] ?? null))
        .filter((n): n is number => !isError(n));
      if (numbers.length === 0) return new FormulaError('#DIV/0!', 'No rows matched.');
      return numbers.reduce((total, n) => total + n, 0) / numbers.length;
    },
  },
  {
    name: 'COUNT',
    category: 'Statistical',
    summary: 'How many numeric values a column holds.',
    pattern: 'Count the numbers in {0}',
    aliases: ['how many numbers'],
    args: [{ name: 'values', mode: 'range', label: 'Count', description: 'Columns or numbers.', accepts: 'any', variadic: true }],
    example: 'COUNT(Sales[Amount])',
    evaluate: (args) => numbersIn(args).length,
  },
  {
    name: 'COUNTA',
    category: 'Statistical',
    summary: 'How many cells are not empty.',
    pattern: 'Count the filled cells in {0}',
    aliases: ['count non-empty', 'how many filled'],
    args: [{ name: 'values', mode: 'range', label: 'Count', description: 'Columns or values.', accepts: 'any', variadic: true }],
    example: 'COUNTA(Contacts[Email])',
    evaluate: (args) => {
      let total = 0;
      for (const value of args) {
        for (const cell of column(value)) if (cell !== null && cell !== '') total += 1;
      }
      return total;
    },
  },
  {
    name: 'COUNTBLANK',
    category: 'Statistical',
    summary: 'How many cells are empty.',
    pattern: 'Count the empty cells in {0}',
    aliases: ['count missing', 'count empty'],
    args: [{ name: 'values', mode: 'range', label: 'Count blanks in', description: 'A column.', accepts: 'any' }],
    example: 'COUNTBLANK(Contacts[Phone])',
    evaluate: (args) => column(args[0]).filter((cell) => cell === null || cell === '').length,
  },
  {
    name: 'COUNTIF',
    category: 'Statistical',
    summary: 'How many rows meet a condition.',
    pattern: 'Count rows where {0} is {1}',
    popular: true,
    aliases: ['count where', 'conditional count', 'how many match'],
    args: [
      { name: 'testColumn', mode: 'range', label: 'Where this column', description: 'The column to test.', accepts: 'any' },
      { name: 'criteria', mode: 'value', label: 'Meets', description: 'A value or a test like ">100" or "North*".', placeholder: '">100"' },
    ],
    example: 'COUNTIF(Orders[Status], "Shipped")',
    evaluate: (args) => matchingIndices([args[0]!, args[1]!], column(args[0]).length).length,
  },
  {
    name: 'COUNTIFS',
    category: 'Statistical',
    summary: 'How many rows meet several conditions at once.',
    pattern: 'Count rows where every condition holds',
    aliases: ['count multiple conditions'],
    args: [
      { name: 'testColumn', mode: 'range', label: 'Where this column', description: 'A column to test.', accepts: 'any', variadic: true },
      { name: 'criteria', mode: 'value', label: 'Meets', description: 'A value or a test.', variadic: true },
    ],
    example: 'COUNTIFS(Orders[Status], "Shipped", Orders[Region], "North")',
    evaluate: (args) => matchingIndices(args, column(args[0]).length).length,
  },
  {
    name: 'MIN',
    category: 'Statistical',
    summary: 'The smallest number.',
    pattern: 'The smallest of {0}',
    aliases: ['smallest', 'lowest', 'minimum'],
    args: [{ name: 'values', mode: 'range', label: 'Smallest of', description: 'Columns or numbers.', accepts: 'number', variadic: true }],
    example: 'MIN(Sales[Amount])',
    evaluate: (args) => {
      const numbers = numbersIn(args);
      return numbers.length === 0 ? 0 : Math.min(...numbers);
    },
  },
  {
    name: 'MAX',
    category: 'Statistical',
    summary: 'The largest number.',
    pattern: 'The largest of {0}',
    aliases: ['largest', 'highest', 'maximum', 'peak'],
    args: [{ name: 'values', mode: 'range', label: 'Largest of', description: 'Columns or numbers.', accepts: 'number', variadic: true }],
    example: 'MAX(Sales[Amount])',
    evaluate: (args) => {
      const numbers = numbersIn(args);
      return numbers.length === 0 ? 0 : Math.max(...numbers);
    },
  },
  {
    name: 'MEDIAN',
    category: 'Statistical',
    summary: 'The middle value - unlike the average, outliers do not drag it.',
    pattern: 'The median of {0}',
    aliases: ['middle value'],
    args: [{ name: 'values', mode: 'range', label: 'Median of', description: 'Columns or numbers.', accepts: 'number', variadic: true }],
    example: 'MEDIAN(Salaries[Amount])',
    evaluate: (args) => percentile(numbersIn(args), 0.5),
  },
  {
    name: 'PERCENTILE',
    category: 'Statistical',
    summary: 'The value below which a given share of the data falls.',
    pattern: 'The {1} percentile of {0}',
    aliases: ['quartile', 'p90', 'percentile'],
    args: [
      { name: 'values', mode: 'range', label: 'Of this column', description: 'The numbers.', accepts: 'number' },
      { name: 'fraction', mode: 'value', label: 'Percentile', description: 'Between 0 and 1. 0.9 is the 90th percentile.', accepts: 'number', placeholder: '0.9' },
    ],
    example: 'PERCENTILE(Response[Seconds], 0.95)',
    evaluate: (args) => {
      const fraction = toNumber(args[1] ?? 0.5);
      if (isError(fraction)) return fraction;
      if (fraction < 0 || fraction > 1) return new FormulaError('#NUM!', 'The percentile must be between 0 and 1.');
      return percentile(numbersIn([args[0] ?? null]), fraction);
    },
  },
  {
    name: 'STDEV',
    category: 'Statistical',
    summary: 'How spread out the numbers are.',
    pattern: 'The standard deviation of {0}',
    aliases: ['standard deviation', 'spread', 'variance'],
    args: [{ name: 'values', mode: 'range', label: 'Spread of', description: 'The numbers.', accepts: 'number', variadic: true }],
    example: 'STDEV(Scores[Result])',
    evaluate: (args) => {
      const numbers = numbersIn(args);
      if (numbers.length < 2) return new FormulaError('#DIV/0!', 'At least two numbers are needed.');
      const mean = numbers.reduce((total, n) => total + n, 0) / numbers.length;
      const variance = numbers.reduce((total, n) => total + (n - mean) ** 2, 0) / (numbers.length - 1);
      return Math.sqrt(variance);
    },
  },
  {
    name: 'LARGE',
    category: 'Statistical',
    summary: 'The nth largest value.',
    pattern: 'The {1}th largest of {0}',
    aliases: ['top n', 'nth largest'],
    args: [
      { name: 'values', mode: 'range', label: 'From this column', description: 'The numbers.', accepts: 'number' },
      { name: 'position', mode: 'value', label: 'Which one', description: '1 is the largest, 2 the second largest.', accepts: 'number', placeholder: '1' },
    ],
    example: 'LARGE(Sales[Amount], 3)',
    evaluate: (args) => {
      const numbers = sorted(numbersIn([args[0] ?? null])).reverse();
      const k = toNumber(args[1] ?? 1);
      if (isError(k)) return k;
      const value = numbers[Math.trunc(k) - 1];
      return value === undefined ? new FormulaError('#NUM!', 'There are not that many values.') : value;
    },
  },
  {
    name: 'SMALL',
    category: 'Statistical',
    summary: 'The nth smallest value.',
    pattern: 'The {1}th smallest of {0}',
    aliases: ['bottom n', 'nth smallest'],
    args: [
      { name: 'values', mode: 'range', label: 'From this column', description: 'The numbers.', accepts: 'number' },
      { name: 'position', mode: 'value', label: 'Which one', description: '1 is the smallest.', accepts: 'number', placeholder: '1' },
    ],
    example: 'SMALL(Sales[Amount], 3)',
    evaluate: (args) => {
      const numbers = sorted(numbersIn([args[0] ?? null]));
      const k = toNumber(args[1] ?? 1);
      if (isError(k)) return k;
      const value = numbers[Math.trunc(k) - 1];
      return value === undefined ? new FormulaError('#NUM!', 'There are not that many values.') : value;
    },
  },
];
