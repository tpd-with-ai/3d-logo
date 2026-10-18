# 3D Logo language reference

3D Logo is a deliberately small language: 16 commands, one control structure (`repeat`), one
counter (`repcount`), and arithmetic. There are no variables, procedures, or conditionals. Every
rule below is implemented in one place and covered by tests:

| Rule | Source of truth | Tests |
| --- | --- | --- |
| Tokens and grammar | `src/lang/lexer.ts`, `src/lang/parser.ts` | `src/lang/parser.test.ts` |
| Command names, aliases, inputs | `src/lang/commands.ts` | `src/lang/parser.test.ts` |
| Orientation and movement | `src/turtle/turtle.ts` | `src/turtle/turtle.test.ts` |
| Line and triangle generation | `src/geometry/drawing.ts` | `src/interpreter/interpreter.test.ts` |
| Execution, repeat, limits, errors | `src/interpreter/interpreter.ts` | `src/interpreter/interpreter.test.ts` |

## Grammar

```ebnf
program   = { statement } ;
statement = repeat | command ;
repeat    = "repeat" expr "[" { statement } "]" ;
command   = NAME                      (* commands with no input *)
          | NAME expr                 (* distance or angle commands *)
          | "color" ( COLORNAME | HEX ) ;

expr      = term { ( "+" | "-" ) term } ;
term      = unary { ( "*" | "/" ) unary } ;
unary     = "-" unary | primary ;
primary   = NUMBER | "repcount" | "(" expr ")" ;

NUMBER    = digit { digit } [ "." digit { digit } ] | "." digit { digit } ;
HEX       = "#" 3 or 6 hex digits ;
NAME      = letter { letter | digit | "_" } ;    (* case-insensitive *)
comment   = ";" { any character except newline } ;
```

- Whitespace and newlines only separate tokens, so `repeat 4 [fd 50 rt 90]` can be on one line or
  many.
- Every command has a fixed number of inputs (0 or 1), so no parentheses or separators are needed
  between commands. An input expression ends at the first token that cannot continue it, which is
  usually the next command name.
- Arithmetic is greedy: `fd 10 -5` means `fd (10 - 5)`. Write `bk 5` to move backward.
- `repcount` may only appear inside a `repeat` block; using it elsewhere is a syntax error.

## Commands

| Command | Alias | Input | Effect |
| --- | --- | --- | --- |
| `forward d` | `fd` | distance | Move `d` units along the heading **H**. |
| `back d` | `bk` | distance | Move `d` units along **−H**. |
| `home` | | | Move to the origin (a normal move: draws if the pen is down), then restore the home orientation. |
| `left a` | `lt` | angle | Yaw: rotate **H** toward **L** about **U**. |
| `right a` | `rt` | angle | Yaw the other way: `right a` = `left −a`. |
| `climb a` | | angle | Pitch: rotate **H** toward **U** about **L** (nose up). |
| `dive a` | | angle | `dive a` = `climb −a` (nose down). |
| `rollright a` | `rr` | angle | Roll about **H**: **L** rotates toward **U**, so the right wing goes down. |
| `rollleft a` | `rl` | angle | `rollleft a` = `rollright −a`. |
| `penup` | `pu` | | Moves stop drawing. |
| `pendown` | `pd` | | Moves draw again. |
| `lines` | | | Switch to line mode (the default). |
| `triangles` | | | Switch to triangle mode and start a new strip here. |
| `color c` | | color | Set the pen color: a name below or `#rrggbb` / `#rgb`. |
| `clear` | | | Erase the drawing. Pose, pen, mode, and color are unchanged. |
| `reset` | | | Erase the drawing and restore every start setting (home pose without drawing, pen down, line mode, cyan). |
| `repeat n [ … ]` | | count | Run the block `n` times. `n` must be a whole number ≥ 0. |
| `repcount` | | | In an expression: the current pass (1, 2, 3, …) of the innermost `repeat`. |

Named colors: cyan (default), red, orange, yellow, green, blue, purple, pink, brown, white, gray,
black.

Climb/dive deliberately avoid the names `up`/`down`, which are easy to confuse with
`penup`/`pendown`.

## Coordinates, units, and orientation

- **World axes** are right-handed with **Z up**: X to the right, Y ahead (away from the default
  camera), Z up. The ground grid is the plane z = 0.
- **Units**: distances are world units (the viewport shows the current grid cell size), angles are
  degrees. Any finite number is allowed, including negatives and fractions.
- **Turtle frame**: the turtle carries an orthonormal right-handed frame of three unit vectors,
  heading **H**, left wing **L**, and up **U**, with **H × L = U**.
