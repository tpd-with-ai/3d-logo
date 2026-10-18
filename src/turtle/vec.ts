/** Minimal immutable 3D vector math, kept free of rendering dependencies. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => vec(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => vec(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const length = (a: Vec3): number => Math.sqrt(dot(a, a));
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));
export const equals = (a: Vec3, b: Vec3): boolean => a.x === b.x && a.y === b.y && a.z === b.z;

/**
 * Cosine and sine of an angle in degrees, exact for multiples of 90° so that squares and cubes
 * close perfectly instead of accumulating floating-point drift.
 */
export function cosSinDeg(degrees: number): [number, number] {
  const quarter = degrees / 90;
  if (Number.isInteger(quarter)) {
    const table: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ];
    return table[((quarter % 4) + 4) % 4];
  }
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians), Math.sin(radians)];
}
