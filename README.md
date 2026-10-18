# 3D Logo Playground

A small, teachable 3D version of Logo with an interactive browser playground. Drive a turtle
through space with yaw, pitch, and roll, and draw either lines or triangle strips.

```logo
; A wire cube: a vertical square (climb) on each side of a ground square (right).
repeat 4 [
  repeat 4 [ forward 60 climb 90 ]
  forward 60 right 90
]
```

The language reference, grammar, coordinate model, and exact triangle rules are in
[docs/LANGUAGE.md](docs/LANGUAGE.md).

## Quick start

```sh
pnpm install
pnpm dev        # http://localhost:5173
```

In the playground: edit code (Live mode reruns as you type), press **Run** or Ctrl/⌘ + Enter, pick a
speed to watch the turtle replay its steps, or use **Step** to go one command at a time. Load
examples from the header and open **Help** for the reference.

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

## Architecture

Each layer depends only on the ones above it, so language semantics are testable without a
browser.

```
src/lang/          lexer.ts → parser.ts → ast.ts       source → AST, syntax errors with spans
                   commands.ts                         command table (names, aliases, inputs, help)
src/turtle/        vec.ts, turtle.ts                   pose and intrinsic yaw/pitch/roll
src/geometry/      drawing.ts                          line segments, triangle strips, pending points
src/interpreter/   interpreter.ts                      runs the AST, repeat/repcount, limits, frames
src/render/        drawingLayer.ts, turtleModel.ts,    three.js scene; owns and disposes GPU resources
                   viewport.ts
src/ui/            editor.ts, app.ts, help.ts          CodeMirror editor, controls, playback
src/examples.ts                                        example programs
```

- **Immediate execution.** `runSource` parses and runs the whole program synchronously and
  returns the drawing, final turtle state, and one frame per executed command. Animation and
  stepping only replay those frames by changing visible ranges, so they cannot change results.
- **No leaks between runs.** `DrawingLayer` disposes the previous run's buffers before building
  new ones and shares materials across runs. Unit tests check disposal; a browser test checks that
  the renderer's GPU geometry and texture counts stay flat across repeated runs.
- **Help stays in sync.** The in-app reference is generated from the same command table the
  parser uses.

## Known limitations

- No variables, procedures, or conditionals, by design. `repeat`, `repcount`, and arithmetic cover
  the examples.
- Triangle mode makes strips only. Fans and disconnected triangles need `penup`/`pendown` (or
  `triangles`) to restart the strip.
- No functions such as `sqrt` or `sin`, so some shapes need precomputed constants (for example
  109.47° in the tetrahelix example).
- Line width and lighting are fixed by the renderer, not the language.
