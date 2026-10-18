# 3D Logo Playground

A small, teachable 3D version of Logo with an interactive browser playground. Drive a turtle
through space with six turtle-relative turns (`yawleft`/`yawright`, `pitchup`/`pitchdown`,
`rollleft`/`rollright`, with classic aliases such as `left`, `right`, `climb`, `dive`) and draw
lines, triangle strips, closed tetrahedra, or flat `polygon` faces, in named, hex, `rgb()`,
`hsv()`, or translucent `rgba()` / `hsva()` colors. A gallery of 39 examples ranges from turning lessons to exact polyhedra, including
the eight-faced genus-3 polyhedron from R. Mizhaev's 2026 paper.

```logo
; A wire cube: a vertical square (pitchup) on each side of a ground square (yawright).
repeat 4 [
  repeat 4 [ forward 60 pitchup 90 ]
  forward 60 yawright 90
]
```

The language reference, grammar, coordinate model, exact drawing rules, and example sources are in
[docs/LANGUAGE.md](docs/LANGUAGE.md).

## Quick start

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

In the playground: edit code (Live mode reruns as you type), press **Run** or Ctrl/⌘ + Enter, pick a
speed to watch the turtle replay its steps, or use **Step** to go one command at a time. Open
**Gallery** for categorized examples (with Exact / Approximation / Artistic / Lesson labels,
sources, and stats) or pick one from the header menu, and open **Help** for the reference.

Camera: drag to orbit, right-drag or Shift-drag to pan, scroll to zoom. Click or Tab into the view
to fly with the keyboard: W/S forward/back along the view, A/D strafe, E/Q up/down along world Z,
Shift for 3× speed, Esc to leave (keys are matched by physical position; synthetic or remote
events without a key code fall back to the letter). Unlike the wheel, which dollies toward the
orbit target, flight moves the orbit target with the camera by the same vector, so a later drag
orbits around the point in front of you without snapping. Speed scales with the framed scene and
is frame-rate independent; held keys are dropped on blur, tab switch, or when a dialog opens.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Typecheck and production build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests (Playwright) against the production build |
| `pnpm check` | All of the above |

Browser tests use `PLAYWRIGHT_CHROMIUM_PATH` if set, otherwise the Chrome bundled with
agent-browser (present in Amp orbs), otherwise Playwright's own Chromium
(`pnpm exec playwright install chromium`).

## Deployment

Every push to `main` deploys to GitHub Pages at <https://tpd-with-ai.github.io/3d-logo/> via
[.github/workflows/pages.yml](.github/workflows/pages.yml): lint, unit tests, production build,
browser tests against that build, then upload and deploy. The workflow sets `BASE_PATH` to the
Pages subpath (`/3d-logo/`); without it, `dev`, `build`, and `preview` serve from `/`. To try the
Pages build locally: `BASE_PATH=/3d-logo/ pnpm build && BASE_PATH=/3d-logo/ pnpm preview`, then
open `/3d-logo/`.

## Architecture

Each layer depends only on the ones above it, so language semantics are testable without a
browser.

```
src/lang/          lexer.ts → parser.ts → ast.ts       source → AST, syntax errors with spans
                   commands.ts                         command table (names, aliases, inputs, help)
src/turtle/        vec.ts, turtle.ts                   pose and intrinsic yaw/pitch/roll (current axes)
src/geometry/      drawing.ts, polygon.ts              segments, triangle strips, tetrahedra, polygon faces
src/interpreter/   interpreter.ts, color.ts            runs the AST, repeat/repcount, limits, frames; rgb/hsv
src/render/        drawingLayer.ts, turtleModel.ts,    three.js scene; owns and disposes GPU resources
                   viewport.ts, fly.ts                 keyboard flight (pure, unit-tested)
src/ui/            editor.ts, app.ts, help.ts,         CodeMirror editor, controls, playback, Help
                   diagrams.ts, gallery.ts             Help SVGs (posed by turtle.ts); gallery cards
src/examples.ts, src/gallery/                          example programs; generated data-heavy ones
```

- **Immediate execution.** `runSource` parses and runs the whole program synchronously and
  returns the drawing, final turtle state, and one frame per executed command. Animation and
  stepping only replay those frames by changing visible ranges, so they cannot change results.
- **No leaks between runs.** `DrawingLayer` disposes the previous run's buffers before building
  new ones and shares materials across runs. Unit tests check disposal; a browser test checks that
  the renderer's GPU geometry and texture counts stay flat across repeated runs.
- **Help stays in sync.** The in-app reference is generated from the same command table the
  parser uses, its turn diagrams are posed with the real turn functions, and its "Try it"
  snippets are the "Turning basics" examples, which unit tests run.

## Known limitations

- No variables, procedures, or conditionals, by design. `repeat`, `repcount`, and arithmetic cover
  the examples.
- Triangle mode makes strips only. Fans and disconnected triangles need `penup`/`pendown` (or
  `triangles`) to restart the strip, or a `polygon` per face.
- `repcount` only sees the innermost `repeat` (no outer index), so the torus is drawn as rings, not
  a surface.
- Only `sin` and `cos` are built in; other constants are written out (for example arccos(1/3)
  angles to 7 decimals).
- `polygon` needs flat, non-self-crossing outlines. Consecutive tetrahedra are independent, so a
  shared face is drawn twice (hidden inside the chain).
- Translucent faces are sorted per batch, not per triangle, so overlapping translucent shapes can
  blend in a slightly wrong order from some angles.
- Line width and lighting are fixed by the renderer, not the language.
