import { add, cosSinDeg, cross, normalize, scale, vec, type Vec3 } from './vec';

/**
 * The turtle's pose: a position plus an orthonormal, right-handed frame.
 *
 *   heading (H): the direction `forward` moves.
 *   left    (L): the turtle's left wing.
 *   up      (U): out of the turtle's back.
 *
 * The frame always satisfies H × L = U. The right wing is R = −L.
 *
 * All turns are intrinsic: each rotates the frame about one of the turtle's own *current* axes,
 * using the right-hand rule for the positive direction:
 *
 *   yaw   about U  (positive = yawleft:   H swings toward L)
 *   pitch about R  (positive = pitchup:   H swings toward U)
 *   roll  about H  (positive = rollright: L swings toward U, so the right wing drops)
 *
 * Because the axis is read from the current pose, a turn's effect in world space depends on
 * every earlier turn, and turns do not commute.
 *
 * World axes are right-handed with Z up. At home the turtle sits at the origin with
 * H = +Y, L = −X, U = +Z, so a classic 2D Logo program draws on the ground plane (z = 0)
 * exactly as it would on a 2D screen seen from above.
 */
export interface Pose {
  readonly position: Vec3;
  readonly heading: Vec3;
  readonly left: Vec3;
  readonly up: Vec3;
}

export const HOME_POSE: Pose = {
  position: vec(0, 0, 0),
  heading: vec(0, 1, 0),
  left: vec(-1, 0, 0),
  up: vec(0, 0, 1),
};

/** Moves along the heading. Negative distances move backward. */
export function move(pose: Pose, distance: number): Pose {
  return { ...pose, position: add(pose.position, scale(pose.heading, distance)) };
}

/**
 * Rotates the pair (a, b) by `degrees` inside the plane they span: a turns toward b.
 * a' = a·cos θ + b·sin θ,  b' = b·cos θ − a·sin θ.
 */
function rotatePair(a: Vec3, b: Vec3, degrees: number): [Vec3, Vec3] {
  const [c, s] = cosSinDeg(degrees);
  return [add(scale(a, c), scale(b, s)), add(scale(b, c), scale(a, -s))];
}

/** Re-orthonormalizes the frame so long programs do not drift. Keeps H exact, then U, then L. */
function orthonormal(position: Vec3, heading: Vec3, left: Vec3): Pose {
  const h = normalize(heading);
  const u = normalize(cross(h, left));
  const l = cross(u, h);
  return { position, heading: h, left: l, up: u };
}

/** Yaw about the current U. Positive = `yawleft` (H toward L; counter-clockwise seen from above U). */
export function yaw(pose: Pose, degrees: number): Pose {
  const [h, l] = rotatePair(pose.heading, pose.left, degrees);
  return orthonormal(pose.position, h, l);
}

/** Pitch about the current right axis R = −L. Positive = `pitchup` (H toward U). */
export function pitch(pose: Pose, degrees: number): Pose {
  const [h] = rotatePair(pose.heading, pose.up, degrees);
  return orthonormal(pose.position, h, pose.left);
}

/** Roll about the current H. Positive = `rollright` (L toward U; clockwise seen from behind). */
export function roll(pose: Pose, degrees: number): Pose {
  const [l] = rotatePair(pose.left, pose.up, degrees);
  return orthonormal(pose.position, pose.heading, l);
}

