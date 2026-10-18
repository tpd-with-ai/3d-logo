export interface Example {
  id: string;
  title: string;
  group: 'Turning basics' | 'Drawings';
  code: string;
}

/**
 * Example programs. The "Turning basics" group doubles as the runnable mini-examples in Help.
 * Examples use the canonical turn names (yawleft, pitchup, rollright, ...); the first one shows
 * that classic Logo aliases such as `right` still work.
 */
export const EXAMPLES: Example[] = [
  {
    id: 'turn-yaw',
    title: 'Yaw: yawleft / yawright',
    group: 'Turning basics',
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
    group: 'Turning basics',
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
    group: 'Turning basics',
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
    group: 'Turning basics',
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
    id: 'square',
    title: 'Square and star (classic Logo)',
    group: 'Drawings',
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
    title: 'Growing spiral (repcount)',
    group: 'Drawings',
    code: `; repcount is 1, 2, 3, ... inside a repeat.
repeat 60 [
  color #a855f7
  forward repcount * 2
  yawright 89
]
`,
  },
  {
    id: 'helix',
    title: 'Helix (pitch)',
    group: 'Drawings',
    code: `; Pitch up, step, pitch back down: each step rises a little
; while yawleft keeps the heading circling around.
repeat 144 [
  pitchup 20 forward 6 pitchdown 20
  yawleft 10
]
`,
  },
  {
    id: 'globe',
    title: 'Globe of rings (roll)',
    group: 'Drawings',
    code: `; Draw a ring, then roll about the heading and draw another.
; rollright drops the right wing, so each ring is tilted.
repeat 12 [
  repeat 36 [ forward 6 yawleft 10 ]
  rollright 15
]
`,
  },
  {
    id: 'cube',
    title: 'Wire cube (pitch + yaw)',
    group: 'Drawings',
    code: `; A vertical square (pitchup) on each side of a ground square (yawright).
repeat 4 [
  repeat 4 [ forward 60 pitchup 90 ]
  forward 60 yawright 90
]
`,
  },
  {
    id: 'ribbon',
    title: 'Triangle ribbon',
    group: 'Drawings',
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
    id: 'twist',
    title: 'Twisted ribbon (triangles + roll)',
    group: 'Drawings',
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
    title: 'Tetrahelix (folded triangles)',
    group: 'Drawings',
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
    title: 'Pinwheel (lines + triangles)',
    group: 'Drawings',
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
