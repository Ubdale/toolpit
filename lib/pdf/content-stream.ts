'use client';

/**
 * A lexer and writer for PDF content streams.
 *
 * A page's content stream is a stack machine written in postfix: operands come
 * first, then the operator that consumes them. To take a watermark out of a
 * page without disturbing anything else, we have to read that program, find the
 * instructions that draw the watermark, and write the rest back untouched.
 *
 * The one design decision everything else follows from: **every operand keeps
 * its original source text**. Re-serialising is then a matter of joining what
 * we did not delete, so a stream survives the round trip byte-for-byte apart
 * from whitespace — no re-encoding of numbers, no re-escaping of strings, no
 * chance of corrupting a page we were only meant to read.
 */

export type OperandKind = 'string' | 'name' | 'number' | 'array' | 'dict' | 'other';

export type Operand = {
  kind: OperandKind;
  /** Exactly as it appeared in the stream. */
  raw: string;
  /** Decoded text, for string operands and the strings inside a TJ array. */
  text?: string;
};

export type Operation = {
  operands: Operand[];
  operator: string;
  /**
   * Inline images (BI … ID <binary> EI) are kept as one opaque blob, because
   * their payload is raw bytes that are not tokens at all.
   */
  inline?: Uint8Array;
};

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

function isWhitespace(byte: number): boolean {
  return WHITESPACE.has(byte);
}

function isDelimiter(byte: number): boolean {
  return DELIMITERS.has(byte);
}

/**
 * Decodes a literal string body, resolving the escape sequences PDF allows.
 * Bytes are mapped one-to-one to code points — for a standard-encoded font that
 * is the readable text, and for a subset font it is at least stable, which is
 * all the caller needs to group identical runs.
 */
function decodeLiteral(body: string): string {
  let out = '';

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i]!;
    if (char !== '\\') {
      out += char;
      continue;
    }

    const next = body[i + 1];
    if (next === undefined) break;

    switch (next) {
      case 'n':
        out += '\n';
        i += 1;
        break;
      case 'r':
        out += '\r';
        i += 1;
        break;
      case 't':
        out += '\t';
        i += 1;
        break;
      case 'b':
        out += '\b';
        i += 1;
        break;
      case 'f':
        out += '\f';
        i += 1;
        break;
      case '\n':
        // A backslash before a newline is a line continuation, not a character.
        i += 1;
        break;
      case '\r':
        i += 1;
        if (body[i + 1] === '\n') i += 1;
        break;
      default:
        if (next >= '0' && next <= '7') {
          let digits = '';
          let j = i + 1;
          while (j < body.length && digits.length < 3 && body[j]! >= '0' && body[j]! <= '7') {
            digits += body[j]!;
            j += 1;
          }
          out += String.fromCharCode(parseInt(digits, 8) & 0xff);
          i = j - 1;
        } else {
          out += next;
          i += 1;
        }
    }
  }

  return out;
}

function decodeHex(body: string): string {
  const clean = body.replace(/[^0-9a-fA-F]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 2) {
    // An odd final digit is padded with zero, per the spec.
    out += String.fromCharCode(parseInt((clean.slice(i, i + 2) + '0').slice(0, 2), 16));
  }
  return out;
}

/**
 * PDF text is often written in UTF-16BE, marked by a byte-order mark. Without
 * this, "DRAFT" from a modern producer reads as "\0D\0R\0A\0F\0T".
 */
function normalizeText(value: string): string {
  if (value.length >= 2 && value.charCodeAt(0) === 0xfe && value.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < value.length; i += 2) {
      out += String.fromCharCode((value.charCodeAt(i) << 8) | value.charCodeAt(i + 1));
    }
    return out;
  }
  return value;
}

class Lexer {
  private position = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  get done(): boolean {
    return this.position >= this.source.length;
  }

  get offset(): number {
    return this.position;
  }

  skipWhitespaceAndComments(): void {
    while (this.position < this.source.length) {
      const code = this.source.charCodeAt(this.position);
      if (isWhitespace(code)) {
        this.position += 1;
      } else if (code === 0x25) {
        // A comment runs to the end of the line.
        while (
          this.position < this.source.length &&
          this.source.charCodeAt(this.position) !== 0x0a &&
          this.source.charCodeAt(this.position) !== 0x0d
        ) {
          this.position += 1;
        }
      } else {
        break;
      }
    }
  }

