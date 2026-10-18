import { describe, expect, it } from 'vitest';
import { runSource } from './interpreter';
import { NAMED_COLORS, DEFAULT_COLOR } from '../lang/commands';
import type { Vec3 } from '../turtle/vec';

/** Rounds away floating-point noise (and −0) so geometry can be compared exactly. */
const r = (v: Vec3) => [v.x, v.y, v.z].map((n) => Math.round(n * 1e6) / 1e6 + 0);

function ok(source: string) {
  const result = runSource(source);
  if (result.error) throw new Error(result.error.describe());
  return result;
}

const segs = (source: string) => ok(source).drawing.segments.map((s) => [r(s.a), r(s.b)]);
const tris = (source: string) => ok(source).drawing.triangles.map((t) => [r(t.a), r(t.b), r(t.c)]);

describe('repeat', () => {
  it('runs its block count times with a 1-based repcount for the innermost repeat', () => {
    // Moves of 1, 2, 3 along +Y; the inner repeat's own repcount does not leak outward.
    const result = ok('repeat 3 [ repeat 2 [ penup ] pendown fd repcount ]');
    expect(r(result.pose.position)).toEqual([0, 6, 0]);
    expect(result.drawing.segments).toHaveLength(3);
  });

  it('accepts a computed count, and zero runs nothing', () => {
    expect(segs('repeat 2 * 2 [ fd 10 rt 90 ]')).toHaveLength(4);
    expect(segs('repeat 0 [ fd 10 ]')).toHaveLength(0);
  });

  it.each([
    ['repeat 2.5 [ fd 1 ]', 'whole number of times (0 or more), but got 2.5', 1, 8],
    ['repeat -1 [ fd 1 ]', 'but got -1', 1, 8],
    ['fd 10\nrepeat 3 [ fd 10 / (repcount - 2) ]', 'Division by zero.', 2, 20],
  ])('reports runtime error for %j with location', (source, message, line, column) => {
    const result = runSource(source);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain(message);
    expect(result.error?.span).toMatchObject({ line, column });
  });

  it('keeps the geometry drawn before a runtime error', () => {
    const result = runSource('fd 10 fd 10 / 0');
    expect(result.error?.message).toBe('Division by zero.');
    expect(result.drawing.segments).toHaveLength(1);
  });

  it('stops runaway programs at the step limit', () => {
    const result = runSource('repeat 1000 [ repeat 1000 [ rt 1 ] ]', { maxSteps: 5000 });
    expect(result.error?.message).toMatch(/^Stopped after 5,000 steps/);
    expect(result.error?.span.line).toBe(1);
  });

  it('stops oversized drawings at the primitive limit', () => {
    const result = runSource('repeat 100 [ fd 1 rt 1 ]', { maxPrimitives: 10 });
    expect(result.error?.message).toContain('more than 10 lines and triangles');
  });
});

describe('line mode', () => {
  it('draws one segment per pen-down move in the current color', () => {
    const result = ok('fd 10 color red rt 90 fd 5 bk 5');
    expect(result.drawing.segments.map((s) => [r(s.a), r(s.b), s.color])).toEqual([
      [[0, 0, 0], [0, 10, 0], DEFAULT_COLOR],
      [[0, 10, 0], [5, 10, 0], NAMED_COLORS.red],
      [[5, 10, 0], [0, 10, 0], NAMED_COLORS.red],
    ]);
  });

  it('does not draw pen-up moves, zero-length moves, or turns', () => {
    expect(segs('pu fd 10 pd fd 0 rt 90 climb 30 rr 10 fd 5')).toHaveLength(1);
  });

  it('draws home as a move when the pen is down', () => {
    expect(segs('fd 10 rt 90 fd 10 home')).toEqual([
      [[0, 0, 0], [0, 10, 0]],
      [[0, 10, 0], [10, 10, 0]],
      [[10, 10, 0], [0, 0, 0]],
    ]);
  });

  it('draws in 3D: climb leaves the ground plane', () => {
    expect(segs('climb 90 fd 10 dive 90 fd 10')).toEqual([
      [[0, 0, 0], [0, 0, 10]],
      [[0, 0, 10], [0, 10, 10]],
    ]);
  });
});

