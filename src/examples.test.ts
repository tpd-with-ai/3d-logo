import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { MIZHAEV_FACES, MIZHAEV_PLANES, MIZHAEV_VERTICES } from './gallery/mizhaev';
import { drawingBounds, type Triangle } from './geometry/drawing';
import { runSource } from './interpreter/interpreter';
import { add, cross, dot, length, sub, vec, type Vec3 } from './turtle/vec';

const distance = (a: Vec3, b: Vec3) => length(sub(a, b));

const example = (id: string) => {
  const found = EXAMPLES.find((e) => e.id === id);
  if (!found) throw new Error(`no example ${id}`);
  return runSource(found.code);
};
const key = (p: Vec3) => [p.x, p.y, p.z].map((n) => Math.round(n * 1000) / 1000 + 0).join(',');

describe('examples', () => {
  it('have unique ids and a description', () => {
    expect(new Set(EXAMPLES.map((e) => e.id)).size).toBe(EXAMPLES.length);
    for (const e of EXAMPLES) expect(e.description.length, e.id).toBeGreaterThan(10);
  });

  it.each(EXAMPLES.map((e) => [e.id, e.code]))('%s runs without errors, draws, and stays in a framable box', (_id, code) => {
    const result = runSource(code);
    expect(result.error).toBeUndefined();
    expect(result.drawing.segments.length + result.drawing.triangles.length).toBeGreaterThan(0);
    expect(result.drawing.skippedTetrahedra).toBe(0);
    expect(result.steps).toBeLessThan(10_000); // keeps every example instant
    const bounds = drawingBounds(result.drawing)!;
    for (const n of [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z]) {
      expect(Math.abs(n)).toBeLessThan(500);
    }
  });

  it('match the recorded geometry counts and bounds', () => {
    const summary = Object.fromEntries(
      EXAMPLES.map((e) => {
        const { drawing, steps } = runSource(e.code);
        const b = drawingBounds(drawing)!;
        const round = (v: Vec3) => [v.x, v.y, v.z].map((n) => Math.round(n) + 0).join(' ');
        return [
          e.id,
          `${drawing.segments.length} lines, ${drawing.triangles.length} triangles, ${drawing.tetrahedra} tetrahedra, ` +
            `${drawing.pendingPoints.length} pending, ${steps} steps, box [${round(b.min)}] to [${round(b.max)}]`,
        ];
      }),
    );
    expect(summary).toMatchSnapshot();
  });
});

describe('Mizhaev genus-3 polyhedron', () => {
  const result = example('mizhaev');
  const triangles = result.drawing.triangles;
  // Each nonagon becomes 7 triangles, emitted face by face.
  const faces: Triangle[][] = [];
  for (let i = 0; i < triangles.length; i += 7) faces.push(triangles.slice(i, i + 7));
  const outline = (face: Triangle[]) =>
    face.flatMap((t) =>
      ([[t.a, t.b, 1], [t.b, t.c, 2], [t.c, t.a, 4]] as const)
        .filter(([, , bit]) => t.edges & bit)
        .map(([p, q]) => [key(p), key(q)].sort().join('|')),
    );

  it('draws 8 faces of 7 triangles each, with no lines', () => {
    expect(result.error).toBeUndefined();
    expect(result.drawing.segments).toHaveLength(0);
    expect(triangles).toHaveLength(56);
    expect(faces).toHaveLength(8);
  });

  it('has the paper’s 24 vertices, 36 edges, and Euler characteristic −4 (genus 3)', () => {
    const vertices = new Set(triangles.flatMap((t) => [t.a, t.b, t.c].map(key)));
    const paper = new Set(MIZHAEV_VERTICES.slice(1).map(([x, y, z]) => `${x},${y},${z}`));
    expect(vertices).toEqual(paper);
    const edgeFaces = new Map<string, number>();
    for (const face of faces) {
      const edges = outline(face);
      expect(edges).toHaveLength(9); // a nonagon
      for (const edge of edges) edgeFaces.set(edge, (edgeFaces.get(edge) ?? 0) + 1);
    }
    expect(edgeFaces.size).toBe(36);
    expect([...edgeFaces.values()].every((n) => n === 2)).toBe(true); // closed surface
    const chi = vertices.size - edgeFaces.size + faces.length;
    expect(chi).toBe(-4);
    expect(1 - chi / 2).toBe(3);
  });

  it('puts every face on its published plane and makes every pair of faces share an edge', () => {
    faces.forEach((face, f) => {
      const [a, b, c, d] = MIZHAEV_PLANES[f];
      for (const t of face) for (const p of [t.a, t.b, t.c]) expect(a * p.x + b * p.y + c * p.z).toBe(d);
      // Drawn corners match the paper's face walk.
      expect(new Set(face.flatMap((t) => [t.a, t.b, t.c].map(key)))).toEqual(
        new Set(MIZHAEV_FACES[f].map((v) => MIZHAEV_VERTICES[v].join(','))),
      );
    });
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        const shared = outline(faces[i]).filter((e) => outline(faces[j]).includes(e));
        expect(shared.length, `F${i + 1}/F${j + 1}`).toBeGreaterThanOrEqual(1);
      }
  });

  it('cuts each non-convex nonagon into triangles that tile it exactly', () => {
    faces.forEach((face, f) => {
      // Polygon area from the paper's walk (Newell), versus the triangles' areas, all wound alike.
      const walk = MIZHAEV_FACES[f].map((v) => vec(...MIZHAEV_VERTICES[v]));
      const newell = walk.reduce((n, p, i) => add(n, cross(p, walk[(i + 1) % walk.length])), vec(0, 0, 0));
      const triangleArea = face.reduce((sum, t) => {
        const doubled = cross(sub(t.b, t.a), sub(t.c, t.a));
        expect(dot(doubled, newell)).toBeGreaterThan(0);
        return sum + length(doubled) / 2;
      }, 0);
      expect(triangleArea).toBeCloseTo(length(newell) / 2, 6);
    });
  });
});

