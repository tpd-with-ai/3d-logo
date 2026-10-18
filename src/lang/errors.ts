/** A location in the source text. `line` and `column` are 1-based; `offset` is a 0-based character index. */
export interface Span {
  offset: number;
  length: number;
  line: number;
  column: number;
}

export type ErrorKind = 'syntax' | 'runtime';

/** Every error reported to the user carries a kind and the source span that caused it. */
export class LogoError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
    readonly span: Span,
  ) {
    super(message);
    this.name = 'LogoError';
  }

  /** Friendly one-line description, e.g. "Line 3, column 5: Unknown command 'foward'." */
  describe(): string {
    return `Line ${this.span.line}, column ${this.span.column}: ${this.message}`;
  }
}

/** Levenshtein distance, used for "did you mean" suggestions. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** Returns the closest candidate within a small edit distance, or undefined. */
export function suggest(word: string, candidates: Iterable<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Math.max(1, Math.floor(word.length / 3)) + 1;
  for (const candidate of candidates) {
    const d = distance(word, candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}
