import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { LogoError } from './errors';
import type { CommandStatement, Expr, RepeatStatement } from './ast';

function syntaxError(source: string): LogoError {
  try {
    parse(source);
  } catch (error) {
    if (error instanceof LogoError) return error;
    throw error;
  }
  throw new Error(`expected a syntax error for: ${source}`);
}

/** Renders an expression with explicit parentheses to check precedence and associativity. */
function show(expr: Expr): string {
  switch (expr.kind) {
    case 'number':
      return String(expr.value);
    case 'repcount':
      return 'repcount';
    case 'negate':
      return `(-${show(expr.operand)})`;
    case 'binary':
      return `(${show(expr.left)} ${expr.op} ${show(expr.right)})`;
  }
}

describe('parser', () => {
  it('resolves aliases and case to canonical command names', () => {
    const program = parse('FD 10 Rt 90\npu PD rr 5 rl 5 bk 1 lt 2 left 1 right 1 Climb 3 dive 4 PitchUp 1 yawLeft 1');
    expect(program.body.map((s) => (s as CommandStatement).name)).toEqual([
      'forward', 'yawright', 'penup', 'pendown', 'rollright', 'rollleft', 'back', 'yawleft',
      'yawleft', 'yawright', 'pitchup', 'pitchdown', 'pitchup', 'yawleft',
    ]);
  });

  it('applies * and / before + and -, left to right, with unary minus binding tightest', () => {
    const [stmt] = parse('fd 1 - 2 - 3 * -4 / 2 + (5 - 6)').body as CommandStatement[];
    expect(show(stmt.args[0] as Expr)).toBe('(((1 - 2) - ((3 * (-4)) / 2)) + (5 - 6))');
  });

  it('ends an argument at the next command word, so commands can share a line', () => {
    const program = parse('repeat 4 [fd 50 rt 90] color #F80 color red');
    const repeat = program.body[0] as RepeatStatement;
    expect(repeat.body).toHaveLength(2);
    expect(program.body[1]).toMatchObject({ name: 'color', args: [{ hex: '#ff8800' }] });
    expect(program.body[2]).toMatchObject({ name: 'color', args: [{ hex: '#ef4444' }] });
  });

  it('records 1-based line/column spans and skips comments', () => {
    const program = parse('; a square\n  fd 10 ; go\n\tlt 90');
    expect(program.body[0].span).toMatchObject({ line: 2, column: 3, offset: 13, length: 5 });
    expect(program.body[1].span).toMatchObject({ line: 3, column: 2 });
  });

  it.each([
    ['foward 10', "Unknown command 'foward'. Did you mean 'forward'?", 1, 1],
    ['fd 10\nrt', "'rt' needs an angle in degrees, e.g. rt 90.", 2, 1],
    ['pitchup fd 10', "'pitchup' needs an angle in degrees, e.g. pitchup 90.", 1, 1],
    ['yawlft 90', "Unknown command 'yawlft'. Did you mean 'yawleft'?", 1, 1],
    ['fd 10 20', 'Unexpected number 20.', 1, 7],
    ['repeat 4 fd 10', "'repeat' needs a [ block ] after the count.", 1, 10],
    ['repeat 4 [\n fd 10', "This '[' is never closed. Add a matching ']'.", 1, 10],
    ['fd 10 ]', "Unexpected ']' with no matching '['.", 1, 7],
    ['fd (1 + 2', "Missing ')' to close this '('.", 1, 4],
    ['fd 1 +', "Expected a number, 'repcount', or '(' but found the end of the program.", 1, 6],
    ['fd repcount', "'repcount' can only be used inside a repeat block.", 1, 4],
    ['color reed', "Unknown color 'reed'. Did you mean 'red'?", 1, 7],
    ['color fd 10', "'color' needs a color name or hex value", 1, 1],
    ['color #12', 'A hex color looks like #ff8800', 1, 7],
    ['fd 10x', "A number must be followed by a space, not 'x'.", 1, 6],
    ['fd 10 @', "Unexpected character '@'.", 1, 7],
  ])('reports a friendly error for %j', (source, message, line, column) => {
    const error = syntaxError(source);
    expect(error.kind).toBe('syntax');
    expect(error.message).toContain(message);
    expect(error.span).toMatchObject({ line, column });
  });

  it('accepts repcount inside nested repeats', () => {
    expect(() => parse('repeat 3 [ repeat repcount [ fd repcount * 2 ] ]')).not.toThrow();
  });
});
