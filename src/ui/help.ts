import { COMMANDS, NAMED_COLORS } from '../lang/commands';
import { EXAMPLES } from '../examples';
import { MIZHAEV_SOURCE } from '../gallery/mizhaev';
import { axesDiagram, tetraWindowDiagram, turnDiagram, type TurnKind } from './diagrams';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function snippet(id: string, label: string): string {
  const example = EXAMPLES.find((e) => e.id === id);
  if (!example) throw new Error(`missing example ${id}`);
  return `<pre class="snippet"><code>${escape(example.code.trim())}</code></pre>
    <button class="btn btn-small try" type="button" data-example="${id}" aria-label="Try the ${label} example in the editor">▶ Try it</button>`;
}

const TURNS: { kind: TurnKind; title: string; axis: string; rows: [string, string, string][]; example: string }[] = [
  {
    kind: 'yaw',
    title: 'Yaw',
    axis: '<b class="ax-u">U</b>, the turtle’s up axis',
    rows: [
      ['yawleft', 'left, lt', 'nose swings toward <b class="ax-l">L</b> (counter-clockwise seen from above the turtle)'],
      ['yawright', 'right, rt', 'nose swings toward the right wing (clockwise)'],
    ],
    example: 'turn-yaw',
  },
  {
    kind: 'pitch',
    title: 'Pitch',
    axis: 'the wing line <b class="ax-l">L</b>–R',
    rows: [
      ['pitchup', 'climb', 'nose rises toward <b class="ax-u">U</b>'],
      ['pitchdown', 'dive', 'nose drops away from <b class="ax-u">U</b>'],
    ],
    example: 'turn-pitch',
  },
  {
    kind: 'roll',
    title: 'Roll',
    axis: '<b class="ax-h">H</b>, the heading',
    rows: [
      ['rollleft', 'rl', 'left wing drops (counter-clockwise seen from behind)'],
      ['rollright', 'rr', 'right wing drops (clockwise seen from behind)'],
    ],
    example: 'turn-roll',
  },
];

function turnsHtml(): string {
  return TURNS.map(
    (t) => `
    <figure class="turn-card">
      <figcaption><h4>${t.title}</h4><span class="turn-axis">Axis: ${t.axis}</span></figcaption>
      ${turnDiagram(t.kind)}
      <p class="diagram-key">Dashed ghost: before · solid: after <code>${t.rows[t.kind === 'roll' ? 1 : 0][0]} 40</code></p>
      <table><tbody>${t.rows
        .map(([name, aliases, effect]) => `<tr><td><code>${name}</code><br><span class="alias">${aliases}</span></td><td>${effect}</td></tr>`)
        .join('')}</tbody></table>
      ${snippet(t.example, t.title)}
    </figure>`,
  ).join('');
}

