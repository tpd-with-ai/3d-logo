import type { Span } from './errors';
import type { CommandName } from './commands';

export type Expr =
  | { kind: 'number'; value: number; span: Span }
  | { kind: 'repcount'; span: Span }
  | { kind: 'negate'; operand: Expr; span: Span }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/'; left: Expr; right: Expr; span: Span };

/** A color argument, already resolved to a lowercase `#rrggbb` string by the parser. */
export interface ColorArg {
  kind: 'color';
  hex: string;
  span: Span;
}

export interface CommandStatement {
  kind: 'command';
  name: CommandName;
  /** Numeric commands carry exactly one Expr; `color` carries one ColorArg; others carry none. */
  args: (Expr | ColorArg)[];
  span: Span;
}

export interface RepeatStatement {
  kind: 'repeat';
  count: Expr;
  body: Statement[];
  span: Span;
}

export type Statement = CommandStatement | RepeatStatement;

export interface Program {
  body: Statement[];
}
