import { CATEGORIES, EXAMPLES, type Accuracy, type Example } from '../examples';
import type { Drawing } from '../geometry/drawing';
import { runSource, type RunResult } from '../interpreter/interpreter';
import type { Statement } from '../lang/ast';
import { parse } from '../lang/parser';
import { dot, type Vec3 } from '../turtle/vec';
import { SCREEN_RIGHT, SCREEN_UP, VIEW } from './diagrams';

export const ACCURACY_LABELS: Record<Accuracy, { label: string; title: string }> = {
  exact: { label: 'Exact', title: 'Reproduces a precisely defined object (up to floating-point rounding)' },
  approximation: { label: 'Approximation', title: 'A polygonal approximation of a smooth curve or surface' },
  artistic: { label: 'Artistic', title: 'A design, not a model of a specific object' },
  lesson: { label: 'Lesson', title: 'A small program that teaches one idea' },
};

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Commands written in the source (each repeat and polygon counts as one, plus its body). */
export function commandCount(body: readonly Statement[]): number {
  return body.reduce((n, s) => n + 1 + (s.kind === 'command' ? 0 : commandCount(s.body)), 0);
}

export function badge(accuracy: Accuracy): string {
  const { label, title } = ACCURACY_LABELS[accuracy];
  return `<span class="badge badge-${accuracy}" title="${title}">${label}</span>`;
}

/** A small flat-shaded SVG of a drawing, seen from the default camera direction. */
export function thumbnail(drawing: Drawing, size = 132): string {
  const project = (p: Vec3) => [dot(p, SCREEN_RIGHT), -dot(p, SCREEN_UP), dot(p, VIEW)] as const;
  const items: { depth: number; svg: (map: (p: Vec3) => string) => string }[] = [];
  const pts: (readonly [number, number, number])[] = [];
  for (const s of drawing.segments) {
    if (s.alpha === 0) continue;
    const [a, b] = [project(s.a), project(s.b)];
    pts.push(a, b);
    items.push({ depth: Math.max(a[2], b[2]) + 1e-3, svg: (m) => `<path d="M${m(s.a)}L${m(s.b)}" stroke="${s.color}" stroke-opacity="${s.alpha}"/>` });
  }
  for (const t of drawing.triangles) {
    if (t.alpha === 0) continue;
    const corners = [t.a, t.b, t.c].map(project);
    pts.push(...corners);
    // Double-sided: light whichever side faces the viewer.
    const facing = Math.abs(dot(t.normal, VIEW));
    const opacity = ((0.45 + 0.55 * facing) * t.alpha).toFixed(2);
    items.push({
      depth: (corners[0][2] + corners[1][2] + corners[2][2]) / 3,
      svg: (m) => `<path d="M${m(t.a)}L${m(t.b)}L${m(t.c)}Z" fill="${t.color}" fill-opacity="${opacity}" stroke="#0b1020" stroke-opacity="0.35"/>`,
    });
  }
  if (!pts.length) return '';
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const extent = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1e-9);
  const pad = 8;
  const k = (size - 2 * pad) / extent;
  const ox = pad + (size - 2 * pad - (Math.max(...xs) - minX) * k) / 2;
  const oy = pad + (size - 2 * pad - (Math.max(...ys) - minY) * k) / 2;
  const map = (p: Vec3) => {
    const [x, y] = project(p);
    return `${((x - minX) * k + ox).toFixed(1)} ${((y - minY) * k + oy).toFixed(1)}`;
  };
  const body = items
    .sort((a, b) => a.depth - b.depth)
    .map((i) => i.svg(map))
    .join('');
  return `<svg class="thumb" viewBox="0 0 ${size} ${size}" aria-hidden="true" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" fill="none">${body}</svg>`;
}

function statsText(example: Example, result: RunResult): string {
  const { drawing } = result;
  const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
  const parts = [count(commandCount(parse(example.code).body), 'command'), count(result.steps, 'step')];
  if (drawing.segments.length) parts.push(count(drawing.segments.length, 'line'));
  if (drawing.tetrahedra) parts.push(count(drawing.tetrahedra, 'tetrahedron', 'tetrahedra'));
  else if (drawing.triangles.length) parts.push(count(drawing.triangles.length, 'triangle'));
  return parts.join(' · ');
}

function card(example: Example): string {
  const result = runSource(example.code);
  const source = example.source
    ? `<a class="card-source" href="${escape(example.source.url)}" target="_blank" rel="noopener">Source: ${escape(example.source.label)}</a>`
    : '';
  return `
    <li class="card">
      <button class="card-open" type="button" data-example="${example.id}" aria-describedby="card-${example.id}-d">
        ${thumbnail(result.drawing)}
        <span class="card-title">${escape(example.title)}</span>
      </button>
      <div class="card-meta">${badge(example.accuracy)} <span class="card-stats">${statsText(example, result)}</span></div>
      <p class="card-desc" id="card-${example.id}-d">${escape(example.description)}</p>
      ${source}
    </li>`;
}

/** The gallery dialog body: one section per category. Runs every example once to draw thumbnails. */
export function galleryHtml(): string {
  const legend = (Object.keys(ACCURACY_LABELS) as Accuracy[])
    .map((a) => `<li>${badge(a)} ${ACCURACY_LABELS[a].title}</li>`)
    .join('');
  const sections = CATEGORIES.map((category) => {
    const examples = EXAMPLES.filter((e) => e.category === category);
    return `<section class="gallery-section" aria-labelledby="gal-${category.replace(/\W+/g, '-')}">
      <h3 id="gal-${category.replace(/\W+/g, '-')}">${escape(category)}</h3>
      <ul class="cards">${examples.map(card).join('')}</ul>
    </section>`;
  }).join('');
  return `<ul class="legend">${legend}</ul>${sections}`;
}
