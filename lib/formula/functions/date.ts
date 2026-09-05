import { toDate, toIsoDate, toNumber, toText } from '../coerce';
import { FormulaError, isError, type FormulaDef } from './shared';

/**
 * Dates.
 *
 * Everything returns an ISO `YYYY-MM-DD` string rather than a serial number,
 * because that is what the rest of the app stores and what a person reading
 * the exported spreadsheet expects to see. Excel's serial numbers are still
 * accepted on the way in, so a workbook that uses them keeps working.
 */

const UNITS: Record<string, string> = {
  d: 'days',
  m: 'months',
  y: 'years',
};

function monthsBetween(start: Date, end: Date): number {
  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
  months += end.getUTCMonth() - start.getUTCMonth();
  // A partial final month does not count, matching Excel's DATEDIF.
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return months;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const targetDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  // Clamp to the end of a shorter month, so 31 Jan + 1 month is 28 Feb.
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(targetDay, lastDay));
  return result;
}

/** Wraps a date-in, number-out function with the usual error propagation. */
function part(name: string, summary: string, pattern: string, aliases: string[], read: (date: Date) => number): FormulaDef {
  return {
    name,
    category: 'Date',
    summary,
    pattern,
    aliases,
    args: [{ name: 'date', mode: 'value', label: 'From date', description: 'A date column.', accepts: 'date' }],
    example: `${name}([Order date])`,
    evaluate: (args) => {
      const date = toDate(args[0] ?? null);
      return isError(date) ? date : read(date);
    },
  };
}

