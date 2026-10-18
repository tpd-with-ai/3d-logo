import type { ColorArg, CommandStatement, Expr, Program, Statement } from '../lang/ast';
import { LogoError, type Span } from '../lang/errors';
import { parse } from '../lang/parser';
import { DrawingBuilder, type DrawMode, type Drawing, type Segment, type Triangle } from '../geometry/drawing';
import { HOME_POSE, move, pitch, roll, yaw, type Pose } from '../turtle/turtle';
import { cosSinDeg, vec } from '../turtle/vec';
import { ColorComponentError, hsvToHex, rgbToHex } from './color';

/** A snapshot after one executed command, used by the playground to replay a run. */
export interface Frame {
  readonly pose: Pose;
  /** Visible ranges into RunResult.allSegments / allTriangles after this command. */
  readonly segmentStart: number;
  readonly segmentEnd: number;
  readonly triangleStart: number;
  readonly triangleEnd: number;
  /** Source of the command that produced this frame. */
  readonly span: Span;
}

export interface RunResult {
  /** What is visible at the end (or at the point a runtime error stopped the program). */
  readonly drawing: Drawing;
  readonly pose: Pose;
  readonly penDown: boolean;
  readonly mode: DrawMode;
  readonly color: string;
  /** Number of commands and repeat iterations executed. */
  readonly steps: number;
  /** Every primitive ever emitted, including ones later hidden by `clear`. */
  readonly allSegments: readonly Segment[];
  readonly allTriangles: readonly Triangle[];
  readonly frames: readonly Frame[];
  /** True when the run was longer than `maxFrames`; frames then cover only the beginning. */
  readonly framesTruncated: boolean;
  readonly error?: LogoError;
}

export interface RunOptions {
  /** Safety limit on executed commands + repeat iterations. */
  maxSteps?: number;
  /** Safety limit on emitted segments + triangles. */
  maxPrimitives?: number;
  /** Maximum frames recorded for playback. */
  maxFrames?: number;
}

export const DEFAULT_LIMITS = { maxSteps: 1_000_000, maxPrimitives: 200_000, maxFrames: 100_000 };

/** Parses and runs source. Syntax errors produce an empty result carrying the error. */
export function runSource(source: string, options: RunOptions = {}): RunResult {
  let program: Program;
  try {
    program = parse(source);
  } catch (error) {
    if (!(error instanceof LogoError)) throw error;
    return new Interpreter(options).finish(error);
  }
  return run(program, options);
}

/** Runs a parsed program from a fresh state. Each call is fully independent. */
export function run(program: Program, options: RunOptions = {}): RunResult {
  const interpreter = new Interpreter(options);
  try {
    interpreter.block(program.body);
  } catch (error) {
    if (!(error instanceof LogoError)) throw error;
    return interpreter.finish(error);
  }
  return interpreter.finish();
}

class Interpreter {
  private pose: Pose = HOME_POSE;
  private readonly drawing = new DrawingBuilder(HOME_POSE.position);
  private readonly repcounts: number[] = [];
  private readonly frames: Frame[] = [];
  private framesTruncated = false;
  private steps = 0;
  private readonly limits: Required<RunOptions>;

  constructor(options: RunOptions) {
    this.limits = { ...DEFAULT_LIMITS, ...options };
  }

  finish(error?: LogoError): RunResult {
    const d = this.drawing;
    return {
      drawing: d.result(),
      pose: this.pose,
      penDown: d.penDown,
      mode: d.mode,
      color: d.color,
      steps: this.steps,
      allSegments: d.segments,
      allTriangles: d.triangles,
      frames: this.frames,
      framesTruncated: this.framesTruncated,
      error,
    };
  }

  block(statements: readonly Statement[]): void {
    for (const statement of statements) {
      if (statement.kind === 'repeat') this.repeat(statement.count, statement.body, statement.span);
      else if (statement.kind === 'polygon') this.polygon(statement.body, statement.span);
      else this.command(statement);
    }
  }

  private tick(span: Span): void {
    if (++this.steps > this.limits.maxSteps) {
      throw new LogoError(
        'runtime',
        `Stopped after ${this.limits.maxSteps.toLocaleString('en-US')} steps. Is a repeat count too large?`,
        span,
      );
    }
  }

  private repeat(countExpr: Expr, body: readonly Statement[], span: Span): void {
    const raw = this.evaluate(countExpr);
    const count = Math.round(raw);
    if (count < 0 || Math.abs(raw - count) > 1e-9) {
      throw new LogoError('runtime', `repeat needs a whole number of times (0 or more), but got ${format(raw)}.`, countExpr.span);
    }
    this.repcounts.push(0);
    for (let i = 1; i <= count; i++) {
      this.tick(span);
      this.repcounts[this.repcounts.length - 1] = i;
      this.block(body);
    }
    this.repcounts.pop();
  }

