import { tokenize, type Token } from './lexer';
import type { Node, BinaryOp, ParseIssue } from './types';

/**
 * A precedence-climbing parser for the expression grammar.
 *
 * Precedence follows Excel's own table, which is not quite the one most
 * languages use: comparison binds loosest, then concatenation, then the
 * arithmetic tiers, and `^` is right-associative.
 */

const PRECEDENCE: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

const RIGHT_ASSOCIATIVE = new Set(['^']);

export type ParseResult = {
  node: Node | null;
  issues: ParseIssue[];
};

export function parse(input: string): ParseResult {
  const trimmed = input.trim().replace(/^=/, '');
  if (!trimmed) return { node: null, issues: [] };

  const { tokens, issues } = tokenize(trimmed);
  const parser = new Parser(tokens, issues);
  const node = parser.parseExpression(0);

  if (node && parser.peek().kind !== 'eof') {
    const token = parser.peek();
    issues.push({
      message: `Unexpected "${token.value}" — something is missing before it.`,
      start: token.start,
      end: token.end,
    });
  }

  return { node, issues };
}

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly issues: ParseIssue[],
  ) {}

  peek(): Token {
    return this.tokens[this.position] ?? this.tokens[this.tokens.length - 1]!;
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') this.position += 1;
    return token;
  }

  private expect(kind: Token['kind'], what: string): boolean {
    if (this.peek().kind === kind) {
      this.next();
      return true;
    }
    const token = this.peek();
    this.issues.push({
      message: `Expected ${what} here.`,
      start: token.start,
      end: token.end,
    });
    return false;
  }

  parseExpression(minPrecedence: number): Node | null {
    let left = this.parseUnary();
    if (!left) return null;

    for (;;) {
      const token = this.peek();
      if (token.kind !== 'operator') break;

      // Postfix percent is a suffix, not an infix operator.
      if (token.value === '%') {
        this.next();
        left = { kind: 'percent', operand: left };
        continue;
      }

      const precedence = PRECEDENCE[token.value];
      if (precedence === undefined || precedence < minPrecedence) break;

      this.next();
      const nextMin = RIGHT_ASSOCIATIVE.has(token.value) ? precedence : precedence + 1;
      const right = this.parseExpression(nextMin);
      if (!right) return left;

      left = { kind: 'binary', op: token.value as BinaryOp, left, right };
    }

    return left;
  }

  private parseUnary(): Node | null {
    const token = this.peek();
    if (token.kind === 'operator' && (token.value === '-' || token.value === '+')) {
      this.next();
      const operand = this.parseUnary();
      if (!operand) return null;
      return { kind: 'unary', op: token.value as '-' | '+', operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node | null {
    const token = this.next();

    switch (token.kind) {
      case 'number':
        return { kind: 'number', value: Number(token.value) };

      case 'string':
        return { kind: 'string', value: token.value };

      case 'field':
        return { kind: 'field', field: token.value };

      case 'lparen': {
        const inner = this.parseExpression(0);
        this.expect('rparen', 'a closing bracket ")"');
        return inner;
      }

      case 'identifier': {
        const upper = token.value.toUpperCase();
        if (upper === 'TRUE') return { kind: 'boolean', value: true };
        if (upper === 'FALSE') return { kind: 'boolean', value: false };

        // `Orders[Amount]` — a table name followed by a bracketed column.
        if (this.peek().kind === 'field') {
          const field = this.next();
          return { kind: 'ref', table: token.value, field: field.value };
        }

        if (this.peek().kind === 'lparen') {
          this.next();
          const args: Node[] = [];
          if (this.peek().kind !== 'rparen') {
            for (;;) {
              const arg = this.parseExpression(0);
              if (!arg) break;
              args.push(arg);
              if (this.peek().kind !== 'comma') break;
              this.next();
            }
          }
          this.expect('rparen', 'a closing bracket ")"');
          return { kind: 'call', name: upper, args };
        }

        this.issues.push({
          message: `"${token.value}" is not a function or a column. Column names go in square brackets, like [${token.value}].`,
          start: token.start,
          end: token.end,
        });
        return null;
      }

      default:
        this.issues.push({
          message: token.kind === 'eof' ? 'The formula is incomplete.' : `Unexpected "${token.value}".`,
          start: token.start,
          end: token.end,
        });
        return null;
    }
  }
}

/** Every column this formula reads, for dependency ordering and validation. */
export function dependencies(node: Node | null): { fields: string[]; refs: { table: string; field: string }[] } {
  const fields = new Set<string>();
  const refs: { table: string; field: string }[] = [];

  const walk = (current: Node | null) => {
    if (!current) return;
    switch (current.kind) {
      case 'field':
        fields.add(current.field);
        break;
      case 'ref':
        refs.push({ table: current.table, field: current.field });
        break;
      case 'unary':
      case 'percent':
        walk(current.operand);
        break;
      case 'binary':
        walk(current.left);
        walk(current.right);
        break;
      case 'call':
        current.args.forEach(walk);
        break;
    }
  };

  walk(node);
  return { fields: [...fields], refs };
}
