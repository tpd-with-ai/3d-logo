import { geodesicCode, hilbertCode, icosahedronCode, octahedronCode, sierpinskiCode } from './gallery/generators';
import { MIZHAEV_SOURCE, mizhaevCode } from './gallery/mizhaev';

export type Category = 'Turning basics' | 'Drawing modes' | 'Tetrahedra' | 'Classic Logo' | 'Color' | 'Polyhedra' | 'Curves & knots' | 'Surfaces';

/**
 * How faithful an example is to the thing it is named after:
 * - exact: reproduces a precisely defined object (up to floating-point rounding; angles such as
 *   arccos(1/3) are given to 7 decimals),
 * - approximation: a polygonal approximation of a smooth curve or surface,
 * - artistic: a design, not a model of a specific object,
 * - lesson: a small program that teaches one idea.
 */
export type Accuracy = 'exact' | 'approximation' | 'artistic' | 'lesson';

export interface Example {
  id: string;
  title: string;
  category: Category;
  accuracy: Accuracy;
  description: string;
  source?: { label: string; url: string };
  code: string;
}

/**
 * The example gallery. "Turning basics" doubles as the runnable mini-examples in Help. Examples
 * use the canonical turn names; the classic Logo example shows that aliases such as `right` work.
 * Data-heavy programs are generated from their source data (see ./gallery).
 */