describe('exact polyhedra', () => {
  const edgeLengths = (triangles: readonly Triangle[]) =>
    triangles.flatMap((t) => [distance(t.a, t.b), distance(t.b, t.c), distance(t.c, t.a)]);

  it('the icosahedron has 20 faces, 12 vertices, and all 30 edges of length 100', () => {
    const { drawing } = example('icosahedron');
    expect(drawing.triangles).toHaveLength(20);
    expect(new Set(drawing.triangles.flatMap((t) => [t.a, t.b, t.c].map(key))).size).toBe(12);
    for (const n of edgeLengths(drawing.triangles)) expect(n).toBeCloseTo(100, 9);
  });

  it('the octahedron has 6 vertices and equal edges', () => {
    const { drawing } = example('octahedron');
    expect(new Set(drawing.triangles.flatMap((t) => [t.a, t.b, t.c].map(key))).size).toBe(6);
    const lengths = edgeLengths(drawing.triangles);
    for (const n of lengths) expect(n).toBeCloseTo(lengths[0], 9);
  });

  it('the turtle-built tetrahedron closes: 4 equilateral faces on 4 vertices', () => {
    const { drawing } = example('tetrahedron');
    expect(drawing.triangles).toHaveLength(4);
    const corners = drawing.triangles.flatMap((t) => [t.a, t.b, t.c]);
    const distinct: Vec3[] = [];
    for (const p of corners) if (!distinct.some((q) => distance(p, q) < 1e-4)) distinct.push(p);
    expect(distinct).toHaveLength(4);
    for (const n of edgeLengths(drawing.triangles)) expect(n).toBeCloseTo(60, 4);
  });

  it('the wire cube has 12 distinct edges on 8 corners', () => {
    const { drawing } = example('cube');
    const edges = new Set(drawing.segments.map((s) => [key(s.a), key(s.b)].sort().join('|')));
    expect(edges.size).toBe(12);
    expect(new Set(drawing.segments.flatMap((s) => [key(s.a), key(s.b)])).size).toBe(8);
  });

  it('the 3D Hilbert curve visits all 64 cells of a 4×4×4 lattice once', () => {
    const { drawing } = example('hilbert');
    const points = [drawing.segments[0].a, ...drawing.segments.map((s) => s.b)];
    expect(points).toHaveLength(64);
    expect(new Set(points.map(key)).size).toBe(64);
    for (const s of drawing.segments) expect(distance(s.a, s.b)).toBeCloseTo(12, 9);
  });

  it('tetrahedra examples use regular tetrahedra with outward faces', () => {
    for (const [id, edge, count] of [['tetra-single', 40 * Math.SQRT2, 1], ['tetra-chain', 40, 29]] as const) {
      const { drawing } = example(id);
      expect(drawing.tetrahedra).toBe(count);
      for (const n of edgeLengths(drawing.triangles)) expect(n).toBeCloseTo(edge, 5);
      // Each group of 4 faces is one solid: every normal points away from the solid's centre.
      for (let i = 0; i < drawing.triangles.length; i += 4) {
        const faces = drawing.triangles.slice(i, i + 4);
        const pts = faces.flatMap((t) => [t.a, t.b, t.c]);
        const centre = pts.reduce((acc, p) => ({ x: acc.x + p.x / 12, y: acc.y + p.y / 12, z: acc.z + p.z / 12 }), { x: 0, y: 0, z: 0 });
        for (const t of faces) {
          const out = sub(t.a, centre);
          expect(out.x * t.normal.x + out.y * t.normal.y + out.z * t.normal.z).toBeGreaterThan(0);
        }
      }
    }
  });
});
