import { DATE_FUNCTIONS } from './date';
import { FINANCE_FUNCTIONS } from './finance';
import { LOGICAL_FUNCTIONS } from './logical';
import { LOOKUP_FUNCTIONS } from './lookup';
import { MATH_FUNCTIONS, STAT_FUNCTIONS } from './math';
import type { FormulaDef } from './shared';
import { TEXT_FUNCTIONS } from './text';

export type { FormulaDef };

/** Every function the engine knows, in the order the picker lists categories. */
export const FUNCTIONS: FormulaDef[] = [
  ...LOOKUP_FUNCTIONS,
  ...MATH_FUNCTIONS,
  ...STAT_FUNCTIONS,
  ...LOGICAL_FUNCTIONS,
  ...TEXT_FUNCTIONS,
  ...DATE_FUNCTIONS,
  ...FINANCE_FUNCTIONS,
];

const BY_NAME = new Map(FUNCTIONS.map((fn) => [fn.name, fn]));

export function lookupFunction(name: string): FormulaDef | undefined {
  return BY_NAME.get(name.toUpperCase());
}

export const CATEGORIES = [
  'Lookup',
  'Math',
  'Statistical',
  'Logical',
  'Text',
  'Date',
  'Finance',
] as const;

/**
 * Ranked search over names, summaries and aliases.
 *
 * The aliases are what make this usable by someone who does not know Excel's
 * vocabulary: typing "days between" finds DATEDIF, "join" finds CONCAT, and
 * "percent change" finds GROWTH. Without them the picker is only searchable by
 * people who already knew what to search for.
 */
export function searchFunctions(query: string): FormulaDef[] {
  const term = query.trim().toLowerCase();
  if (!term) return FUNCTIONS.filter((fn) => fn.popular);

  const scored: { fn: FormulaDef; score: number }[] = [];

  for (const fn of FUNCTIONS) {
    const name = fn.name.toLowerCase();
    let score = 0;

    if (name === term) score = 100;
    else if (name.startsWith(term)) score = 80;
    else if (name.includes(term)) score = 60;

    if (score === 0) {
      for (const alias of fn.aliases ?? []) {
        const lower = alias.toLowerCase();
        if (lower === term) score = Math.max(score, 70);
        else if (lower.startsWith(term)) score = Math.max(score, 50);
        else if (lower.includes(term)) score = Math.max(score, 35);
      }
    }

    if (score === 0 && fn.summary.toLowerCase().includes(term)) score = 20;
    if (score > 0) scored.push({ fn, score: score + (fn.popular ? 5 : 0) });
  }

  return scored.sort((a, b) => b.score - a.score || a.fn.name.localeCompare(b.fn.name)).map((entry) => entry.fn);
}

/** The functions worth showing before anyone types anything. */
export function popularFunctions(): FormulaDef[] {
  return FUNCTIONS.filter((fn) => fn.popular);
}
