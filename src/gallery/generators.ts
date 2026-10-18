/**
 * Builders for the data-heavy gallery programs. Each returns ordinary Logo source; the gallery
 * shows that source, so nothing here is hidden from the reader.
 */

type P = [number, number, number];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P, b: P): P => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: P, b: P) => Math.hypot(...sub(a, b));

/** Triangles of a convex solid centred at the origin, wound so normals point outward. */
function outward(points: P[], faces: [number, number, number][]): [number, number, number][] {
  return faces.map(([a, b, c]) => {
    const n = cross(sub(points[b], points[a]), sub(points[c], points[a]));
    return dot(n, points[a]) > 0 ? [a, b, c] : [a, c, b];
  });
}

/** All vertex triples whose three edges have the given length (the faces of a regular solid). */
function trianglesWithEdge(points: P[], edge: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const near = (i: number, j: number) => Math.abs(dist(points[i], points[j]) - edge) < 1e-6 * edge;
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++)
      for (let k = j + 1; k < points.length; k++) if (near(i, j) && near(j, k) && near(i, k)) out.push([i, j, k]);
  return out;
}

function faceLines(coords: string[][], faces: [number, number, number][], color: (i: number) => string): string[] {
  return faces.map(([a, b, c], i) => `color ${color(i)}  setpos ${coords[a].join(' ')}  polygon [ setpos ${coords[b].join(' ')}  setpos ${coords[c].join(' ')} ]`);
}

/** Octahedron with vertices on the axes at ±50: exact integer coordinates. */
export function octahedronCode(): string {
  const r = 50;
  const points: P[] = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const faces = outward(points, trianglesWithEdge(points, r * Math.SQRT2));
  return [
    '; Regular octahedron: 6 vertices on the axes at distance 50, 8 faces.',
    '; Each face: move to one corner, then polygon [ the other two ].',
    'penup',
    ...faceLines(points.map((p) => p.map(String)), faces, (i) => `hsv(${i * 45}, 55, 100)`),
  ].join('\n') + '\n';
}

/**
 * Regular icosahedron with vertices (0, ±a, ±b), (±a, ±b, 0), (±b, 0, ±a), where a = 50 and
 * b = 50φ. Since φ = 2·cos 36°, b is written exactly as 100 * cos(36).
 */
export function icosahedronCode(): string {
  const a = 50;
  const b = 100 * Math.cos(Math.PI / 5);
  const points: P[] = [];
  const labels: string[][] = [];
  const B = (s: number) => (s > 0 ? '100*cos(36)' : '-100*cos(36)');
  const A = (s: number) => (s > 0 ? '50' : '-50');
  for (const s1 of [1, -1])
    for (const s2 of [1, -1]) {
      points.push([0, s1 * a, s2 * b]); labels.push(['0', A(s1), B(s2)]);
      points.push([s1 * a, s2 * b, 0]); labels.push([A(s1), B(s2), '0']);
      points.push([s2 * b, 0, s1 * a]); labels.push([B(s2), '0', A(s1)]);
    }
  const faces = outward(points, trianglesWithEdge(points, 2 * a));
  return [
    '; Regular icosahedron: 12 vertices, 20 equilateral faces (edge 100).',
    '; Vertices are (0, ±50, ±50φ) and their cyclic shifts. φ = 2·cos 36°,',
    '; so 50φ is written exactly as 100*cos(36).',
    'penup',
    ...faceLines(labels, faces, (i) => `hsv(${(i * 18) % 360}, 60, 100)`),
  ].join('\n') + '\n';
}

/** Frequency-2 geodesic sphere: each icosahedron face split into 4, corners pushed onto the sphere. */
export function geodesicCode(radius = 80): string {
  const t = (1 + Math.sqrt(5)) / 2;
  const ico: P[] = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) ico.push([0, s1, s2 * t], [s1, s2 * t, 0], [s2 * t, 0, s1]);
  const icoFaces = outward(ico, trianglesWithEdge(ico, 2));
  const points: P[] = [];
  const index = (p: P) => {
    const len = Math.hypot(...p);
    const q: P = [(p[0] / len) * radius, (p[1] / len) * radius, (p[2] / len) * radius];
    const found = points.findIndex((r) => dist(r, q) < 1e-9);
    if (found >= 0) return found;
    points.push(q);
    return points.length - 1;
  };
  const mid = (p: P, q: P): P => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  const faces: [number, number, number][] = [];
  for (const [i, j, k] of icoFaces) {
    const [a, b, c] = [ico[i], ico[j], ico[k]];
    const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)];
    const [A, B, C, AB, BC, CA] = [a, b, c, ab, bc, ca].map(index);
    faces.push([A, AB, CA], [AB, B, BC], [CA, BC, C], [AB, BC, CA]);
  }
  const coords = points.map((p) => p.map((n) => String(Math.round(n * 1000) / 1000 + 0)));
  const hue = (f: [number, number, number]) => Math.round(200 + (points[f[0]][2] + points[f[1]][2] + points[f[2]][2]) / 3 / radius * 60);
  return [
    `; Geodesic sphere, frequency 2: an icosahedron with each face split into`,
    `; 4 triangles and every corner pushed out onto a sphere of radius ${radius}.`,
    '; 42 vertices, 80 faces. Coordinates are rounded to 0.001.',
    'penup',
    ...faceLines(coords, faces, (i) => `hsv(${hue(faces[i])}, 55, 100)`),
  ].join('\n') + '\n';
}

