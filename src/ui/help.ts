import { COMMANDS, NAMED_COLORS } from '../lang/commands';
import { EXAMPLES } from '../examples';
import { axesDiagram, turnDiagram, type TurnKind } from './diagrams';

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
    </tbody></table>

    <h3>Triangle mode</h3>
    <ul>
      <li><code>triangles</code> starts a strip at the turtle’s position. Each pen-down move adds a point;
      every point after the second makes a triangle with the two before it.</li>
      <li>Turns and pen-up moves add no points. <code>penup</code> ends the strip; <code>pendown</code> starts a new one where the turtle is.</li>
      <li>A triangle takes the color current when its third point is made. Leftover points (white dots) do not draw.</li>
    </ul>

    <h3>Colors</h3>
    <p class="swatches">${swatches}</p>
    <p>Or any hex value: <code>color #ff8800</code>, <code>color #f80</code>.</p>
  `;
}