- **Home pose**: position (0, 0, 0), **H** = +Y, **L** = −X, **U** = +Z. A turtle that never climbs,
  dives, or rolls stays on the ground and behaves exactly like 2D Logo viewed from above, so
  `right 90` turns clockwise as seen from above.

### Rotation formulas

All rotations are by angle θ and leave the third axis unchanged:

| Command | Changes | Formula |
| --- | --- | --- |
| `left θ` | H, L | H′ = H cos θ + L sin θ, L′ = L cos θ − H sin θ |
| `climb θ` | H, U | H′ = H cos θ + U sin θ, U′ = U cos θ − H sin θ |
| `rollright θ` | L, U | L′ = L cos θ + U sin θ, U′ = U cos θ − L sin θ |

So from home: `left 90` faces −X, `climb 90` faces +Z (with **U** = −Y), and `rollright 90` puts the
left wing up (**L** = +Z) and the back toward +X (**U** = +X).

### Composition

Rotations are **intrinsic**: each one turns about the turtle's *current* axes, not the world axes.
In matrix terms, if R = [H L U] is the orientation, each command updates R ← R · R_local(θ). Order
therefore matters:

- `climb 90 left 90` → nose up, then yaw about the new up axis (−Y): **H** = −X.
- `left 90 climb 90` → yaw to −X, then pitch about the new left axis: **H** = +Z.

Multiples of 90° use exact sines and cosines, and the frame is re-orthonormalized after every
rotation, so squares and cubes close exactly and long programs do not drift.

## Drawing

Every move (`forward`, `back`, `home`) goes from the old position P to the new position Q. Turns
never draw.

### Line mode (default)

A pen-down move adds the segment P→Q in the current color. Zero-length moves and pen-up moves add
nothing.

### Triangle mode

Triangle mode builds **triangle strips** from a sliding window of the most recent points:

1. **Strip start.** A strip starts with the turtle's current position as its first point when the
   turtle is in triangle mode with the pen down, immediately after `triangles`, `pendown` (when the
   pen was up), `clear`, or `reset`. Re-issuing `triangles` starts a fresh strip where the turtle is.
2. **Points.** Each pen-down move appends its end point Q. Turns and pen-up moves add no points.
3. **Sliding window.** When the window holds three points a, b, c (oldest first), the triangle
   (a, b, c) is emitted and a is dropped. The next point d then forms (b, c, d). A strip of n points
   makes n − 2 triangles.
4. **Pen-up points do not participate.** `penup` ends the strip and empties the window; `pendown`
   starts a new strip at the turtle's position. This mirrors line mode, where lifting the pen
   breaks the line.
5. **Mode switches.** `lines` empties the window. Switching back with `triangles` starts a new
   strip. Lines are never drawn in triangle mode and triangles are never drawn in line mode.
   Geometry already drawn is kept.
6. **Winding and normals.** Vertices are stored in generation order a → b → c, which defines the
   front face. The normal is (b − a) × (c − a), normalized (right-hand rule): a strip walked
   counter-clockwise as seen from above has normals pointing up. Consecutive triangles in a strip
   therefore alternate winding (unlike GPU strip conventions). Triangles are rendered double-sided
   and lit on both faces, so winding never hides geometry.
7. **Color and material.** Each triangle has one flat color: the pen color at the moment its third
   point is generated. All triangles share one matte, double-sided material with thin dark edges.
8. **Degenerate triangles.** Zero-area triangles (collinear or repeated points) are skipped, but
   their points still slide through the window.
9. **Incomplete groups.** A strip that ends with fewer than three points draws nothing and is not
   an error. Its points are reported as *pending points* (shown as white dots in the viewport and
   counted in the status line). Once a strip has formed a triangle, nothing is pending.

Example: `triangles fd 30 repeat 8 [ rt 120 fd 30 lt 120 fd 30 ]` walks a zig-zag of points and
produces a ribbon of 16 equilateral triangles.

## Errors

Errors carry a kind, a message, and a 1-based line and column. The playground underlines the span
and shows the message.

- **Syntax errors** stop the program before it runs: unknown commands or colors (with a
  "Did you mean…?" suggestion), missing inputs, extra numbers, unbalanced `[ ]` or `( )`, bad
  characters or hex colors, and `repcount` outside a `repeat`.
- **Runtime errors** stop the program where they happen and keep what was drawn so far: division by
  zero, non-whole or negative repeat counts, numbers too large to represent, more than 1,000,000
  steps (commands plus repeat passes), or more than 200,000 lines and triangles.

## Execution model

A run always starts from a fresh state (home pose, pen down, line mode, cyan, empty drawing) and
executes the whole program immediately. The playground can then replay the recorded steps at a
chosen speed or one at a time; replay never changes the result.
