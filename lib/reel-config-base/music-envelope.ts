import type { LayeredReel, VideoItem } from './layered-schema';

export interface MusicEnvelope {
  /** Linear gain for the <Audio volume> callback (per composition frame). */
  volumeAt: (frame: number) => number;
  /** Polyline vertices (frame → linear gain) for drawing the envelope. */
  points: Array<{ frame: number; gain: number }>;
}

export function computeMusicEnvelope(reel: LayeredReel, opts: { fps: number }): MusicEnvelope {
  const { fps } = opts;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);
  // The outro is an ordinary time-windowed video item, not a singular "the end"
  // marker: a reel may carry several (the cut just naturally places one last).
  // So the bed follows the LAST outro to end — a `.find()` here would silence the
  // music at the first one and play any later outro over silence. One outro →
  // identical to the old first-match behaviour.
  const outroEnds = reel.tracks.video.filter((v) => v.kind === 'outro').map((v) => msToFrames(v.endMs));
  const outroEndFrame = outroEnds.length > 0 ? Math.max(...outroEnds) : null;
  const baseVolume = Math.pow(10, (reel.tracks.music.baseVolumeDb ?? -8) / 20);
  const musicEndFrame = reel.tracks.music.endMs !== undefined ? msToFrames(reel.tracks.music.endMs) : null;

  // Fades are data (spec 2026-07-25): fadeOut defaults to the legacy 1s and
  // anchors to whichever end comes first — the explicit music trim (endMs) or
  // the outro end. fadeIn defaults to 0 (off), ramping from frame 0.
  const fadeOutFrames = msToFrames(reel.tracks.music.fadeOutMs ?? 1000);
  const fadeInFrames = msToFrames(reel.tracks.music.fadeInMs ?? 0);
  const ends = [musicEndFrame, outroEndFrame].filter((x): x is number => x !== null);
  const fadeEndFrame = ends.length > 0 ? Math.min(...ends) : null;
  const fadeStartFrame = fadeEndFrame !== null && fadeOutFrames > 0 ? fadeEndFrame - fadeOutFrames : null;

  const findPrimaryVideoItemAt = (f: number): VideoItem | null => {
    let primary: VideoItem | null = null;
    for (const v of reel.tracks.video) {
      const sf = msToFrames(v.startMs);
      const ef = msToFrames(v.endMs);
      if (f >= sf && f < ef) {
        if (!primary || sf > msToFrames(primary.startMs)) primary = v;
      }
    }
    return primary;
  };

  const volumeAt = (f: number): number => {
    if (musicEndFrame !== null && f >= musicEndFrame) return 0;
    if (outroEndFrame !== null && f >= outroEndFrame) return 0;
    const item = findPrimaryVideoItemAt(f);
    const boostDb = item?.musicBoostDb ?? 0;
    let factor = Math.pow(10, boostDb / 20);
    if (fadeStartFrame !== null && fadeEndFrame !== null && f >= fadeStartFrame && f < fadeEndFrame) {
      factor *= 1 - (f - fadeStartFrame) / fadeOutFrames;
    }
    if (fadeInFrames > 0 && f < fadeInFrames) {
      factor *= f / fadeInFrames;
    }
    return baseVolume * factor;
  };

  const totalFrames = msToFrames(reel.meta.totalDurationMs);
  const verts = new Set<number>([0, totalFrames]);
  for (const v of reel.tracks.video) verts.add(msToFrames(v.startMs));
  if (fadeInFrames > 0) verts.add(fadeInFrames);
  if (fadeStartFrame !== null) verts.add(fadeStartFrame);
  if (outroEndFrame !== null) { verts.add(outroEndFrame); verts.add(Math.max(0, outroEndFrame - 1)); }
  if (musicEndFrame !== null) { verts.add(musicEndFrame); verts.add(Math.max(0, musicEndFrame - 1)); }
  const points = [...verts]
    .filter((f) => f >= 0 && f <= totalFrames)
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, gain: volumeAt(frame) }));

  return { volumeAt, points };
}