export const DATE_FUNCTIONS: FormulaDef[] = [
  {
    name: 'TODAY',
    category: 'Date',
    summary: "Today's date.",
    pattern: "Today's date",
    popular: true,
    aliases: ['now', 'current date', 'this day'],
    args: [],
    example: 'DATEDIF([Start], TODAY(), "d")',
    evaluate: () => toIsoDate(new Date()),
  },
  {
    name: 'DATE',
    category: 'Date',
    summary: 'Builds a date from a year, month and day.',
    pattern: 'The date {0}-{1}-{2}',
    aliases: ['make date', 'build date'],
    args: [
      { name: 'year', mode: 'value', label: 'Year', description: 'Four digits.', accepts: 'number', placeholder: '2026' },
      { name: 'month', mode: 'value', label: 'Month', description: '1 to 12.', accepts: 'number', placeholder: '1' },
      { name: 'day', mode: 'value', label: 'Day', description: '1 to 31.', accepts: 'number', placeholder: '1' },
    ],
    example: 'DATE([Year], [Month], 1)',
    evaluate: (args) => {
      const year = toNumber(args[0] ?? null);
      const month = toNumber(args[1] ?? null);
      const day = toNumber(args[2] ?? null);
      if (isError(year)) return year;
      if (isError(month)) return month;
      if (isError(day)) return day;
      return toIsoDate(new Date(Date.UTC(year, month - 1, day)));
    },
  },
  {
    name: 'DATEDIF',
    category: 'Date',
    summary: 'How far apart two dates are, in days, months or years.',
    pattern: 'The {2} between {0} and {1}',
    popular: true,
    aliases: ['days between', 'age', 'duration', 'elapsed', 'difference'],
    args: [
      { name: 'start', mode: 'value', label: 'From', description: 'The earlier date.', accepts: 'date' },
      { name: 'end', mode: 'value', label: 'To', description: 'The later date.', accepts: 'date' },
      { name: 'unit', mode: 'value', label: 'Measured in', description: '"d" days, "m" months, "y" years.', placeholder: '"d"' },
    ],
    example: 'DATEDIF([Start date], TODAY(), "d")',
    evaluate: (args) => {
      const start = toDate(args[0] ?? null);
      const end = toDate(args[1] ?? null);
      if (isError(start)) return start;
      if (isError(end)) return end;

      const unit = toText(args[2] ?? 'd').trim().toLowerCase().charAt(0);
      if (!UNITS[unit]) return new FormulaError('#VALUE!', 'The unit must be "d", "m" or "y".');

      if (unit === 'd') return Math.round((end.getTime() - start.getTime()) / 86_400_000);
      const months = monthsBetween(start, end);
      return unit === 'm' ? months : Math.trunc(months / 12);
    },
  },
  {
    name: 'DAYS',
    category: 'Date',
    summary: 'How many days between two dates.',
    pattern: 'Days from {1} to {0}',
    aliases: ['days between', 'day count'],
    args: [
      { name: 'end', mode: 'value', label: 'To', description: 'The later date.', accepts: 'date' },
      { name: 'start', mode: 'value', label: 'From', description: 'The earlier date.', accepts: 'date' },
    ],
    example: 'DAYS(TODAY(), [Invoice date])',
    evaluate: (args) => {
      const end = toDate(args[0] ?? null);
      const start = toDate(args[1] ?? null);
      if (isError(end)) return end;
      if (isError(start)) return start;
      return Math.round((end.getTime() - start.getTime()) / 86_400_000);
    },
  },
  {
    name: 'EDATE',
    category: 'Date',
    summary: 'A date a number of months earlier or later.',
    pattern: '{0} shifted by {1} months',
    aliases: ['add months', 'next month', 'renewal'],
    args: [
      { name: 'date', mode: 'value', label: 'Start from', description: 'A date.', accepts: 'date' },
      { name: 'months', mode: 'value', label: 'Months to add', description: 'Negative goes backwards.', accepts: 'number', placeholder: '1' },
    ],
    example: 'EDATE([Start date], 12)',
    evaluate: (args) => {
      const date = toDate(args[0] ?? null);
      const months = toNumber(args[1] ?? 0);
      if (isError(date)) return date;
      if (isError(months)) return months;
      return toIsoDate(addMonths(date, Math.trunc(months)));
    },
  },
  {
    name: 'EOMONTH',
    category: 'Date',
    summary: 'The last day of the month, optionally months ahead.',
    pattern: 'End of the month {1} months from {0}',
    aliases: ['month end', 'last day of month'],
    args: [
      { name: 'date', mode: 'value', label: 'Start from', description: 'A date.', accepts: 'date' },
      { name: 'months', mode: 'value', label: 'Months ahead', description: '0 is the current month.', accepts: 'number', optional: true, placeholder: '0' },
    ],
    example: 'EOMONTH([Invoice date], 0)',
    evaluate: (args) => {
      const date = toDate(args[0] ?? null);
      const months = toNumber(args[1] ?? 0);
      if (isError(date)) return date;
      if (isError(months)) return months;
      const shifted = addMonths(date, Math.trunc(months));
      return toIsoDate(new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)));
    },
  },
  {
    name: 'WEEKDAY',
    category: 'Date',
    summary: 'Which day of the week a date falls on, as a name.',
    pattern: 'The weekday of {0}',
    aliases: ['day of week', 'day name'],
    args: [{ name: 'date', mode: 'value', label: 'From date', description: 'A date column.', accepts: 'date' }],
    example: 'WEEKDAY([Order date])',
    evaluate: (args) => {
      const date = toDate(args[0] ?? null);
      if (isError(date)) return date;
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return names[date.getUTCDay()] ?? '';
    },
  },
  part('YEAR', 'The year part of a date.', 'The year of {0}', ['year of'], (date) => date.getUTCFullYear()),
  part('MONTH', 'The month number, 1 to 12.', 'The month of {0}', ['month of'], (date) => date.getUTCMonth() + 1),
  part('DAY', 'The day of the month.', 'The day of {0}', ['day of month'], (date) => date.getUTCDate()),
  part('QUARTER', 'Which quarter of the year, 1 to 4.', 'The quarter of {0}', ['q1', 'fiscal quarter'], (date) =>
    Math.floor(date.getUTCMonth() / 3) + 1,
  ),
];
