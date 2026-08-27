'use client';

/**
 * Text sanitising for PDF output.
 *
 * The standard PDF fonts (Helvetica and friends) use WinAnsi encoding: Latin-1
 * plus a handful of typographic extras. pdf-lib refuses to draw a character
 * that encoding cannot represent — it throws `WinAnsi cannot encode "→"`
 * rather than emit the wrong glyph, which is the right call for a library and
 * a terrible experience for someone converting a real spreadsheet.
 *
 * So text is mapped down here first: common symbols become their closest
 * readable equivalent, and anything genuinely unrepresentable becomes a
 * placeholder. The caller counts substitutions so the UI can be honest that
 * some characters were approximated instead of pretending the output is exact.
 */

/** The WinAnsi-only slots at 0x80-0x9F, which are not Latin-1. */
const WIN_ANSI_EXTRAS = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160,
    0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
  ],
);

function isEncodable(code: number): boolean {
  if (code >= 0x20 && code <= 0x7e) return true; // ASCII
  if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 supplement
  return WIN_ANSI_EXTRAS.has(code);
}

/**
 * Closest readable stand-ins for symbols that turn up in real spreadsheets.
 * Everything here is a deliberate approximation, not a lossless mapping.
 */
const SUBSTITUTES: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↑': '^',
  '↓': 'v',
  '↔': '<->',
  '⇒': '=>',
  '⇐': '<=',
  '✓': 'Yes',
  '✔': 'Yes',
  '✗': 'No',
  '✘': 'No',
  '★': '*',
  '☆': '*',
  '≈': '~',
  '≠': '!=',
  '≤': '<=',
  '≥': '>=',
  '∞': 'inf',
  '±': '+/-',
  '−': '-',
  '×': 'x',
  '÷': '/',
  '·': '.',
  '№': 'No.',
  '℃': 'degC',
  '℉': 'degF',
  '…': '...',
  ' ': ' ',
  '\t': '  ',
};

export type Sanitized = { text: string; substitutions: number };

/** Rewrites a string so every character can be drawn with a standard font. */
export function toWinAnsi(input: string): Sanitized {
  let substitutions = 0;
  let out = '';

  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;

    if (isEncodable(code)) {
      out += character;
      continue;
    }

    const replacement = SUBSTITUTES[character];
    if (replacement !== undefined) {
      out += replacement;
      substitutions += 1;
      continue;
    }

    // Strip combining marks by decomposing — "é" written as e + U+0301 becomes
    // a plain "e" rather than a placeholder.
    const folded = character.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (folded !== character && [...folded].every((c) => isEncodable(c.codePointAt(0) ?? 0))) {
      out += folded;
      substitutions += 1;
      continue;
    }

    // Newlines inside a cell would break the row layout anyway.
    if (character === '\n' || character === '\r') {
      out += ' ';
      continue;
    }

    out += '?';
    substitutions += 1;
  }

  return { text: out, substitutions };
}
