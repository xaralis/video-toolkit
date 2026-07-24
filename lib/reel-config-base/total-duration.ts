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

// Recompute meta.totalDurationMs from the tracks and re-pin full-span brand
// items to the new end: a brand item whose endMs sat exactly at the OLD total
// (the "spans the whole reel" derivation) stretches/shrinks with it, while a
// deliberately shorter one keeps its authored span. Returns the same object
// when nothing changes, so callers can hand it straight to React state.
export function withTotalDuration(reel: LayeredReel): LayeredReel {
  const totalMs = computeTotalDurationMs(reel);
  if (totalMs === reel.meta.totalDurationMs) return reel;
  const brand = reel.tracks.brand.map((b) =>
    b.endMs === reel.meta.totalDurationMs ? { ...b, endMs: totalMs } : b,
  );
  return { ...reel, meta: { ...reel.meta, totalDurationMs: totalMs }, tracks: { ...reel.tracks, brand } };
}
