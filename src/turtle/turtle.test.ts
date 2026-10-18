import { describe, expect, it } from 'vitest';
import { HOME_POSE, move, pitch, roll, yaw, type Pose } from './turtle';
import { cross, dot, length, type Vec3 } from './vec';

function expectVec(actual: Vec3, expected: [number, number, number]) {
  expect(actual.x).toBeCloseTo(expected[0], 9);
  expect(actual.y).toBeCloseTo(expected[1], 9);
  expect(actual.z).toBeCloseTo(expected[2], 9);
}

function expectOrthonormal(pose: Pose) {
  for (const v of [pose.heading, pose.left, pose.up]) expect(length(v)).toBeCloseTo(1, 12);
  expect(dot(pose.heading, pose.left)).toBeCloseTo(0, 12);
  expect(dot(pose.heading, pose.up)).toBeCloseTo(0, 12);
  const hxl = cross(pose.heading, pose.left);
  expectVec(hxl, [pose.up.x, pose.up.y, pose.up.z]);
}

describe('turtle orientation', () => {
  it('starts at the origin facing +Y with left −X and up +Z', () => {
    expectVec(HOME_POSE.position, [0, 0, 0]);
    expectVec(HOME_POSE.heading, [0, 1, 0]);
    expectVec(HOME_POSE.left, [-1, 0, 0]);
    expectVec(HOME_POSE.up, [0, 0, 1]);
    expectOrthonormal(HOME_POSE);
  });

  it('yaw +90 (left) turns the heading toward −X; up is unchanged', () => {
    const p = yaw(HOME_POSE, 90);
    expectVec(p.heading, [-1, 0, 0]);
    expectVec(p.left, [0, -1, 0]);
    expectVec(p.up, [0, 0, 1]);
  });

  it('pitch +90 (climb) points the heading up +Z and the back toward −Y', () => {
    const p = pitch(HOME_POSE, 90);
    expectVec(p.heading, [0, 0, 1]);
    expectVec(p.up, [0, -1, 0]);
    expectVec(p.left, [-1, 0, 0]);
  });

  it('roll +90 (rollright) points the left wing up and the back toward +X', () => {
    const p = roll(HOME_POSE, 90);
    expectVec(p.left, [0, 0, 1]);
    expectVec(p.up, [1, 0, 0]);
    expectVec(p.heading, [0, 1, 0]);
  });

  it('rotations are intrinsic: each turns about the turtle’s current axes, so order matters', () => {
    // climb then left: the left turn happens about the new up axis (now −Y).
    const a = yaw(pitch(HOME_POSE, 90), 90);
    expectVec(a.heading, [-1, 0, 0]);
    expectVec(a.up, [0, -1, 0]);
    // left then climb: the climb happens about the new left axis (now −Y).
    const b = pitch(yaw(HOME_POSE, 90), 90);
    expectVec(b.heading, [0, 0, 1]);
  });

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
    expectVec(p.heading, [0, 1, 0]);
    expectVec(p.up, [0, 0, 1]);
  });

  it('multiples of 90° are exact, so squares close with no drift', () => {
    let p = HOME_POSE;
    for (let i = 0; i < 4000; i++) p = yaw(move(p, 33.5), 90);
    expect([p.position.x, p.position.y, p.position.z].map(Math.abs)).toEqual([0, 0, 0]);
  });
});
