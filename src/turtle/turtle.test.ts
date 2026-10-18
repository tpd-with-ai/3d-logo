import { describe, expect, it } from 'vitest';
import { HOME_POSE, move, pitch, roll, yaw, type Pose } from './turtle';
import { add, cross, dot, length, normalize, scale, sub, vec, type Vec3 } from './vec';

type Turn = (pose: Pose, degrees: number) => Pose;
const AXES = ['heading', 'left', 'up'] as const;

function expectVec(actual: Vec3, expected: Vec3 | [number, number, number], digits = 9) {
  const [x, y, z] = Array.isArray(expected) ? expected : [expected.x, expected.y, expected.z];
  expect(actual.x).toBeCloseTo(x, digits);
  expect(actual.y).toBeCloseTo(y, digits);
  expect(actual.z).toBeCloseTo(z, digits);
}

function expectFrame(actual: Pose, expected: Pose, digits = 9) {
  for (const axis of AXES) expectVec(actual[axis], expected[axis], digits);
}

function expectOrthonormal(pose: Pose) {
  for (const v of [pose.heading, pose.left, pose.up]) expect(length(v)).toBeCloseTo(1, 12);
  expect(dot(pose.heading, pose.left)).toBeCloseTo(0, 12);
  expect(dot(pose.heading, pose.up)).toBeCloseTo(0, 12);
  expectVec(cross(pose.heading, pose.left), pose.up, 12);
}

/** Independent oracle: Rodrigues' rotation of v about unit axis a by `degrees` (right-hand rule). */
function rodrigues(v: Vec3, a: Vec3, degrees: number): Vec3 {
  const t = (degrees * Math.PI) / 180;
  return add(add(scale(v, Math.cos(t)), scale(cross(a, v), Math.sin(t))), scale(a, dot(a, v) * (1 - Math.cos(t))));
}

/** The turtle axis each turn rotates about, read from the *current* pose. */
const AXIS_OF: [string, Turn, (p: Pose) => Vec3][] = [
  ['yaw (about U)', yaw, (p) => p.up],
  ['pitch (about R = −L)', pitch, (p) => scale(p.left, -1)],
  ['roll (about H)', roll, (p) => p.heading],
];

function oracleTurn(pose: Pose, axisOf: (p: Pose) => Vec3, degrees: number): Pose {
  const a = axisOf(pose);
  return {
    position: pose.position,
    heading: rodrigues(pose.heading, a, degrees),
    left: rodrigues(pose.left, a, degrees),
    up: rodrigues(pose.up, a, degrees),
  };
}

/** Deterministic random orthonormal frames, built without using the code under test. */
function randomFrames(count: number): Pose[] {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return Array.from({ length: count }, () => {
    const h = normalize(vec(rnd(), rnd(), rnd()));
    const r = vec(rnd(), rnd(), rnd());
    const l = normalize(sub(r, scale(h, dot(r, h))));
    return { position: vec(rnd() * 50, rnd() * 50, rnd() * 50), heading: h, left: l, up: cross(h, l) };
  });
}

/** Expresses `pose`'s axes in the coordinates of `frame` (columns H, L, U). */
function inFrame(frame: Pose, pose: Pose): number[] {
  return AXES.flatMap((axis) => AXES.map((basis) => dot(pose[axis], frame[basis])));
}

const FRAMES = randomFrames(200);
const ANGLES = [37, -90, 123.4, 270, -400];

describe('home frame and turn directions', () => {
  it('starts at the origin facing +Y with left −X and up +Z', () => {
    expect(HOME_POSE.position).toEqual({ x: 0, y: 0, z: 0 });
    expectFrame(HOME_POSE, { position: HOME_POSE.position, heading: vec(0, 1, 0), left: vec(-1, 0, 0), up: vec(0, 0, 1) });
    expectOrthonormal(HOME_POSE);
  });

  it('on the ground, yawleft/yawright behave like 2D Logo seen from above', () => {
    expectVec(yaw(HOME_POSE, 90).heading, [-1, 0, 0]); // yawleft 90: counter-clockwise
    expectVec(yaw(HOME_POSE, -90).heading, [1, 0, 0]); // yawright 90: clockwise
    expectVec(yaw(HOME_POSE, -90).up, [0, 0, 1]); // stays on the ground
  });

  it('pitchup 90 points the nose up +Z and the back toward −Y; pitchdown points it down', () => {
    const up = pitch(HOME_POSE, 90);
    expectVec(up.heading, [0, 0, 1]);
    expectVec(up.up, [0, -1, 0]);
    expectVec(up.left, [-1, 0, 0]);
    expectVec(pitch(HOME_POSE, -90).heading, [0, 0, -1]);
  });

  it('rollright 90 drops the right wing (left wing up, back toward +X); rollleft mirrors it', () => {
    const right = roll(HOME_POSE, 90);
    expectVec(right.left, [0, 0, 1]);
    expectVec(right.up, [1, 0, 0]);
    expectVec(right.heading, [0, 1, 0]);
    expectVec(roll(HOME_POSE, -90).left, [0, 0, -1]);
  });
});

