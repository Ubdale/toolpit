import { numbersIn, toBoolean, toNumber, toText } from '../coerce';
import { FormulaError, isError, type FormulaDef, type FormulaValue } from './shared';

/**
 * Text handling.
 *
 * FIND and SEARCH differ only in case sensitivity, which nobody remembers, so
 * both say which they are in their own summary rather than leaving it to the
 * documentation.
 */

function flatten(values: FormulaValue[]): FormulaValue[] {
  const out: FormulaValue[] = [];
  for (const value of values) {
    if (Array.isArray(value)) out.push(...value);
    else out.push(value);
  }
  return out;
}

export const TEXT_FUNCTIONS: FormulaDef[] = [
  {
    name: 'CONCAT',
    category: 'Text',
    summary: 'Joins pieces of text together.',
    pattern: 'Join {0} together',
    popular: true,
    aliases: ['join', 'combine', 'merge text', 'concatenate', 'append'],
    args: [{ name: 'parts', mode: 'value', label: 'Join', description: 'Columns and text, in order.', variadic: true }],
    example: 'CONCAT([First name], " ", [Last name])',
    evaluate: (args) => flatten(args).map((value) => toText(value)).join(''),
  },
  {
    name: 'TEXTJOIN',
    category: 'Text',
    summary: 'Joins text with a separator between each piece.',
    pattern: 'Join {2} separated by {0}',
    aliases: ['join with comma', 'implode', 'concatenate with separator'],
    args: [
      { name: 'separator', mode: 'value', label: 'Separated by', description: 'For example ", " or " - ".', placeholder: '", "' },
      { name: 'skipEmpty', mode: 'value', label: 'Skip empty values', description: 'TRUE leaves out blanks.', placeholder: 'TRUE' },
      { name: 'parts', mode: 'value', label: 'Join', description: 'The columns to join.', variadic: true },
    ],
    example: 'TEXTJOIN(", ", TRUE, [City], [Region], [Country])',
    evaluate: (args) => {
      const separator = toText(args[0] ?? '');
      const skipEmpty = toBoolean(args[1] ?? true);
      const parts = flatten(args.slice(2)).map((value) => toText(value));
      return (skipEmpty ? parts.filter((part) => part !== '') : parts).join(separator);
    },
  },
  {
    name: 'LEFT',
    category: 'Text',
    summary: 'The first few characters of some text.',
    pattern: 'The first {1} characters of {0}',
    aliases: ['first characters', 'prefix', 'start of'],
    args: [
      { name: 'text', mode: 'value', label: 'From', description: 'The text.' },
      { name: 'count', mode: 'value', label: 'How many characters', description: 'Counting from the left.', accepts: 'number', placeholder: '3' },
    ],
    example: 'LEFT([Postcode], 2)',
    evaluate: (args) => {
      const count = toNumber(args[1] ?? 1);
      if (isError(count)) return count;
      return toText(args[0] ?? null).slice(0, Math.max(0, Math.trunc(count)));
    },
  },
  {
    name: 'RIGHT',
    category: 'Text',
    summary: 'The last few characters of some text.',
    pattern: 'The last {1} characters of {0}',
    aliases: ['last characters', 'suffix', 'end of'],
    args: [
      { name: 'text', mode: 'value', label: 'From', description: 'The text.' },
      { name: 'count', mode: 'value', label: 'How many characters', description: 'Counting from the right.', accepts: 'number', placeholder: '4' },
    ],
    example: 'RIGHT([Card number], 4)',
    evaluate: (args) => {
      const count = toNumber(args[1] ?? 1);
      if (isError(count)) return count;
      const size = Math.max(0, Math.trunc(count));
      const text = toText(args[0] ?? null);
      return size === 0 ? '' : text.slice(-size);
    },
  },
  {
    name: 'MID',
    category: 'Text',
    summary: 'A slice out of the middle of some text.',
    pattern: '{1} characters of {0} starting at {2}',
    aliases: ['substring', 'slice', 'extract'],
    args: [
      { name: 'text', mode: 'value', label: 'From', description: 'The text.' },
      { name: 'start', mode: 'value', label: 'Starting at character', description: 'Counting from 1.', accepts: 'number', placeholder: '1' },
      { name: 'count', mode: 'value', label: 'How many characters', description: 'How many to take.', accepts: 'number', placeholder: '5' },
    ],
    example: 'MID([Reference], 4, 6)',
    evaluate: (args) => {
      const start = toNumber(args[1] ?? 1);
      const count = toNumber(args[2] ?? 0);
      if (isError(start)) return start;
      if (isError(count)) return count;
      const from = Math.max(0, Math.trunc(start) - 1);
      return toText(args[0] ?? null).slice(from, from + Math.max(0, Math.trunc(count)));
    },
  },
  {
    name: 'LEN',
    category: 'Text',
    summary: 'How many characters long the text is.',
    pattern: 'The length of {0}',
    aliases: ['length', 'characters', 'size'],
    args: [{ name: 'text', mode: 'value', label: 'Length of', description: 'The text.' }],
    example: 'LEN([Description])',
    evaluate: (args) => toText(args[0] ?? null).length,
  },
  {
    name: 'TRIM',
    category: 'Text',
    summary: 'Removes stray spaces from both ends and collapses doubles.',
    pattern: 'Tidy the spacing in {0}',
    popular: true,
    aliases: ['clean', 'strip spaces', 'whitespace'],
    args: [{ name: 'text', mode: 'value', label: 'Tidy', description: 'The text.' }],
    example: 'TRIM([Company name])',
    evaluate: (args) => toText(args[0] ?? null).trim().replace(/\s+/g, ' '),
  },
  {
    name: 'UPPER',
    category: 'Text',
    summary: 'Converts text to capitals.',
    pattern: '{0} in capitals',
    aliases: ['uppercase', 'capitals'],
    args: [{ name: 'text', mode: 'value', label: 'Text', description: 'The text.' }],
    example: 'UPPER([Code])',
    evaluate: (args) => toText(args[0] ?? null).toUpperCase(),
  },
  {
    name: 'LOWER',
    category: 'Text',
    summary: 'Converts text to lower case.',
    pattern: '{0} in lower case',
    aliases: ['lowercase'],
    args: [{ name: 'text', mode: 'value', label: 'Text', description: 'The text.' }],
    example: 'LOWER([Email])',
    evaluate: (args) => toText(args[0] ?? null).toLowerCase(),
  },
  {
    name: 'PROPER',
    category: 'Text',
    summary: 'Capitalises The First Letter Of Each Word.',
    pattern: '{0} in title case',
    aliases: ['title case', 'capitalise', 'capitalize'],
    args: [{ name: 'text', mode: 'value', label: 'Text', description: 'The text.' }],
    example: 'PROPER([Full name])',
    evaluate: (args) =>
      toText(args[0] ?? null)
        .toLowerCase()
        .replace(/(^|[^A-Za-z'])([a-z])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase()),
  },
  {
    name: 'SUBSTITUTE',
    category: 'Text',
    summary: 'Replaces every occurrence of one piece of text with another.',
    pattern: 'In {0}, replace {1} with {2}',
    popular: true,
    aliases: ['replace', 'find and replace', 'swap'],
    args: [
      { name: 'text', mode: 'value', label: 'In', description: 'The text to change.' },
      { name: 'find', mode: 'value', label: 'Replace', description: 'What to look for.', placeholder: '"Ltd"' },
      { name: 'replacement', mode: 'value', label: 'With', description: 'What to put in its place.', placeholder: '"Limited"' },
    ],
    example: 'SUBSTITUTE([Company], "Ltd", "Limited")',
    evaluate: (args) => {
      const find = toText(args[1] ?? '');
      if (find === '') return toText(args[0] ?? null);
      return toText(args[0] ?? null).split(find).join(toText(args[2] ?? ''));
    },
  },
  {
    name: 'SEARCH',
    category: 'Text',
    summary: 'Where one piece of text appears inside another, ignoring case.',
    pattern: 'The position of {0} inside {1}',
    aliases: ['find position', 'contains', 'index of'],
    args: [
      { name: 'find', mode: 'value', label: 'Find', description: 'The text to look for.', placeholder: '"@"' },
      { name: 'within', mode: 'value', label: 'Inside', description: 'The text to search.' },
    ],
    example: 'SEARCH("@", [Email])',
    evaluate: (args) => {
      const needle = toText(args[0] ?? '').toLowerCase();
      const position = toText(args[1] ?? null).toLowerCase().indexOf(needle);
      return position === -1 ? new FormulaError('#VALUE!', 'That text was not found.') : position + 1;
    },
  },
  {
    name: 'FIND',
    category: 'Text',
    summary: 'Where one piece of text appears inside another, case sensitive.',
    pattern: 'The position of {0} inside {1}, matching case',
    aliases: ['find position case sensitive'],
    args: [
      { name: 'find', mode: 'value', label: 'Find', description: 'The text to look for.' },
      { name: 'within', mode: 'value', label: 'Inside', description: 'The text to search.' },
    ],
    example: 'FIND("X", [Reference])',
    evaluate: (args) => {
      const position = toText(args[1] ?? null).indexOf(toText(args[0] ?? ''));
      return position === -1 ? new FormulaError('#VALUE!', 'That text was not found.') : position + 1;
    },
  },
  {
    name: 'CONTAINS',
    category: 'Text',
    summary: 'True when one piece of text appears inside another.',
    pattern: '{0} contains {1}',
    popular: true,
    aliases: ['includes', 'has text', 'like'],
    args: [
      { name: 'text', mode: 'value', label: 'Does this', description: 'The text to search.' },
      { name: 'find', mode: 'value', label: 'Contain', description: 'The text to look for.', placeholder: '"urgent"' },
    ],
    example: 'IF(CONTAINS([Notes], "urgent"), "Priority", "Normal")',
    evaluate: (args) =>
      toText(args[0] ?? null).toLowerCase().includes(toText(args[1] ?? '').toLowerCase()),
  },
  {
    name: 'SPLITPART',
    category: 'Text',
    summary: 'Takes one piece of text that is separated by a character.',
    pattern: 'Part {2} of {0}, split on {1}',
    aliases: ['split', 'text to columns', 'delimiter', 'before comma'],
    args: [
      { name: 'text', mode: 'value', label: 'Split', description: 'The text to split.' },
      { name: 'separator', mode: 'value', label: 'On', description: 'The character to split at.', placeholder: '","' },
      { name: 'index', mode: 'value', label: 'Take part', description: 'Counting from 1.', accepts: 'number', placeholder: '1' },
    ],
    example: 'SPLITPART([Full name], " ", 1)',
    evaluate: (args) => {
      const index = toNumber(args[2] ?? 1);
      if (isError(index)) return index;
      const parts = toText(args[0] ?? null).split(toText(args[1] ?? ','));
      return parts[Math.trunc(index) - 1] ?? '';
    },
  },
  {
    name: 'VALUE',
    category: 'Text',
    summary: 'Turns text that looks like a number into a real number.',
    pattern: '{0} as a number',
    aliases: ['to number', 'parse number', 'convert'],
    args: [{ name: 'text', mode: 'value', label: 'Convert', description: 'Text such as "1,240" or "$99".' }],
    example: 'VALUE([Amount as text])',
    evaluate: (args) => {
      const numbers = numbersIn([args[0] ?? null]);
      return numbers[0] ?? new FormulaError('#VALUE!', 'That is not a number.');
    },
  },
];
