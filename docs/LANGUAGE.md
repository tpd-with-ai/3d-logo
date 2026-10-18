# 3D Logo language reference

3D Logo is a deliberately small language: 18 commands, one control structure (`repeat`), one
face block (`polygon`), one counter (`repcount`), arithmetic with `sin`/`cos`, and colors by name,
hex, `rgb()`, or `hsv()`. There are no variables, procedures, or conditionals. Every rule below is
implemented in one place and covered by tests:

| Rule | Source of truth | Tests |
| --- | --- | --- |
| Tokens and grammar | `src/lang/lexer.ts`, `src/lang/parser.ts` | `src/lang/parser.test.ts` |
| Command names, aliases, inputs | `src/lang/commands.ts` | `src/lang/parser.test.ts` |
| Orientation and movement | `src/turtle/turtle.ts` | `src/turtle/turtle.test.ts` |
| Line, triangle, and tetrahedron generation | `src/geometry/drawing.ts` | `src/interpreter/interpreter.test.ts` |
| Polygon filling (planarity, ear clipping) | `src/geometry/polygon.ts` | `src/geometry/polygon.test.ts` |
| Functional colors | `src/interpreter/color.ts` | `src/interpreter/color.test.ts` |
| Example gallery (counts, bounds, exact models) | `src/examples.ts`, `src/gallery/` | `src/examples.test.ts` |
| Execution, repeat, limits, errors | `src/interpreter/interpreter.ts` | `src/interpreter/interpreter.test.ts` |

## Grammar

```ebnf
program   = { statement } ;
statement = repeat | polygon | command ;
repeat    = "repeat" expr "[" { statement } "]" ;
polygon   = "polygon" "[" { statement } "]" ;   (* no polygon, clear, or reset inside *)
command   = NAME                      (* commands with no input *)
          | NAME expr                 (* distance or angle commands *)
          | "setpos" expr expr expr
          | "color" color ;
color     = COLORNAME | HEX
          | "rgb" "(" expr "," expr "," expr ")"
          | "hsv" "(" expr "," expr "," expr ")" ;

expr      = term { ( "+" | "-" ) term } ;
term      = unary { ( "*" | "/" ) unary } ;
unary     = "-" unary | primary ;
primary   = NUMBER | "repcount" | "(" expr ")"
          | ( "sin" | "cos" ) "(" expr ")" ;     (* degrees *)

NUMBER    = digit { digit } [ "." digit { digit } ] | "." digit { digit } ;
HEX       = "#" 3 or 6 hex digits ;
NAME      = letter { letter | digit | "_" } ;    (* case-insensitive *)
comment   = ";" { any character except newline } ;
```

- Whitespace and newlines only separate tokens, so `repeat 4 [fd 50 rt 90]` can be on one line or
  many.
- Every command has a fixed number of inputs (0, 1, or 3 for `setpos`), so no parentheses or
  separators are needed between commands. An input expression ends at the first token that cannot
  continue it, which is usually the next command name.
- **Minus rule** (as in UCBLogo): a `-` with whitespace, `[`, or `(` before it and no space after it
  is a sign and starts a new input, so `setpos 10 -5 0` has three inputs. Inside parentheses it
  subtracts again. `10 - 5`, `10-5`, and `(10 -5)` all subtract; `fd 10 -5` is a syntax error
  ("Unexpected number -5") rather than a silent `fd 5`.
- `rgb`, `hsv`, `sin`, and `cos` need parentheses; `rgb` and `hsv` take exactly three
  comma-separated inputs. Words are case-insensitive: `COLOR HSV(0, 100, 100)` is fine.
- `repcount` may only appear inside a `repeat` block; using it elsewhere is a syntax error.

## Commands

