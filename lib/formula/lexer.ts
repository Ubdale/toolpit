import type { ParseIssue } from './types';

/**
 * Turns formula text into tokens.
 *
 * Kept deliberately small: the grammar has no cell ranges, no sheet-qualified
 * A1 refs and no array literals, so the only genuinely fiddly parts are
 * bracketed identifiers (which may contain spaces) and Excel's doubled-quote
 * escape inside strings.
 */

export type TokenKind =
  | 'number'
  | 'string'
  | 'identifier'
  /** A `[Bracketed Name]`, already unwrapped. */
  | 'field'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export type Token = {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
};

/** Longest first, so `<=` is never read as `<` then `=`. */
const OPERATORS = ['<>', '<=', '>=', '+', '-', '*', '/', '^', '&', '=', '<', '>', '%'];

export function tokenize(input: string): { tokens: Token[]; issues: ParseIssue[] } {
  const tokens: Token[] = [];
  const issues: ParseIssue[] = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i]!;

    if (/\s/.test(char)) {
      i += 1;
      continue;
    }

    // ---------------------------------------------------------- numbers
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(input[i + 1] ?? ''))) {
      const start = i;
      while (i < input.length && /[0-9.]/.test(input[i]!)) i += 1;
      // Scientific notation, including a signed exponent.
      if (/[eE]/.test(input[i] ?? '') && /[0-9+-]/.test(input[i + 1] ?? '')) {
        i += 2;
        while (i < input.length && /[0-9]/.test(input[i]!)) i += 1;
      }
      const text = input.slice(start, i);
      if (Number.isNaN(Number(text))) {
        issues.push({ message: `"${text}" is not a number.`, start, end: i });
      }
      tokens.push({ kind: 'number', value: text, start, end: i });
      continue;
    }

    // ---------------------------------------------------------- strings
    if (char === '"') {
      const start = i;
      i += 1;
      let text = '';
      let closed = false;
      while (i < input.length) {
        if (input[i] === '"') {
          // Excel escapes a quote by doubling it.
          if (input[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        text += input[i];
        i += 1;
      }
      if (!closed) {
        issues.push({ message: 'This text is missing its closing quote.', start, end: i });
      }
      tokens.push({ kind: 'string', value: text, start, end: i });
      continue;
    }

    // ------------------------------------------------- [bracketed field]
    if (char === '[') {
      const start = i;
      i += 1;
      let name = '';
      let closed = false;
      while (i < input.length) {
        if (input[i] === ']') {
          i += 1;
          closed = true;
          break;
        }
        name += input[i];
        i += 1;
      }
      if (!closed) {
        issues.push({ message: 'This column name is missing its closing bracket.', start, end: i });
      }
      // Excel writes the current row as [@Column]; accept it and mean the same
      // thing, since every reference here is row-relative already.
      tokens.push({ kind: 'field', value: name.replace(/^@/, '').trim(), start, end: i });
      continue;
    }

    // ------------------------------------------------------- identifiers
    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      while (i < input.length && /[A-Za-z0-9_.]/.test(input[i]!)) i += 1;
      tokens.push({ kind: 'identifier', value: input.slice(start, i), start, end: i });
      continue;
    }

    // -------------------------------------------------------- structural
    if (char === '(') {
      tokens.push({ kind: 'lparen', value: char, start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen', value: char, start: i, end: i + 1 });
      i += 1;
      continue;
    }
    // Semicolons are the argument separator in many European Excel locales.
    if (char === ',' || char === ';') {
      tokens.push({ kind: 'comma', value: ',', start: i, end: i + 1 });
      i += 1;
      continue;
    }

    const operator = OPERATORS.find((op) => input.startsWith(op, i));
    if (operator) {
      tokens.push({ kind: 'operator', value: operator, start: i, end: i + operator.length });
      i += operator.length;
      continue;
    }

    issues.push({ message: `"${char}" does not mean anything here.`, start: i, end: i + 1 });
    i += 1;
  }

  tokens.push({ kind: 'eof', value: '', start: input.length, end: input.length });
  return { tokens, issues };
}
