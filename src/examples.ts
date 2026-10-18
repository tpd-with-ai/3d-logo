export interface Example {
  id: string;
  title: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'square',
    title: 'Square and star (yaw)',
    code: `; Classic Logo works unchanged: it draws on the ground (z = 0).
; right/left turn about the turtle's up axis (yaw).
repeat 4 [ forward 60 right 90 ]

penup forward 90 pendown
color yellow
repeat 5 [ forward 60 right 144 ]
`,
  },
  {
    id: 'squiral',
    title: 'Growing spiral (repcount)',
    code: `; repcount is 1, 2, 3, ... inside a repeat.
repeat 60 [
  color #a855f7
  forward repcount * 2
  right 89
]
`,
  },
  {
    id: 'helix',
    title: 'Helix (pitch)',
    code: `; climb tips the nose up, dive tips it back down.
; Each step rises a little while the heading circles around.
repeat 144 [
  climb 20 forward 6 dive 20
  left 10
]
`,
  },
  {
    id: 'globe',
    title: 'Globe of rings (roll)',
    code: `; Draw a ring, then roll about the heading and draw another.
; rollright tips the right wing down, so each ring is tilted.
repeat 12 [
  repeat 36 [ forward 6 left 10 ]
  rollright 15
]
`,
  },
  {
    id: 'cube',
    title: 'Wire cube (climb + turn)',
    code: `; A vertical square (climb) on each side of a ground square (right).
repeat 4 [
  repeat 4 [ forward 60 climb 90 ]
  forward 60 right 90
]
`,
  },
  {
    id: 'ribbon',
    title: 'Triangle ribbon',
    code: `; In triangle mode every move adds a point, and each new point
; makes a triangle with the two before it (a triangle strip).
triangles
forward 30
repeat 8 [
  color orange right 120 forward 30
  color yellow left 120 forward 30
]
`,
  },
  {
    id: 'twist',
    title: 'Twisted ribbon (triangles + roll)',
    code: `; The same zig-zag strip, rolled a little after every step.
triangles
forward 20
repeat 40 [
  color cyan right 120 forward 20
  color blue left 120 forward 20
  rollright 9
]
`,
  },
  {
    id: 'tetrahelix',
    title: 'Tetrahelix (folded triangles)',
    code: `; Before each new triangle, roll 109.47 degrees about the edge the
; turtle just walked. That folds the strip so every 4 points form a
; regular tetrahedron, and the tetrahedra stack into a helix.
triangles
forward 40
repeat 15 [
  color pink   rollright 109.47 right 120 forward 40
  color purple rollright 109.47 left 120 forward 40
]
`,
  },
  {
    id: 'pinwheel',
    title: 'Pinwheel (lines + triangles)',
    code: `; Combine modes: a line stem, then triangle blades.
color white
climb 90 forward 80        ; stem straight up; blades now lie in a vertical plane
triangles
repeat 4 [
  color yellow
  forward 40 right 120 forward 40     ; blade: centre, tip, side point
  right 120 penup forward 40 pendown  ; back to the centre, no new point
  right 210                           ; 240 + 210 = 450: a quarter turn on
]
`,
  },
];
