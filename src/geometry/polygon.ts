import { add, cross, dot, length, normalize, sub, vec, type Vec3 } from '../turtle/vec';

export interface FilledPolygon {
  /** Corners after removing repeated and straight-through (collinear) points. */
  corners: Vec3[];
  /** Unit normal by the right-hand rule over the corner order (Newell's method). */
  normal: Vec3;
  /** Triangles as corner indices, wound like the polygon. */
  triangles: [number, number, number][];
}

/**
 * Turns a closed ring of points into a flat face. Returns the face, or a friendly reason why it
 * cannot be filled: fewer than three corners, no area, corners not in one plane, or edges that
 * cross. A last point equal to the first (a path that returned to its start) is dropped.
 */
export function fillPolygon(points: readonly Vec3[]): FilledPolygon | string {
  const extent = Math.max(1e-12, ...points.map((p) => length(sub(p, points[0]))));
  const same = (a: Vec3, b: Vec3) => length(sub(a, b)) <= extent * 1e-9;

  let ring: Vec3[] = [];
  for (const p of points) if (ring.length === 0 || !same(p, ring[ring.length - 1])) ring.push(p);
  while (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
  if (ring.length < 3) return `A polygon needs at least 3 different corners, but this one has ${ring.length}.`;

  // Newell's method: robust normal for any simple planar polygon, convex or not.
  let n = vec(0, 0, 0);
  for (let i = 0; i < ring.length; i++) n = add(n, cross(ring[i], ring[(i + 1) % ring.length]));
  const noArea = 'This polygon has no area: all its corners lie on one line.';
  const zeroArea = length(n) <= extent * extent * 1e-9;
  if (zeroArea) {
    // Lobes can cancel (a bowtie); take the plane from the widest corner triple so the edge
    // crossing check below can explain the real problem.
    n = ring.slice(2).map((p) => cross(sub(ring[1], ring[0]), sub(p, ring[0]))).reduce((m, c) => (length(c) > length(m) ? c : m), vec(0, 0, 0));
    if (length(n) <= extent * extent * 1e-9) return noArea;
  }
  const normal = normalize(n);

  const offPlane = Math.max(...ring.map((p) => Math.abs(dot(sub(p, ring[0]), normal))));
  if (offPlane > extent * 1e-6) {
    return `A polygon must be flat, but its corners are up to ${Number(offPlane.toPrecision(3))} units out of one plane.`;
  }

  // Work in 2D coordinates on the plane.
  const u = normalize(Math.abs(normal.x) < 0.9 ? cross(normal, vec(1, 0, 0)) : cross(normal, vec(0, 1, 0)));
  const w = cross(normal, u);
  let flat = ring.map((p) => [dot(p, u), dot(p, w)] as [number, number]);
  const area2 = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const eps = extent * extent * 1e-12;

  // Drop corners where the path runs straight through; a corner that doubles back is an error.
  const keep: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = flat[(i - 1 + ring.length) % ring.length];
    const b = flat[i];
    const c = flat[(i + 1) % ring.length];
    if (Math.abs(area2(a, b, c)) > eps) keep.push(i);
    else if ((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) < 0) {
      return 'This polygon’s edges overlap (the path turns straight back on itself).';
    }
  }
  ring = keep.map((i) => ring[i]);
  flat = keep.map((i) => flat[i]);
  const count = ring.length;
  if (count < 3) return noArea;

  // Edges must not cross or touch except at shared corners.
  const crosses = (p1: number[], p2: number[], p3: number[], p4: number[]) => {
    const d1 = area2(p3, p4, p1);
    const d2 = area2(p3, p4, p2);
    const d3 = area2(p1, p2, p3);
    const d4 = area2(p1, p2, p4);
    return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
  };
  for (let i = 0; i < count; i++) {
    for (let j = i + 2; j < count; j++) {
      if (i === 0 && j === count - 1) continue;
      if (crosses(flat[i], flat[(i + 1) % count], flat[j], flat[(j + 1) % count])) {
        return 'This polygon’s edges cross each other; its corners must go around the outline in order.';
      }
    }
  }

  if (zeroArea) return noArea;

  // Ear clipping on a counter-clockwise copy; output keeps the original winding.
  const signed = flat.reduce((sum, p, i) => sum + area2([0, 0], p, flat[(i + 1) % count]), 0);
  const order = [...Array(count).keys()];
  if (signed < 0) order.reverse();
  const triangles: [number, number, number][] = [];
  const inside = (p: number[], a: number[], b: number[], c: number[]) =>
    area2(a, b, p) >= -eps && area2(b, c, p) >= -eps && area2(c, a, p) >= -eps;
  let guard = 0;
  while (order.length > 3) {
    if (guard++ > count * count) return 'This polygon could not be filled; check that its outline does not overlap itself.';
    let clipped = false;
    for (let k = 0; k < order.length; k++) {
      const [ia, ib, ic] = [order[(k - 1 + order.length) % order.length], order[k], order[(k + 1) % order.length]];
      const [a, b, c] = [flat[ia], flat[ib], flat[ic]];
      if (area2(a, b, c) <= eps) continue;
      if (order.some((j) => j !== ia && j !== ib && j !== ic && inside(flat[j], a, b, c))) continue;
      triangles.push(signed < 0 ? [ic, ib, ia] : [ia, ib, ic]);
      order.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) return 'This polygon could not be filled; check that its outline does not overlap itself.';
  }
  triangles.push(signed < 0 ? [order[2], order[1], order[0]] : [order[0], order[1], order[2]]);
  return { corners: ring, normal, triangles };
}

/** Area of a filled polygon (sum of its triangles), used by tests. */
export function polygonArea(face: FilledPolygon): number {
  return face.triangles.reduce((sum, [a, b, c]) => {
    const [pa, pb, pc] = [face.corners[a], face.corners[b], face.corners[c]];
    return sum + length(cross(sub(pb, pa), sub(pc, pa))) / 2;
  }, 0);
}
