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
    case 'call':
      return `${expr.fn}(${show(expr.arg)})`;
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
    ['repeat 4 fd 10', "'repeat' needs a [ block ], e.g. repeat 4 [ forward 50 right 90 ].", 1, 10],
    ['repeat 4 [\n fd 10', "This '[' is never closed. Add a matching ']'.", 1, 10],
    ['fd 10 ]', "Unexpected ']' with no matching '['.", 1, 7],
    ['fd (1 + 2', "Missing ')' to close this '('.", 1, 4],
    ['fd 1 +', "Expected a number, 'repcount', sin(…), cos(…), or '(' but found the end of the program.", 1, 6],
    ['fd repcount', "'repcount' can only be used inside a repeat block.", 1, 4],
    ['color reed', "Unknown color 'reed'. Did you mean 'red'?", 1, 7],
    ['color fd 10', "'color' needs a color: a name (red), hex (#ff8800), rgb(255, 128, 0), hsv(30, 100, 100), or with alpha rgba(255, 128, 0, 50) / hsva(30, 100, 100, 50).", 1, 1],
    ['color #12', 'A hex color looks like #ff8800', 1, 7],
    ['fd 10x', "A number must be followed by a space, not 'x'.", 1, 6],
    ['fd 10 @', "Unexpected character '@'.", 1, 7],
  ])('reports a friendly error for %j', (source, message, line, column) => {
    const error = syntaxError(source);
    expect(error.kind).toBe('syntax');
    expect(error.message).toContain(message);
    expect(error.span).toMatchObject({ line, column });
  });

  it('treats a sign-style minus as a new input, but subtraction otherwise (UCBLogo rule)', () => {
    const [setpos] = parse('setpos 72 -84 18').body as CommandStatement[];
    expect(setpos.args.map((a) => show(a as Expr))).toEqual(['72', '(-84)', '18']);
    const [a, b, c] = parse('fd 10 - 5 fd 10-5 fd (10 -5)').body as CommandStatement[];
    for (const stmt of [a, b, c]) expect(show(stmt.args[0] as Expr)).toBe('(10 - 5)');
    expect(syntaxError('fd 10 -5').message).toContain('Unexpected number -5.');
  });

  it('parses setpos with three expressions, including sin/cos calls and a sign-minus on a new line', () => {
    const [p] = parse('setpos 20 * cos(30)\n -20 * SIN ( 45 ) 0').body as CommandStatement[];
    expect(p.args.map((x) => show(x as Expr))).toEqual(['(20 * cos(30))', '((-20) * sin(45))', '0']);
  });

  it('parses polygon blocks and rgb/hsv colors with arithmetic, spaces, and any case', () => {
    const program = parse('polygon [ repeat 4 [ fd 10 rt 90 ] ]\nrepeat 3 [ color HSV( repcount * 20 , 80,100 ) color Rgb(255,0, 255 - 5) ]');
    expect(program.body[0]).toMatchObject({ kind: 'polygon', body: [{ kind: 'repeat' }] });
    const [hsv, rgb] = (program.body[1] as RepeatStatement).body as CommandStatement[];
    expect(hsv.args[0]).toMatchObject({ kind: 'color', form: 'hsv' });
    const rgbArgs = (rgb.args[0] as { args: Expr[] }).args.map(show);
    expect(rgbArgs).toEqual(['255', '0', '(255 - 5)']);
  });

  it('parses rgba/hsva with four components, arithmetic, spaces, and any case', () => {
    const program = parse('repeat 2 [ color HSVA( repcount * 20 , 80,100, 100 - repcount * 10 ) color Rgba(255,0, 0,50) ]');
    const [hsva, rgba] = (program.body[0] as RepeatStatement).body as CommandStatement[];
    expect(hsva.args[0]).toMatchObject({ kind: 'color', form: 'hsva' });
    expect((hsva.args[0] as { args: Expr[] }).args.map(show)).toEqual(['(repcount * 20)', '80', '100', '(100 - (repcount * 10))']);
    expect((rgba.args[0] as { args: Expr[] }).args.map(show)).toEqual(['255', '0', '0', '50']);
  });

  it.each([
    ['color rgba(1, 2, 3)', "'rgba' takes 4 values but got 3, e.g. rgba(255, 128, 0, 50).", 1, 7],
    ['color hsva(1, 2, 3, 4, 5)', "'hsva' takes 4 values but got 5, e.g. hsva(30, 100, 100, 50).", 1, 7],
    ['color rgba(1, 2, 3 4)', "Separate the values of 'rgba' with commas", 1, 20],
    ['color rgba 1 2 3 4', "'rgba' needs parentheses, e.g. rgba(255, 128, 0, 50).", 1, 7],
    ['color hsvaa(1, 2, 3, 4)', "Did you mean 'hsva'?", 1, 7],
    ['setpos 1 2', "'setpos' needs three numbers x y z, e.g. setpos 0 -50 20 (it got 2).", 1, 1],
    ['polygon fd 10', "'polygon' needs a [ block ], e.g. polygon [ repeat 4 [ forward 50 right 90 ] ].", 1, 9],
    ['polygon [ fd 10 polygon [ fd 5 ] ]', "'polygon' cannot be used inside a polygon block.", 1, 17],
    ['polygon [ clear ]', "'clear' cannot be used inside a polygon block.", 1, 11],
    ['fd sin 30', "'sin' needs parentheses, e.g. sin(30).", 1, 4],
    ['fd cos(1, 2)', "'cos' takes 1 value but got 2, e.g. cos(30).", 1, 4],
    ['color rgb(255, 0)', "'rgb' takes 3 values but got 2, e.g. rgb(255, 128, 0).", 1, 7],
    ['color rgb(1, 2, 3, 4)', "'rgb' takes 3 values but got 4", 1, 7],
    ['color hsv(1 2 3)', "Separate the values of 'hsv' with commas and close it with ')', e.g. hsv(30, 100, 100); found '2'.", 1, 13],
    ['color rgb(1, 2, 3', "Separate the values of 'rgb' with commas and close it with ')'", 1, 10],
    ['color rgb 1 2 3', "'rgb' needs parentheses, e.g. rgb(255, 128, 0).", 1, 7],
    ['color rgb(1, , 3)', "Expected a number, 'repcount', sin(…), cos(…), or '(' but found ','.", 1, 14],
    ['color hsb(1, 2, 3)', "Unknown color 'hsb'. Did you mean 'hsv'?", 1, 7],
    ['fd 1, 2', "Expected a command, but found ','.", 1, 5],
    ['sin(30)', "'sin' gives a number; use it as an input, e.g. forward 10 * sin(30).", 1, 1],
  ])('reports a friendly error for extension syntax %j', (source, message, line, column) => {
    const error = syntaxError(source);
    expect(error.message).toContain(message);
    expect(error.span).toMatchObject({ line, column });
  });

  it('accepts repcount inside nested repeats', () => {
    expect(() => parse('repeat 3 [ repeat repcount [ fd repcount * 2 ] ]')).not.toThrow();
  });
});
