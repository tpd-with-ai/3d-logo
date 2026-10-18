import { AXIS_COLORS } from '../render/palette';
import { LEFT_TIP, RIGHT_TIP, TURTLE_COLORS, TURTLE_FACES } from '../render/turtleShape';
import { HOME_POSE, pitch, roll, yaw, type Pose } from '../turtle/turtle';
import { add, cross, dot, normalize, scale, sub, vec, type Vec3 } from '../turtle/vec';

/**
 * Small SVG diagrams for Help. Turtles are posed with the real `yaw`/`pitch`/`roll` functions and
 * drawn from the same direction as the default 3D camera, so the pictures match the language.
 */

/** Unit vectors of the default camera view: VIEW points toward the camera. Shared with gallery thumbnails. */
export const VIEW = normalize(vec(0.6, -1, 0.95));
export const SCREEN_RIGHT = normalize(cross(scale(VIEW, -1), vec(0, 0, 1)));
export const SCREEN_UP = cross(SCREEN_RIGHT, scale(VIEW, -1));
const PX = 46; // pixels per turtle unit

interface Item {
  depth: number;
  svg: string;
}

const project = (p: Vec3): [number, number] => [dot(p, SCREEN_RIGHT) * PX, -dot(p, SCREEN_UP) * PX];
const fmt = (n: number) => n.toFixed(1);
const toWorld = (pose: Pose, [x, y, z]: readonly number[]): Vec3 =>
  add(add(scale(pose.heading, x), scale(pose.left, y)), scale(pose.up, z));

class Sketch {
  private readonly items: Item[] = [];
  private readonly points: [number, number][] = [];

  constructor(private readonly id: string) {}

  private add(depth: number, svg: string, ...pts: Vec3[]) {
    for (const p of pts) this.points.push(project(p));
    this.items.push({ depth, svg });
  }

