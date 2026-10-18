import { LogoError, type Span } from './errors';

export type TokenType =
  | 'number'
  | 'word'
  | 'hexColor'
  | '['
  | ']'
  | '('
  | ')'
  | '+'
  | '-'
  | '*'
  | '/'
  | 'eof';

export interface Token {
  type: TokenType;
  /** Original source text. Words keep their original case; compare with `lower`. */
  text: string;
  span: Span;
}

const SINGLE: Record<string, TokenType> = {
  '[': '[',
  ']': ']',
  '(': '(',
  ')': ')',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
};

/**
 * Splits source into tokens. Whitespace (including newlines) separates tokens and is otherwise
 * insignificant. `;` starts a comment that runs to the end of the line.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;

  const span = (start: number, length: number): Span => ({
    offset: start,
    length,
    line,
    column: start - lineStart + 1,
  });

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') {
      i++;
      line++;
      lineStart = i;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === ';') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    const start = i;

    if (/[0-9.]/.test(ch)) {
      const match = /^(\d+(\.\d+)?|\.\d+)/.exec(source.slice(i));
      if (!match) throw new LogoError('syntax', `Unexpected character '${ch}'.`, span(start, 1));
      i += match[0].length;
      if (i < source.length && /[A-Za-z_]/.test(source[i])) {
        throw new LogoError(
          'syntax',
          `A number must be followed by a space, not '${source[i]}'.`,
          span(i, 1),
        );
      }
      tokens.push({ type: 'number', text: match[0], span: span(start, match[0].length) });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) i++;
      tokens.push({ type: 'word', text: source.slice(start, i), span: span(start, i - start) });
      continue;
    }

    if (ch === '#') {
      const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9A-Za-z_])/.exec(source.slice(i));
      if (!match) {
        throw new LogoError(
          'syntax',
          "A hex color looks like #ff8800 or #f80 (3 or 6 hex digits).",
          span(start, 1),
        );
      }
      i += match[0].length;
      tokens.push({ type: 'hexColor', text: match[0], span: span(start, match[0].length) });
      continue;
    }

    const single = SINGLE[ch];
    if (single) {
      i++;
      tokens.push({ type: single, text: ch, span: span(start, 1) });
      continue;
    }

    throw new LogoError('syntax', `Unexpected character '${ch}'.`, span(start, 1));
  }

  tokens.push({ type: 'eof', text: '', span: span(i, 0) });
  return tokens;
}