describe('triangle mode', () => {
  it('seeds the strip at the current position and slides a window of three points', () => {
    // Points: start(0,0) p1(0,10) p2(10,10) p3(10,0) → triangles (s,p1,p2) and (p1,p2,p3).
    expect(tris('triangles fd 10 rt 90 fd 10 rt 90 fd 10')).toEqual([
      [[0, 0, 0], [0, 10, 0], [10, 10, 0]],
      [[0, 10, 0], [10, 10, 0], [10, 0, 0]],
    ]);
  });

  it('computes normals with the right-hand rule over generation order', () => {
    const [cw] = ok('triangles fd 10 rt 90 fd 10').drawing.triangles; // clockwise from above
    const [ccw] = ok('triangles fd 10 lt 90 fd 10').drawing.triangles; // counter-clockwise
    expect(r(cw.normal)).toEqual([0, 0, -1]);
    expect(r(ccw.normal)).toEqual([0, 0, 1]);
  });

  it('colors each triangle with the color current when its third point is generated', () => {
    const result = ok('triangles fd 10 color red rt 90 fd 10 color blue rt 90 fd 10');
    expect(result.drawing.triangles.map((t) => t.color)).toEqual([NAMED_COLORS.red, NAMED_COLORS.blue]);
  });

  it('leaves incomplete groups undrawn and reports them as pending points', () => {
    const result = ok('triangles fd 10');
    expect(result.drawing.triangles).toHaveLength(0);
    expect(result.drawing.pendingPoints.map(r)).toEqual([[0, 0, 0], [0, 10, 0]]);
    // Once a strip has made a triangle, its trailing points are not pending.
    expect(ok('triangles fd 10 rt 90 fd 10 fd 10').drawing.pendingPoints).toEqual([]);
    // A new strip after penup/pendown starts pending again from its seed.
    expect(ok('triangles fd 10 rt 90 fd 10 pu fd 5 pd').drawing.pendingPoints.map(r)).toEqual([[15, 10, 0]]);
  });

  it('excludes pen-up points: penup ends the strip and pendown starts a new one where the turtle is', () => {
    const source = 'triangles fd 10 rt 90 pu fd 10 pd fd 10 rt 90 fd 10';
    // Strip 1 = start, (0,10): never completes. Strip 2 starts at (10,10).
    expect(tris(source)).toEqual([[[10, 10, 0], [20, 10, 0], [20, 0, 0]]]);
  });

  it('restarts the strip when switching modes, and draws no lines in triangle mode', () => {
    const result = ok('fd 10 triangles rt 90 fd 10 lines fd 10 triangles rt 90 fd 10 rt 90 fd 10');
    expect(result.drawing.segments.map((s) => [r(s.a), r(s.b)])).toEqual([
      [[0, 0, 0], [0, 10, 0]],
      [[10, 10, 0], [20, 10, 0]],
    ]);
    // Only the last strip (seeded at (20,10)) completes a triangle.
    expect(result.drawing.triangles.map((t) => [r(t.a), r(t.b), r(t.c)])).toEqual([
      [[20, 10, 0], [20, 0, 0], [10, 0, 0]],
    ]);
  });

  it('skips zero-area triangles but still slides their points through the window', () => {
    // start, (0,10), (0,20) are collinear → skipped; then (10,20) forms ((0,10),(0,20),(10,20)).
    expect(tris('triangles fd 10 fd 10 rt 90 fd 10')).toEqual([[[0, 10, 0], [0, 20, 0], [10, 20, 0]]]);
  });

  it('`triangles` while already in triangle mode starts a fresh strip', () => {
    expect(tris('triangles fd 10 rt 90 triangles fd 10 rt 90 fd 10')).toHaveLength(1);
  });
});

describe('state reset', () => {
  it('clear erases the drawing but keeps the turtle pose, pen, mode, and color', () => {
    const result = ok('color red fd 10 rt 90 triangles clear fd 10 rt 90 fd 10');
    expect(result.drawing.segments).toHaveLength(0);
    expect(result.drawing.triangles.map((t) => [r(t.a), t.color])).toEqual([[[0, 10, 0], NAMED_COLORS.red]]);
    expect(result.allSegments).toHaveLength(1); // kept for playback only
  });

  it('reset restores every default and returns home without drawing', () => {
    const result = ok('color red pu triangles climb 30 fd 50 reset fd 10');
    expect(result.penDown).toBe(true);
    expect(result.mode).toBe('lines');
    expect(result.color).toBe(DEFAULT_COLOR);
    expect(result.drawing.segments.map((s) => [r(s.a), r(s.b), s.color])).toEqual([
      [[0, 0, 0], [0, 10, 0], DEFAULT_COLOR],
    ]);
  });

  it('every run starts from a fresh state', () => {
    ok('color red pu climb 45 triangles fd 10');
    const second = ok('fd 10');
    expect(second.drawing.segments.map((s) => [r(s.a), r(s.b), s.color])).toEqual([
      [[0, 0, 0], [0, 10, 0], DEFAULT_COLOR],
    ]);
  });

  it('records one playback frame per command with visible ranges', () => {
    const result = ok('fd 10 rt 90 fd 10 clear fd 10');
    expect(result.frames.map((f) => [f.segmentStart, f.segmentEnd])).toEqual([
      [0, 1], [0, 1], [0, 2], [2, 2], [2, 3],
    ]);
    expect(result.frames[2].span).toMatchObject({ line: 1, column: 13 });
  });

  it('syntax errors produce an empty result with the error', () => {
    const result = runSource('fd 10\nfoo');
    expect(result.error?.kind).toBe('syntax');
    expect(result.error?.describe()).toBe("Line 2, column 1: Unknown command 'foo'.");
    expect(result.drawing.segments).toHaveLength(0);
  });
});
