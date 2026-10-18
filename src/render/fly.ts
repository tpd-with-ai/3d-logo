import { add, normalize, scale, vec, type Vec3 } from '../turtle/vec';

/**
 * Keyboard fly navigation for the 3D view, kept free of DOM and three.js so it can be unit tested.
 *
 * Keys are matched by `KeyboardEvent.code` (physical position, so AZERTY users get the same layout):
 *   W / S  fly forward / back along the camera's view direction (including its up/down tilt)
 *   A / D  strafe left / right (perpendicular to the view, parallel to the ground)
 *   E / Q  rise / sink along world +Z / −Z
 *   Shift  hold for 3× speed
 * Opposite keys cancel; diagonal moves are normalized so they are not faster.
 */
export const FLY_KEYS: Readonly<Record<string, Vec3>> = {
  KeyW: vec(1, 0, 0),
  KeyS: vec(-1, 0, 0),
  KeyD: vec(0, 1, 0),
  KeyA: vec(0, -1, 0),
  KeyE: vec(0, 0, 1),
  KeyQ: vec(0, 0, -1),
};
const SHIFT = new Set(['ShiftLeft', 'ShiftRight']);
export const FAST_FACTOR = 3;
/** Longest frame step applied; longer gaps (tab switches, stalls) never cause a jump. */
export const MAX_STEP_SECONDS = 0.1;

/** The camera's frame: unit view direction, unit screen-right (horizontal), and world up. */
export interface ViewBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

export class FlyKeys {
  private readonly held = new Set<string>();

  /** Records a key press; returns true if it is a fly key the caller should claim (preventDefault). */
  press(code: string): boolean {
    if (SHIFT.has(code)) {
      this.held.add(code);
      return false;
    }
    if (!(code in FLY_KEYS)) return false;
    this.held.add(code);
    return true;
  }

  release(code: string): void {
    this.held.delete(code);
  }

  /** Forgets every held key, e.g. when the view loses focus, so movement never sticks. */
  clear(): void {
    this.held.clear();
  }

  /** True while at least one movement key is held. */
  get moving(): boolean {
    for (const code of this.held) if (code in FLY_KEYS) return true;
    return false;
  }

  /**
   * World-space displacement for one frame of `seconds`, at `speed` world units per second.
   * Returns the zero vector when nothing (or only opposite keys) is held.
   */
  displacement(basis: ViewBasis, seconds: number, speed: number): Vec3 {
    let local = vec(0, 0, 0);
    let fast = false;
    for (const code of this.held) {
      if (SHIFT.has(code)) fast = true;
      else local = add(local, FLY_KEYS[code]);
    }
    if (local.x === 0 && local.y === 0 && local.z === 0) return vec(0, 0, 0);
    const dir = normalize(local);
    const distance = speed * (fast ? FAST_FACTOR : 1) * Math.min(Math.max(seconds, 0), MAX_STEP_SECONDS);
    const world = add(add(scale(basis.forward, dir.x), scale(basis.right, dir.y)), scale(basis.up, dir.z));
    return scale(world, distance);
  }
}