| Command | Alias | Input | Effect |
| --- | --- | --- | --- |
| `forward d` | `fd` | distance | Move `d` units along the heading **H**. |
| `back d` | `bk` | distance | Move `d` units along **−H**. |
| `setpos x y z` | | point | Move straight to the world point (x, y, z). A normal move: draws or adds a point like `forward`. Orientation is unchanged. |
| `home` | | | Move to the origin (a normal move: draws if the pen is down), then restore the home orientation. |
| `yawleft a` | `left`, `lt` | angle | Yaw about the current **U**: the nose swings toward **L**. |
| `yawright a` | `right`, `rt` | angle | Yaw about the current **U**: the nose swings toward **R**. `yawright a` = `yawleft −a`. |
| `pitchup a` | `climb` | angle | Pitch about the current wing axis **R**–**L**: the nose rises toward **U**. |
| `pitchdown a` | `dive` | angle | Pitch the other way: the nose drops. `pitchdown a` = `pitchup −a`. |
| `rollleft a` | `rl` | angle | Roll about the current **H**: the left wing drops. `rollleft a` = `rollright −a`. |
| `rollright a` | `rr` | angle | Roll about the current **H**: the right wing drops. |
| `penup` | `pu` | | Moves stop drawing. |
| `pendown` | `pd` | | Moves draw again. |
| `lines` | | | Switch to line mode (the default). |
| `triangles` | | | Switch to triangle mode and start a new strip here. |
| `tetrahedra` | | | Switch to tetrahedra mode and start a new four-point window here. |
| `polygon [ … ]` | | block | Fill one flat face whose corners are the start position and the end of each move in the block. |
| `color c` | | color | Set the pen color: a name below, `#rrggbb` / `#rgb`, `rgb(r, g, b)`, or `hsv(h, s, v)`. |
| `clear` | | | Erase the drawing. Pose, pen, mode, and color are unchanged. |
| `reset` | | | Erase the drawing and restore every start setting (home pose without drawing, pen down, line mode, cyan). |
| `repeat n [ … ]` | | count | Run the block `n` times. `n` must be a whole number ≥ 0. |
| `repcount` | | | In an expression: the current pass (1, 2, 3, …) of the innermost `repeat`. |
| `sin(a)`, `cos(a)` | | | In an expression: sine and cosine of `a` degrees (exact at multiples of 90°). |

Named colors: cyan (default), red, orange, yellow, green, blue, purple, pink, brown, white, gray,
black.

### Functional colors

Every color is normalized to one canonical form, lowercase `#rrggbb`, when `color` runs. The
components of `rgb()` and `hsv()` are expressions evaluated at that moment (so they may use
arithmetic and `repcount`); values are validated, never clamped, and errors point at the offending
component.

| Form | Ranges | Conversion |
| --- | --- | --- |
| `rgb(r, g, b)` | each channel 0–255 | Fractions round to the nearest integer (half up): `rgb(127.5, 0, 0)` = `#800000`. |
| `hsv(h, s, v)` | hue: any finite number of degrees, wrapped into [0, 360); saturation, value: percent 0–100 | Standard HSV→RGB, then scaled to 0–255 and rounded like `rgb`. `hsv(0, 100, 100)` = `#ff0000`, `hsv(120, 100, 100)` = `#00ff00`, `hsv(-120, 100, 100)` = `hsv(240, 100, 100)` = `#0000ff`, `hsv(0, 0, 50)` = `#808080`. |

To catch 0–1 notation, a saturation or value strictly between 0 and 1 is an error with a
suggestion (`hsv(0, 0.5, 1)` → "Did you mean hsv(0, 50, 100)?"); 0 and anything from 1 to 100 are
accepted. Non-finite components (for example from overflow) are errors too. Lines and triangles
keep the color that was current when they were made, as named colors always have.

The six turns come in symmetric pairs named *axis-word + direction*: `yawleft`/`yawright`,
`pitchup`/`pitchdown`, `rollleft`/`rollright`. The classic short names are aliases and behave
identically. There is deliberately no `up`/`down` alias, which is easy to confuse with
`penup`/`pendown`.

## Coordinates, units, and orientation

- **World axes** are right-handed with **Z up**: X to the right, Y ahead (away from the default
  camera), Z up. The ground grid is the plane z = 0.
- **Units**: distances are world units (the viewport shows the current grid cell size), angles are
  degrees. Any finite number is allowed, including negatives and fractions.
- **Turtle frame**: the turtle carries an orthonormal right-handed frame of three unit vectors,
  heading **H** (forward), left wing **L**, and up **U** (out of its back), with **H × L = U**. The
  right wing is **R = −L**. The playground draws these as labelled arrows on the turtle.