  private path(pts: Vec3[]): string {
    return pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).map(fmt).join(' ')}`).join(' ');
  }

  turtle(pose: Pose, ghost = false): void {
    for (const [a, b, c, side] of TURTLE_FACES) {
      const pts = [a, b, c].map((v) => toWorld(pose, v));
      const depth = dot(scale(add(add(pts[0], pts[1]), pts[2]), 1 / 3), VIEW);
      const style = ghost
        ? `fill="none" stroke="#94a3b8" stroke-dasharray="3 3" stroke-width="1"`
        : `fill="${TURTLE_COLORS[side]}" stroke="#0b1020" stroke-width="0.8" stroke-linejoin="round"`;
      this.add(depth, `<path d="${this.path(pts)} Z" ${style}/>`, ...pts);
    }
    if (ghost) return;
    for (const [tip, color] of [[LEFT_TIP, TURTLE_COLORS.leftLight], [RIGHT_TIP, TURTLE_COLORS.rightLight]] as const) {
      const p = toWorld(pose, tip);
      const [x, y] = project(p);
      this.add(dot(p, VIEW) + 0.01, `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="3.2" fill="${color}"/>`, p);
    }
  }

  arrow(from: Vec3, to: Vec3, color: string, opts: { label?: string; dashed?: boolean; faint?: boolean } = {}): void {
    const dash = opts.dashed ? ' stroke-dasharray="5 4"' : '';
    const opacity = opts.faint ? ' opacity="0.45"' : '';
    this.add(
      Math.max(dot(from, VIEW), dot(to, VIEW)) + 0.5,
      `<path d="${this.path([from, to])}" stroke="${color}" stroke-width="2.4" fill="none"${dash}${opacity} marker-end="url(#${this.marker(color)})"/>`,
      from,
      to,
    );
    if (opts.label) this.label(add(to, scale(normalize(sub(to, from)), 0.28)), opts.label, color);
  }

  /** A line through the centre along `axis`, marking a rotation axis. */
  axisLine(axis: Vec3, length: number, color: string): void {
    const a = scale(axis, -length);
    const b = scale(axis, length);
    this.add(-10, `<path d="${this.path([a, b])}" stroke="${color}" stroke-width="1.4" stroke-dasharray="2 4" fill="none"/>`, a, b);
  }

  /** An arc about `axis` (right-hand rule) from −sweep to +sweep, with an arrowhead at each end. */
  arc(axis: Vec3, start: Vec3, radius: number, centre: Vec3, color: string, labels: [string, string], sweep = 65): void {
    const v = cross(axis, start);
    const at = (deg: number, r = radius) => {
      const t = (deg * Math.PI) / 180;
      return add(centre, add(scale(start, r * Math.cos(t)), scale(v, r * Math.sin(t))));
    };
    const pts = Array.from({ length: 33 }, (_, i) => at(-sweep + (2 * sweep * i) / 32));
    const marker = this.marker(color);
    this.add(
      20,
      `<path d="${this.path(pts)}" stroke="${color}" stroke-width="2" fill="none" marker-start="url(#${marker})" marker-end="url(#${marker})"/>`,
      ...pts,
    );
    this.label(at(sweep + 24, radius + 0.3), labels[0], color);
    this.label(at(-sweep - 24, radius + 0.3), labels[1], color);
  }

  /** A filled flat face (painter-sorted by its centre). */
  face(pts: Vec3[], fill: string, opacity: number): void {
    const depth = dot(scale(pts.reduce(add), 1 / pts.length), VIEW);
    this.add(depth, `<path d="${this.path(pts)} Z" fill="${fill}" fill-opacity="${opacity}" stroke="none"/>`, ...pts);
  }

  edge(a: Vec3, b: Vec3, color: string, dashed = false): void {
    const dash = dashed ? ' stroke-dasharray="4 3"' : '';
    this.add(50, `<path d="${this.path([a, b])}" stroke="${color}" stroke-width="1.6" fill="none"${dash}/>`, a, b);
  }

  /** A dot with its label offset by [dx, dy] pixels. */
  point(p: Vec3, text: string, color: string, [dx, dy]: [number, number]): void {
    const [x, y] = project(p);
    this.add(60, `<circle cx="${fmt(x)}" cy="${fmt(y)}" r="4" fill="${color}" stroke="#0b1020" stroke-width="1"/>`, p);
    this.points.push([x + dx - 8, y + dy - 8], [x + dx + 8, y + dy + 8]);
    this.items.push({
      depth: 100,
      svg: `<text x="${fmt(x + dx)}" y="${fmt(y + dy)}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${text}</text>`,
    });
  }

  label(at: Vec3, text: string, color: string): void {
    const [x, y] = project(at);
    this.points.push([x - text.length * 3.6, y - 8], [x + text.length * 3.6, y + 8]);
    this.items.push({
      depth: 100,
      svg: `<text x="${fmt(x)}" y="${fmt(y)}" fill="${color}" text-anchor="middle" dominant-baseline="middle">${text}</text>`,
    });
  }

  private readonly markers = new Map<string, string>();
  private marker(color: string): string {
    if (!this.markers.has(color)) this.markers.set(color, `${this.id}-m${this.markers.size}`);
    return this.markers.get(color)!;
  }

  render(title: string): string {
    const xs = this.points.map((p) => p[0]);
    const ys = this.points.map((p) => p[1]);
    const pad = 10;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) + pad - minX;
    const h = Math.max(...ys) + pad - minY;
    const defs = [...this.markers]
      .map(
        ([color, id]) =>
          `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker>`,
      )
      .join('');
    const body = [...this.items].sort((a, b) => a.depth - b.depth).map((i) => i.svg).join('');
    return `<svg class="diagram" role="img" aria-labelledby="${this.id}-t" viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}"><title id="${this.id}-t">${title}</title><defs>${defs}</defs>${body}</svg>`;
  }
}

const O = vec(0, 0, 0);

/** The turtle at home with its three axes (and the right wing R = −L) labelled. */
export function axesDiagram(): string {
  const s = new Sketch('dg-axes');
  const p = HOME_POSE;
  s.turtle(p);
  s.arrow(O, scale(p.heading, 2.2), AXIS_COLORS.heading, { label: 'H heading' });
  s.arrow(O, scale(p.left, 1.8), AXIS_COLORS.left, { label: 'L left' });
  s.arrow(O, scale(p.left, -1.5), AXIS_COLORS.left, { label: 'R = −L', dashed: true });
  s.arrow(O, scale(p.up, 1.7), AXIS_COLORS.up, { label: 'U up' });
  return s.render('The turtle with its heading H pointing forward, left wing L, right wing R opposite L, and up axis U out of its back.');
}

