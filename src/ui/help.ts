import { COMMANDS, NAMED_COLORS } from '../lang/commands';

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Builds the concise in-app reference from the command table so it always matches the parser. */
export function helpHtml(): string {
  const groups = new Map<string, string[]>();
  for (const c of COMMANDS) {
    const usage = `${c.name}${c.arg === 'none' ? '' : ` <i>${c.arg}</i>`}`;
    const aliases = c.aliases.length ? ` <span class="alias">(${c.aliases.join(', ')})</span>` : '';
    const row = `<tr><td><code>${usage}</code>${aliases}</td><td>${escape(c.summary)}</td></tr>`;
    groups.set(c.group, [...(groups.get(c.group) ?? []), row]);
  }
  const tables = [...groups]
    .map(([group, rows]) => `<h3>${group}</h3><table><tbody>${rows.join('')}</tbody></table>`)
    .join('');
  const swatches = Object.entries(NAMED_COLORS)
    .map(([name, hex]) => `<span class="swatch"><span style="background:${hex}"></span>${name}</span>`)
    .join('');

  return `
    <p>Distances are world units (one grid cell is shown in the corner readout); angles are degrees.
    Words are case-insensitive, whitespace and newlines are interchangeable, and <code>;</code> starts a comment.</p>

    <h3>Axes and orientation</h3>
    <p>World axes are right-handed with <b>Z up</b>: <span class="ax-x">X</span> right,
    <span class="ax-y">Y</span> ahead, <span class="ax-z">Z</span> up. The turtle starts at the origin
    with heading <b>H = +Y</b>, left wing <b>L = −X</b>, and up <b>U = +Z</b>, so 2D Logo programs draw on the ground.
    Every turn rotates about the turtle's <em>own</em> current axes, so order matters:
    <code>climb 90 left 90</code> ≠ <code>left 90 climb 90</code>.</p>
    ${tables}

    <h3>Repeat and numbers</h3>
    <table><tbody>
      <tr><td><code>repeat <i>n</i> [ … ]</code></td><td>Run the block n times (n must be a whole number ≥ 0).</td></tr>
      <tr><td><code>repcount</code></td><td>Current pass of the innermost repeat: 1, 2, 3, …</td></tr>
      <tr><td><code>+ − * / ( )</code></td><td>Arithmetic in any input, e.g. <code>forward repcount * 2</code>.</td></tr>
    </tbody></table>

    <h3>Triangle mode</h3>
    <ul>
      <li><code>triangles</code> starts a strip at the turtle's position. Each pen-down move adds a point;
      every point after the second makes a triangle with the two before it.</li>
      <li>Turns and pen-up moves add no points. <code>penup</code> ends the strip; <code>pendown</code> starts a new one where the turtle is.</li>
      <li>A triangle takes the color current when its third point is made. Leftover points (white dots) do not draw.</li>
    </ul>

    <h3>Colors</h3>
    <p class="swatches">${swatches}</p>
    <p>Or any hex value: <code>color #ff8800</code>, <code>color #f80</code>.</p>
  `;
}
