/** `1080x1920` → `9:16`. Returns an em dash rather than throwing on a
 *  composition whose dimensions have not arrived yet. */
export function aspectLabel(width: number, height: number): string {
  if (!width || !height) return '—';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

/** Sources the editor probed and could not read.
 *
 *  The metadata hook writes `0` for a failed decode — the same distinction
 *  `pendingSources` relies on to avoid spinning forever. A source with no
 *  entry at all is still in flight, NOT failed; conflating the two would
 *  report every source as broken for the first seconds of every session. */
export function failedSources(sources: string[], durations: Record<string, number>): string[] {
  return sources.filter((s) => durations[s] === 0);
}
