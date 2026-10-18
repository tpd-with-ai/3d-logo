import { DEFAULT_COLOR } from '../lang/commands';
import { cross, equals, length, normalize, sub, vec, type Vec3 } from '../turtle/vec';

export type DrawMode = 'lines' | 'triangles';

export interface Segment {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly color: string;
}

export interface Triangle {
  /** Vertices in generation order (oldest first). This order defines the front face. */
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  /** Unit face normal, (b − a) × (c − a) normalized: the right-hand rule over a → b → c. */
  readonly normal: Vec3;
  readonly color: string;
}

/** The visible result of a program. */
export interface Drawing {
  readonly segments: readonly Segment[];
  readonly triangles: readonly Triangle[];
  /** Points of the current strip that are not part of any triangle yet (0–2 points). */
  readonly pendingPoints: readonly Vec3[];
}

/**
 * Turns pen moves into geometry. This is the single owner of the drawing rules:
 *
 * Line mode: every pen-down move from P to Q (P ≠ Q) adds segment P→Q in the current color.
 *
 * Triangle mode: a sliding window holds the most recent points of the current strip.
 *   - A strip (re)starts with the turtle's current position as its first point whenever the
 *     turtle is in triangle mode with the pen down after: `triangles`, `pendown` (pen was up),
 *     `clear`, or `reset`. `penup` and `lines` empty the window.
 *   - Each pen-down move appends its end point. Once the window holds three points a, b, c,
 *     triangle (a, b, c) is emitted in the current color and the oldest point is dropped, so the
 *     next move reuses b and c (a triangle strip: n points give n − 2 triangles).
 *   - Pen-up moves and turns add no points. Zero-area triangles are skipped, but their points
 *     still slide through the window.
 *   - A strip with fewer than three points never draws; its points are reported as
 *     `pendingPoints`. Once a strip has formed a triangle, nothing is pending.
 *
 * `clear` hides everything emitted so far; primitives stay in the append-only arrays so the
 * playground can replay a run step by step.
 */
export class DrawingBuilder {
  readonly segments: Segment[] = [];
  readonly triangles: Triangle[] = [];
  /** Index of the first segment/triangle that is still visible after the last `clear`. */
  segmentStart = 0;
  triangleStart = 0;

  penDown = true;
  mode: DrawMode = 'lines';
  color = DEFAULT_COLOR;

  private cursor: Vec3;
  private window: Vec3[] = [];
  /** Whether the current strip has completed a group of three yet. */
  private stripCompleted = false;

  constructor(start: Vec3) {
    this.cursor = start;
  }

  get primitiveCount(): number {
    return this.segments.length + this.triangles.length;
  }

  get pendingPoints(): readonly Vec3[] {
    return this.stripCompleted ? [] : this.window;
  }

  moveTo(to: Vec3): void {
    const from = this.cursor;
    this.cursor = to;
    if (!this.penDown) return;

    if (this.mode === 'lines') {
      if (!equals(from, to)) this.segments.push({ a: from, b: to, color: this.color });
      return;
    }

    this.window.push(to);
    if (this.window.length < 3) return;
    const [a, b, c] = this.window;
    this.window.shift();
    this.stripCompleted = true;
    const n = cross(sub(b, a), sub(c, a));
    if (length(n) > 1e-9) this.triangles.push({ a, b, c, normal: normalize(n), color: this.color });
  }

  setPen(down: boolean): void {
    if (down === this.penDown) return;
    this.penDown = down;
    this.restartStrip();
  }

  setMode(mode: DrawMode): void {
    this.mode = mode;
    this.restartStrip();
  }

  setColor(hex: string): void {
    this.color = hex;
  }

  clear(): void {
    this.segmentStart = this.segments.length;
    this.triangleStart = this.triangles.length;
    this.restartStrip();
  }

  /** Clears the drawing and restores every default, placing the cursor at `home` without drawing. */
  reset(home: Vec3): void {
    this.cursor = home;
    this.penDown = true;
    this.mode = 'lines';
    this.color = DEFAULT_COLOR;
    this.clear();
  }

  result(): Drawing {
    return {
      segments: this.segments.slice(this.segmentStart),
      triangles: this.triangles.slice(this.triangleStart),
      pendingPoints: [...this.pendingPoints],
    };
  }

  private restartStrip(): void {
    this.window = this.penDown && this.mode === 'triangles' ? [this.cursor] : [];
    this.stripCompleted = false;
  }
}

export interface Bounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Axis-aligned bounds of everything visible in a drawing, or null when it is empty. */
export function drawingBounds(drawing: Drawing): Bounds | null {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const include = (p: Vec3) => {
    [p.x, p.y, p.z].forEach((n, i) => {
      if (n < min[i]) min[i] = n;
      if (n > max[i]) max[i] = n;
    });
  };
  for (const s of drawing.segments) [s.a, s.b].forEach(include);
  for (const t of drawing.triangles) [t.a, t.b, t.c].forEach(include);
  drawing.pendingPoints.forEach(include);
  if (min[0] === Infinity) return null;
  return { min: vec(min[0], min[1], min[2]), max: vec(max[0], max[1], max[2]) };
}
