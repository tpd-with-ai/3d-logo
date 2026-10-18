import { expect, test, type Page } from '@playwright/test';

const status = (page: Page) => page.locator('#status');

/** Replaces the editor contents (as a paste would). */
async function setCode(page: Page, code: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

/** Counts pixels in the WebGL canvas that match the default cyan pen color. */
const cyanPixels = (page: Page) => countPixels(page, 'cyan');
/** Counts pixels matching the amber heading arrow (H) of the turtle's axes. */
const amberPixels = (page: Page) => countPixels(page, 'amber');

function countPixels(page: Page, kind: 'cyan' | 'amber'): Promise<number> {
  return page.evaluate((kind) => {
    const source = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (kind === 'cyan' ? r < 100 && g > 180 && b > 200 : r > 220 && g > 150 && g < 215 && b < 90) count++;
    }
    return count;
  }, kind);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./'); // relative, so it stays under baseURL's BASE_PATH
  await expect(status(page)).toContainText('Ran');
});

test('runs the starter program and draws it', async ({ page }) => {
  await expect(status(page)).toContainText('9 lines · 0 triangles');
  await expect(page.locator('#viewport')).toHaveAttribute('aria-label', /9 lines/);
  await expect.poll(() => cyanPixels(page)).toBeGreaterThan(500);
});

test('edit, run with the keyboard, and clear the view', async ({ page }) => {
  await page.locator('#live').uncheck();
  await setCode(page, 'repeat 3 [ forward 50 right 120 ]\nclimb 90 forward 30');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toContainText('4 lines');
  await expect(page.locator('#hud')).toContainText('pos (0, 0, 30)');

  await page.locator('#clear').click();
  await expect(status(page)).toContainText('Cleared');
  await expect.poll(() => cyanPixels(page)).toBeLessThan(20);
});

test('live mode reruns as you type and shows located errors', async ({ page }) => {
  await setCode(page, 'fd 10\nrt 90\nfoward 20');
  const error = page.locator('#error');
  await expect(error).toBeVisible();
  await expect(error).toContainText("Line 3, column 1: Unknown command 'foward'. Did you mean 'forward'?");
  await expect(page.locator('.cm-lintRange-error')).toHaveCount(1);

  await page.locator('#error-jump').click();
  await expect(page.locator('.cm-content')).toBeFocused();

  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.insertText('fd repcount');
  await expect(error).toContainText("'repcount' can only be used inside a repeat block.");

  await setCode(page, 'repeat 3 [ fd 10 / (repcount - 2) ]');
  await expect(error).toContainText('Runtime error · Line 1, column 20: Division by zero.');
  await expect(status(page)).toContainText('Stopped by an error after');

  await setCode(page, 'fd 10');
  await expect(error).toBeHidden();
  await expect(status(page)).toContainText('1 line');
});

test('examples load and run, including triangle and tetrahedra modes', async ({ page }) => {
  await page.locator('#examples').selectOption({ label: 'Triangle strip' });
  await expect(status(page)).toContainText('0 lines · 16 triangles');
  await expect(page.locator('.cm-content')).toContainText('triangles');

  await page.locator('#examples').selectOption({ label: 'Pinwheel' });
  await expect(status(page)).toContainText('1 line · 4 triangles · 1 pending point');

  await page.locator('#examples').selectOption({ label: 'One tetrahedron' });
  await expect(status(page)).toContainText('4 triangles · 1 tetrahedron');
  await expect(page.locator('#hud')).toContainText('tetrahedra');
  await page.locator('#examples').selectOption({ label: 'Tetrahedron chain (Boerdijk–Coxeter helix)' });
  await expect(status(page)).toContainText('116 triangles · 29 tetrahedra');

  await setCode(page, 'tetrahedra\nforward 10 forward 10 forward 10');
  await expect(status(page)).toContainText('0 triangles · 1 flat window skipped');
});

type Debug = { __logo3d: { camera(): { position: number[]; target: number[]; direction: number[] }; ndcExtent(): number } };
const camera = (page: Page) => page.evaluate(() => (window as unknown as Debug).__logo3d.camera());