describe('every turn is intrinsic (about the turtle’s current axes)', () => {
  it.each(AXIS_OF)('%s matches Rodrigues’ rotation about the current axis from 200 rotated frames', (_name, turn, axisOf) => {
    for (const frame of FRAMES) {
      for (const degrees of ANGLES) {
        const actual = turn(frame, degrees);
        expectFrame(actual, oracleTurn(frame, axisOf, degrees), 10);
        expect(actual.position).toEqual(frame.position);
      }
    }
  });

  it.each(AXIS_OF)('%s has the same local effect from every starting frame (no world axes)', (_name, turn) => {
    for (const degrees of ANGLES) {
      const local = inFrame(HOME_POSE, turn(HOME_POSE, degrees));
      for (const frame of FRAMES) {
        inFrame(frame, turn(frame, degrees)).forEach((value, i) => expect(value).toBeCloseTo(local[i], 10));
      }
    }
  });

  it.each(AXIS_OF)('%s is undone by the opposite turn from any frame', (_name, turn) => {
    for (const frame of FRAMES) expectFrame(turn(turn(frame, 71.5), -71.5), frame, 10);
  });

  it('a mixed sequence matches the oracle applied step by step from a rotated frame', () => {
    const steps: [number, number][] = [[0, 30], [1, -75], [2, 140], [1, 33], [0, -210], [2, -12.5]];
    for (const frame of FRAMES.slice(0, 50)) {
      let actual = frame;
      let expected = frame;
      for (const [which, degrees] of steps) {
        actual = AXIS_OF[which][1](actual, degrees);
        expected = oracleTurn(expected, AXIS_OF[which][2], degrees);
      }
      expectFrame(actual, expected, 9);
    }
  });
});

describe('composition and non-commutativity from rotated frames', () => {
  it('after a roll, pitchup turns toward the new up axis, not world +Z', () => {
    const rolled = roll(HOME_POSE, 90); // U is now +X
    expectVec(pitch(rolled, 90).heading, [1, 0, 0]);
    expectVec(pitch(rolled, -90).heading, [-1, 0, 0]);
  });

  it('after a pitch, yaw turns about the new up axis, not world Z', () => {
    const climbed = pitch(HOME_POSE, 90); // H = +Z, U = −Y
    expectVec(yaw(climbed, 90).heading, [-1, 0, 0]); // a world-Z yaw would leave H at +Z
    expectVec(yaw(climbed, -90).heading, [1, 0, 0]);
  });

  it('after a yaw and a pitch, roll spins about the new heading', () => {
    const p = pitch(yaw(HOME_POSE, 90), 90); // H = +Z, L = −Y, U = +X
    const r = roll(p, 90);
    expectVec(r.heading, [0, 0, 1]);
    expectVec(r.left, [1, 0, 0]);
    expectVec(r.up, [0, 1, 0]);
  });

  it('yaw then pitch differs from pitch then yaw, from home and from rotated frames', () => {
    // From home: pitchup 90 yawleft 90 faces −X; yawleft 90 pitchup 90 faces +Z.
    expectVec(yaw(pitch(HOME_POSE, 90), 90).heading, [-1, 0, 0]);
    expectVec(pitch(yaw(HOME_POSE, 90), 90).heading, [0, 0, 1]);
    for (const [a, b] of [[yaw, pitch], [pitch, roll], [roll, yaw]] as [Turn, Turn][]) {
      for (const frame of FRAMES.slice(0, 20)) {
        const ab = b(a(frame, 90), 90);
        const ba = a(b(frame, 90), 90);
        expect(length(sub(ab.heading, ba.heading)) + length(sub(ab.up, ba.up))).toBeGreaterThan(0.5);
      }
    }
  });

  it('turns about the same axis commute and add up', () => {
    for (const frame of FRAMES.slice(0, 20)) {
      expectFrame(yaw(yaw(frame, 20), 50), yaw(frame, 70), 10);
      expectFrame(pitch(pitch(frame, -15), 40), pitch(frame, 25), 10);
    }
  });
});

describe('movement and numerical stability', () => {
  it('moves along the current heading, and backward with negative distances', () => {
    const p = move(pitch(yaw(HOME_POSE, -90), 45), 10);
    expectVec(p.position, [10 * Math.SQRT1_2, 0, 10 * Math.SQRT1_2]);
    expectVec(move(p, -10).position, [0, 0, 0]);
  });

  it('stays orthonormal and returns home after many mixed rotations', () => {
    let p = HOME_POSE;
    for (let i = 0; i < 1000; i++) p = roll(pitch(yaw(p, 37), 23), 11);
    expectOrthonormal(p);
    for (let i = 0; i < 1000; i++) p = yaw(pitch(roll(p, -11), -23), -37);
    expectFrame(p, HOME_POSE);
  });

  it('multiples of 90° are exact, so squares close with no drift', () => {
    let p = HOME_POSE;
    for (let i = 0; i < 4000; i++) p = yaw(move(p, 33.5), 90);
    expect([p.position.x, p.position.y, p.position.z].map(Math.abs)).toEqual([0, 0, 0]);
  });
});
