import type { ColorArg, CommandStatement, Expr, Program, Statement } from './ast';
import { findCommand, FUNCTIONS, NAMED_COLORS, RESERVED_WORDS } from './commands';
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

/** Commands that make no sense while a polygon is being collected. */
const NOT_IN_POLYGON = new Set(['clear', 'reset', 'polygon']);

class Parser {
  private index = 0;
  private repeatDepth = 0;
  private parenDepth = 0;
  private polygonDepth = 0;

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
      if (token.type === 'number' || (token.type === '-' && this.peek().type === 'number')) {
        const text = token.type === '-' ? `-${this.peek().text}` : token.text;
        this.fail(
          `Unexpected number ${text}. Check how many inputs the command before it takes; did you forget a command name?`,
          token.span,
        );
      }
      this.fail(`Expected a command, but found '${token.text}'.`, token.span);
    }

    const word = token.text.toLowerCase();
    if (word === 'repeat') return this.repeat(token);
    if (word === 'repcount' || (FUNCTIONS as readonly string[]).includes(word)) {
      this.fail(`'${word}' gives a number; use it as an input, e.g. forward ${word === 'repcount' ? 'repcount' : `10 * ${word}(30)`}.`, token.span);
    }

    const command = findCommand(word);
    if (!command) {
      const hint = suggest(word, RESERVED_WORDS);
      this.fail(`Unknown command '${token.text}'.${hint ? ` Did you mean '${hint}'?` : ''}`, token.span);
    }
    if (this.polygonDepth > 0 && NOT_IN_POLYGON.has(command.name)) {
      this.fail(`'${command.name}' cannot be used inside a polygon block.`, token.span);
    }

    switch (command.arg) {
      case 'none':
        return { kind: 'command', name: command.name, args: [], span: token.span };
      case 'block':
        return this.polygon(token);
      case 'color': {
        const color = this.colorArg(token);
        return { kind: 'command', name: command.name, args: [color], span: cover(token.span, color.span) };
      }
      case 'point': {
        const args: Expr[] = [];
        for (let i = 0; i < 3; i++) {
          if (!this.startsExpression(this.peek())) {
            this.fail(`'${word}' needs three numbers x y z, e.g. ${word} 0 -50 20 (it got ${i}).`, token.span);
          }
          args.push(this.expression());
        }
        return { kind: 'command', name: command.name, args, span: cover(token.span, args[2].span) };
      }
      default: {
        if (!this.startsExpression(this.peek())) this.fail(`'${word}' needs ${argHint(command.arg, word)}.`, token.span);
        const arg = this.expression();
        return { kind: 'command', name: command.name, args: [arg], span: cover(token.span, arg.span) } satisfies CommandStatement;
      }
    }
  }

  private block(keyword: Token, usage: string): { body: Statement[]; close: Token } {
    const open = this.next();
    if (open.type !== '[') {
      this.fail(`'${keyword.text.toLowerCase()}' needs a [ block ], e.g. ${usage}.`, open.type === 'eof' ? keyword.span : open.span);
    }
    const body: Statement[] = [];
    while (this.peek().type !== ']') {
      if (this.peek().type === 'eof') this.fail("This '[' is never closed. Add a matching ']'.", open.span);
      body.push(this.statement());
    }
    return { body, close: this.next() };
  }

  private repeat(keyword: Token): Statement {
    if (!this.startsExpression(this.peek())) {
      this.fail("'repeat' needs a count and a block, e.g. repeat 4 [ forward 50 right 90 ].", keyword.span);
    }
    const count = this.expression();
    this.repeatDepth++;
    const { body, close } = this.block(keyword, 'repeat 4 [ forward 50 right 90 ]');
    this.repeatDepth--;
    return { kind: 'repeat', count, body, span: cover(keyword.span, close.span) };
  }

  private polygon(keyword: Token): Statement {
    this.polygonDepth++;
    const { body, close } = this.block(keyword, 'polygon [ repeat 4 [ forward 50 right 90 ] ]');
    this.polygonDepth--;
    return { kind: 'polygon', body, span: cover(keyword.span, close.span) };
  }

  /** `name ( expr {, expr} )` with exactly `arity` comma-separated arguments. */
  private callArgs(name: Token, arity: number, example: string): { args: Expr[]; close: Token } {
    const word = name.text.toLowerCase();
    const open = this.next();
    if (open.type !== '(') this.fail(`'${word}' needs parentheses, e.g. ${example}.`, name.span);
    this.parenDepth++;
    const args: Expr[] = [];
    for (;;) {
      if (this.peek().type === ')' && args.length === 0) break;
      args.push(this.expression());
      const sep = this.peek();
      if (sep.type === ',') {
        this.next();
        continue;
      }
      if (sep.type === ')') break;
      const found = sep.type === 'eof' ? 'the end of the program' : `'${sep.text}'`;
      this.fail(`Separate the values of '${word}' with commas and close it with ')', e.g. ${example}; found ${found}.`, sep.type === 'eof' ? open.span : sep.span);
    }
    const close = this.next();
    this.parenDepth--;
    if (args.length !== arity) {
      this.fail(`'${word}' takes ${arity} value${arity === 1 ? '' : 's'} but got ${args.length}, e.g. ${example}.`, cover(name.span, close.span));
    }
    return { args, close };
  }

  private colorArg(command: Token): ColorArg {
    const token = this.peek();
    if (token.type === 'hexColor') {
      this.next();
      let hex = token.text.toLowerCase();
      if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      return { kind: 'color', form: 'hex', hex, span: token.span };
    }
    const name = token.type === 'word' ? token.text.toLowerCase() : '';
    if (name === 'rgb' || name === 'hsv' || name === 'rgba' || name === 'hsva') {
      this.next();
      const examples = { rgb: 'rgb(255, 128, 0)', hsv: 'hsv(30, 100, 100)', rgba: 'rgba(255, 128, 0, 50)', hsva: 'hsva(30, 100, 100, 50)' };
      const { args, close } = this.callArgs(token, name.length === 4 ? 4 : 3, examples[name]);
      const span = cover(token.span, close.span);
      return name === 'rgba' || name === 'hsva'
        ? { kind: 'color', form: name, args: args as [Expr, Expr, Expr, Expr], span }
        : { kind: 'color', form: name, args: args as [Expr, Expr, Expr], span };
    }
    if (token.type === 'word' && !findCommand(name) && name !== 'repeat') {
      this.next();
      const hex = NAMED_COLORS[name];
      if (!hex) {
        const hint = suggest(name, [...Object.keys(NAMED_COLORS), 'rgb', 'hsv', 'rgba', 'hsva']);
        this.fail(
          `Unknown color '${token.text}'.${hint ? ` Did you mean '${hint}'?` : ''} Use a name like red, #ff8800, rgb(255, 128, 0), hsv(30, 100, 100), rgba(255, 128, 0, 50), or hsva(30, 100, 100, 50).`,
          token.span,
        );
      }
      return { kind: 'color', form: 'hex', hex, span: token.span };
    }
    this.fail("'color' needs a color: a name (red), hex (#ff8800), rgb(255, 128, 0), hsv(30, 100, 100), or with alpha rgba(255, 128, 0, 50) / hsva(30, 100, 100, 50).", command.span);
  }

  private startsExpression(token: Token): boolean {
    if (token.type === 'number' || token.type === '(' || token.type === '-') return true;
    if (token.type !== 'word') return false;
    const word = token.text.toLowerCase();
    return word === 'repcount' || (FUNCTIONS as readonly string[]).includes(word);
  }

  /**
   * A '-' written like a sign (`10 -5`) ends the current input instead of subtracting, so
   * `setpos 10 -5 3` has three inputs. Inside parentheses it always subtracts.
   */
  private continuesWithMinus(): boolean {
    const token = this.peek();
    return token.type === '-' && (!token.sign || this.parenDepth > 0);
  }

  // expr = term { ("+" | "-") term }
  private expression(): Expr {
    let left = this.term();
    while (this.peek().type === '+' || this.continuesWithMinus()) {
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

  // primary = NUMBER | "repcount" | ("sin" | "cos") "(" expr ")" | "(" expr ")"
  private primary(): Expr {
    const token = this.next();
    if (token.type === 'number') return { kind: 'number', value: Number(token.text), span: token.span };
    const word = token.type === 'word' ? token.text.toLowerCase() : '';
    if (word === 'repcount') {
      if (this.repeatDepth === 0) this.fail("'repcount' can only be used inside a repeat block.", token.span);
      return { kind: 'repcount', span: token.span };
    }
    if (word === 'sin' || word === 'cos') {
      const { args, close } = this.callArgs(token, 1, `${word}(30)`);
      return { kind: 'call', fn: word, arg: args[0], span: cover(token.span, close.span) };
    }
    if (token.type === '(') {
      this.parenDepth++;
      const inner = this.expression();
      this.parenDepth--;
      const close = this.next();
      if (close.type !== ')') this.fail("Missing ')' to close this '('.", token.span);
      return { ...inner, span: cover(token.span, close.span) };
    }
    const found = token.type === 'eof' ? 'the end of the program' : `'${token.text}'`;
    this.fail(
      `Expected a number, 'repcount', sin(…), cos(…), or '(' but found ${found}.`,
      token.type === 'eof' ? (this.tokens[this.index - 1]?.span ?? token.span) : token.span,
    );
  }
}
