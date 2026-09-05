import { toBoolean, toText } from '../coerce';
import { FormulaError, isError, type FormulaDef, type FormulaValue } from './shared';

/**
 * Conditions.
 *
 * IFERROR is the quiet workhorse here: a lookup that misses produces #N/A, and
 * wrapping it is how a report stays readable rather than showing a column of
 * error codes to whoever opens the spreadsheet.
 */

function flatten(values: FormulaValue[]): FormulaValue[] {
  const out: FormulaValue[] = [];
  for (const value of values) {
    if (Array.isArray(value)) out.push(...value);
    else out.push(value);
  }
  return out;
}

export const LOGICAL_FUNCTIONS: FormulaDef[] = [
  {
    name: 'IF',
    category: 'Logical',
    summary: 'Picks one of two values depending on a test.',
    pattern: 'If {0} then {1}, otherwise {2}',
    popular: true,
    aliases: ['condition', 'when', 'otherwise', 'else'],
    args: [
      { name: 'test', mode: 'value', label: 'If this is true', description: 'A comparison, like [Amount] > 100.', placeholder: '[Amount] > 100' },
      { name: 'then', mode: 'value', label: 'Then', description: 'The value when the test passes.', placeholder: '"Yes"' },
      { name: 'otherwise', mode: 'value', label: 'Otherwise', description: 'The value when it fails.', optional: true, placeholder: '"No"' },
    ],
    example: 'IF([Amount] > 1000, "Large", "Standard")',
    evaluate: (args) => {
      const test = args[0] ?? null;
      if (isError(test)) return test;
      return toBoolean(test) ? (args[1] ?? null) : (args.length > 2 ? (args[2] ?? null) : false);
    },
  },
  {
    name: 'IFS',
    category: 'Logical',
    summary: 'Checks conditions in order and returns the first match.',
    pattern: 'The first matching case among the conditions',
    aliases: ['nested if', 'multiple conditions', 'case'],
    args: [
      { name: 'test', mode: 'value', label: 'If this is true', description: 'A comparison.', variadic: true, placeholder: '[Score] >= 90' },
      { name: 'then', mode: 'value', label: 'Then', description: 'The value to use.', variadic: true, placeholder: '"A"' },
    ],
    example: 'IFS([Score] >= 90, "A", [Score] >= 80, "B", TRUE, "C")',
    evaluate: (args) => {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const test = args[i] ?? null;
        if (isError(test)) return test;
        if (toBoolean(test)) return args[i + 1] ?? null;
      }
      return new FormulaError('#N/A', 'No condition matched.');
    },
  },
  {
    name: 'SWITCH',
    category: 'Logical',
    summary: 'Maps a value onto a set of results, like a translation table.',
    pattern: 'Match {0} against each case',
    aliases: ['map', 'translate', 'case', 'rename values'],
    args: [
      { name: 'value', mode: 'value', label: 'Look at', description: 'The value to match.', placeholder: '[Code]' },
      { name: 'case', mode: 'value', label: 'When it is', description: 'A value to compare against.', variadic: true, placeholder: '"N"' },
    ],
    example: 'SWITCH([Code], "N", "North", "S", "South", "Other")',
    evaluate: (args) => {
      const subject = toText(args[0] ?? null).toLowerCase();
      let i = 1;
      for (; i + 1 < args.length; i += 2) {
        if (toText(args[i] ?? null).toLowerCase() === subject) return args[i + 1] ?? null;
      }
      // A lone trailing argument is the default, exactly as in Excel.
      return i < args.length ? (args[i] ?? null) : new FormulaError('#N/A', 'Nothing matched.');
    },
  },
  {
    name: 'AND',
    category: 'Logical',
    summary: 'True only when every condition holds.',
    pattern: 'All of the conditions are true',
    aliases: ['both', 'all of'],
    args: [{ name: 'tests', mode: 'value', label: 'All true', description: 'Two or more comparisons.', variadic: true }],
    example: 'AND([Amount] > 100, [Region] = "North")',
    evaluate: (args) => flatten(args).every((value) => toBoolean(value)),
  },
  {
    name: 'OR',
    category: 'Logical',
    summary: 'True when at least one condition holds.',
    pattern: 'Any of the conditions is true',
    aliases: ['either', 'any of'],
    args: [{ name: 'tests', mode: 'value', label: 'Any true', description: 'Two or more comparisons.', variadic: true }],
    example: 'OR([Status] = "New", [Status] = "Open")',
    evaluate: (args) => flatten(args).some((value) => toBoolean(value)),
  },
  {
    name: 'NOT',
    category: 'Logical',
    summary: 'Flips true to false and back.',
    pattern: 'The opposite of {0}',
    aliases: ['invert', 'opposite'],
    args: [{ name: 'test', mode: 'value', label: 'Invert', description: 'A comparison.' }],
    example: 'NOT([Archived])',
    evaluate: (args) => !toBoolean(args[0] ?? null),
  },
  {
    name: 'IFERROR',
    category: 'Logical',
    summary: 'Replaces any error with a value of your choosing.',
    pattern: 'Use {0}, but show {1} if it fails',
    popular: true,
    aliases: ['catch error', 'hide error', 'fallback', 'na'],
    args: [
      { name: 'value', mode: 'value', label: 'Try this', description: 'Usually a lookup or a division.' },
      { name: 'fallback', mode: 'value', label: 'If it errors, show', description: 'What to show instead.', placeholder: '0' },
    ],
    example: 'IFERROR(VLOOKUP([ID], Customers[ID], Customers[Email]), "Unknown")',
    evaluate: (args) => (isError(args[0]) ? (args[1] ?? null) : (args[0] ?? null)),
  },
  {
    name: 'IFBLANK',
    category: 'Logical',
    summary: 'Substitutes a value when a cell is empty.',
    pattern: 'Use {0}, but show {1} when it is empty',
    aliases: ['default value', 'fill blanks', 'coalesce'],
    args: [
      { name: 'value', mode: 'value', label: 'Use this', description: 'The value to check.' },
      { name: 'fallback', mode: 'value', label: 'If empty, show', description: 'The replacement.', placeholder: '"-"' },
    ],
    example: 'IFBLANK([Phone], "No phone on file")',
    evaluate: (args) => {
      const value = args[0] ?? null;
      if (isError(value)) return value;
      return value === null || value === '' ? (args[1] ?? null) : value;
    },
  },
  {
    name: 'ISBLANK',
    category: 'Logical',
    summary: 'True when a cell is empty.',
    pattern: '{0} is empty',
    aliases: ['is empty', 'missing'],
    args: [{ name: 'value', mode: 'value', label: 'Check', description: 'The cell to test.' }],
    example: 'ISBLANK([Email])',
    evaluate: (args) => {
      const value = args[0] ?? null;
      return value === null || value === '';
    },
  },
  {
    name: 'ISNUMBER',
    category: 'Logical',
    summary: 'True when a value is a number.',
    pattern: '{0} is a number',
    aliases: ['is numeric'],
    args: [{ name: 'value', mode: 'value', label: 'Check', description: 'The cell to test.' }],
    example: 'ISNUMBER([Reference])',
    evaluate: (args) => typeof (args[0] ?? null) === 'number',
  },
  {
    name: 'ISTEXT',
    category: 'Logical',
    summary: 'True when a value is text.',
    pattern: '{0} is text',
    aliases: ['is string'],
    args: [{ name: 'value', mode: 'value', label: 'Check', description: 'The cell to test.' }],
    example: 'ISTEXT([Code])',
    evaluate: (args) => typeof (args[0] ?? null) === 'string',
  },
  {
    name: 'ISERROR',
    category: 'Logical',
    summary: 'True when a formula produced an error.',
    pattern: '{0} is an error',
    aliases: ['has error', 'failed'],
    args: [{ name: 'value', mode: 'value', label: 'Check', description: 'The value to test.' }],
    example: 'ISERROR(VLOOKUP([ID], Customers[ID], Customers[Email]))',
    evaluate: (args) => isError(args[0]),
  },
];
