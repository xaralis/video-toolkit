import type { LayeredReel } from './layered-schema';

// The reel's total duration is DERIVED: the furthest end reached by any
// content-bearing track — video, overlays, audio beds, and the music bed when
// it carries an explicit out-point (without one it follows the content end and
// contributes nothing). Brand items (watermark/disclaimer) are excluded: their
// span is itself derived from the content end, so counting them would freeze
// the total at its old value.
export function computeTotalDurationMs(reel: LayeredReel): number {
  const ends = [
    ...reel.tracks.video.map((v) => v.endMs),
    ...reel.tracks.overlays.map((o) => o.endMs),
    ...reel.tracks.audio.map((a) => a.endMs),
  ];
  if (reel.tracks.music.source && reel.tracks.music.endMs !== undefined) {
    ends.push(reel.tracks.music.endMs);
  }
  return Math.max(0, ...ends);
}

// Recompute meta.totalDurationMs from the tracks. Brand items are NOT touched
// here: their span is derived from the CONTENT end (which excludes the outro),
// not from the total, so the old "re-pin anything sitting exactly at the old
// total" heuristic could only ever be right by coincidence — and silently did
// nothing on every reel that has an outro. `withDerivedBrandSpan`
// (content-end.ts) owns the brand span now; the editor host applies it on every
// change. Returns the same object when nothing changes, so callers can hand it
// straight to React state.
export function withTotalDuration(reel: LayeredReel): LayeredReel {
  const totalMs = computeTotalDurationMs(reel);
  if (totalMs === reel.meta.totalDurationMs) return reel;
  return { ...reel, meta: { ...reel.meta, totalDurationMs: totalMs } };
}
