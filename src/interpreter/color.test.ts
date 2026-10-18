import { describe, expect, it } from 'vitest';
import { alphaPercent, ColorComponentError, hsvToHex, rgbToHex } from './color';

function componentError(fn: () => unknown): ColorComponentError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ColorComponentError) return error;
    throw error;
  }
  throw new Error('expected a color error');
}

describe('rgb(r, g, b)', () => {
  it('maps 0–255 channels to #rrggbb, rounding fractions half up', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbToHex(255, 128, 0)).toBe('#ff8000');
    expect(rgbToHex(127.5, 0.49, 254.5)).toBe('#8000ff');
  });

  it.each([
    [[-0.01, 0, 0], 0, 'rgb red must be between 0 and 255, but got -0.01.'],
    [[0, 255.5, 0], 1, 'rgb green must be between 0 and 255, but got 255.5.'],
    [[0, 0, Infinity], 2, 'rgb blue must be a finite number.'],
    [[0, NaN, 0], 1, 'rgb green must be a finite number.'],
  ])('rejects %j (component %i)', (values, component, message) => {
    const error = componentError(() => rgbToHex(values[0], values[1], values[2]));
    expect(error.component).toBe(component);
    expect(error.message).toBe(message);
  });
});

describe('hsv(h, s, v)', () => {
  it.each([
    [0, 100, 100, '#ff0000'],
    [60, 100, 100, '#ffff00'],
    [120, 100, 100, '#00ff00'],
    [180, 100, 100, '#00ffff'],
    [240, 100, 100, '#0000ff'],
    [300, 100, 100, '#ff00ff'],
    [30, 50, 100, '#ffbf80'], // (1, 0.75, 0.5) × 255 = (255, 191.25, 127.5)
    [200, 0, 40, '#666666'], // no saturation: gray at 40 %
    [123, 77, 0, '#000000'],
  ])('hsv(%d, %d, %d) = %s', (h, s, v, hex) => {
    expect(hsvToHex(h, s, v)).toBe(hex);
  });

  it('wraps the hue by 360 in both directions', () => {
    expect(hsvToHex(360, 100, 100)).toBe('#ff0000');
    expect(hsvToHex(-120, 100, 100)).toBe(hsvToHex(240, 100, 100));
    expect(hsvToHex(750, 80, 90)).toBe(hsvToHex(30, 80, 90));
  });

  it.each([
    [[0, -1, 50], 1, 'hsv saturation is a percentage between 0 and 100, but got -1.'],
    [[0, 50, 100.5], 2, 'hsv value is a percentage between 0 and 100, but got 100.5.'],
    [[NaN, 50, 50], 0, 'hsv hue must be a finite number.'],
    [[0, 0.5, 1], 1, 'hsv saturation and value are percentages (0–100), not 0–1. Did you mean hsv(0, 50, 100)?'],
    [[10, 1, 0.8], 2, 'Did you mean hsv(10, 100, 80)?'],
    [[10, 50, 0.5], 2, 'Did you mean hsv(10, 50, 50)?'],
  ])('rejects %j (component %i)', (values, component, message) => {
    const error = componentError(() => hsvToHex(values[0], values[1], values[2]));
    expect(error.component).toBe(component);
    expect(error.message).toContain(message);
  });

  it('accepts integer percentages at the boundaries, including tiny ones', () => {
    expect(hsvToHex(0, 1, 1)).toBe('#030303');
    expect(hsvToHex(0, 0, 0)).toBe('#000000');
    expect(hsvToHex(0, 100, 100)).toBe('#ff0000');
  });
});

describe('alpha (rgba/hsva)', () => {
  it('is a whole percent 0–100, rounding half up', () => {
    expect(alphaPercent(0, 'rgba', [0, 0, 0])).toBe(0);
    expect(alphaPercent(1, 'rgba', [0, 0, 0])).toBe(1);
    expect(alphaPercent(100, 'hsva', [0, 0, 0])).toBe(100);
    expect(alphaPercent(37.5, 'rgba', [0, 0, 0])).toBe(38);
    expect(alphaPercent(37.49, 'rgba', [0, 0, 0])).toBe(37);
    expect(alphaPercent(99.5, 'rgba', [0, 0, 0])).toBe(100);
  });

  it.each([
    [-0.5, 'rgba alpha is a percentage between 0 (invisible) and 100 (opaque), but got -0.5.'],
    [100.01, 'rgba alpha is a percentage between 0 (invisible) and 100 (opaque), but got 100.01.'],
    [Infinity, 'rgba alpha must be a finite number.'],
    [NaN, 'rgba alpha must be a finite number.'],
    [0.5, 'rgba alpha is a percentage (0–100), not 0–1. Did you mean rgba(255, 128, 0, 50)?'],
  ])('rejects %d as component 3', (alpha, message) => {
    const error = componentError(() => alphaPercent(alpha, 'rgba', [255, 128, 0]));
    expect(error.component).toBe(3);
    expect(error.message).toBe(message);
  });
});
