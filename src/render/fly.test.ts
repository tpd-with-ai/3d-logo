import { describe, expect, it } from 'vitest';
import { FlyKeys, keyCode, MAX_STEP_SECONDS, type ViewBasis } from './fly';
import { normalize, vec, type Vec3 } from '../turtle/vec';

const close = (actual: Vec3, expected: Vec3) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
  expect(actual.z).toBeCloseTo(expected.z, 9);
};

/** A camera looking along +Y, level with the ground: right is +X. */
const LEVEL: ViewBasis = { forward: vec(0, 1, 0), right: vec(1, 0, 0), up: vec(0, 0, 1) };

describe('FlyKeys', () => {
  it('claims only movement keys; Shift is tracked but not claimed', () => {
    const keys = new FlyKeys();
    expect(keys.press('KeyW')).toBe(true);
    expect(keys.press('KeyQ')).toBe(true);
    expect(keys.press('ShiftLeft')).toBe(false);
    expect(keys.press('KeyF')).toBe(false);
    expect(keys.press('ArrowUp')).toBe(false);
    expect(keys.press('Space')).toBe(false);
  });

  it('moves speed × time while held, independent of frame rate', () => {
    const keys = new FlyKeys();
    keys.press('KeyW');
    close(keys.displacement(LEVEL, 0.05, 400), vec(0, 20, 0));
    // One second at 60 fps and at 20 fps covers the same distance.
    let at60 = 0;
    for (let i = 0; i < 60; i++) at60 += keys.displacement(LEVEL, 1 / 60, 40).y;
    let at20 = 0;
    for (let i = 0; i < 20; i++) at20 += keys.displacement(LEVEL, 1 / 20, 40).y;
    expect(at60).toBeCloseTo(40, 9);
    expect(at20).toBeCloseTo(40, 9);
  });

  it('caps a long frame gap so a stall never causes a jump', () => {
    const keys = new FlyKeys();
    keys.press('KeyW');
    close(keys.displacement(LEVEL, 5, 40), vec(0, 40 * MAX_STEP_SECONDS, 0));
    close(keys.displacement(LEVEL, -1, 40), vec(0, 0, 0));
  });

  it('maps each key to the camera-relative direction', () => {
    const cases: [string, Vec3][] = [
      ['KeyW', vec(0, 1, 0)],
      ['KeyS', vec(0, -1, 0)],
      ['KeyD', vec(1, 0, 0)],
      ['KeyA', vec(-1, 0, 0)],
      ['KeyE', vec(0, 0, 1)],
      ['KeyQ', vec(0, 0, -1)],
    ];
    for (const [code, expected] of cases) {
      const keys = new FlyKeys();
      keys.press(code);
      close(keys.displacement(LEVEL, 0.1, 10), expected);
    }
  });

  it('follows a rotated, tilted view: W flies along the view, D along its right', () => {
    // Camera looking toward −X and 30° down; its screen-right is +Y.
    const forward = normalize(vec(-Math.cos(Math.PI / 6), 0, -Math.sin(Math.PI / 6)));
    const rotated: ViewBasis = { forward, right: vec(0, 1, 0), up: vec(0, 0, 1) };
    const keys = new FlyKeys();
    keys.press('KeyW');
    close(keys.displacement(rotated, 0.1, 100), vec(-10 * Math.cos(Math.PI / 6), 0, -5));
    keys.release('KeyW');
    keys.press('KeyD');
    close(keys.displacement(rotated, 0.1, 100), vec(0, 10, 0));
  });

  it('normalizes diagonals, cancels opposites, and Shift is 3× faster', () => {
    const keys = new FlyKeys();
    keys.press('KeyW');
    keys.press('KeyD');
    close(keys.displacement(LEVEL, 0.1, 100), vec(10 / Math.SQRT2, 10 / Math.SQRT2, 0));
    keys.press('KeyA');
    close(keys.displacement(LEVEL, 0.1, 100), vec(0, 10, 0));
    keys.press('KeyS');
    expect(keys.moving).toBe(true);
    close(keys.displacement(LEVEL, 0.1, 100), vec(0, 0, 0));
    keys.release('KeyS');
    keys.release('KeyA');
    keys.release('KeyD');
    keys.press('ShiftRight');
    close(keys.displacement(LEVEL, 0.1, 100), vec(0, 30, 0));
  });

  it('clear forgets every held key', () => {
    const keys = new FlyKeys();
    keys.press('KeyW');
    keys.press('ShiftLeft');
    keys.clear();
    expect(keys.moving).toBe(false);
    close(keys.displacement(LEVEL, 0.1, 100), vec(0, 0, 0));
    keys.press('KeyW'); // Shift was cleared too
    close(keys.displacement(LEVEL, 0.1, 100), vec(0, 10, 0));
  });

  it('reads the physical code, falling back to the key when an event has no code', () => {
    expect(keyCode({ code: 'KeyW', key: 'z' })).toBe('KeyW'); // AZERTY: position wins
    expect(keyCode({ code: '', key: 'w' })).toBe('KeyW');
    expect(keyCode({ code: '', key: 'W' })).toBe('KeyW');
    expect(keyCode({ code: '', key: 'Shift' })).toBe('ShiftLeft');
    expect(keyCode({ code: '', key: 'ArrowUp' })).toBe('');
  });
});
