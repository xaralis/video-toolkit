// Per-clip playback speed carries NO schema field. A video item already has
// two independent spans — `startMs`/`endMs` (where it sits on the timeline)
// and `sourceInMs`/`sourceOutMs` (what it plays from the source) — and speed
// is nothing but their ratio:
//
//   speed = (sourceOutMs - sourceInMs) / (endMs - startMs)
//
// Before this module existed, every clip/broll had those two spans in lock
// step (a trim always moved both together — see `resizeVideoItem` in
// `lib/editor/src/timeline/layered-adapter.ts`), so the ratio was always
// exactly 1 and nothing ever read it. `SegmentMedia.tsx` sets `startFrom`/
// `endAt` on `<OffthreadVideo>` from the source span alone and never passed
// `playbackRate` — a latent bug as much as a missing feature: the moment the
// two spans disagree, the video reaches the end of its source window and
// holds/blanks for the remainder. Deriving speed here and having the
// renderer pass it as `playbackRate` closes that gap AND is the feature.
//
// This follows the `FRAMING_DEFAULTS`/`GRADE_DEFAULTS` precedent (framing.ts,
// grade.ts): one defaults object, one tolerant reader, one change predicate
// the reel editor uses to decide what starts expanded/dirty — not a literal
// `1` typed in three places.
export const SPEED_DEFAULTS = { speed: 1 } as const;

// Sane clamp on the derived/authored ratio. 10x (checkerboard-fast, still
// legible as motion) down to 0.1x (10x slow-mo, still audibly/visibly a
// clip rather than a freeze) — wide enough for real b-roll slow-downs
// without admitting a value that makes `playbackRate` degenerate (0 stalls
// the source; a huge value skips almost all of it).
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;

/** Clamps a raw speed value into the sane range, and treats a non-finite or
 *  non-positive input as "no change" (1x) rather than propagating a NaN or a
 *  zero/negative `playbackRate` into Remotion. */
export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return SPEED_DEFAULTS.speed;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
}

/** The ratio a clip/broll item's two spans already encode. Guards the one
 *  genuine division-by-zero risk (a zero or negative TIMELINE span — never
 *  legitimate, but not this function's job to veto) by reading it as 1x
 *  rather than dividing by zero. Always clamped, so a config hand-edited (or
 *  drifted) outside `[SPEED_MIN, SPEED_MAX]` still renders/edits as a sane
 *  value instead of surfacing an extreme `playbackRate`. */
export function deriveSpeed(item: { startMs: number; endMs: number; sourceInMs: number; sourceOutMs: number }): number {
  const timelineMs = item.endMs - item.startMs;
  if (timelineMs <= 0) return SPEED_DEFAULTS.speed;
  return clampSpeed((item.sourceOutMs - item.sourceInMs) / timelineMs);
}

/** Whether an item's speed differs from doing nothing at all (1x) — used by
 *  the reel editor to decide whether its Speed section starts expanded.
 *  Tolerant of anything that isn't a clip/broll with numeric spans (a photo,
 *  a malformed item): those read as untouched, matching `deriveSpeed`'s own
 *  1x fallback for the same inputs. */
export function hasSpeedChanges(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false;
  const rec = item as Record<string, unknown>;
  if (rec.kind !== 'clip' && rec.kind !== 'broll') return false;
  const { startMs, endMs, sourceInMs, sourceOutMs } = rec as Record<string, unknown>;
  if (
    typeof startMs !== 'number' ||
    typeof endMs !== 'number' ||
    typeof sourceInMs !== 'number' ||
    typeof sourceOutMs !== 'number'
  ) {
    return false;
  }
  return deriveSpeed({ startMs, endMs, sourceInMs, sourceOutMs }) !== SPEED_DEFAULTS.speed;
}
