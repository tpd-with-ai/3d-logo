/**
 * Ruslan Mizhaev's genus-3 equivelar polyhedron {9,3}: 8 planar nonagonal faces, 24 vertices,
 * 36 edges, every pair of faces sharing at least one edge.
 *
 * Source (primary): R. Mizhaev, "Integer Realization of an Equivelar Octahedron of Genus 3",
 * arXiv:2609.17700 (2026), https://doi.org/10.48550/arXiv.2609.17700 — Table 1 (vertex
 * coordinates), Table 2 (face walks), §4 (plane equations). Transcribed verbatim from the
 * paper's TeX source; tests check every published property against this data.
 */
export const MIZHAEV_SOURCE = {
  title: 'Integer Realization of an Equivelar Octahedron of Genus 3',
  author: 'Ruslan Mizhaev',
  arxiv: 'arXiv:2609.17700',
  url: 'https://arxiv.org/abs/2609.17700',
  doi: 'https://doi.org/10.48550/arXiv.2609.17700',
  press: 'https://gizmodo.com/a-mathematician-discovered-a-new-eight-faced-shape-it-looks-like-a-glitch-in-reality-2000818219',
};

/** Table 1: vertices 1–24 (index 0 unused so numbers match the paper). */
export const MIZHAEV_VERTICES: readonly (readonly [number, number, number])[] = [
  [NaN, NaN, NaN],
  [-72, 84, 18], [-36, 112, 102], [72, -84, 18], [36, -112, 102], [0, 300, 234], [-84, 48, -18],
  [9, 147, 207], [0, -300, 234], [84, -48, -18], [-112, -36, -102], [48, 84, 18], [-147, 9, -207],
  [-9, -147, 207], [84, 72, -18], [112, 36, -102], [-48, -84, 18], [147, -9, -207], [-18, 126, 144],
  [-126, -18, -144], [-300, 0, -234], [-84, -72, -18], [18, -126, 144], [126, 18, -144], [300, 0, -234],
];

/** Table 2: cyclic face walks F1–F8. */
export const MIZHAEV_FACES: readonly (readonly number[])[] = [
  [6, 10, 16, 22, 18, 7, 5, 1, 2],
  [9, 15, 11, 18, 22, 13, 8, 3, 4],
  [7, 5, 8, 3, 17, 23, 9, 15, 14],
  [13, 8, 5, 1, 12, 19, 6, 10, 21],
  [1, 2, 11, 18, 7, 14, 24, 20, 12],
  [3, 4, 16, 22, 13, 21, 20, 24, 17],
  [14, 24, 17, 23, 19, 6, 2, 11, 15],
  [10, 21, 20, 12, 19, 23, 9, 4, 16],
];

/** §4: supporting planes a·x + b·y + c·z = d for F1–F8. */
export const MIZHAEV_PLANES: readonly (readonly [number, number, number, number])[] = [
  [21, 3, -10, -1440], [21, 3, 10, 1440], [3, 0, 1, 234], [3, 0, -1, -234],
  [0, 3, -1, 234], [0, 3, 1, -234], [3, -21, 10, -1440], [3, -21, -10, 1440],
];

const PLANE_TEXT = (p: readonly number[]) => {
  const terms = [[p[0], 'x'], [p[1], 'y'], [p[2], 'z']]
    .filter(([c]) => c !== 0)
    .map(([c, v], i) => `${i === 0 ? (Number(c) < 0 ? '-' : '') : Number(c) < 0 ? ' - ' : ' + '}${Math.abs(Number(c)) === 1 ? '' : Math.abs(Number(c))}${v}`);
  return `${terms.join('')} = ${p[3]}`;
};

/** The paper's faces as Logo: one `polygon` per face, corners written as `setpos`. */
export function mizhaevCode(): string {
  const lines = [
    '; Mizhaev genus-3 polyhedron: 8 flat nonagons, 24 vertices, 36 edges.',
    '; Every face touches every other face along at least one edge.',
    '; Exact integer data from R. Mizhaev, arXiv:2609.17700 (2026),',
    '; Tables 1-2. Each face is one polygon; v# is the paper\'s vertex number.',
    'penup   ; move between faces without drawing lines',
  ];
  MIZHAEV_FACES.forEach((walk, f) => {
    const [first, ...rest] = walk;
    const at = (v: number) => `setpos ${MIZHAEV_VERTICES[v].join(' ')}`;
    lines.push(
      '',
      `; F${f + 1}: ${walk.join('-')}   plane ${PLANE_TEXT(MIZHAEV_PLANES[f])}`,
      `color hsv(${f * 45}, 60, 95)`,
      `${at(first).padEnd(26)}; v${first}`,
      'polygon [',
      ...rest.map((v) => `  ${at(v).padEnd(24)}; v${v}`),
      ']',
    );
  });
  return lines.join('\n') + '\n';
}
