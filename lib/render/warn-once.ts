// A dev-only, de-duplicating console warning.
//
// WHY DE-DUPLICATION IS THE POINT, not a nicety: the callers are render-path
// code. `getTransitionRecord` is resolved on EVERY rendered frame of every
// boundary, so a plain `console.warn` on a 20-second reel emits ~600 identical
// lines and buries the one message that mattered. Warn once per distinct key
// and the signal survives.
//
// WARNS, NEVER THROWS — the same design as `lib/project/zod-guard.ts`, and for
// the same reason: the conditions these guard are *suspicious*, not *broken*.
// A hand-edited `Root.tsx` with a kind core doesn't recognise still renders (as
// a hard cut); turning that into an exception would stop a render that was
// about to produce a usable file.
//
// Phase 4 note: Task 1.0 introduced this as a shared helper rather than
// inlining the bookkeeping, so Task 6.3 can adopt it instead of writing a
// second one.

const SEEN = new Set<string>();

/** True in anything that isn't a production build. Written defensively because
 *  this module is bundled for the browser (Remotion Studio, the reel editor) as
 *  well as run under Node, and `process` is not guaranteed to exist there. */
export function isDevEnvironment(): boolean {
  try {
    return typeof process === 'undefined' || process.env?.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

export interface WarnOnceOptions {
  /** Seam for testing — defaults to `console.warn`. */
  warn?: (message: string) => void;
  /** Seam for testing — defaults to `isDevEnvironment()`. */
  dev?: boolean;
}

/**
 * Emit `message` the first time this `key` is seen, and never again.
 *
 * Returns `true` when it actually warned, so a caller can assert on the
 * behaviour without capturing console output.
 */
export function warnOnce(key: string, message: string, opts: WarnOnceOptions = {}): boolean {
  if (!(opts.dev ?? isDevEnvironment())) return false;
  if (SEEN.has(key)) return false;
  SEEN.add(key);
  (opts.warn ?? ((m: string) => console.warn(m)))(message);
  return true;
}

/** Forget every key seen so far. For tests — a suite asserting "warns once"
 *  needs the module-level memory cleared between cases. */
export function resetWarnOnce(): void {
  SEEN.clear();
}
