import { expect, test, type Page } from '@playwright/test';

const status = (page: Page) => page.locator('#status');

/** Replaces the editor contents (as a paste would). */
async function setCode(page: Page, code: string) {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

/** Counts pixels in the WebGL canvas that match the default cyan pen color. */
function cyanPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const source = document.querySelector<HTMLCanvasElement>('#viewport canvas')!;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 100 && data[i + 1] > 180 && data[i + 2] > 200) count++;
    }
    return count;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
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

test('examples load and run, including triangle mode', async ({ page }) => {
  await page.locator('#examples').selectOption({ label: 'Triangle ribbon' });
  await expect(status(page)).toContainText('0 lines · 16 triangles');
  await expect(page.locator('.cm-content')).toContainText('triangles');

  await page.locator('#examples').selectOption({ label: 'Pinwheel (lines + triangles)' });
  await expect(status(page)).toContainText('1 line · 4 triangles · 1 pending point');
});

test('animated playback can be stopped and stepped', async ({ page }) => {
  await page.locator('#examples').selectOption({ label: 'Helix (pitch)' });
  await page.locator('#speed').selectOption({ label: 'Slow' });
  await page.locator('#run').click();
  await expect(status(page)).toContainText(/Step \d+ of 576/);
  await expect(page.locator('.cm-step')).toHaveCount(1);
  await expect(page.locator('#stop')).toBeEnabled();

  await page.locator('#stop').click();
  await expect(status(page)).toContainText(/Stopped at step \d+ of 576/);
  await expect(page.locator('#stop')).toBeDisabled();

  await page.locator('#step').click();
  await expect(status(page)).toHaveText('Step 1 of 576: climb 20');
  await page.locator('#step').click();
  await expect(status(page)).toHaveText('Step 2 of 576: forward 6');
});

test('help opens as a dialog and closes with Escape', async ({ page }) => {
  await page.locator('#help-open').click();
  const dialog = page.getByRole('dialog', { name: 'Language reference' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('rollright');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#help-open')).toBeFocused();
});

test('re-running does not leak GPU geometries or textures', async ({ page }) => {
  // Counts are read after two animation frames so the latest scene has been rendered (uploaded).
  const memory = () =>
    page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return (window as unknown as { __logo3d: { memory(): object } }).__logo3d.memory();
    });
  const examples = ['Globe of rings (roll)', 'Tetrahelix (folded triangles)', 'Pinwheel (lines + triangles)'];
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
