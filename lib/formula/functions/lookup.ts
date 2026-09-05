import { compareValues, matchesCriteria, toNumber, toText } from '../coerce';
import { FormulaError, isError, type Column, type FormulaDef } from './shared';

/**
 * Lookups, reshaped.
 *
 * Excel's VLOOKUP takes a block of columns and a *number* saying which one to
 * return, which is why it breaks the moment anyone inserts a column. Toolpit
 * has named columns and no grid, so a lookup names both sides outright:
 *
 *   VLOOKUP([Order ID], Customers[CustID], Customers[Email], "Not found")
 *
 * That is XLOOKUP's shape, and it is the single biggest ease win over Excel:
 * no column counting, no exact-match fourth argument to forget, and a
 * left-to-right reading that matches how people describe the task out loud.
 */

function asColumn(value: unknown): Column {
  return Array.isArray(value) ? (value as Column) : [value as never];
}

/** Shared by VLOOKUP and XLOOKUP, which differ only in name here. */
function lookup(args: unknown[]): unknown {
  const needle = args[0];
  const haystack = asColumn(args[1]);
  const results = asColumn(args[2]);
  const fallback = args.length > 3 ? args[3] : new FormulaError('#N/A');

  if (haystack.length === 0) return new FormulaError('#REF!', 'The column to search in is empty.');

  for (let i = 0; i < haystack.length; i += 1) {
    if (matchesCriteria(haystack[i] ?? null, needle as never)) {
      return results[i] ?? null;
    }
  }
  return fallback;
}

export const LOOKUP_FUNCTIONS: FormulaDef[] = [
  {
    name: 'VLOOKUP',
    category: 'Lookup',
    summary: 'Pulls a matching value out of another table.',
    pattern: 'Look up {0} in {1} and return the matching {2}',
    popular: true,
    aliases: ['lookup', 'join', 'merge', 'match', 'xlookup', 'find in table'],
    args: [
      { name: 'value', mode: 'value', label: 'Look up this', description: 'Usually a column from this table, like an ID.' },
      { name: 'searchColumn', mode: 'range', label: 'In this column', description: 'The column in the other table to search.', accepts: 'any' },
      { name: 'returnColumn', mode: 'range', label: 'Return this column', description: 'The value to bring back from the matching row.', accepts: 'any' },
      { name: 'ifMissing', mode: 'value', label: 'If not found', description: 'Shown when nothing matches. Leave blank for #N/A.', optional: true, placeholder: '"Not found"' },
    ],
    example: 'VLOOKUP([Customer ID], Customers[ID], Customers[Email], "Unknown")',
    evaluate: (args) => lookup(args) as never,
  },
  {
    name: 'XLOOKUP',
    category: 'Lookup',
    summary: 'The same as VLOOKUP here - search one column, return another.',
    pattern: 'Look up {0} in {1} and return the matching {2}',
    aliases: ['lookup', 'vlookup'],
    args: [
      { name: 'value', mode: 'value', label: 'Look up this', description: 'The value to find.' },
      { name: 'searchColumn', mode: 'range', label: 'In this column', description: 'The column to search.', accepts: 'any' },
      { name: 'returnColumn', mode: 'range', label: 'Return this column', description: 'The value to bring back.', accepts: 'any' },
      { name: 'ifMissing', mode: 'value', label: 'If not found', description: 'Shown when nothing matches.', optional: true, placeholder: '"Not found"' },
    ],
    example: 'XLOOKUP([SKU], Stock[SKU], Stock[Qty], 0)',
    evaluate: (args) => lookup(args) as never,
  },
  {
    name: 'INDEX',
    category: 'Lookup',
    summary: 'Takes the value at a given position in a column.',
    pattern: 'Take item number {1} from {0}',
    aliases: ['nth', 'position', 'element'],
    args: [
      { name: 'column', mode: 'range', label: 'From this column', description: 'The column to read from.', accepts: 'any' },
      { name: 'position', mode: 'value', label: 'Position', description: 'Counting from 1.', accepts: 'number' },
    ],
    example: 'INDEX(Prices[Amount], 3)',
    evaluate: (args) => {
      const column = asColumn(args[0]);
      const position = toNumber(args[1] as never);
      if (isError(position)) return position;
      const index = Math.trunc(position);
      if (index < 1 || index > column.length) {
        return new FormulaError('#REF!', `There is no row ${index} - the column has ${column.length}.`);
      }
      return column[index - 1] ?? null;
    },
  },
  {
    name: 'MATCH',
    category: 'Lookup',
    summary: 'Finds which position a value sits at in a column.',
    pattern: 'Find the position of {0} in {1}',
    aliases: ['position of', 'index of', 'row number'],
    args: [
      { name: 'value', mode: 'value', label: 'Find this', description: 'The value to locate.' },
      { name: 'column', mode: 'range', label: 'In this column', description: 'The column to search.', accepts: 'any' },
    ],
    example: 'MATCH([Region], Regions[Name])',
    evaluate: (args) => {
      const column = asColumn(args[1]);
      for (let i = 0; i < column.length; i += 1) {
        if (matchesCriteria(column[i] ?? null, args[0] as never)) return i + 1;
      }
      return new FormulaError('#N/A');
    },
  },
  {
    name: 'COUNTMATCH',
    category: 'Lookup',
    summary: 'How many rows in another table match this one.',
    pattern: 'Count rows of {1} matching {0}',
    aliases: ['count related', 'how many matching', 'countif other table'],
    args: [
      { name: 'value', mode: 'value', label: 'Match this', description: 'Usually an ID from this table.' },
      { name: 'searchColumn', mode: 'range', label: 'Against this column', description: 'The column in the other table.', accepts: 'any' },
    ],
    example: 'COUNTMATCH([Customer ID], Orders[Customer ID])',
    evaluate: (args) => {
      const column = asColumn(args[1]);
      let total = 0;
      for (const cell of column) if (matchesCriteria(cell ?? null, args[0] as never)) total += 1;
      return total;
    },
  },
  {
    name: 'SORTPOSITION',
    category: 'Lookup',
    summary: 'Where this value would rank if the column were sorted.',
    pattern: 'Rank of {0} within {1}',
    aliases: ['rank', 'placement', 'standing'],
    args: [
      { name: 'value', mode: 'value', label: 'This value', description: 'Usually the current row.' },
      { name: 'column', mode: 'range', label: 'Within this column', description: 'The column to rank against.', accepts: 'number' },
      { name: 'ascending', mode: 'value', label: 'Smallest first', description: 'TRUE ranks smallest as 1. Defaults to largest first.', optional: true, placeholder: 'FALSE' },
    ],
    example: 'SORTPOSITION([Revenue], Sales[Revenue])',
    evaluate: (args) => {
      const column = asColumn(args[1]);
      const ascending = args.length > 2 && toText(args[2] as never).toUpperCase() === 'TRUE';
      const value = args[0] as never;
      let rank = 1;
      for (const cell of column) {
        const order = compareValues(cell ?? null, value);
        if (ascending ? order < 0 : order > 0) rank += 1;
      }
      return rank;
    },
  },
];
