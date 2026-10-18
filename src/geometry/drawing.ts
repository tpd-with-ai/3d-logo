import { DEFAULT_COLOR } from '../lang/commands';
import { fillPolygon } from './polygon';
import { cross, dot, equals, length, normalize, scale, sub, vec, type Vec3 } from '../turtle/vec';

export type DrawMode = 'lines' | 'triangles' | 'tetrahedra';

export interface Segment {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly color: string;
  /** Opacity 0–1 (whole percents) captured with the color. 0 is kept in the model but not rendered. */
  readonly alpha: number;
}

export interface Triangle {
  /** Vertices in generation order (oldest first). This order defines the front face. */
  readonly a: Vec3;
  readonly b: Vec3;
  readonly c: Vec3;
  /** Unit face normal by the right-hand rule over a → b → c (for polygons: the polygon's normal). */
  readonly normal: Vec3;
  readonly color: string;
  /** Opacity 0–1 (whole percents) captured with the color. 0 is kept in the model but not rendered. */
  readonly alpha: number;
  /**
   * Which edges are outline edges, as bits: 1 = a–b, 2 = b–c, 4 = c–a. Triangles cut from a
   * polygon leave their interior diagonals out so only the polygon's outline is drawn.
   */
  readonly edges: number;
}

/** The visible result of a program. */
export interface Drawing {
  readonly segments: readonly Segment[];
  readonly triangles: readonly Triangle[];
  /** Points of the current window that are not part of any triangle or tetrahedron yet (0–3). */
  readonly pendingPoints: readonly Vec3[];
  /** Tetrahedra drawn (each is four of the triangles). */
  readonly tetrahedra: number;
  /** Four-point windows skipped because the points were flat (zero volume), over the whole run. */
  readonly skippedTetrahedra: number;
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
 * Tetrahedra mode: the same window rules as triangle mode, but the window holds four points.
 *   Each new point after the third makes a closed tetrahedron from the last four points
 *   a, b, c, d: four triangles on the vertex sets abc, abd, acd, bcd, each wound so its normal
 *   points away from the fourth vertex (outward). Consecutive tetrahedra share three points and
 *   are independent geometry (their common face is drawn by both). Four points that are flat
 *   (|volume| tiny relative to their size) make no tetrahedron and are counted in
 *   `skippedTetrahedra`.
 *
 * Polygon blocks: between `beginPolygon` and `endPolygon`, moves only collect corners (the
 * start position plus each move's end point, regardless of pen and mode); nothing else is drawn.
 * `endPolygon` fills the corners as one flat face, cut into triangles that share the polygon's
 * normal and color, then restarts any triangle strip so faces never connect to each other.
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
  alpha = 1;

  private cursor: Vec3;
  private window: Vec3[] = [];
  /** Corners of the polygon being collected, or null outside a polygon block. */
  private polygon: Vec3[] | null = null;
  /** Whether the current window has completed a group (triangle or tetrahedron) yet. */
  private stripCompleted = false;
  /** Tetrahedra emitted since the last clear, and flat windows skipped this run. */
  tetrahedronCount = 0;
  skippedTetrahedra = 0;

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
    if (this.polygon) {
      this.polygon.push(to);
      return;
    }
    if (!this.penDown) return;

    if (this.mode === 'lines') {
      if (!equals(from, to)) this.segments.push({ a: from, b: to, color: this.color, alpha: this.alpha });
      return;
    }

    this.window.push(to);
    const size = this.mode === 'tetrahedra' ? 4 : 3;
    if (this.window.length < size) return;
    const points = [...this.window];
    this.window.shift();
    this.stripCompleted = true;
    if (size === 4) {
      this.tetrahedron(points);
      return;
    }
    const [a, b, c] = points;
    const n = cross(sub(b, a), sub(c, a));
    if (length(n) > 1e-9) this.triangles.push({ a, b, c, normal: normalize(n), color: this.color, alpha: this.alpha, edges: 7 });
  }

  private tetrahedron([a, b, c, d]: Vec3[]): void {
    const volume6 = dot(sub(b, a), cross(sub(c, a), sub(d, a)));
    const size = Math.max(...[[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]].map(([p, q]) => length(sub(p, q))));
    if (Math.abs(volume6) <= 1e-9 * size ** 3) {
      this.skippedTetrahedra++;
      return;
    }
    this.tetrahedronCount++;
    // Faces in the order ABC, ABD, ACD, BCD; each is flipped if needed so it faces away from
    // the vertex it does not contain.
    const faces: [Vec3, Vec3, Vec3, Vec3][] = [[a, b, c, d], [a, b, d, c], [a, c, d, b], [b, c, d, a]];
    for (const [p, q0, r0, opposite] of faces) {
      let [q, r] = [q0, r0];
      let n = cross(sub(q, p), sub(r, p));
      if (dot(n, sub(opposite, p)) > 0) {
        [q, r] = [r, q];
        n = scale(n, -1);
      }
      this.triangles.push({ a: p, b: q, c: r, normal: normalize(n), color: this.color, alpha: this.alpha, edges: 7 });
    }
  }

  beginPolygon(): void {
    this.polygon = [this.cursor];
  }

  /** Fills the collected corners. Returns a friendly reason if they do not form a flat polygon. */
  endPolygon(): string | undefined {
    const points = this.polygon ?? [];
    this.polygon = null;
    this.restartStrip();
    const face = fillPolygon(points);
    if (typeof face === 'string') return face;
    const n = face.corners.length;
    const outline = (i: number, j: number) => (j === (i + 1) % n || i === (j + 1) % n ? 1 : 0);
    for (const [i, j, k] of face.triangles) {
      const [a, b, c] = [face.corners[i], face.corners[j], face.corners[k]];
      const edges = outline(i, j) | (outline(j, k) << 1) | (outline(k, i) << 2);
      this.triangles.push({ a, b, c, normal: face.normal, color: this.color, alpha: this.alpha, edges });
    }
    return undefined;
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

  setColor(hex: string, alpha = 1): void {
    this.color = hex;
    this.alpha = alpha;
  }

  clear(): void {
    this.segmentStart = this.segments.length;
    this.triangleStart = this.triangles.length;
    this.tetrahedronCount = 0;
    this.restartStrip();
  }

  /** Clears the drawing and restores every default, placing the cursor at `home` without drawing. */
  reset(home: Vec3): void {
    this.cursor = home;
    this.penDown = true;
    this.mode = 'lines';
    this.color = DEFAULT_COLOR;
    this.alpha = 1;
    this.clear();
  }

  result(): Drawing {
    return {
      segments: this.segments.slice(this.segmentStart),
      triangles: this.triangles.slice(this.triangleStart),
      pendingPoints: [...this.pendingPoints],
      tetrahedra: this.tetrahedronCount,
      skippedTetrahedra: this.skippedTetrahedra,
    };
  }

  private restartStrip(): void {
    this.window = this.penDown && this.mode !== 'lines' ? [this.cursor] : [];
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
