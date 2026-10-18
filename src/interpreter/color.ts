/**
 * Functional colors. Every color ends up as one canonical form: a lowercase `#rrggbb` string.
 *
 * rgb(r, g, b): each channel 0–255. Fractions are allowed and rounded to the nearest integer
 *   (half rounds up). Values outside 0–255 are errors, not clamped.
 * hsv(h, s, v): hue in degrees, any finite value, wrapped into [0, 360) (so 360 = 0 = red and
 *   -120 = 240 = blue). Saturation and value are percentages 0–100; outside that range is an
 *   error. Channels are computed exactly, then scaled to 0–255 and rounded like rgb.
 *   A saturation or value strictly between 0 and 1 (e.g. hsv(0, 50, 0.5)) is rejected as probable
 *   0–1 notation instead of silently drawing an almost-black color, so the accepted values are
 *   0 and anything from 1 to 100 (fractions such as 12.5 are fine).
 * rgba(r, g, b, a) / hsva(h, s, v, a): the same, plus alpha (opacity) as a percentage 0–100,
 *   where 0 is invisible and 100 is opaque. Alpha rounds to the nearest whole percent (half up),
 *   like rgb channels round to whole numbers, and follows the same 0–1 guard as saturation.
 *   rgb(), hsv(), names, and hex colors are fully opaque (100).
 */

/** A problem with one component (0-based index), reported at that component's source span. */
export class ColorComponentError extends Error {
  constructor(
    readonly component: number,
    message: string,
  ) {
    super(message);
  }
}

const RGB_NAMES = ['red', 'green', 'blue'];
const HSV_NAMES = ['hue', 'saturation', 'value'];
const show = (n: number) => String(Number(n.toFixed(6)));

function toHex(channels: number[]): string {
  return `#${channels.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function checkFinite(values: number[], names: string[], fn: string): void {
  values.forEach((value, i) => {
    if (!Number.isFinite(value)) throw new ColorComponentError(i, `${fn} ${names[i]} must be a finite number.`);
  });
}

export function rgbToHex(r: number, g: number, b: number): string {
  const values = [r, g, b];
  checkFinite(values, RGB_NAMES, 'rgb');
  values.forEach((value, i) => {
    if (value < 0 || value > 255) {
      throw new ColorComponentError(i, `rgb ${RGB_NAMES[i]} must be between 0 and 255, but got ${show(value)}.`);
    }
  });
  return toHex(values);
}

export function hsvToHex(h: number, s: number, v: number): string {
  checkFinite([h, s, v], HSV_NAMES, 'hsv');
  [s, v].forEach((value, k) => {
    if (value < 0 || value > 100) {
      throw new ColorComponentError(
        k + 1,
        `hsv ${HSV_NAMES[k + 1]} is a percentage between 0 and 100, but got ${show(value)}.`,
      );
    }
  });
  const fractional = [s, v].findIndex((x) => x > 0 && x < 1);
  if (fractional >= 0) {
    const fix = (x: number) => show(x <= 1 ? x * 100 : x);
    throw new ColorComponentError(
      fractional + 1,
      `hsv saturation and value are percentages (0–100), not 0–1. Did you mean hsv(${show(h)}, ${fix(s)}, ${fix(v)})?`,
    );
  }
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const val = v / 100;
  const chroma = val * sat;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const m = val - chroma;
  const [r, g, b] =
    sector < 1 ? [chroma, x, 0] :
    sector < 2 ? [x, chroma, 0] :
    sector < 3 ? [0, chroma, x] :
    sector < 4 ? [0, x, chroma] :
    sector < 5 ? [x, 0, chroma] :
    [chroma, 0, x];
  return toHex([r, g, b].map((c) => (c + m) * 255));
}

/**
 * Validates an rgba/hsva alpha (component index 3) given in percent and returns the canonical
 * opacity: a whole percent 0–100.
 */
export function alphaPercent(a: number, fn: 'rgba' | 'hsva', shown: number[]): number {
  if (!Number.isFinite(a)) throw new ColorComponentError(3, `${fn} alpha must be a finite number.`);
  if (a < 0 || a > 100) {
    throw new ColorComponentError(3, `${fn} alpha is a percentage between 0 (invisible) and 100 (opaque), but got ${show(a)}.`);
  }
  if (a > 0 && a < 1) {
    const fixed = [...shown.map(show), show(a * 100)].join(', ');
    throw new ColorComponentError(3, `${fn} alpha is a percentage (0–100), not 0–1. Did you mean ${fn}(${fixed})?`);
  }
  return Math.round(a);
}
