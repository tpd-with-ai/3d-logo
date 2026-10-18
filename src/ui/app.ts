import { drawingBounds } from '../geometry/drawing';
import { runSource, type Frame, type RunResult } from '../interpreter/interpreter';
import { HOME_POSE, type Pose } from '../turtle/turtle';
import type { Vec3 } from '../turtle/vec';
import { EXAMPLES } from '../examples';
import { Viewport } from '../render/viewport';
import { Editor } from './editor';
import { badge, galleryHtml } from './gallery';
import { helpHtml } from './help';

const STORAGE_KEY = '3d-logo:code';
const LIVE_DELAY_MS = 300;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (n: number) => String(Math.round(n * 100) / 100 + 0);
const fmtVec = (v: Vec3) => `(${fmt(v.x)}, ${fmt(v.y)}, ${fmt(v.z)})`;
const plural = (n: number, word: string) => `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;

interface Playback {
  result: RunResult;
  /** Index of the last frame shown; -1 before the first. */
  index: number;
  playing: boolean;
  rafId: number;
  lastTime: number;
  budget: number;
}

/** Wires the editor, interpreter, and viewport together. Owns no language semantics. */
export class App {
  private readonly editor: Editor;
  private readonly viewport: Viewport;
  private readonly ui = {
    run: $<HTMLButtonElement>('run'),
    step: $<HTMLButtonElement>('step'),
    stop: $<HTMLButtonElement>('stop'),
    speed: $<HTMLSelectElement>('speed'),
    live: $<HTMLInputElement>('live'),
    examples: $<HTMLSelectElement>('examples'),
    status: $('status'),
    error: $('error'),
    errorText: $('error-text'),
    hud: $('hud'),
    exampleInfo: $('example-info'),
    viewport: $('viewport'),
  };
  private result?: RunResult;
  private playback?: Playback;
  private liveTimer = 0;
  /** Bounds of what is currently drawn, for Fit / Reset view. */
  private bounds: ReturnType<typeof drawingBounds> = null;

  constructor() {
    this.viewport = new Viewport(this.ui.viewport);
    const saved = localStorage.getItem(STORAGE_KEY);
    this.editor = new Editor({
      parent: $('editor'),
      doc: saved ?? EXAMPLES.find((e) => e.id === 'square')!.code,
      label: 'Logo program',
      onRun: () => this.run(true),
      onStop: () => this.stop(),
      onChange: (doc) => this.onEdit(doc),
    });

    this.ui.examples.add(new Option('— choose —', ''));
    for (const group of new Set(EXAMPLES.map((e) => e.category))) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group;
      for (const example of EXAMPLES.filter((e) => e.category === group)) optgroup.append(new Option(example.title, example.id));
      this.ui.examples.append(optgroup);
    }
    this.ui.examples.value = '';

    this.bindControls();
    // GPU resource counts and camera state for browser tests (e2e/app.spec.ts).
    Object.assign(window, { __logo3d: { memory: () => this.viewport.memory(), camera: () => this.viewport.cameraState(), ndcExtent: () => this.viewport.ndcExtent(this.bounds) } });
    $('help-body').innerHTML = helpHtml();
    this.run(false, true);
    this.viewport.resetCamera(this.bounds);
  }

  private bindControls(): void {
    const { ui } = this;
    ui.run.addEventListener('click', () => this.run(true));
    ui.step.addEventListener('click', () => this.step());
    ui.stop.addEventListener('click', () => this.stop());
    ui.examples.addEventListener('change', () => this.loadExample(ui.examples.value));
    $('fit').addEventListener('click', () => this.viewport.frame(this.bounds));
    $('reset-view').addEventListener('click', () => this.viewport.resetCamera(this.bounds));
    $('zoom-in').addEventListener('click', () => this.viewport.zoom(0.8));
    $('zoom-out').addEventListener('click', () => this.viewport.zoom(1.25));
    $<HTMLInputElement>('guides').addEventListener('change', (e) =>
      this.viewport.setGuidesVisible((e.target as HTMLInputElement).checked),
    );
    $<HTMLInputElement>('turtle-axes').addEventListener('change', (e) =>
      this.viewport.setTurtleAxesVisible((e.target as HTMLInputElement).checked),
    );
    $('clear').addEventListener('click', () => this.clearView());
    $('error-jump').addEventListener('click', () => {
      if (this.result?.error) this.editor.reveal(this.result.error.span);
    });

    ui.viewport.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Escape') ui.viewport.blur();
      else if (event.key === '+' || event.key === '=') this.viewport.zoom(0.8);
      else if (event.key === '-' || event.key === '_') this.viewport.zoom(1.25);
      else if (event.key.toLowerCase() === 'f') this.viewport.frame(this.bounds);
      else return;
      event.preventDefault();
    });

    const help = $<HTMLDialogElement>('help');
    $('help-open').addEventListener('click', () => {
      this.viewport.stopFlying();
      help.showModal();
    });
    $('help-close').addEventListener('click', () => help.close());
    help.addEventListener('click', (event) => {
      if (event.target === help) return help.close();
      // "Try it" buttons replay a mini-example at Medium speed so the turns are visible.
      const id = (event.target as HTMLElement).closest<HTMLElement>('[data-example]')?.dataset.example;
      if (!id) return;
      help.close();
      this.loadExample(id, 40);
    });

    const gallery = $<HTMLDialogElement>('gallery');
    $('gallery-open').addEventListener('click', () => {
      this.viewport.stopFlying();
      const body = $('gallery-body');
      if (!body.childElementCount) body.innerHTML = galleryHtml(); // runs every example once, so only on demand
      gallery.showModal();
    });
    $('gallery-close').addEventListener('click', () => gallery.close());
    gallery.addEventListener('click', (event) => {
      if (event.target === gallery) return gallery.close();
      const id = (event.target as HTMLElement).closest<HTMLElement>('button[data-example]')?.dataset.example;
      if (!id) return;
      gallery.close();
      this.loadExample(id);
    });
  }

  private loadExample(id: string, speed?: number): void {
    const example = EXAMPLES.find((e) => e.id === id);
    if (!example) return;
    this.editor.setDoc(example.code);
    this.ui.examples.value = id; // setDoc's edit handler resets the picker and hides the info bar
    const source = example.source
      ? ` <a href="${example.source.url}" target="_blank" rel="noopener">Source</a>`
      : '';
    this.ui.exampleInfo.innerHTML = `${badge(example.accuracy)} <b>${example.title}</b> <span>${example.description}${source}</span>`;
    this.ui.exampleInfo.hidden = false;
    this.run(true, true, true, speed);
  }

  private onEdit(doc: string): void {
    localStorage.setItem(STORAGE_KEY, doc);
    this.ui.examples.value = '';
    this.ui.exampleInfo.hidden = true;
    if (this.playback) this.stop();
    window.clearTimeout(this.liveTimer);
    if (this.ui.live.checked) this.liveTimer = window.setTimeout(() => this.run(false), LIVE_DELAY_MS);
  }

  /**
   * Runs the program. The interpreter always executes immediately; `animate` only controls
   * whether the finished run is replayed frame by frame at the chosen speed.
   */
  run(animate: boolean, refit = animate, resetCamera = false, speedOverride?: number): void {
    window.clearTimeout(this.liveTimer);
    this.cancelPlayback();
    const started = performance.now();
    const result = runSource(this.editor.doc);
    const elapsed = performance.now() - started;
    this.result = result;
    this.editor.showError(result.error);
    this.showError(result);

    // A syntax error leaves the last good drawing on screen (dimmed) so live editing does not flicker.
    const stale = result.error?.kind === 'syntax';
    this.ui.viewport.classList.toggle('is-stale', stale);
    if (stale) {
      this.setStatus('Fix the error to run.');
      return;
    }

    this.viewport.drawing.setPrimitives(result.allSegments, result.allTriangles);
    const speed = speedOverride ?? Number(this.ui.speed.value);
    if (animate && speed > 0 && result.frames.length > 0 && !result.framesTruncated) {
      if (resetCamera) this.viewport.resetCamera(drawingBounds(result.drawing));
      this.startPlayback(result, true, speed);
      return;
    }
    this.showFinal(result, refit, resetCamera, elapsed);
  }

  /** Advances one command. Starts a paused replay of the current program if none is active. */
  private step(): void {
    if (!this.playback) {
      this.run(false);
      const result = this.result;
      if (!result || result.error?.kind === 'syntax' || result.frames.length === 0) return;
      this.startPlayback(result, false, 0);
    }
    const playback = this.playback;
    if (!playback) return;
    playback.playing = false;
    cancelAnimationFrame(playback.rafId);
    this.advance(playback, 1);
    this.updateButtons();
  }

  private stop(): void {
    const playback = this.playback;
    if (!playback) return;
    this.cancelPlayback();
    this.editor.highlightStep(null);
    this.setStatus(`Stopped at step ${playback.index + 1} of ${playback.result.frames.length}. Press Run to start over.`);
  }

  private clearView(): void {
    this.cancelPlayback();
    this.ui.viewport.classList.remove('is-stale');
    this.result = undefined;
    this.viewport.drawing.setPrimitives([], []);
    this.viewport.setPose(HOME_POSE);
    this.editor.highlightStep(null);
    this.bounds = null;
    this.updateHud(HOME_POSE);
    this.setStatus('Cleared. Press Run to draw again.');
  }

  private startPlayback(result: RunResult, playing: boolean, perSecond: number): void {
    const playback: Playback = { result, index: -1, playing, rafId: 0, lastTime: performance.now(), budget: 0 };
    this.playback = playback;
    this.viewport.drawing.show({ segmentStart: 0, segmentEnd: 0, triangleStart: 0, triangleEnd: 0 });
    this.viewport.setPose(HOME_POSE);
    this.viewport.frame(drawingBounds(result.drawing));
    this.updateButtons();
    if (!playing) return;
    const tick = (now: number) => {
      playback.budget += ((now - playback.lastTime) / 1000) * perSecond;
      playback.lastTime = now;
      const steps = Math.floor(playback.budget);
      playback.budget -= steps;
      if (steps > 0) this.advance(playback, steps);
      if (this.playback === playback && playback.playing) playback.rafId = requestAnimationFrame(tick);
    };
    playback.rafId = requestAnimationFrame(tick);
  }

  private advance(playback: Playback, steps: number): void {
    const { frames } = playback.result;
    playback.index = Math.min(playback.index + steps, frames.length - 1);
    const frame: Frame = frames[playback.index];
    this.viewport.drawing.show(frame);
    this.viewport.setPose(frame.pose);
    this.editor.highlightStep(frame.span);
    this.updateHud(frame.pose);
    this.setStatus(`Step ${playback.index + 1} of ${frames.length}: ${this.editor.doc.slice(frame.span.offset, frame.span.offset + frame.span.length)}`);
    if (playback.index === frames.length - 1) {
      this.cancelPlayback();
      this.showFinal(playback.result, false, false);
    }
  }

  private cancelPlayback(): void {
    if (!this.playback) return;
    cancelAnimationFrame(this.playback.rafId);
    this.playback = undefined;
    this.updateButtons();
  }

  private showFinal(result: RunResult, refit: boolean, resetCamera: boolean, elapsed?: number): void {
    const { drawing } = result;
    this.viewport.drawing.show({
      segmentStart: result.allSegments.length - drawing.segments.length,
      segmentEnd: result.allSegments.length,
      triangleStart: result.allTriangles.length - drawing.triangles.length,
      triangleEnd: result.allTriangles.length,
    });
    this.viewport.drawing.setPending(drawing.pendingPoints);
    this.viewport.setPose(result.pose);
    this.editor.highlightStep(null);
    this.bounds = drawingBounds(drawing);
    if (resetCamera) this.viewport.resetCamera(this.bounds);
    else if (refit) this.viewport.frame(this.bounds);
    this.updateHud(result.pose);

    const parts = [plural(drawing.segments.length, 'line'), plural(drawing.triangles.length, 'triangle')];
    if (drawing.tetrahedra) parts.push(`${plural(drawing.tetrahedra, 'tetrahedron').replace(/ons$/, 'a')}`);
    if (drawing.skippedTetrahedra) parts.push(`${plural(drawing.skippedTetrahedra, 'flat window')} skipped`);
    if (drawing.pendingPoints.length) parts.push(plural(drawing.pendingPoints.length, 'pending point'));
    const alphas = [...drawing.segments, ...drawing.triangles].map((p) => p.alpha);
    const translucent = alphas.filter((a) => a > 0 && a < 1).length;
    const invisible = alphas.filter((a) => a === 0).length;
    if (translucent) parts.push(`${translucent.toLocaleString('en-US')} translucent`);
    if (invisible) parts.push(`${invisible.toLocaleString('en-US')} invisible (alpha 0)`);
    const timing = elapsed === undefined ? '' : ` in ${elapsed < 1 ? '<1' : Math.round(elapsed)} ms`;
    const prefix = result.error ? 'Stopped by an error after' : 'Ran';
    this.setStatus(`${prefix} ${plural(result.steps, 'step')}${timing} · ${parts.join(' · ')}`);
    this.ui.viewport.setAttribute(
      'aria-label',
      `3D view with ${parts.join(', ')}. Turtle at ${fmtVec(result.pose.position)}.`,
    );
  }

  private showError(result: RunResult): void {
    const { error } = result;
    this.ui.error.hidden = !error;
    this.ui.errorText.textContent = error ? `${error.kind === 'syntax' ? 'Syntax' : 'Runtime'} error · ${error.describe()}` : '';
  }

  private setStatus(text: string): void {
    this.ui.status.textContent = text;
  }

  private updateHud(pose: Pose): void {
    const result = this.result;
    const pen = result ? (result.penDown ? 'down' : 'up') : 'down';
    const color = result?.color ?? '';
    const alpha = result && result.alpha < 1 ? ` · alpha ${Math.round(result.alpha * 100)}%` : '';
    this.ui.hud.innerHTML = `
      <div><span class="hud-key">pos</span> ${fmtVec(pose.position)}</div>
      <div><span class="hud-key ax-h">H</span> ${fmtVec(pose.heading)}</div>
      <div><span class="hud-key ax-l">L</span> ${fmtVec(pose.left)} <span class="hud-key ax-u">U</span> ${fmtVec(pose.up)}</div>
      ${result && !this.playback ? `<div><span class="hud-key">pen</span> ${pen} · ${result.mode} · <span class="hud-swatch" style="background:${color};opacity:${result.alpha}"></span>${color}${alpha}</div>` : ''}
      <div class="hud-dim">grid cell ${fmt(this.viewport.gridStep)} units</div>`;
  }

  private updateButtons(): void {
    const active = Boolean(this.playback);
    this.ui.stop.disabled = !active;
    this.ui.run.classList.toggle('is-running', Boolean(this.playback?.playing));
  }
}