  /** Reads one token: an operand, or a bare keyword that acts as an operator. */
  next(): { raw: string; kind: OperandKind | 'keyword' } | null {
    this.skipWhitespaceAndComments();
    if (this.done) return null;

    const start = this.position;
    const code = this.source.charCodeAt(this.position);

    // Literal string, with nesting.
    if (code === 0x28) {
      this.position += 1;
      let depth = 1;
      while (this.position < this.source.length && depth > 0) {
        const char = this.source.charCodeAt(this.position);
        if (char === 0x5c) {
          this.position += 2;
          continue;
        }
        if (char === 0x28) depth += 1;
        if (char === 0x29) depth -= 1;
        this.position += 1;
      }
      return { raw: this.source.slice(start, this.position), kind: 'string' };
    }

    // Hex string or dictionary.
    if (code === 0x3c) {
      if (this.source.charCodeAt(this.position + 1) === 0x3c) {
        let depth = 0;
        while (this.position < this.source.length) {
          if (this.source.startsWith('<<', this.position)) {
            depth += 1;
            this.position += 2;
          } else if (this.source.startsWith('>>', this.position)) {
            depth -= 1;
            this.position += 2;
            if (depth === 0) break;
          } else if (this.source.charCodeAt(this.position) === 0x28) {
            // Skip a string inside the dictionary so its ">>" cannot fool us.
            this.skipString();
          } else {
            this.position += 1;
          }
        }
        return { raw: this.source.slice(start, this.position), kind: 'dict' };
      }

      while (this.position < this.source.length && this.source.charCodeAt(this.position) !== 0x3e) {
        this.position += 1;
      }
      this.position += 1;
      return { raw: this.source.slice(start, this.position), kind: 'string' };
    }

    // Array.
    if (code === 0x5b) {
      let depth = 0;
      while (this.position < this.source.length) {
        const char = this.source.charCodeAt(this.position);
        if (char === 0x28) {
          this.skipString();
          continue;
        }
        if (char === 0x5b) depth += 1;
        if (char === 0x5d) {
          depth -= 1;
          this.position += 1;
          if (depth === 0) break;
          continue;
        }
        this.position += 1;
      }
      return { raw: this.source.slice(start, this.position), kind: 'array' };
    }

    // Name.
    if (code === 0x2f) {
      this.position += 1;
      while (this.position < this.source.length) {
        const char = this.source.charCodeAt(this.position);
        if (isWhitespace(char) || isDelimiter(char)) break;
        this.position += 1;
      }
      return { raw: this.source.slice(start, this.position), kind: 'name' };
    }

    // Anything else runs to the next delimiter or space: a number or a keyword.
    while (this.position < this.source.length) {
      const char = this.source.charCodeAt(this.position);
      if (isWhitespace(char) || isDelimiter(char)) break;
      this.position += 1;
    }
    // A lone delimiter would otherwise loop forever.
    if (this.position === start) this.position += 1;

    const raw = this.source.slice(start, this.position);
    return { raw, kind: /^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw) ? 'number' : 'keyword' };
  }

  private skipString(): void {
    this.position += 1;
    let depth = 1;
    while (this.position < this.source.length && depth > 0) {
      const char = this.source.charCodeAt(this.position);
      if (char === 0x5c) {
        this.position += 2;
        continue;
      }
      if (char === 0x28) depth += 1;
      if (char === 0x29) depth -= 1;
      this.position += 1;
    }
  }

  /** Consumes an inline image from after `ID` through its closing `EI`. */
  consumeInlineImage(): string {
    const start = this.position;
    while (this.position < this.source.length) {
      if (
        this.source.startsWith('EI', this.position) &&
        (this.position + 2 >= this.source.length ||
          isWhitespace(this.source.charCodeAt(this.position + 2)) ||
          isDelimiter(this.source.charCodeAt(this.position + 2))) &&
        isWhitespace(this.source.charCodeAt(this.position - 1))
      ) {
        this.position += 2;
        break;
      }
      this.position += 1;
    }
    return this.source.slice(start, this.position);
  }
}

/** Decoded text carried by a string operand, or by the strings inside an array. */
function operandText(kind: OperandKind, raw: string): string | undefined {
  if (kind === 'string') {
    const body = raw.startsWith('<') ? decodeHex(raw.slice(1, -1)) : decodeLiteral(raw.slice(1, -1));
    return normalizeText(body);
  }

  if (kind === 'array') {
    // A TJ array interleaves strings with kerning numbers; the text is the
    // strings joined, with the numbers dropped.
    let out = '';
    const lexer = new Lexer(raw.slice(1, -1));
    for (;;) {
      const token = lexer.next();
      if (!token) break;
      if (token.kind === 'string') out += operandText('string', token.raw) ?? '';
    }
    return out;
  }

  return undefined;
}

const LATIN1 = new TextDecoder('latin1');

export function tokenizeContentStream(bytes: Uint8Array): Operation[] {
  // Latin-1 maps every byte to one code point, so slicing the source by
  // character index is the same as slicing it by byte index.
  const source = LATIN1.decode(bytes);
  const lexer = new Lexer(source);

  const operations: Operation[] = [];
  let operands: Operand[] = [];

  for (;;) {
    const token = lexer.next();
    if (!token) break;

    if (token.kind !== 'keyword') {
      operands.push({
        kind: token.kind,
        raw: token.raw,
        text: operandText(token.kind, token.raw),
      });
      // A malformed stream could otherwise grow this without bound.
      if (operands.length > 512) operands = operands.slice(-64);
      continue;
    }

    if (token.raw === 'BI') {
      operations.push({ operands: [], operator: 'BI', inline: encodeLatin1(lexer.consumeInlineImage()) });
      operands = [];
      continue;
    }

    operations.push({ operands, operator: token.raw });
    operands = [];
  }

  return operations;
}

function encodeLatin1(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) out[i] = value.charCodeAt(i) & 0xff;
  return out;
}

/** Writes operations back out as a content stream. */
export function serializeContentStream(operations: Operation[]): Uint8Array {
  const parts: string[] = [];

  for (const operation of operations) {
    if (operation.inline) {
      parts.push(`BI${LATIN1.decode(operation.inline)}`);
      continue;
    }
    const operands = operation.operands.map((operand) => operand.raw).join(' ');
    parts.push(operands ? `${operands} ${operation.operator}` : operation.operator);
  }

  return encodeLatin1(`${parts.join('\n')}\n`);
}

/** The operators that put glyphs on the page. */
export const TEXT_SHOWING = new Set(['Tj', 'TJ', "'", '"']);

/** Text shown by one operation, whichever of the four forms it used. */
export function shownText(operation: Operation): string {
  if (!TEXT_SHOWING.has(operation.operator)) return '';

  // ' and " take the string last, after their spacing operands.
  const source =
    operation.operator === '"'
      ? operation.operands[2]
      : operation.operands[operation.operands.length - 1];

  return source?.text ?? '';
}
