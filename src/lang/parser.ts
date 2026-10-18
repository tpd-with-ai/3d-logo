import type { ColorArg, Expr, Program, Statement } from './ast';
import { findCommand, NAMED_COLORS, RESERVED_WORDS } from './commands';
import { LogoError, suggest, type Span } from './errors';
import { tokenize, type Token } from './lexer';

/** Parses source text into a Program, or throws a LogoError of kind 'syntax'. */
export function parse(source: string): Program {
  return new Parser(tokenize(source)).program();
}

function cover(from: Span, to: Span): Span {
  return { ...from, length: to.offset + to.length - from.offset };
}

const argHint = (kind: 'distance' | 'angle', word: string) =>
  kind === 'distance' ? `a distance, e.g. ${word} 50` : `an angle in degrees, e.g. ${word} 90`;

class Parser {
  private index = 0;
  private repeatDepth = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== 'eof') this.index++;
    return token;
  }

  private fail(message: string, span: Span): never {
    throw new LogoError('syntax', message, span);
  }

  program(): Program {
    const body: Statement[] = [];
    while (this.peek().type !== 'eof') {
      if (this.peek().type === ']') this.fail("Unexpected ']' with no matching '['.", this.peek().span);
      body.push(this.statement());
    }
    return { body };
  }

  private statement(): Statement {
    const token = this.next();
    if (token.type !== 'word') {
      if (token.type === 'number') {
        this.fail(
          `Unexpected number ${token.text}. Each command takes at most one input; did you forget a command name?`,
          token.span,
        );
      }
      this.fail(`Expected a command, but found '${token.text}'.`, token.span);
    }

    const word = token.text.toLowerCase();
    if (word === 'repeat') return this.repeat(token);
    if (word === 'repcount') {
      this.fail("'repcount' is a number, not a command. Use it as an input, e.g. forward repcount.", token.span);
    }

    const command = findCommand(word);
    if (!command) {
      const hint = suggest(word, RESERVED_WORDS);
      this.fail(`Unknown command '${token.text}'.${hint ? ` Did you mean '${hint}'?` : ''}`, token.span);
    }

    if (command.arg === 'none') return { kind: 'command', name: command.name, args: [], span: token.span };

    if (command.arg === 'color') {
      const color = this.colorArg(token);
      return { kind: 'command', name: command.name, args: [color], span: cover(token.span, color.span) };
    }

    if (!this.startsExpression(this.peek())) {
      const word = token.text.toLowerCase();
      this.fail(`'${word}' needs ${argHint(command.arg, word)}.`, token.span);
    }
    const arg = this.expression();
    return { kind: 'command', name: command.name, args: [arg], span: cover(token.span, arg.span) };
  }

  private repeat(keyword: Token): Statement {
    if (!this.startsExpression(this.peek())) {
      this.fail("'repeat' needs a count and a block, e.g. repeat 4 [ forward 50 right 90 ].", keyword.span);
    }
    const count = this.expression();
    const open = this.next();
    if (open.type !== '[') {
      this.fail("'repeat' needs a [ block ] after the count.", open.type === 'eof' ? keyword.span : open.span);
    }

    this.repeatDepth++;
    const body: Statement[] = [];
    while (this.peek().type !== ']') {
      if (this.peek().type === 'eof') this.fail("This '[' is never closed. Add a matching ']'.", open.span);
      body.push(this.statement());
    }
    const close = this.next();
    this.repeatDepth--;
    return { kind: 'repeat', count, body, span: cover(keyword.span, close.span) };
  }

  private colorArg(command: Token): ColorArg {
    const token = this.peek();
    if (token.type === 'hexColor') {
      this.next();
      let hex = token.text.toLowerCase();
      if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      return { kind: 'color', hex, span: token.span };
    }
    if (token.type === 'word' && !findCommand(token.text.toLowerCase()) && token.text.toLowerCase() !== 'repeat') {
      this.next();
      const name = token.text.toLowerCase();
      const hex = NAMED_COLORS[name];
      if (!hex) {
        const hint = suggest(name, Object.keys(NAMED_COLORS));
        this.fail(
          `Unknown color '${token.text}'.${hint ? ` Did you mean '${hint}'?` : ''} Use a name like red or a hex value like #ff8800.`,
          token.span,
        );
      }
      return { kind: 'color', hex, span: token.span };
    }
    this.fail("'color' needs a color name or hex value, e.g. color red or color #ff8800.", command.span);
  }

  private startsExpression(token: Token): boolean {
    return (
      token.type === 'number' ||
      token.type === '(' ||
      token.type === '-' ||
      (token.type === 'word' && token.text.toLowerCase() === 'repcount')
    );
  }

  // expr = term { ("+" | "-") term }
  private expression(): Expr {
    let left = this.term();
    while (this.peek().type === '+' || this.peek().type === '-') {
      const op = this.next().type as '+' | '-';
      const right = this.term();
      left = { kind: 'binary', op, left, right, span: cover(left.span, right.span) };
    }
    return left;
  }

  // term = unary { ("*" | "/") unary }
  private term(): Expr {
    let left = this.unary();
    while (this.peek().type === '*' || this.peek().type === '/') {
      const op = this.next().type as '*' | '/';
      const right = this.unary();
      left = { kind: 'binary', op, left, right, span: cover(left.span, right.span) };
    }
    return left;
  }

  // unary = "-" unary | primary
  private unary(): Expr {
    if (this.peek().type === '-') {
      const minus = this.next();
      const operand = this.unary();
      return { kind: 'negate', operand, span: cover(minus.span, operand.span) };
    }
    return this.primary();
  }

  // primary = NUMBER | "repcount" | "(" expr ")"
  private primary(): Expr {
    const token = this.next();
    if (token.type === 'number') return { kind: 'number', value: Number(token.text), span: token.span };
    if (token.type === 'word' && token.text.toLowerCase() === 'repcount') {
      if (this.repeatDepth === 0) this.fail("'repcount' can only be used inside a repeat block.", token.span);
      return { kind: 'repcount', span: token.span };
    }
    if (token.type === '(') {
      const inner = this.expression();
      const close = this.next();
      if (close.type !== ')') this.fail("Missing ')' to close this '('.", token.span);
      return { ...inner, span: cover(token.span, close.span) };
    }
    const found = token.type === 'eof' ? 'the end of the program' : `'${token.text}'`;
    this.fail(`Expected a number, 'repcount', or '(' but found ${found}.`, token.type === 'eof' ? this.tokens[this.index - 1]?.span ?? token.span : token.span);
  }
}
