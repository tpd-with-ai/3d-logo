import { describe, expect, it } from 'vitest';
import { EXAMPLES } from './examples';
import { runSource } from './interpreter/interpreter';

describe('examples', () => {
  it.each(EXAMPLES.map((e) => [e.title, e.code]))('%s runs without errors and draws', (_title, code) => {
    const result = runSource(code);
    expect(result.error).toBeUndefined();
    expect(result.drawing.segments.length + result.drawing.triangles.length).toBeGreaterThan(0);
  });
});