/** Builds the in-app reference. Command tables come from the parser's command table. */
export function helpHtml(): string {
  const groups = new Map<string, string[]>();
  for (const c of COMMANDS) {
    const usage = `${c.name}${c.arg === 'none' ? '' : ` <i>${c.arg}</i>`}`;
    const aliases = c.aliases.length ? ` <span class="alias">(${c.aliases.join(', ')})</span>` : '';
    const row = `<tr><td><code>${usage}</code>${aliases}</td><td>${escape(c.summary)}</td></tr>`;
    groups.set(c.group, [...(groups.get(c.group) ?? []), row]);
  }
  const tables = [...groups]
    .map(([group, rows]) => `<h3>${group}</h3><table class="ref"><tbody>${rows.join('')}</tbody></table>`)
    .join('');
  const swatches = Object.entries(NAMED_COLORS)
    .map(([name, hex]) => `<span class="swatch"><span style="background:${hex}"></span>${name}</span>`)
    .join('');

  return `
    <h3>The turtle’s own axes</h3>
    <div class="axes-guide">
      ${axesDiagram()}
      <dl class="axes-list">
        <dt class="ax-h">H · heading</dt><dd>Where the nose points. <code>forward</code> moves along H.</dd>
        <dt class="ax-l">L · left wing</dt><dd>Out of the left wing (red light). The right wing R (green light) is −L.</dd>
        <dt class="ax-u">U · up</dt><dd>Out of the turtle’s back.</dd>
      </dl>
    </div>
    <p>These axes ride on the turtle (shown in the 3D view; toggle <b>Axes</b>). <b>Every turn rotates about one
    of them as it is right now</b>, never about the world X/Y/Z, so each turn changes what the next one does.
    At the start H = +Y, L = −X, U = +Z: the turtle sits on the ground and classic Logo works unchanged.</p>

    <h3>Six relative turns</h3>
    <p class="note">Angles are degrees. A negative angle turns the other way: <code>yawleft -30</code> = <code>yawright 30</code>.
    <b>Try it</b> replaces the editor text (Ctrl/⌘+Z brings yours back) and replays the steps.</p>
    <div class="turn-cards">${turnsHtml()}</div>

    <h3>Turns are relative: order matters</h3>
    <div class="combined">
      <div>
        <p>On the ground, U points straight up and yaw never changes it, so after any <code>yawleft</code>
        or <code>yawright</code>, <code>pitchup</code> still climbs straight up. Pitch or roll first and
        "up" means something else:</p>
        <ul>
          <li><code>pitchup 90 yawleft 90</code>: the yaw spins about the <em>new</em> U, so the turtle ends pointing −X.</li>
          <li><code>yawleft 90 pitchup 90</code>: same turns, other order: the turtle ends pointing up.</li>
          <li><code>rollright 90 pitchup 90</code>: the roll tipped U toward +X, so "up" is now world right.</li>
        </ul>
      </div>
      <div>${snippet('turn-order', 'order matters')}</div>
    </div>

    <h3>Basics</h3>
    <p>Distances are world units (the corner readout shows the grid cell size). Words are case-insensitive,
    whitespace and newlines are interchangeable, and <code>;</code> starts a comment.
    World axes: <span class="ax-x">X</span> right, <span class="ax-y">Y</span> ahead, <span class="ax-z">Z</span> up.</p>
    ${tables}

    <h3>Repeat and numbers</h3>
    <table class="ref"><tbody>
      <tr><td><code>repeat <i>n</i> [ … ]</code></td><td>Run the block n times (n must be a whole number ≥ 0).</td></tr>
      <tr><td><code>repcount</code></td><td>Current pass of the innermost repeat: 1, 2, 3, …</td></tr>
      <tr><td><code>+ − * / ( )</code></td><td>Arithmetic in any input, e.g. <code>forward repcount * 2</code>.</td></tr>
      <tr><td><code>sin(<i>deg</i>)</code> <code>cos(<i>deg</i>)</code></td><td>Sine and cosine of an angle in degrees, e.g. <code>forward 50 * sin(30)</code>.</td></tr>
    </tbody></table>
    <p class="note">A minus sign glued to a number after a space starts a new input, as in UCBLogo:
    <code>setpos 10 -5 0</code> is three inputs. Write <code>10 - 5</code> or <code>10-5</code> to subtract.</p>

    <h3>Drawing modes</h3>
    <p>Every pen-down move generates one point: where the turtle ends up. The mode decides what the points draw.
    Turns and pen-up moves generate no points.</p>
    <table class="ref"><tbody>
      <tr><td><code>lines</code></td><td>Each move draws a segment from where it started to where it ended (the default).</td></tr>
      <tr><td><code>triangles</code></td><td>A sliding window of the last <b>3</b> points: each new point after the second makes a triangle with the two before it (a strip).</td></tr>
      <tr><td><code>tetrahedra</code></td><td>A sliding window of the last <b>4</b> points: each new point after the third makes a closed tetrahedron with the three before it.</td></tr>
    </tbody></table>
    <div class="axes-guide">
      ${tetraWindowDiagram()}
      <ul class="window-list">
        <li>Points 1–4 make faces <b>123, 124, 134, 234</b>, each turned to face outward.</li>
        <li>Point 5 drops point 1: the next solid is 2–5. Neighbours share three points and are drawn as separate solids.</li>
        <li>Four flat points make no solid; the status line counts them as skipped.</li>
      </ul>
    </div>
    <ul>
      <li>The window starts with the turtle’s position when you choose <code>triangles</code> or <code>tetrahedra</code>,
      and again after <code>pendown</code>, <code>clear</code>, <code>reset</code>, or a <code>polygon</code>. <code>penup</code> or switching mode empties it, so shapes never join across a mode change.</li>
      <li>A triangle or tetrahedron takes the color current when its last point is made. Points still waiting for a full window are shown as white dots and draw nothing.</li>
    </ul>
    ${snippet('tetra-single', 'one tetrahedron')}

    <h3>Faces and exact points</h3>
    <table class="ref"><tbody>
      <tr><td><code>polygon [ … ]</code></td><td>Fill one flat face. Its corners are the turtle’s start position and the end of every move inside the brackets
      (pen and mode do not matter there). The corners must lie in one plane and the outline must not cross itself. Only the outline is drawn as edges.</td></tr>
      <tr><td><code>setpos <i>x y z</i></code></td><td>Move straight to a world point; it draws like any move and keeps the orientation. Handy for data such as published coordinates.</td></tr>
    </tbody></table>
    <p class="note">The gallery’s <b>Mizhaev genus-3 polyhedron</b> uses both: eight flat nonagons from the integer coordinates in
    ${MIZHAEV_SOURCE.author}, <a href="${MIZHAEV_SOURCE.url}" target="_blank" rel="noopener">“${MIZHAEV_SOURCE.title}”, ${MIZHAEV_SOURCE.arxiv}</a>.</p>

    <h3>Colors</h3>
    <p class="swatches">${swatches}</p>
    <table class="ref"><tbody>
      <tr><td><code>color #ff8800</code> or <code>#f80</code></td><td>Hex, 6 or 3 digits.</td></tr>
      <tr><td><code>color rgb(<i>r</i>, <i>g</i>, <i>b</i>)</code></td><td>Red, green, blue from <b>0 to 255</b>; fractions round to the nearest whole number.</td></tr>
      <tr><td><code>color hsv(<i>h</i>, <i>s</i>, <i>v</i>)</code></td><td>Hue in degrees (wraps: 360 = 0, −30 = 330); saturation and value in <b>percent, 0 to 100</b>.</td></tr>
    </tbody></table>
    <p class="note">Components may be any arithmetic, so <code>repeat 18 [ color hsv(repcount * 20, 80, 100) forward 10 yawright 20 ]</code> draws a rainbow.
    Out-of-range components are errors, and a value between 0 and 1 for saturation or value is rejected because 0–100 is expected.</p>

    <h3>Moving the camera</h3>
    <table class="ref"><tbody>
      <tr><td>Mouse / touch</td><td>Drag to orbit, right-drag or Shift-drag (two fingers on touch) to pan, scroll or pinch to zoom.</td></tr>
      <tr><td>Fly <span class="alias">(view focused)</span></td><td>Click the view or Tab to it, then hold <kbd>W</kbd>/<kbd>S</kbd> to fly forward/back along your view,
      <kbd>A</kbd>/<kbd>D</kbd> to slide left/right, <kbd>E</kbd>/<kbd>Q</kbd> to rise/sink. Hold <kbd>Shift</kbd> to go 3× faster.
      The orbit centre travels with you, so dragging afterwards orbits around the spot in front of you. <kbd>Esc</kbd> or <kbd>Tab</kbd> leaves the view.</td></tr>
      <tr><td>Other keys</td><td>Arrows pan, Shift+arrows orbit, <kbd>+</kbd>/<kbd>−</kbd> zoom, <kbd>F</kbd> fits the drawing.</td></tr>
    </tbody></table>
  `;
}