- **Home pose**: position (0, 0, 0), **H** = +Y, **L** = −X, **U** = +Z. A turtle that never pitches
  or rolls stays on the ground and behaves exactly like 2D Logo viewed from above, so
  `right 90` (`yawright 90`) turns clockwise as seen from above.

### Turns are intrinsic

Every turn rotates the whole frame about one of the turtle's **own current** axes. The axis is
read from the pose at the moment the command runs, never from the world axes. Positive
directions follow the right-hand rule about that axis:

| Command | Axis (current) | Direction | Frame update for angle θ |
| --- | --- | --- | --- |
| `yawleft θ` | **U** | right-hand rule about **U**: **H** → **L** (counter-clockwise seen from above the turtle) | H′ = H cos θ + L sin θ, L′ = L cos θ − H sin θ |
| `pitchup θ` | **R** = −**L** | right-hand rule about **R**: **H** → **U** (nose up) | H′ = H cos θ + U sin θ, U′ = U cos θ − H sin θ |
| `rollright θ` | **H** | right-hand rule about **H**: **L** → **U**, **U** → **R** (clockwise seen from behind) | L′ = L cos θ + U sin θ, U′ = U cos θ − L sin θ |

`yawright`, `pitchdown`, and `rollleft` are the same rotations with −θ. The axis of each turn is
unchanged by it, and position never changes.

From home: `yawleft 90` faces −X, `pitchup 90` faces +Z (with **U** = −Y), and `rollright 90` puts
the left wing up (**L** = +Z) and the back toward +X (**U** = +X).

### Composition

Because each turn uses the current axes, a turn's effect in world space depends on every earlier
turn. In matrix terms, with orientation R = [H L U], each command updates R ← R · R_local(θ), so
turns about different axes do not commute:

- `pitchup 90 yawleft 90` → nose up, then yaw about the new **U** (now −Y): **H** = −X.
- `yawleft 90 pitchup 90` → yaw to −X, then pitch about the new wing axis: **H** = +Z.
- `rollright 90 pitchup 90` → the roll turns **U** to +X, so pitching "up" heads toward world +X.

On the ground, yaw never changes **U**, so `pitchup` after any number of `yawleft`/`yawright` turns
still climbs toward world up. That is still a relative turn; it only looks absolute because **U**
happens to equal +Z. Pitch or roll first and the difference shows.

Multiples of 90° use exact sines and cosines, and the frame is re-orthonormalized after every
rotation, so squares and cubes close exactly and long programs do not drift.

## Drawing

Every move (`forward`, `back`, `setpos`, `home`) goes from the old position P to the new position
Q. Turns never draw. In triangle and tetrahedra modes a pen-down move *generates a point*: Q.

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

### Tetrahedra mode

Tetrahedra mode uses the same window rules as triangle mode (start, points, pen and mode
changes, `clear`, `reset`), but the window holds the most recent **four** points.

1. **Window start.** The turtle's position is the first point immediately after `tetrahedra`,
   `pendown` (pen was up), `clear`, `reset`, or the end of a `polygon`, while in tetrahedra mode
   with the pen down. Re-issuing `tetrahedra` starts a fresh window.
2. **Only pen-down points participate.** `penup` empties the window. Switching to `lines` or
   `triangles` empties it as well; coming back with `tetrahedra` starts fresh at the turtle, so no
   solid mixes points from different modes.
3. **Sliding window.** When the window holds four points a, b, c, d (oldest first), one closed
   tetrahedron is emitted and a is dropped; the next point e forms (b, c, d, e). n points make
   n − 3 tetrahedra.
4. **Faces and winding.** Each tetrahedron is four triangles on the vertex sets abc, abd, acd, bcd.
   Each face is wound so its right-hand normal points away from the fourth vertex, that is,
   outward. Rendering is double-sided like triangle mode.
5. **Color.** All four faces take the pen color current when the fourth point is generated.
6. **Flat windows.** Four points with (almost) no volume, |(b − a) · ((c − a) × (d − a))| ≤ 10⁻⁹ ×
   (largest edge)³, make no solid. The points still slide through the window. Skips are counted
   for the whole run and shown in the status line ("1 flat window skipped").
7. **Pending points.** Until a window first completes, its 1–3 points are pending (white dots).
8. **Independent solids.** Consecutive tetrahedra share three points, and their common face is
   drawn by both. Keeping each solid independent keeps the rule simple; the duplicate face is
   hidden inside the chain.