/**
 * 3D Hilbert curve from the single-rule L-system X → ^\XF^\XFX-F^//XFX&F+//XFX-F/X-/
 * (Prusinkiewicz & Lindenmayer, The Algorithmic Beauty of Plants, 1990, p. 20), with
 * + − yaw, ^ & pitch, \ / roll, all by 90°.
 */
export function hilbertCode(order = 2, step = 12): string {
  const rule = '^\\XF^\\XFX-F^//XFX&F+//XFX-F/X-/';
  let text = 'X';
  for (let i = 0; i < order; i++) text = text.replace(/X/g, rule);
  const words: Record<string, string> = {
    F: `forward ${step}`, '+': 'yawleft 90', '-': 'yawright 90', '^': 'pitchup 90',
    '&': 'pitchdown 90', '\\': 'rollleft 90', '/': 'rollright 90',
  };
  const commands = [...text].filter((ch) => ch in words).map((ch) => words[ch]);
  // One line per forward step: the turns that lead into it, then the step itself.
  const lines: string[] = [];
  let current: string[] = [];
  let moves = 0;
  for (const command of commands) {
    current.push(command);
    if (command.startsWith('forward')) {
      moves++;
      lines.push(`color hsv(${Math.round((moves * 300) / (8 ** order - 1))}, 80, 100)  ${current.join(' ')}`);
      current = [];
    }
  }
  if (current.length) lines.push(current.join(' '));
  return [
    `; 3D Hilbert curve, order ${order}: one unbroken path through all ${8 ** order} points of a`,
    `; ${2 ** order}×${2 ** order}×${2 ** order} grid. Generated from the L-system`,
    ';   X -> ^\\XF^\\XFX-F^//XFX&F+//XFX-F/X-/',
    '; (Prusinkiewicz & Lindenmayer, The Algorithmic Beauty of Plants, p. 20),',
    '; reading + - as yawleft/yawright, ^ & as pitchup/pitchdown,',
    '; \\ / as rollleft/rollright (all 90) and F as forward.',
    ...lines,
  ].join('\n') + '\n';
}

/**
 * Sierpiński tetrahedron: each level replaces a tetrahedron by four half-size copies at its
 * corners. Starting from the cube-corner tetrahedron (0,0,0), (s,s,0), (s,0,s), (0,s,s), every
 * corner at level `level` is a multiple of s / 2^level, so with s = 160 the coordinates are exact
 * integers. Each solid is drawn as its own four-point window (penup, then pendown at a corner).
 */
export function sierpinskiCode(level = 3, size = 160): string {
  const solids: { corners: P[]; path: number[] }[] = [];
  const split = (corners: P[], path: number[]) => {
    if (path.length === level) return void solids.push({ corners, path });
    corners.forEach((corner, i) => {
      const half = corners.map((c) => corner.map((n, k) => (n + c[k]) / 2) as P);
      split(half, [...path, i]);
    });
  };
  split([[0, 0, 0], [size, size, 0], [size, 0, size], [0, size, size]], []);
  const lines: string[] = [];
  solids.forEach(({ corners, path }, i) => {
    // One hue per top-level corner, a lighter shade per second-level corner.
    if (i % 4 ** (level - 2) === 0) lines.push(`color hsv(${200 + path[0] * 45}, ${80 - path[1] * 15}, 100)`);
    const [a, ...rest] = corners.map((c) => `setpos ${c.join(' ')}`);
    lines.push(`penup ${a} pendown ${rest.join(' ')}`);
  });
  return [
    `; Sierpinski tetrahedron, level ${level}: ${4 ** level} solids. Each level keeps the four`,
    '; corner copies of a tetrahedron at half size. All corners are exact integers.',
    '; penup + pendown before each solid starts a fresh four-point window, so',
    '; neighbouring solids never get bridged by an extra tetrahedron.',
    'tetrahedra',
    ...lines,
  ].join('\n') + '\n';
}
