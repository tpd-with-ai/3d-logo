/**
 * The turtle's dart shape in local coordinates: +X = heading H, +Y = left wing L, +Z = up U.
 * Shared by the 3D model and the Help diagrams so both always look the same.
 */
type P = readonly [number, number, number];
export const NOSE: P = [1, 0, 0];
export const LEFT_TIP: P = [-0.65, 0.6, 0];
export const RIGHT_TIP: P = [-0.65, -0.6, 0];
const NOTCH: P = [-0.35, 0, 0];
const TOP: P = [-0.15, 0, 0.32];

/** Faces as [a, b, c, side]; 'back' faces are the bright top, 'belly' the dark underside. */
export const TURTLE_FACES: readonly [P, P, P, 'back' | 'belly'][] = [
  [NOSE, LEFT_TIP, TOP, 'back'],
  [LEFT_TIP, NOTCH, TOP, 'back'],
  [NOTCH, RIGHT_TIP, TOP, 'back'],
  [RIGHT_TIP, NOSE, TOP, 'back'],
  [NOSE, RIGHT_TIP, NOTCH, 'belly'],
  [NOSE, NOTCH, LEFT_TIP, 'belly'],
];

export const TURTLE_COLORS = { back: '#86efac', belly: '#14532d', leftLight: '#ff3b3b', rightLight: '#3bff6e' };