  private polygon(body: readonly Statement[], span: Span): void {
    this.tick(span);
    this.drawing.beginPolygon();
    this.block(body);
    const problem = this.drawing.endPolygon();
    if (problem) throw new LogoError('runtime', problem, span);
    this.checkPrimitives(span);
    this.record(span);
  }

  private command(statement: CommandStatement): void {
    this.tick(statement.span);
    const d = this.drawing;
    const [arg] = statement.args;
    const number = () => this.evaluate(arg as Expr);

    switch (statement.name) {
      case 'forward':
        this.moveBy(number());
        break;
      case 'back':
        this.moveBy(-number());
        break;
      case 'setpos': {
        const [x, y, z] = statement.args.map((a) => this.evaluate(a as Expr));
        this.pose = { ...this.pose, position: vec(x, y, z) };
        d.moveTo(this.pose.position);
        break;
      }
      case 'home':
        this.pose = HOME_POSE;
        d.moveTo(HOME_POSE.position);
        break;
      // Every turn rotates about one of the turtle's own current axes (never a world axis).
      case 'yawleft':
        this.pose = yaw(this.pose, number());
        break;
      case 'yawright':
        this.pose = yaw(this.pose, -number());
        break;
      case 'pitchup':
        this.pose = pitch(this.pose, number());
        break;
      case 'pitchdown':
        this.pose = pitch(this.pose, -number());
        break;
      case 'rollright':
        this.pose = roll(this.pose, number());
        break;
      case 'rollleft':
        this.pose = roll(this.pose, -number());
        break;
      case 'penup':
        d.setPen(false);
        break;
      case 'pendown':
        d.setPen(true);
        break;
      case 'lines':
        d.setMode('lines');
        break;
      case 'triangles':
        d.setMode('triangles');
        break;
      case 'tetrahedra':
        d.setMode('tetrahedra');
        break;
      case 'color':
        d.setColor(this.color(arg as ColorArg));
        break;
      case 'polygon':
        break; // handled as a block statement
      case 'clear':
        d.clear();
        break;
      case 'reset':
        this.pose = HOME_POSE;
        d.reset(HOME_POSE.position);
        break;
    }

    this.checkPrimitives(statement.span);
    this.record(statement.span);
  }

  private checkPrimitives(span: Span): void {
    if (this.drawing.primitiveCount > this.limits.maxPrimitives) {
      throw new LogoError(
        'runtime',
        `Stopped: the drawing has more than ${this.limits.maxPrimitives.toLocaleString('en-US')} lines and triangles.`,
        span,
      );
    }
  }

  /** Evaluates a color argument to canonical `#rrggbb`, reporting bad components where they are. */
  private color(arg: ColorArg): string {
    if (arg.form === 'hex') return arg.hex;
    const values = arg.args.map((e) => this.evaluateRaw(e));
    try {
      return arg.form === 'rgb' ? rgbToHex(values[0], values[1], values[2]) : hsvToHex(values[0], values[1], values[2]);
    } catch (error) {
      if (error instanceof ColorComponentError) throw new LogoError('runtime', error.message, arg.args[error.component].span);
      throw error;
    }
  }

  private moveBy(distance: number): void {
    this.pose = move(this.pose, distance);
    this.drawing.moveTo(this.pose.position);
  }

  private record(span: Span): void {
    if (this.frames.length >= this.limits.maxFrames) {
      this.framesTruncated = true;
      return;
    }
    const d = this.drawing;
    this.frames.push({
      pose: this.pose,
      segmentStart: d.segmentStart,
      segmentEnd: d.segments.length,
      triangleStart: d.triangleStart,
      triangleEnd: d.triangles.length,
      span,
    });
  }

  private evaluate(expr: Expr): number {
    const value = this.evaluateRaw(expr);
    if (!Number.isFinite(value)) throw new LogoError('runtime', 'This number is too large.', expr.span);
    return value;
  }

  private evaluateRaw(expr: Expr): number {
    switch (expr.kind) {
      case 'number':
        return expr.value;
      case 'repcount':
        return this.repcounts[this.repcounts.length - 1];
      case 'negate':
        return -this.evaluate(expr.operand);
      case 'call': {
        // Degrees, exact at multiples of 90 like the turtle's own turns.
        const [c, sn] = cosSinDeg(this.evaluate(expr.arg));
        return expr.fn === 'sin' ? sn : c;
      }
      case 'binary': {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);
        switch (expr.op) {
          case '+':
            return left + right;
          case '-':
            return left - right;
          case '*':
            return left * right;
          case '/':
            if (right === 0) throw new LogoError('runtime', 'Division by zero.', expr.right.span);
            return left / right;
        }
      }
    }
  }
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}