export const EXAMPLES: Example[] = [
  {
    id: 'turn-yaw',
    title: 'Yaw: yawleft / yawright',
    category: 'Turning basics',
    accuracy: 'lesson',
    description: 'Turn about the turtle’s own up axis.',
    code: `; Yaw: turn about the turtle's up axis U.
forward 30
yawleft 90    ; nose swings toward L
forward 30
yawright 45   ; same axis, other way
forward 30
`,
  },
  {
    id: 'turn-pitch',
    title: 'Pitch: pitchup / pitchdown',
    category: 'Turning basics',
    accuracy: 'lesson',
    description: 'Turn about the wing axis: the nose rises or drops.',
    code: `; Pitch: turn about the wing axis (L-R).
forward 30
pitchup 90    ; nose rises toward U
forward 30
pitchdown 90  ; nose drops back to level
forward 30
`,
  },
  {
    id: 'turn-roll',
    title: 'Roll: rollleft / rollright',
    category: 'Turning basics',
    accuracy: 'lesson',
    description: 'Turn about the heading; later turns use the rolled axes.',
    code: `; Roll: turn about the heading H.
forward 30
rollright 90  ; right wing drops
forward 30    ; path still straight
yawleft 90    ; about the new U...
forward 30    ; ...so this goes UP
`,
  },
  {
    id: 'turn-order',
    title: 'Relative turns: order matters',
    category: 'Turning basics',
    accuracy: 'lesson',
    description: 'The same two turns in a different order end somewhere else.',
    code: `; Every turn uses the turtle's axes NOW.
color yellow
pitchup 90 yawleft 90 forward 40    ; ends at -X
penup home pendown
color pink
yawleft 90 pitchup 90 forward 40    ; ends straight up
penup home pendown
color cyan
rollright 90 pitchup 90 forward 40  ; ends at +X
`,
  },
  {
    id: 'ribbon',
    title: 'Triangle strip',
    category: 'Drawing modes',
    accuracy: 'lesson',
    description: 'Triangle mode: each new point makes a triangle with the two before it.',
    code: `; In triangle mode every move adds a point, and each new point
; makes a triangle with the two before it (a triangle strip).
triangles
forward 30
repeat 8 [
  color orange yawright 120 forward 30
  color yellow yawleft 120 forward 30
]
`,
  },
  {
    id: 'polygon-intro',
    title: 'Filled polygons',
    category: 'Drawing modes',
    accuracy: 'lesson',
    description: 'polygon [ … ] fills one flat face, convex or not, in any plane.',
    code: `; polygon [ ... ] fills one flat face. Its corners are where the
; turtle starts plus the end of every move inside the brackets.
color orange
polygon [ repeat 6 [ forward 30 yawleft 60 ] ]        ; a hexagon

penup forward 90 pendown
color cyan                                            ; an L shape
polygon [ forward 40 yawleft 90 forward 20 yawleft 90 forward 20
          yawright 90 forward 20 yawleft 90 forward 20 yawleft 90 forward 40 ]

penup yawright 90 forward 70 yawleft 90 pendown
color hsv(300, 60, 100)
pitchup 90                                            ; a triangle standing up
polygon [ repeat 3 [ forward 50 yawright 120 ] ]
`,
  },
  {
    id: 'tetra-single',
    title: 'One tetrahedron',
    category: 'Drawing modes',
    accuracy: 'lesson',
    description: 'Tetrahedra mode: four points make one closed solid.',
    code: `; tetrahedra mode: each new point makes a closed tetrahedron with the
; three points before it. Start + 3 points = 1 tetrahedron (4 faces).
; These integer corners give a regular tetrahedron with edge 40·√2.
tetrahedra
color rgb(255, 140, 60)
setpos 40 40 0
setpos 40 0 40
setpos 0 40 40
`,
  },
  {
    id: 'tetra-chain',
    title: 'Tetrahedron chain (Boerdijk–Coxeter helix)',
    category: 'Tetrahedra',
    accuracy: 'exact',
    description: 'A sliding window of four points stacks regular tetrahedra into a helix.',
    code: `; In tetrahedra mode every 4 consecutive points make a solid. This
; zig-zag folds each step by 109.4712206 degrees (the angle that makes
; 4 consecutive points a regular tetrahedron), so the solids stack
; into the Boerdijk-Coxeter helix.
tetrahedra
forward 40
repeat 15 [
  color hsv(repcount * 24, 70, 100)
  rollright 109.4712206 yawright 120 forward 40
  color hsv(repcount * 24 + 12, 70, 100)
  rollright 109.4712206 yawleft 120 forward 40
]
`,
  },
  {
    id: 'tetra-flat',
    title: 'Solid or flat? (skipped windows)',
    category: 'Tetrahedra',
    accuracy: 'lesson',
    description: 'Four points make a solid only if they are not in one plane; a flat window is skipped.',
    code: `; Four points make a tetrahedron only if they are NOT in one plane.
tetrahedra
color rgb(80, 200, 120)
setpos 40 0 0  setpos 20 35 0  setpos 20 12 33   ; 4th point lifted: a solid
penup setpos 70 0 0 pendown                      ; fresh window at x = 70
color rgb(240, 90, 90)
setpos 110 0 0  setpos 90 35 0  setpos 90 12 0   ; all on the ground: flat,
                                                 ; skipped (see the status line)
lines                                            ; outline where it would be
setpos 70 0 0  setpos 110 0 0  setpos 90 35 0  setpos 70 0 0
`,
  },
  {
    id: 'tetra-crystal',
    title: 'Tetrahedral crystal slab',
    category: 'Tetrahedra',
    accuracy: 'exact',
    description: '15 regular tetrahedra on a triangular lattice, each built by the turtle and closed by its own window.',
    code: `; 15 regular tetrahedra (edge 40) on a triangular lattice: rows of 5, 4, 3,
; 2, 1. Each cell: pen down (fresh window), base triangle, climb to the apex,
; then pen up and retrace to the next cell without adding points.
; 54.7356103 = arctan(sqrt 2): the climb from a base corner to the apex.
tetrahedra
repeat 5 [
  color hsv(160 + repcount * 25, 60, 100)
  repeat 6 - repcount [                              ; repcount: the row here
    pendown forward 40 yawleft 120 forward 40        ; corners 1, 2, 3
    yawleft 150 pitchup 54.7356103 forward 40        ; corner 4: the apex
    penup back 40 pitchdown 54.7356103 yawright 150  ; retrace (pen up)
    back 40 yawright 120                             ; next cell's corner 1
  ]
  back 40 * (6 - repcount)                           ; back to the row start
  yawleft 60 forward 40 yawright 60                  ; next row, half a cell over
]
`,
  },
  {
    id: 'tetra-sierpinski',
    title: 'Sierpiński tetrahedron (level 3)',
    category: 'Tetrahedra',
    accuracy: 'exact',
    description: '64 separate solids from three rounds of halving; exact integer corners.',
    code: sierpinskiCode(),
  },
  {
    id: 'tetra-starburst',
    title: 'Tetrahedral starburst',
    category: 'Tetrahedra',
    accuracy: 'artistic',
    description: '30 spikes from one centre, each its own four-point window, spread by the golden angle.',
    code: `; 30 spikes from one centre. Pen up, home, aim, pen down: each spike starts a
; fresh window at the centre, so spikes never join each other.
tetrahedra
repeat 30 [
  penup home
  yawright repcount * 137.5          ; the golden angle spreads the spikes
  pitchup 70 * sin(repcount * 53)    ; and tilts them up and down
  pendown                            ; point 1: the centre
  color hsv(repcount * 12, 75, 100)
  forward 90                         ; point 2: the tip
  pitchup 90 forward 14              ; points 3 and 4 widen the tip
  yawleft 90 forward 14              ; so the spike is a solid
]
penup home
`,
  },
  {
    id: 'tetra-tunnel',
    title: 'Twisted tetrahedral tunnel',
    category: 'Tetrahedra',
    accuracy: 'approximation',
    description: 'One continuous window spirals round a ring: 96 solids close into a twisted tube.',
    code: `; Points spiral round a ring of radius 80 in steps of a quarter turn plus a
; little twist (93.75 degrees), moving 3.75 degrees along the ring each time.
; Any four in a row surround the core, so the sliding window makes a solid
; tube. 98 steps reach the first points again and close the tunnel.
tetrahedra penup
setpos 100 0 0 pendown
repeat 98 [
  color hsv(repcount * 3.75, 70, 100)
  setpos (80 + 20 * cos(repcount * 93.75)) * cos(repcount * 3.75)
         (80 + 20 * cos(repcount * 93.75)) * sin(repcount * 3.75)
         20 * sin(repcount * 93.75)
]
`,
  },
  {
    id: 'tetra-coral',
    title: 'Tetrahedral coral',
    category: 'Tetrahedra',
    accuracy: 'artistic',
    description: 'Five tapering tetrahedron chains grow from one base; pen up between branches keeps them apart.',
    code: `; Five branches, each a chain of tetrahedra whose steps shrink as it grows.
; Pen up before each branch starts a fresh window, so branches never bridge.
tetrahedra
repeat 5 [
  penup home
  yawright repcount * 72 pitchup 25 rollright 180   ; aim this branch
  color hsv(repcount * 25 + 290, 75, 100)
  pendown forward 30
  repeat 7 + repcount [                              ; longer and longer branches
    rollright 109.4712206 yawright 120 forward 30 - repcount * 1.5
    rollright 109.4712206 yawleft 120 forward 29 - repcount * 1.5
  ]
]
penup home
`,
  },
  {
    id: 'glass-tetra',
    title: 'Nested glass tetrahedra',
    category: 'Tetrahedra',
    accuracy: 'exact',
    description: 'Four concentric regular tetrahedra; outer shells are more transparent, the core is opaque.',
    code: `; Four regular tetrahedra around one centre, each its own window (pen up,
; move, pen down). hsva alpha falls from 100 (opaque core) to 18 outside.
tetrahedra
color hsv(30, 90, 100)
penup setpos 20 20 20 pendown setpos 20 -20 -20 setpos -20 20 -20 setpos -20 -20 20
color hsva(330, 75, 100, 45)
penup setpos 45 45 45 pendown setpos 45 -45 -45 setpos -45 45 -45 setpos -45 -45 45
color hsva(260, 70, 100, 28)
penup setpos 72 72 72 pendown setpos 72 -72 -72 setpos -72 72 -72 setpos -72 -72 72
color hsva(190, 70, 100, 18)
penup setpos 100 100 100 pendown setpos 100 -100 -100 setpos -100 100 -100 setpos -100 -100 100
penup home
`,
  },
  {
    id: 'square',
    title: 'Square and star (classic Logo)',
    category: 'Classic Logo',
    accuracy: 'exact',
    description: 'Unchanged 2D Logo, drawn on the ground plane.',
    code: `; Classic Logo works unchanged and draws on the ground (z = 0).
; right and left are aliases of yawright and yawleft.
repeat 4 [ forward 60 right 90 ]

penup forward 90 pendown
color yellow
repeat 5 [ forward 60 right 144 ]
`,
  },
  {
    id: 'squiral',
    title: 'Growing spiral',
    category: 'Classic Logo',
    accuracy: 'artistic',
    description: 'repcount grows each step of a square spiral.',
    code: `; repcount is 1, 2, 3, ... inside a repeat.
repeat 60 [
  color #a855f7
  forward repcount * 2
  yawright 89
]
`,
  },
  {
    id: 'rainbow-helix',
    title: 'Rainbow helix (hsv)',
    category: 'Color',
    accuracy: 'artistic',
    description: 'An hsv() hue gradient along a coil.',
    code: `; hsv(hue, saturation, value): hue in degrees (wraps at 360),
; saturation and value in percent. Step the hue for a rainbow.
repeat 216 [
  color hsv(repcount * 5, 85, 100)
  pitchup 12 forward 5 pitchdown 12
  yawleft 10
]
`,
  },
  {
    id: 'rgb-spiral',
    title: 'RGB fade spiral (rgb)',
    category: 'Color',
    accuracy: 'artistic',
    description: 'An rgb() gradient from red to blue on a tilting spiral.',
    code: `; rgb(red, green, blue): each channel 0-255. Fade red into blue
; while a growing square spiral slowly tilts upward.
repeat 60 [
  color rgb(255 - repcount * 4, 40 + repcount * 2, repcount * 4)
  forward repcount * 2
  yawright 89
  pitchup 2
]
`,
  },
  {
    id: 'glass-mobius',
    title: 'Glass Möbius strip (hsva)',
    category: 'Color',
    accuracy: 'approximation',
    description: 'An hsva() gradient: hue sweeps the rainbow while the opacity rises and falls around the loop.',
    code: `; hsva(hue, saturation, value, alpha): alpha is a percentage, 0 invisible,
; 100 opaque. Here it swings between 15 and 95 around the strip.
penup setpos 45 0 0 triangles pendown
setpos 75 0 0
repeat 36 [
  color hsva(repcount * 10, 70, 100, 55 + 40 * sin(repcount * 10))
  setpos (60 - 15 * cos(5 * repcount)) * cos(10 * repcount)
         (60 - 15 * cos(5 * repcount)) * sin(10 * repcount)
         -15 * sin(5 * repcount)
  setpos (60 + 15 * cos(5 * repcount)) * cos(10 * repcount)
         (60 + 15 * cos(5 * repcount)) * sin(10 * repcount)
         15 * sin(5 * repcount)
]
`,
  },
  {
    id: 'glass-cube',
    title: 'Glass cube with a core (rgba)',
    category: 'Color',
    accuracy: 'artistic',
    description: 'rgba() polygon walls at 30% let you see an opaque tetrahedron and a translucent diagonal inside.',
    code: `; rgba(red, green, blue, alpha): channels 0-255, alpha 0-100 percent.
; Opaque things inside translucent walls stay visible.
tetrahedra color rgb(255, 170, 40)               ; an opaque core
penup setpos 45 45 45 pendown setpos 45 15 15 setpos 15 45 15 setpos 15 15 45
lines color rgba(255, 255, 255, 60)              ; a translucent diagonal
penup setpos 0 0 0 pendown setpos 60 60 60
penup home                                       ; walls: the solid cube walk
color rgba(90, 200, 255, 30)
polygon [ repeat 4 [ forward 60 yawright 90 ] ]
repeat 4 [
  color rgba(90 + repcount * 30, 200, 255, 30)
  polygon [ repeat 4 [ forward 60 pitchup 90 ] ]
  forward 60 yawright 90
]
pitchup 90 forward 60 pitchdown 90
color rgba(90, 200, 255, 30)
polygon [ repeat 4 [ forward 60 yawright 90 ] ]
`,
  },
  {
    id: 'cube',
    title: 'Wire cube',
    category: 'Polyhedra',
    accuracy: 'exact',
    description: 'Twelve edges from vertical squares around a ground square.',
    code: `; A vertical square (pitchup) on each side of a ground square (yawright).
repeat 4 [
  repeat 4 [ forward 60 pitchup 90 ]
  forward 60 yawright 90
]
`,
  },
  {
    id: 'solid-cube',
    title: 'Solid cube',
    category: 'Polyhedra',
    accuracy: 'exact',
    description: 'Six polygon faces walked by the turtle.',
    code: `; Six square faces, each a polygon, walked like the wire cube.
penup                                   ; faces only, no edge lines
color hsv(30, 70, 100)
polygon [ repeat 4 [ forward 60 yawright 90 ] ]   ; bottom
repeat 4 [
  color hsv(repcount * 60 + 60, 55, 100)
  polygon [ repeat 4 [ forward 60 pitchup 90 ] ]  ; one side wall
  forward 60 yawright 90                          ; next bottom edge
]
pitchup 90 forward 60 pitchdown 90               ; climb to the top
color hsv(300, 50, 100)
polygon [ repeat 4 [ forward 60 yawright 90 ] ]   ; top
`,
  },
  {
    id: 'tetrahedron',
    title: 'Tetrahedron (turtle-built)',
    category: 'Polyhedra',
    accuracy: 'exact',
    description: 'Base plus three faces rolled up by the dihedral angle arccos(1/3).',
    code: `; Regular tetrahedron built by the turtle: a triangle base, then on
; each base edge roll up by 180 - 70.5288 degrees (70.5288 = the
; tetrahedron's dihedral angle, arccos 1/3) and fill a side face.
penup
color hsv(40, 70, 100)
polygon [ repeat 3 [ forward 60 yawright 120 ] ]      ; base
repeat 3 [
  color hsv(repcount * 100 + 100, 60, 100)
  rollright 109.4712206
  polygon [ repeat 3 [ forward 60 yawleft 120 ] ]     ; side face
  rollleft 109.4712206
  forward 60 yawright 120                             ; next edge
]
`,
  },
  {
    id: 'octahedron',
    title: 'Octahedron',
    category: 'Polyhedra',
    accuracy: 'exact',
    description: 'Eight faces from integer vertices on the axes.',
    code: octahedronCode(),
  },
  {
    id: 'icosahedron',
    title: 'Icosahedron',
    category: 'Polyhedra',
    accuracy: 'exact',
    description: 'Twenty faces; the golden ratio is written exactly as 2·cos 36°.',
    code: icosahedronCode(),
  },
  {
    id: 'geodesic',
    title: 'Geodesic sphere (frequency 2)',
    category: 'Polyhedra',
    accuracy: 'approximation',
    description: '80 triangles approximating a sphere; coordinates rounded to 0.001.',
    code: geodesicCode(),
  },
  {
    id: 'mizhaev',
    title: 'Mizhaev genus-3 polyhedron',
    category: 'Polyhedra',
    accuracy: 'exact',
    description: '8 nonagons where every face touches every other: exact integer data from the 2026 paper.',
    source: { label: 'R. Mizhaev, Integer Realization of an Equivelar Octahedron of Genus 3, arXiv:2609.17700 (2026), Tables 1–2', url: MIZHAEV_SOURCE.url },
    code: mizhaevCode(),
  },
  {
    id: 'helix',
    title: 'Helix',
    category: 'Curves & knots',
    accuracy: 'approximation',
    description: 'A coil of straight steps from pitch and yaw.',
    code: `; Pitch up, step, pitch back down: each step rises a little
; while yawleft keeps the heading circling around.
repeat 144 [
  pitchup 20 forward 6 pitchdown 20
  yawleft 10
]
`,
  },
  {
    id: 'trefoil',
    title: 'Trefoil knot',
    category: 'Curves & knots',
    accuracy: 'approximation',
    description: '120 steps along the parametric trefoil, using setpos with sin and cos.',
    code: `; Trefoil knot, drawn as 120 straight steps along the curve
;   x = sin t + 2 sin 2t,  y = cos t - 2 cos 2t,  z = -sin 3t
; with t = 3 * repcount degrees, scaled by 25.
penup setpos 0 -25 0 pendown        ; t = 0
repeat 120 [
  color hsv(repcount * 3, 80, 100)
  setpos 25 * (sin(3 * repcount) + 2 * sin(6 * repcount))
         25 * (cos(3 * repcount) - 2 * cos(6 * repcount))
         -25 * sin(9 * repcount)
]
`,
  },
  {
    id: 'torus',
    title: 'Torus of rings',
    category: 'Curves & knots',
    accuracy: 'approximation',
    description: '36 tube rings around a circle, all drawn with relative turns.',
    code: `; A torus as 36 rings of a tube (radius 20) placed around a circle.
; The turtle walks the outer equator. pitchup 90 turns the plane
; across its heading into its turning plane, so each ring stands upright.
penup setpos 80 0 0 pendown         ; on the outer equator, heading +Y
repeat 36 [
  color hsv(repcount * 10, 70, 100)
  pitchup 90
  repeat 24 [ forward 40 * sin(7.5) yawleft 15 ]   ; one ring
  pitchdown 90
  penup yawleft 5 forward 160 * sin(5) yawleft 5 pendown
]
`,
  },
  {
    id: 'hilbert',
    title: '3D Hilbert curve',
    category: 'Curves & knots',
    accuracy: 'exact',
    description: 'A space-filling path through a 4×4×4 grid, expanded from an L-system.',
    source: { label: 'L-system from P. Prusinkiewicz & A. Lindenmayer, The Algorithmic Beauty of Plants (1990), p. 20', url: 'http://algorithmicbotany.org/papers/#abop' },
    code: hilbertCode(),
  },
  {
    id: 'globe',
    title: 'Globe of rings',
    category: 'Curves & knots',
    accuracy: 'artistic',
    description: 'Rings rolled about the heading form a sphere-like cage.',
    code: `; Draw a ring, then roll about the heading and draw another.
; rollright drops the right wing, so each ring is tilted.
repeat 12 [
  repeat 36 [ forward 6 yawleft 10 ]
  rollright 15
]
`,
  },
  {
    id: 'mobius',
    title: 'Möbius strip',
    category: 'Surfaces',
    accuracy: 'approximation',
    description: 'One triangle strip with a half twist; its two edges join into one.',
    code: `; Mobius strip: one triangle strip zig-zagging between its two edges
; while the cross-section turns half a revolution around the loop.
; Edge points at angle u = 10 * repcount, radius 60, half-width 15.
penup setpos 45 0 0 triangles pendown   ; first edge point (u = 0)
setpos 75 0 0                           ; second edge point
repeat 36 [
  color hsv(repcount * 10, 70, 100)
  setpos (60 - 15 * cos(5 * repcount)) * cos(10 * repcount)
         (60 - 15 * cos(5 * repcount)) * sin(10 * repcount)
         -15 * sin(5 * repcount)
  setpos (60 + 15 * cos(5 * repcount)) * cos(10 * repcount)
         (60 + 15 * cos(5 * repcount)) * sin(10 * repcount)
         15 * sin(5 * repcount)
]
`,
  },
  {
    id: 'helicoid',
    title: 'Helicoid staircase',
    category: 'Surfaces',
    accuracy: 'approximation',
    description: 'A triangle strip between two helices.',
    code: `; Helicoid (a spiral staircase surface): one triangle strip that
; zig-zags between an inner and an outer helix.
penup setpos 10 0 0 triangles pendown
setpos 70 0 0
repeat 48 [
  color hsv(repcount * 7.5 + 180, 65, 100)
  setpos 10 * cos(15 * repcount) 10 * sin(15 * repcount) repcount * 3
  setpos 70 * cos(15 * repcount) 70 * sin(15 * repcount) repcount * 3
]
`,
  },
  {
    id: 'saddle',
    title: 'Saddle of straight lines',
    category: 'Surfaces',
    accuracy: 'exact',
    description: 'Both line families of the hyperbolic paraboloid z = xy/60.',
    code: `; Hyperbolic paraboloid z = x*y/60 drawn as straight lines: it is a
; doubly ruled surface, so both families of lines lie exactly on it.
penup
repeat 13 [
  color hsv(200, 70, 100)
  setpos repcount * 10 - 70 -60 (repcount * 10 - 70) * -1
  pendown
  setpos repcount * 10 - 70 60 repcount * 10 - 70
  penup
  color hsv(330, 70, 100)
  setpos -60 repcount * 10 - 70 (repcount * 10 - 70) * -1
  pendown
  setpos 60 repcount * 10 - 70 repcount * 10 - 70
  penup
]
`,
  },
  {
    id: 'twist',
    title: 'Twisted ribbon',
    category: 'Surfaces',
    accuracy: 'artistic',
    description: 'A zig-zag strip rolled a little after every step.',
    code: `; The same zig-zag strip, rolled a little after every step.
triangles
forward 20
repeat 40 [
  color cyan yawright 120 forward 20
  color blue yawleft 120 forward 20
  rollright 9
]
`,
  },
  {
    id: 'tetrahelix',
    title: 'Folded triangle strip',
    category: 'Surfaces',
    accuracy: 'artistic',
    description: 'The tetrahelix fold drawn as an open triangle strip.',
    code: `; Before each new triangle, roll 109.47 degrees about the edge the
; turtle just walked. That folds the strip so every 4 points form a
; regular tetrahedron, and the tetrahedra stack into a helix.
triangles
forward 40
repeat 15 [
  color pink   rollright 109.47 yawright 120 forward 40
  color purple rollright 109.47 yawleft 120 forward 40
]
`,
  },
  {
    id: 'pinwheel',
    title: 'Pinwheel',
    category: 'Surfaces',
    accuracy: 'artistic',
    description: 'A line stem and four triangle blades.',
    code: `; Combine modes: a line stem, then triangle blades.
color white
pitchup 90 forward 80      ; stem straight up; blades now lie in a vertical plane
triangles
repeat 4 [
  color yellow
  forward 40 yawright 120 forward 40     ; blade: centre, tip, side point
  yawright 120 penup forward 40 pendown  ; back to the centre, no new point
  yawright 210                           ; 240 + 210 = 450: a quarter turn on
]
`,
  },
];

export const CATEGORIES: Category[] = [...new Set(EXAMPLES.map((e) => e.category))];
