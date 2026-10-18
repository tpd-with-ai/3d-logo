import { describe, expect, it } from 'vitest';
import { runSource } from './interpreter';
import { NAMED_COLORS, DEFAULT_COLOR } from '../lang/commands';
import { cross, dot, sub, vec, type Vec3 } from '../turtle/vec';

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

describe('relative turns through the language', () => {
  const pose = (source: string) => {
    const p = ok(source).pose;
    return [p.position, p.heading, p.left, p.up].map(r);
  };
  // An arbitrary starting orientation, so no command can pass by coincidence with world axes.
  const TILT = 'yawleft 25 pitchup 40 rollright 65 forward 7 ';

  it.each([
    ['yawleft 33', 'left 33', 'lt 33', 'yawright -33'],
    ['yawright 33', 'right 33', 'rt 33', 'yawleft -33'],
    ['pitchup 33', 'climb 33', 'pitchdown -33', 'dive -33'],
    ['pitchdown 33', 'dive 33', 'pitchup -33', 'climb -33'],
    ['rollleft 33', 'rl 33', 'rollright -33', 'rr -33'],
  ])('%s, its aliases, and its negated opposite agree after a tilt', (...variants) => {
    const expected = pose(TILT + variants[0]);
    for (const variant of variants.slice(1)) expect(pose(TILT + variant)).toEqual(expected);
    expect(expected).not.toEqual(pose(TILT)); // the turn really changed something
  });

  it.each([
    ['yawleft', 'yawright'],
    ['pitchup', 'pitchdown'],
    ['rollleft', 'rollright'],
  ])('%s and %s cancel from a tilted frame', (a, b) => {
    expect(pose(`${TILT} ${a} 48 ${b} 48`)).toEqual(pose(TILT));
  });

  it.each([
    ['pitchup 90 forward 10', [0, 0, 10]], // on the ground, U is world up
    ['yawleft 90 pitchup 90 forward 10', [0, 0, 10]], // yaw leaves U alone, so this still climbs
    ['pitchup 90 yawleft 90 forward 10', [-10, 0, 0]], // yaw about the new up (−Y)
    ['rollright 90 pitchup 90 forward 10', [10, 0, 0]], // roll first: "up" is now world +X
    ['rollleft 90 pitchup 90 forward 10', [-10, 0, 0]],
    ['pitchup 90 rollright 90 yawright 90 forward 10', [0, 10, 0]], // yaw about the rolled up axis (+X)
  ])('%s ends at %j', (source, expected) => {
    expect(r(ok(source).pose.position)).toEqual(expected);
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

describe('setpos, sin and cos', () => {
  it('setpos moves to an absolute point like any move and keeps the orientation', () => {
    const result = ok('yawleft 90 setpos 10 -20 30 forward 5');
    expect(result.drawing.segments.map((s) => [r(s.a), r(s.b)])).toEqual([
      [[0, 0, 0], [10, -20, 30]],
      [[10, -20, 30], [5, -20, 30]], // still heading −X
    ]);
  });

  it('sin and cos take degrees and are exact at multiples of 90', () => {
    const result = ok('setpos 10 * cos(90) 10 * sin(90) 10 * cos(60)');
    expect([result.pose.position.x, result.pose.position.y]).toEqual([0, 10]);
    expect(result.pose.position.z).toBeCloseTo(5, 12);
  });

  it('a parametric curve: 36 setpos points on a circle', () => {
    const result = ok('penup setpos 20 0 0 pendown repeat 36 [ setpos 20 * cos(repcount * 10) 20 * sin(repcount * 10) 0 ]');
    expect(result.drawing.segments).toHaveLength(36);
    expect(r(result.pose.position)).toEqual([20, 0, 0]);
  });
});

describe('polygon blocks', () => {
  it('fills the start position plus each move end as one face, drawing no lines', () => {
    const result = ok('color red polygon [ repeat 4 [ forward 10 yawright 90 ] ]');
    expect(result.drawing.segments).toHaveLength(0);
    expect(result.drawing.triangles).toHaveLength(2);
    expect(result.drawing.triangles.every((t) => t.color === NAMED_COLORS.red)).toBe(true);
    // Clockwise seen from above → normal −Z; only outline edges are drawn (the diagonal is not).
    expect(result.drawing.triangles.every((t) => r(t.normal)[2] === -1)).toBe(true);
    const bits = (n: number) => [1, 2, 4].filter((b) => n & b).length;
    expect(result.drawing.triangles.map((t) => bits(t.edges))).toEqual([2, 2]); // the shared diagonal is left out
  });

  it('collects corners regardless of pen and mode, and never joins the surrounding strip', () => {
    const result = ok('triangles forward 10 penup polygon [ setpos 0 0 0 setpos 0 0 10 ] pendown');
    // Corners: start (0,10,0), (0,0,0), (0,0,10) → one triangle; the strip from before is gone.
    expect(tris('triangles forward 10 penup polygon [ setpos 0 0 0 setpos 0 0 10 ]')).toEqual([
      [[0, 10, 0], [0, 0, 0], [0, 0, 10]],
    ]);
    expect(result.penDown).toBe(true);
    expect(result.drawing.pendingPoints.map(r)).toEqual([[0, 0, 10]]);
  });

  it('uses the color current at the end of the block', () => {
    const result = ok('polygon [ color red forward 10 yawright 90 forward 10 color blue ]');
    expect(result.drawing.triangles.map((t) => t.color)).toEqual([NAMED_COLORS.blue]);
  });

  it.each([
    ['fd 5\npolygon [ forward 10 ]', 'at least 3 different corners, but this one has 2', 2, 1],
    ['polygon [ forward 10 forward 10 ]', 'no area', 1, 1],
    ['polygon [ forward 10 yawright 90 forward 10 pitchup 90 forward 10 ]', 'must be flat', 1, 1],
  ])('reports %j at the polygon block', (source, message, line, column) => {
    const result = runSource(source);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain(message);
    expect(result.error?.span).toMatchObject({ line, column });
  });
});

describe('functional colors', () => {
  it('captures rgb/hsv colors, with arithmetic and repcount, when geometry is made', () => {
    const result = ok('repeat 3 [ color hsv(repcount * 120, 100, 100) forward 10 ] color rgb(255, 128, 0) forward 1');
    expect(result.drawing.segments.map((s) => s.color)).toEqual(['#00ff00', '#0000ff', '#ff0000', '#ff8000']);
  });

  it('a triangle takes the color current at its third point, in either form', () => {
    const result = ok('triangles color rgb(0, 0, 255) forward 10 color hsv(0, 100, 100) yawright 90 forward 10');
    expect(result.drawing.triangles.map((t) => t.color)).toEqual(['#ff0000']);
  });

  it.each([
    ['color rgb(255, 300, 0)', 'rgb green must be between 0 and 255, but got 300.', 1, 16],
    ['repeat 3 [ color rgb(repcount * 100, 0, 0) ]', 'rgb red must be between 0 and 255, but got 300.', 1, 22],
    ['color hsv(10, 50, 0.5)', 'not 0–1', 1, 19],
    ['color hsv(10, 120, 50)', 'saturation is a percentage between 0 and 100, but got 120.', 1, 15],
    ['color rgb(1 / 0, 0, 0)', 'Division by zero.', 1, 15],
  ])('reports %j at the component', (source, message, line, column) => {
    const result = runSource(source);
    expect(result.error?.kind).toBe('runtime');
    expect(result.error?.message).toContain(message);
    expect(result.error?.span).toMatchObject({ line, column });
  });
});

describe('tetrahedra mode', () => {
  const tets = (source: string) => ok(source).drawing;
  /** The regular tetrahedron with integer corners (edge 40√2). */
  const SINGLE = 'tetrahedra setpos 40 40 0 setpos 40 0 40 setpos 0 40 40';

  it('four points make one closed tetrahedron: faces ABC, ABD, ACD, BCD, all facing outward', () => {
    const drawing = tets(SINGLE);
    expect(drawing.tetrahedra).toBe(1);
    expect(drawing.triangles).toHaveLength(4);
    const centre = { x: 20, y: 20, z: 20 };
    const sets = drawing.triangles.map((t) => [t.a, t.b, t.c].map((p) => r(p).join(',')).sort().join(' | '));
    const [A, B, C, D] = ['0,0,0', '40,40,0', '40,0,40', '0,40,40'];
    expect(sets).toEqual([[A, B, C], [A, B, D], [A, C, D], [B, C, D]].map((f) => f.sort().join(' | ')));
    for (const t of drawing.triangles) {
      const n = cross(sub(t.b, t.a), sub(t.c, t.a));
      expect(dot(n, sub(t.a, centre))).toBeGreaterThan(0); // winding faces outward
      expect(dot(t.normal, sub(t.a, centre))).toBeGreaterThan(0);
    }
  });

  it('outward winding does not depend on the order the points arrive in', () => {
    const mirrored = tets('tetrahedra setpos 0 40 40 setpos 40 0 40 setpos 40 40 0');
    for (const t of mirrored.triangles) expect(dot(cross(sub(t.b, t.a), sub(t.c, t.a)), sub(t.a, vec(20, 20, 20)))).toBeGreaterThan(0);
  });

  it('slides a four-point window: n points make n − 3 tetrahedra', () => {
    const drawing = tets('tetrahedra repeat 6 [ setpos 30 * cos(repcount * 100) 30 * sin(repcount * 100) repcount * 10 ]');
    expect(drawing.tetrahedra).toBe(4); // 7 points (start + 6)
    expect(drawing.triangles).toHaveLength(16);
    expect(drawing.pendingPoints).toEqual([]);
  });

  it('keeps fewer than four points pending, and penup / mode switches start a fresh window', () => {
    expect(tets('tetrahedra forward 10 yawright 90 forward 10').pendingPoints).toHaveLength(3);
    const drawing = tets(`${SINGLE} penup forward 5 pendown setpos 0 0 0 setpos 9 9 9`);
    expect(drawing.tetrahedra).toBe(1); // the new window (3 points) is not completed
    expect(drawing.pendingPoints).toHaveLength(3);
    expect(tets(`${SINGLE} triangles tetrahedra setpos 1 2 3`).pendingPoints).toHaveLength(2);
    expect(tets('tetrahedra setpos 40 40 0 lines setpos 40 0 40 tetrahedra setpos 0 40 40').tetrahedra).toBe(0);
  });

  it('captures the color when the fourth point completes the tetrahedron', () => {
    const drawing = tets('tetrahedra setpos 40 40 0 color red setpos 40 0 40 color hsv(240, 100, 100) setpos 0 40 40');
    expect(new Set(drawing.triangles.map((t) => t.color))).toEqual(new Set(['#0000ff']));
  });

  it('skips flat windows instead of emitting zero-volume faces, and counts them', () => {
    const drawing = tets('tetrahedra forward 10 yawright 90 forward 10 yawright 90 forward 10');
    expect(drawing.tetrahedra).toBe(0);
    expect(drawing.triangles).toHaveLength(0);
    expect(drawing.skippedTetrahedra).toBe(1);
  });

  it('clear and reset restart the window; clear also resets the visible tetrahedron count', () => {
    const cleared = tets(`${SINGLE} clear setpos 5 5 5`);
    expect(cleared.tetrahedra).toBe(0);
    expect(cleared.triangles).toHaveLength(0);
    expect(cleared.pendingPoints.map(r)).toEqual([[0, 40, 40], [5, 5, 5]]);
    const reset = ok(`${SINGLE} reset`);
    expect(reset.mode).toBe('lines');
    expect(reset.drawing.pendingPoints).toEqual([]);
  });

  it('handles a long chain quickly (10,000 tetrahedra)', () => {
    const drawing = tets('tetrahedra forward 40 repeat 5000 [ rollright 109.4712 yawright 120 forward 40 rollright 109.4712 yawleft 120 forward 40 ]');
    expect(drawing.tetrahedra).toBe(9999);
    expect(drawing.skippedTetrahedra).toBe(0);
  });
});