test('every example runs without errors and fits the camera', async ({ page }) => {
  const ids = await page.locator('#examples option').evaluateAll((options) =>
    options.map((o) => (o as HTMLOptionElement).value).filter(Boolean),
  );
  expect(ids.length).toBeGreaterThanOrEqual(25);
  for (const id of ids) {
    await page.locator('#examples').selectOption(id);
    await expect(status(page), id).toContainText('Ran');
    await expect(page.locator('#error')).toBeHidden();
    const extent = await page.evaluate(() => (window as unknown as Debug).__logo3d.ndcExtent());
    expect(extent, id).toBeGreaterThan(0.2); // not lost in the distance
    expect(extent, id).toBeLessThanOrEqual(1); // every corner of the drawing's box is on screen
  }
});

test('the gallery shows categories, accuracy labels, and sources, and opens the genus-3 model', async ({ page }) => {
  await page.locator('#gallery-open').click();
  const dialog = page.getByRole('dialog', { name: 'Example gallery' });
  await expect(dialog).toBeVisible();
  for (const heading of ['Turning basics', 'Drawing modes', 'Polyhedra', 'Curves & knots', 'Surfaces']) {
    await expect(dialog.getByRole('heading', { name: heading })).toBeVisible();
  }
  const card = dialog.locator('.card', { hasText: 'Mizhaev genus-3 polyhedron' });
  await expect(card.locator('.badge')).toHaveText('Exact');
  await expect(card).toContainText('56 triangles');
  await expect(card.getByRole('link')).toHaveAttribute('href', 'https://arxiv.org/abs/2609.17700');
  const mobius = dialog.locator('.card', { has: page.getByRole('button', { name: 'Möbius strip', exact: true }) });
  await expect(mobius.locator('.badge')).toHaveText('Approximation');

  await card.getByRole('button', { name: 'Mizhaev genus-3 polyhedron' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#examples')).toHaveValue('mizhaev');
  await expect(status(page)).toContainText('0 lines · 56 triangles');
  const info = page.locator('#example-info');
  await expect(info).toContainText('Exact');
  await expect(info.getByRole('link', { name: 'Source' })).toHaveAttribute('href', /arxiv\.org\/abs\/2609\.17700/);
  await expect(page.locator('.cm-content')).toContainText('polygon [');

  // Editing turns the program into the user's own: the label goes away.
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(' ');
  await expect(info).toBeHidden();
});

test.describe('keyboard flight', () => {
  const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
  const len = (a: number[]) => Math.hypot(...a);
  const unit = (a: number[]) => a.map((n) => n / len(a));
  const dot = (a: number[], b: number[]) => a.reduce((s, n, i) => s + n * b[i], 0);
  /** Waits until orbit damping has died out (headless frame rates can be low). */
  const settle = (page: Page) =>
    expect
      .poll(async () => {
        const a = await camera(page);
        await page.waitForTimeout(100);
        return len(sub((await camera(page)).position, a.position));
      })
      .toBeLessThan(1e-6);
  const hold = async (page: Page, key: string, ms: number) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(100); // let the last frame land
  };

  test('only flies while the view is focused; typing in the editor never moves the camera', async ({ page }) => {
    await page.locator('#live').uncheck();
    const before = await camera(page);
    await page.locator('.cm-content').click();
    await hold(page, 'w', 300);
    await page.keyboard.type('asdqe');
    expect(len(sub((await camera(page)).position, before.position))).toBeLessThan(1e-6);
    await expect(page.locator('.cm-content')).toContainText('wasdqe');

    await page.locator('#run').focus();
    await hold(page, 'w', 200);
    expect(len(sub((await camera(page)).position, before.position))).toBeLessThan(1e-6);
    await expect(page.locator('.fly-hint')).toBeHidden();

    await page.locator('#viewport').focus();
    await expect(page.locator('.fly-hint')).toBeVisible();
    await hold(page, 'w', 300);
    const after = await camera(page);
    expect(len(sub(after.position, before.position))).toBeGreaterThan(5);
  });

  test('W follows the current view after orbiting, and the orbit target travels with the camera', async ({ page }) => {
    await page.locator('#viewport').click({ position: { x: 40, y: 200 } });
    await expect(page.locator('#viewport')).toBeFocused();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft'); // orbit to a new view
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowUp');
    await settle(page);
    const before = await camera(page);
    await hold(page, 'w', 400);
    const after = await camera(page);
    const moved = sub(after.position, before.position);
    expect(len(moved)).toBeGreaterThan(10);
    expect(dot(unit(moved), before.direction)).toBeGreaterThan(0.999); // straight along the view
    // Target moved by the same offset, so the camera keeps its place relative to the orbit target
    // (no snap on the next drag).
    const orbit = sub(before.position, before.target);
    expect(len(sub(sub(after.position, after.target), orbit))).toBeLessThan(1e-6 * len(orbit));
    expect(dot(after.direction, before.direction)).toBeGreaterThan(0.99999);

    const beforeStrafe = await camera(page);
    await hold(page, 'd', 300);
    const strafe = sub((await camera(page)).position, beforeStrafe.position);
    expect(Math.abs(dot(unit(strafe), before.direction))).toBeLessThan(1e-3); // sideways
    expect(Math.abs(strafe[2])).toBeLessThan(1e-6); // parallel to the ground

    const beforeRise = await camera(page);
    await hold(page, 'e', 300);
    const rise = sub((await camera(page)).position, beforeRise.position);
    expect(unit(rise)[2]).toBeGreaterThan(0.9999);
  });

  test('held keys are dropped when focus or the window is lost, or a dialog opens', async ({ page }) => {
    const viewport = page.locator('#viewport');
    /** How far the camera drifts over 250 ms (OrbitControls re-derives the position each frame, so allow float noise). */
    const drift = async () => {
      const a = await camera(page);
      await page.waitForTimeout(250);
      return len(sub((await camera(page)).position, a.position));
    };

    await viewport.focus();
    await page.keyboard.down('w');
    await page.waitForTimeout(150);
    await page.locator('#help-open').click(); // opening Help moves focus into the dialog
    expect(await drift()).toBeLessThan(1e-6);
    await page.keyboard.up('w');
    await page.keyboard.press('Escape');

    await viewport.focus();
    await page.keyboard.down('s');
    await page.waitForTimeout(150);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    expect(await drift()).toBeLessThan(1e-6);
    await page.keyboard.up('s');

    await viewport.focus();
    await page.keyboard.down('a');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape'); // leaves the view
    await expect(viewport).not.toBeFocused();
    expect(await drift()).toBeLessThan(1e-6);
    await page.keyboard.up('a');
  });

  test('arrow-key pan, zoom keys, and Fit still work alongside flight', async ({ page }) => {
    await page.locator('#viewport').focus();
    const start = await camera(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    const panned = await camera(page);
    expect(len(sub(panned.target, start.target))).toBeGreaterThan(0.1);
    await page.keyboard.press('+');
    await page.waitForTimeout(300);
    const zoomed = await camera(page);
    expect(len(sub(zoomed.position, zoomed.target))).toBeLessThan(len(sub(panned.position, panned.target)) * 0.9);
    await hold(page, 'w', 200);
    await page.keyboard.press('f');
    await page.waitForTimeout(300);
    const extent = await page.evaluate(() => (window as unknown as Debug).__logo3d.ndcExtent());
    expect(extent).toBeLessThanOrEqual(1);
  });
});

test('animated playback can be stopped and stepped', async ({ page }) => {
  await page.locator('#examples').selectOption({ label: 'Helix' });
  await page.locator('#speed').selectOption({ label: 'Slow' });
  await page.locator('#run').click();
  await expect(status(page)).toContainText(/Step \d+ of 576/);
  await expect(page.locator('.cm-step')).toHaveCount(1);
  await expect(page.locator('#stop')).toBeEnabled();

  await page.locator('#stop').click();
  await expect(status(page)).toContainText(/Stopped at step \d+ of 576/);
  await expect(page.locator('#stop')).toBeDisabled();

  await page.locator('#step').click();
  await expect(status(page)).toHaveText('Step 1 of 576: pitchup 20');
  await page.locator('#step').click();
  await expect(status(page)).toHaveText('Step 2 of 576: forward 6');
});

test('help opens as a dialog and closes with Escape', async ({ page }) => {
  await page.locator('#help-open').click();
  const dialog = page.getByRole('dialog', { name: 'Language reference' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#help-open')).toBeFocused();
});

test('help explains the turtle axes and runs the turn mini-examples', async ({ page }) => {
  await page.locator('#help-open').click();
  const dialog = page.getByRole('dialog', { name: 'Language reference' });
  // One axes diagram plus a before/after diagram for each of yaw, pitch, and roll.
  await expect(dialog.getByRole('img', { name: /heading H pointing forward/ })).toBeVisible();
  for (const name of [/^Yaw: .*about its up axis U/, /^Pitch: .*wing axis/, /^Roll: .*about its heading H/]) {
    await expect(dialog.getByRole('img', { name })).toBeVisible();
  }
  for (const word of ['yawleft', 'yawright', 'pitchup', 'pitchdown', 'rollleft', 'rollright', 'climb', 'dive']) {
    await expect(dialog.locator('.turn-cards')).toContainText(word);
  }

  await dialog.getByRole('button', { name: 'Try the Roll example in the editor' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#examples')).toHaveValue('turn-roll');
  await expect(status(page)).toContainText(/Step \d+ of 5/); // replays visibly
  await expect(status(page)).toContainText('Ran 5 steps', { timeout: 10_000 });
  // After rollright 90, yawleft (about the new U) sends the turtle up, not sideways.
  await expect(page.locator('#hud')).toContainText('pos (0, 60, 30)');
  await expect(page.locator('#hud')).toContainText('U (1, 0, 0)');

  await page.locator('#help-open').click();
  await dialog.getByRole('button', { name: 'Try the order matters example in the editor' }).click();
  await expect(status(page)).toContainText('3 lines', { timeout: 10_000 });
});

test('the turtle shows its own axes, and the Axes toggle hides them', async ({ page }) => {
  await page.locator('#live').uncheck();
  await setCode(page, 'forward 10');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toContainText('1 line');
  await expect.poll(() => amberPixels(page)).toBeGreaterThan(30);
  await page.locator('#turtle-axes').uncheck();
  await expect.poll(() => amberPixels(page)).toBeLessThan(5);
});

test('re-running does not leak GPU geometries or textures', async ({ page }) => {
  // Counts are read after two animation frames so the latest scene has been rendered (uploaded).
  const memory = () =>
    page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return (window as unknown as { __logo3d: { memory(): object } }).__logo3d.memory();
    });
  const examples = [
    'Globe of rings',
    'Folded triangle strip',
    'Pinwheel',
    'Tetrahedron chain (Boerdijk–Coxeter helix)',
    'Mizhaev genus-3 polyhedron',
    'Filled polygons',
    'Glass cube with a core (rgba)',
    'Glass Möbius strip (hsva)',
    'Nested glass tetrahedra',
  ];
  const runAll = async () => {
    for (const label of examples) {
      await page.locator('#examples').selectOption({ label });
      await memory();
    }
  };
  await runAll();
  const baseline = await memory();
  expect(baseline).toMatchObject({ geometries: expect.any(Number) });
  for (let round = 0; round < 4; round++) await runAll();
  expect(await memory()).toEqual(baseline);
});

test('stacks the view above the code on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const view = await page.locator('.view-panel').boundingBox();
  const code = await page.locator('.code-panel').boundingBox();
  expect(view!.y + view!.height).toBeLessThanOrEqual(code!.y);
  expect(code!.width).toBeGreaterThan(340);
});

test.describe('flight is translation, not zoom (deterministic clock)', () => {
  const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
  const len = (a: number[]) => Math.hypot(...a);
  const dist = (c: { position: number[]; target: number[] }) => len(sub(c.position, c.target));

  test.beforeEach(async ({ page }) => {
    // Fake timers drive requestAnimationFrame and performance.now, so held keys last exactly as long.
    await page.clock.install();
    await page.reload();
    await expect(status(page)).toContainText('Ran');
    // Pause, so wall-clock time spent between test steps does not leak into app time.
    await page.clock.pauseAt(Date.now() + 60_000);
    await page.locator('#viewport').focus();
    await page.clock.runFor(2000); // initial damping settles
  });

  /** Holds `key` for exactly `ms` of app time, sampling the camera every 100 ms. */
  async function hold(page: Page, key: string, ms: number) {
    const samples = [await camera(page)];
    await page.keyboard.down(key);
    for (let t = 0; t < ms; t += 100) {
      await page.clock.runFor(100);
      samples.push(await camera(page));
    }
    await page.keyboard.up(key);
    await page.clock.runFor(100);
    samples.push(await camera(page));
    return samples;
  }

  test('W and S move camera and target by the same vector along the view, at constant distance', async ({ page }) => {
    const start = await camera(page);
    const d0 = dist(start);
    const forward = await hold(page, 'w', 3000);
    for (const c of forward) {
      expect(Math.abs(dist(c) - d0)).toBeLessThan(1e-9 * d0); // a dolly would shrink this
      expect(len(sub(sub(c.position, start.position), sub(c.target, start.target)))).toBeLessThan(1e-9 * d0);
      expect(c.direction[0] * start.direction[0] + c.direction[1] * start.direction[1] + c.direction[2] * start.direction[2]).toBeGreaterThan(1 - 1e-12);
    }
    const afterW = forward.at(-1)!;
    const moved = sub(afterW.position, start.position);
    // Flight goes further than the orbit target was: it passes through it, which a zoom never does.
    expect(len(moved)).toBeGreaterThan(d0);
    const along = moved.reduce((s, n, i) => s + n * start.direction[i], 0);
    expect(along / len(moved)).toBeGreaterThan(1 - 1e-12);

    const back = await hold(page, 's', 3000);
    for (const c of back) expect(Math.abs(dist(c) - d0)).toBeLessThan(1e-9 * d0);
    const end = back.at(-1)!;
    // W then S for the same time returns home, up to the key events landing mid-frame (two frames).
    const twoFrames = (len(moved) / 3) * (2 / 60);
    expect(len(sub(end.position, start.position))).toBeLessThan(twoFrames);
    expect(len(sub(end.target, start.target))).toBeLessThan(twoFrames);
    expect(Math.abs(dist(end) - d0)).toBeLessThan(1e-9 * d0);
  });

  test('A/D strafe and E/Q rise and sink, carrying the target along', async ({ page }) => {
    for (const [key, check] of [
      ['d', (m: number[]) => Math.abs(m[2]) < 1e-9 && len(m) > 10],
      ['a', (m: number[]) => Math.abs(m[2]) < 1e-9 && len(m) > 10],
      ['e', (m: number[]) => m[2] > 10 && Math.hypot(m[0], m[1]) < 1e-9],
      ['q', (m: number[]) => m[2] < -10 && Math.hypot(m[0], m[1]) < 1e-9],
    ] as const) {
      const before = await camera(page);
      const after = (await hold(page, key, 300)).at(-1)!;
      const moved = sub(after.position, before.position);
      expect(check(moved), key).toBe(true);
      expect(len(sub(sub(after.target, before.target), moved)), key).toBeLessThan(1e-9 * dist(before));
    }
  });

  test('after flying, dragging orbits around the carried target without a jump', async ({ page }) => {
    await hold(page, 'w', 600);
    const flown = await camera(page);
    const box = (await page.locator('#viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2);
    await page.clock.runFor(50);
    const firstFrame = await camera(page);
    // A tiny drag makes a tiny change: the pivot is the flown target, not the old one.
    expect(len(sub(firstFrame.target, flown.target))).toBeLessThan(1e-9);
    expect(len(sub(firstFrame.position, flown.position))).toBeLessThan(0.05 * dist(flown));
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2);
    await page.mouse.up();
    await page.clock.runFor(2000);
    const orbited = await camera(page);
    expect(len(sub(orbited.target, flown.target))).toBeLessThan(1e-9);
    expect(Math.abs(dist(orbited) - dist(flown))).toBeLessThan(1e-6 * dist(flown));
    expect(len(sub(orbited.position, flown.position))).toBeGreaterThan(1);

    // Flight still follows the new view after the orbit.
    const before = await camera(page);
    const after = (await hold(page, 'w', 300)).at(-1)!;
    const moved = sub(after.position, before.position);
    expect(moved.reduce((s, n, i) => s + n * before.direction[i], 0) / len(moved)).toBeGreaterThan(1 - 1e-9);
    expect(Math.abs(dist(after) - dist(before))).toBeLessThan(1e-9 * dist(before));
  });

  test('the mouse wheel zooms: distance changes while the target stays put', async ({ page }) => {
    const before = await camera(page);
    const box = (await page.locator('#viewport').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);
    await page.clock.runFor(500);
    const after = await camera(page);
    expect(dist(after)).toBeLessThan(dist(before) * 0.9);
    expect(len(sub(after.target, before.target))).toBeLessThan(1e-9);
  });
});

test('the Tetrahedra gallery section opens solid examples', async ({ page }) => {
  await page.locator('#gallery-open').click();
  const dialog = page.getByRole('dialog', { name: 'Example gallery' });
  const section = dialog.locator('.gallery-section', { has: page.getByRole('heading', { name: 'Tetrahedra' }) });
  await expect(section.locator('.card')).toHaveCount(8);
  await expect(section.locator('.card', { hasText: 'Solid or flat?' }).locator('.badge')).toHaveText('Lesson');
  const card = section.locator('.card', { hasText: 'Sierpiński tetrahedron (level 3)' });
  await expect(card.locator('.badge')).toHaveText('Exact');
  await expect(card).toContainText('64 tetrahedra');
  await card.getByRole('button', { name: 'Sierpiński tetrahedron (level 3)' }).click();
  await expect(status(page)).toContainText('256 triangles · 64 tetrahedra');
  const extent = await page.evaluate(() => (window as unknown as Debug).__logo3d.ndcExtent());
  expect(extent).toBeLessThanOrEqual(1);
  expect(extent).toBeGreaterThan(0.2);

  await page.locator('#examples').selectOption({ label: 'Solid or flat? (skipped windows)' });
  await expect(status(page)).toContainText('1 tetrahedron · 1 flat window skipped');
});

test('rgba/hsva colors render translucent, alpha 0 is kept but not drawn', async ({ page }) => {
  await page.locator('#live').uncheck();
  /** Pixels that are strongly red, and pixels with a weaker red tint over the dark background. */
  const reds = () =>
    page.evaluate(() => {
      const source = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(source, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let strong = 0;
      let tint = 0;
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        if (r > 170 && g < 90 && b < 90) strong++;
        else if (r > 45 && r > g + 25 && r > b + 10) tint++;
      }
      return { strong, tint };
    });
  const square = (color: string) => `penup ${color} polygon [ repeat 4 [ forward 100 yawright 90 ] ]`;
  const run = async (code: string) => {
    await setCode(page, code);
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(status(page)).toContainText('Ran');
  };

  // Nothing drawn, but framed like the 100 × 100 square (turtle at its far corner): the red X axis
  // and turtle are the baseline.
  await run('penup setpos 100 100 0');
  await expect.poll(async () => (await reds()).strong).toBeLessThan(200);
  const baseline = await reds();

  await run(square('color rgb(255, 0, 0)'));
  await expect.poll(async () => (await reds()).strong).toBeGreaterThan(2000);

  await run(square('color rgba(255, 0, 0, 30)'));
  await expect(status(page)).toContainText('2 triangles · 2 translucent');
  await expect(page.locator('#hud')).toContainText('alpha 30%');
  // Same square at 30 %: a dim red tint over the dark background, no full-strength red left.
  await expect.poll(async () => { const r = await reds(); return r.strong < 200 && r.tint > baseline.tint + 2000; }).toBe(true);

  await run(square('color hsva(0, 100, 100, 0)'));
  await expect(status(page)).toContainText('2 triangles · 2 invisible (alpha 0)');
  await expect.poll(async () => { const r = await reds(); return r.strong + Math.abs(r.tint - baseline.tint); }).toBeLessThan(100);

  await setCode(page, 'color rgba(255, 0, 0, 0.5) fd 10');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('#error')).toContainText('Did you mean rgba(255, 0, 0, 50)?');
});

