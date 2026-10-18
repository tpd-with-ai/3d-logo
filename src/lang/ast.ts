import type { Span } from './errors';
import type { CommandName } from './commands';

export type Expr =
  | { kind: 'number'; value: number; span: Span }
  | { kind: 'repcount'; span: Span }
  | { kind: 'negate'; operand: Expr; span: Span }
  | { kind: 'call'; fn: 'sin' | 'cos'; arg: Expr; span: Span }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr; span: Span };

/**
 * A color argument. Names and hex values are resolved to lowercase `#rrggbb` by the parser;
 * `rgb(r, g, b)` and `hsv(h, s, v)` keep their component expressions, which the interpreter
 * evaluates (so they may use arithmetic and `repcount`) and converts to `#rrggbb`.
 */
export type ColorArg =
  | { kind: 'color'; form: 'hex'; hex: string; span: Span }
  | { kind: 'color'; form: 'rgb' | 'hsv'; args: [Expr, Expr, Expr]; span: Span };

export interface CommandStatement {
  kind: 'command';
  name: CommandName;
  /** Distance/angle commands carry one Expr, `setpos` three, `color` one ColorArg, others none. */
  args: (Expr | ColorArg)[];
  span: Span;
}

export interface RepeatStatement {
  kind: 'repeat';
  count: Expr;
  body: Statement[];
  span: Span;
}

/** `polygon [ … ]`: the turtle's start position and each move's end point become one filled face. */
export interface PolygonStatement {
  kind: 'polygon';
  body: Statement[];
  span: Span;
}

export type Statement = CommandStatement | RepeatStatement | PolygonStatement;

export interface Program {
  body: Statement[];
}