export type TurnKind = 'yaw' | 'pitch' | 'roll';

/** Before (ghost) and after (solid) a 40° positive turn, with the axis and both directions marked. */
export function turnDiagram(kind: TurnKind): string {
  const s = new Sketch(`dg-${kind}`);
  const before = HOME_POSE;
  const right = scale(before.left, -1);
  const degrees = 40;
  if (kind === 'yaw') {
    const after = yaw(before, degrees);
    s.axisLine(before.up, 1.6, AXIS_COLORS.up);
    s.label(scale(before.up, -1.85), 'axis U', AXIS_COLORS.up);
    s.turtle(before, true);
    s.turtle(after);
    s.arrow(O, scale(before.heading, 1.4), AXIS_COLORS.heading, { faint: true });
    s.arrow(O, scale(after.heading, 1.4), AXIS_COLORS.heading, { label: 'H' });
    s.arc(before.up, before.heading, 2.1, O, '#e2e8f0', ['yawleft', 'yawright'], 55);
    return s.render('Yaw: the turtle turns about its up axis U. Ghost: before. Solid: after yawleft 40.');
  }
  if (kind === 'pitch') {
    const after = pitch(before, degrees);
    s.axisLine(right, 1.7, AXIS_COLORS.left);
    s.label(scale(right, 1.95), 'axis R–L', AXIS_COLORS.left);
    s.turtle(before, true);
    s.turtle(after);
    s.arrow(O, scale(before.heading, 1.4), AXIS_COLORS.heading, { faint: true });
    s.arrow(O, scale(after.heading, 1.4), AXIS_COLORS.heading, { label: 'H' });
    s.arc(right, before.heading, 2.1, O, '#e2e8f0', ['pitchup', 'pitchdown'], 55);
    return s.render('Pitch: the turtle turns about its wing axis. Ghost: before. Solid: after pitchup 40.');
  }
  const after = roll(before, degrees);
  s.axisLine(before.heading, 2.6, AXIS_COLORS.heading);
  s.label(scale(before.heading, 2.9), 'axis H', AXIS_COLORS.heading);
  s.turtle(before, true);
  s.turtle(after);
  s.arrow(O, scale(before.up, 1.4), AXIS_COLORS.up, { faint: true });
  s.arrow(O, scale(after.up, 1.4), AXIS_COLORS.up, { label: 'U' });
  s.arc(before.heading, before.up, 0.95, scale(before.heading, -2), '#e2e8f0', ['rollright', 'rollleft'], 80);
  return s.render('Roll: the turtle turns about its heading H. Ghost: before. Solid: after rollright 40.');
}

/**
 * Tetrahedra mode: points 1–4 make the first solid (four faces shaded), and point 5 slides the
 * window to 2–5, making the next solid (dashed).
 */
export function tetraWindowDiagram(): string {
  const s = new Sketch('dg-tetra');
  const p = [vec(0, 0, 0), vec(2.4, 0, 0), vec(1.2, 2, 0), vec(1.2, 0.7, 1.9), vec(3, 1.6, 1.5)];
  const [a, b, c, d, e] = p;
  const faces: [Vec3[], string][] = [
    [[a, b, c], '#fb923c'],
    [[a, b, d], '#f97316'],
    [[a, c, d], '#fdba74'],
    [[b, c, d], '#ea580c'],
  ];
  for (const [pts, fill] of faces) s.face(pts, fill, 0.55);
  for (const [u, v] of [[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]]) s.edge(u, v, '#fed7aa');
  for (const u of [b, c, d]) s.edge(u, e, '#7dd3fc', true);
  const offsets: [number, number][] = [[-12, -10], [0, 16], [8, -16], [0, -16], [10, -14]];
  p.forEach((q, i) => s.point(q, String(i + 1), i === 4 ? '#7dd3fc' : '#fde68a', offsets[i]));
  return s.render(
    'Tetrahedra mode: points 1 to 4 form a closed tetrahedron with faces 123, 124, 134 and 234. Point 5 slides the window to points 2 to 5, which form the next tetrahedron, drawn dashed.',
  );
}
