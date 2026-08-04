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
//
// THE RATIO LIVES HERE; THE CONVERSION LIVES IN `./clip-time.ts`. Because speed
// is that ratio, a clip's timeline milliseconds and its source milliseconds are
// different units the moment the ratio is not 1 — and they are both plain
// `number`, so nothing stops one being added to the other. That is not
// hypothetical: five places did exactly that, which is why a trim handle
// refused footage that existed, a trim reset a clip's speed to 1x, and a split
// gave both halves a speed nobody set. Any code that needs to turn one domain
// into the other belongs in `clip-time.ts` — do not open-code `* speed` or
// `/ speed` at a call site, and do not add a second helper that does it
// ELSEWHERE. Adding one INSIDE `clip-time.ts` is the sanctioned move and how
// the frame-domain twin `timelineToSourceFrames` got there: the renderer holds
// a transition's borrowed handle as a frame count, and round-tripping it
// through milliseconds to reach `timelineToSourceMs` would add rounding noise
// to buy nothing. One module, more than one unit — that is not a second model.
//
// Two places legitimately multiply by a speed and are NOT violations of that:
// `setItemSpeed` (layered-adapter.ts), which applies the speed being SET rather
// than the one the item currently has, so `clip-time` cannot express it; and
// `slipDeltaMs` (LayeredTimeline.tsx), which takes the speed as a parameter so
// it can stay a pure px→ms function with no item in scope. If you find a THIRD,
// it is probably a real one — and if you are adding one, prefer converting at
// the call site through `clip-time` instead.
export const SPEED_DEFAULTS = { speed: 1 } as const;

// Sane clamp on the derived/authored ratio. 10x (checkerboard-fast, still
// legible as motion) down to 0.1x (10x slow-mo, still audibly/visibly a
// clip rather than a freeze) — wide enough for real b-roll slow-downs
// without admitting a value that makes `playbackRate` degenerate (0 stalls
// the source; a huge value skips almost all of it).
export const SPEED_MIN = 0.1;
export const SPEED_MAX = 10;

/** How far the two spans may disagree and still mean "the same length".
 *
 *  Half a frame at the toolkit's canonical 30 fps (see docs/video-timing.md —
 *  every video here runs at 30fps). A difference smaller than this cannot be
 *  represented in the output at all: it is under one frame, so no frame of the
 *  render is different for it.
 *
 *  It exists because ordinary editing produces such differences constantly.
 *  A real case: six of the eight items in pp-u-kamenne-vily ended a cut-tune
 *  pass with spans 7-13 ms apart, and every one of them therefore derived a
 *  speed of 0.998-1.004. Nobody had set a speed on any of them. Faithfully
 *  reporting that ratio meant the inspector showed a speed change that no
 *  author made, and the editing maths treated the noise as a real ratio.
 *
 *  Deliberately absolute rather than proportional: a proportional tolerance
 *  scales with clip length, so the same 1% would be a third of a frame on a
 *  short clip and ten frames on a 30-second one. What matters is whether the
 *  difference is representable, and that is measured in frames. */
export const SPEED_SNAP_MS = 1000 / 30 / 2;

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
 *  rather than dividing by zero. Below `SPEED_SNAP_MS` the two spans disagree
 *  by less than half a frame, which is snapped to exactly 1x rather than
 *  reported as a ratio — see `SPEED_SNAP_MS` for why. Always clamped, so a
 *  config hand-edited (or drifted) outside `[SPEED_MIN, SPEED_MAX]` still
 *  renders/edits as a sane value instead of surfacing an extreme
 *  `playbackRate`. */
export function deriveSpeed(item: { startMs: number; endMs: number; sourceInMs: number; sourceOutMs: number }): number {
  const timelineMs = item.endMs - item.startMs;
  if (timelineMs <= 0) return SPEED_DEFAULTS.speed;
  const sourceMs = item.sourceOutMs - item.sourceInMs;
  // A sub-frame disagreement is the same length, not a speed. See SPEED_SNAP_MS.
  if (Math.abs(sourceMs - timelineMs) < SPEED_SNAP_MS) return SPEED_DEFAULTS.speed;
  return clampSpeed(sourceMs / timelineMs);
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
