import { describe, expect, it } from 'vitest';
import { fillPolygon, polygonArea, type FilledPolygon } from './polygon';
import { cross, dot, normalize, sub, vec, type Vec3 } from '../turtle/vec';

const pts = (coords: number[][]) => coords.map(([x, y, z = 0]) => vec(x, y, z));

function filled(points: Vec3[]): FilledPolygon {
  const face = fillPolygon(points);
  if (typeof face === 'string') throw new Error(face);
  return face;
}

describe('fillPolygon', () => {
  it('fills a non-convex L shape with n − 2 triangles covering exactly its area', () => {
    // An L: 3 × 3 square minus a 2 × 2 corner = area 5. Counter-clockwise, so normal +Z.
    const face = filled(pts([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]));
    expect(face.triangles).toHaveLength(4);
    expect(polygonArea(face)).toBeCloseTo(5, 12);
    expect(face.normal).toEqual({ x: 0, y: 0, z: 1 });
    // Every triangle keeps the polygon's winding (its own normal agrees with the polygon's).
    for (const [a, b, c] of face.triangles) {
      const [pa, pb, pc] = [face.corners[a], face.corners[b], face.corners[c]];
      expect(dot(normalize(cross(sub(pb, pa), sub(pc, pa))), face.normal)).toBeCloseTo(1, 12);
    }
  });

  it('follows the corner order for the normal (clockwise → −Z) and works in tilted planes', () => {
    expect(filled(pts([[0, 0], [0, 2], [2, 2], [2, 0]])).normal.z).toBeCloseTo(-1, 12);
    const tilted = filled(pts([[0, 0, 0], [4, 0, 4], [4, 4, 4], [0, 4, 0]]));
    expect(tilted.normal.x).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(tilted.normal.z).toBeCloseTo(Math.SQRT1_2, 12);
    expect(polygonArea(tilted)).toBeCloseTo(4 * 4 * Math.SQRT2, 10);
  });

  it('drops a closing duplicate, repeated corners, and straight-through corners', () => {
    const face = filled(pts([[0, 0], [1, 0], [2, 0], [2, 0], [2, 2], [0, 2], [0, 0]]));
    expect(face.corners).toHaveLength(4);
    expect(face.triangles).toHaveLength(2);
  });

  it.each([
    [[[0, 0], [1, 0]], 'at least 3 different corners, but this one has 2'],
    [[[0, 0], [1, 0], [2, 0]], 'no area'],
    [[[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 1]], 'must be flat'],
    [[[0, 0], [2, 2], [2, 0], [0, 2]], 'edges cross'],
    [[[0, 0], [2, 0], [1, 0], [1, 1]], 'turns straight back'],
  ])('rejects %j', (coords, message) => {
    expect(fillPolygon(pts(coords))).toContain(message);
  });
});