Example: `tetrahedra setpos 40 40 0 setpos 40 0 40 setpos 0 40 40` makes one regular tetrahedron
(the start point is the origin).

### Polygon faces

`polygon [ … ]` fills one flat face, for shapes a strip cannot express (faces with more than three
corners, non-convex faces, published coordinate data):

1. **Corners.** The turtle's position when the block starts, then the end point of every move
   inside the block (including `setpos` and moves inside `repeat`), in order. Pen state and mode do
   not matter inside the block, and nothing else is drawn there. Turns work as usual.
2. **Cleanup.** Repeated consecutive corners, a final corner equal to the first (a closed walk),
   and corners in the middle of a straight edge are dropped.
3. **Validation.** At least three corners must remain; they must be coplanar (each within 10⁻⁶ ×
   the polygon's size of the plane through the first corner with the Newell normal) and the outline must not cross itself. Otherwise a
   runtime error points at the `polygon` keyword.
4. **Filling.** The outline is ear-clipped into triangles that all share the polygon's Newell
   normal (right-hand rule over the corner order) and the color current at the closing `]`. Only
   the outline is drawn as edges, not the cutting diagonals.
5. **Isolation.** The turtle ends where the last move left it. Any triangle strip or tetrahedron
   window restarts afterwards, so separate faces never connect.
6. `polygon`, `clear`, and `reset` are not allowed inside a polygon block (syntax error).

## Errors

Errors carry a kind, a message, and a 1-based line and column. The playground underlines the span
and shows the message.

- **Syntax errors** stop the program before it runs: unknown commands or colors (with a
  "Did you mean…?" suggestion), missing inputs, extra numbers, unbalanced `[ ]` or `( )`, bad
  characters or hex colors, and `repcount` outside a `repeat`.
- **Runtime errors** stop the program where they happen and keep what was drawn so far: division by
  zero, non-whole or negative repeat counts, numbers too large to represent, color components out
  of range, polygons that are not flat or cross themselves, more than 1,000,000 steps (commands
  plus repeat passes), or more than 200,000 lines and triangles.

## Execution model

A run always starts from a fresh state (home pose, pen down, line mode, cyan, empty drawing) and
executes the whole program immediately. The playground can then replay the recorded steps at a
chosen speed or one at a time; replay never changes the result.

## Example gallery and sources

The playground's **Gallery** groups the examples by category and labels each one:

- **Exact**: reproduces a precisely defined object, up to floating-point rounding (for example the
  icosahedron's golden ratio is written as `2 * cos(36)`, and arccos(1/3)-based angles are given
  to 7 decimals).
- **Approximation**: a polygonal approximation of a smooth curve or surface (helix, trefoil,
  torus, Möbius strip, helicoid, geodesic sphere with coordinates rounded to 0.001).
- **Artistic** and **Lesson**: designs, and small programs that teach one idea.

Unit tests run every example, snapshot its counts and bounding box, and check exact models
independently (icosahedron edges, cube edges, Hilbert lattice coverage, regular tetrahedra, and
the genus-3 model below).

**Mizhaev genus-3 polyhedron.** R. Mizhaev, "Integer Realization of an Equivelar Octahedron of
Genus 3", arXiv:2609.17700 (2026), <https://doi.org/10.48550/arXiv.2609.17700> (popular account:
[Gizmodo](https://gizmodo.com/a-mathematician-discovered-a-new-eight-faced-shape-it-looks-like-a-glitch-in-reality-2000818219),
which misprints the edge count as 26). The example uses the paper's integer vertex coordinates
(Table 1) and face walks (Table 2) verbatim, one `polygon` of `setpos` corners per face. Tests check
the drawn result against the paper: 8 nonagons, 24 vertices, 36 edges each shared by exactly two
faces, Euler characteristic 24 − 36 + 8 = −4 (genus 3), every corner exactly on its face's
published plane, every pair of faces sharing an edge, and triangles that tile each non-convex face
exactly.

**3D Hilbert curve.** L-system from P. Prusinkiewicz and A. Lindenmayer, *The Algorithmic Beauty of
Plants* (1990), p. 20, expanded two levels (64 lattice points).
