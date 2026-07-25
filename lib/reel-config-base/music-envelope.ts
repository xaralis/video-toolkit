import type { LayeredReel, VideoItem } from './layered-schema';

export interface MusicEnvelope {
  /** Linear gain for the <Audio volume> callback (per composition frame). */
  volumeAt: (frame: number) => number;
  /** Polyline vertices (frame → linear gain) for drawing the envelope. */
  points: Array<{ frame: number; gain: number }>;
}

// Faithful extraction of LayeredCampaignReel.tsx's musicVolumeAt (verified against
// it): base gain × 10^(item.musicBoostDb/20) of the primary video item at the
// frame, with the last-1s outro linear fade and silence after the outro end.
export function computeMusicEnvelope(reel: LayeredReel, opts: { fps: number }): MusicEnvelope {
  const { fps } = opts;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);
  const outroItem = reel.tracks.video.find((v) => v.kind === 'outro');
  const outroEndFrame = outroItem ? msToFrames(outroItem.endMs) : null;
  const OUTRO_FADE_OUT_FRAMES = fps; // last 1 second
  const outroFadeOutStart = outroEndFrame !== null ? outroEndFrame - OUTRO_FADE_OUT_FRAMES : null;
  const baseVolume = Math.pow(10, (reel.tracks.music.baseVolumeDb ?? -8) / 20);

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
    if (outroEndFrame !== null && f >= outroEndFrame) return 0;
    const item = findPrimaryVideoItemAt(f);
    const boostDb = item?.musicBoostDb ?? 0;
    let factor = Math.pow(10, boostDb / 20);
    if (outroFadeOutStart !== null && outroEndFrame !== null && f >= outroFadeOutStart && f < outroEndFrame) {
      const t = (f - outroFadeOutStart) / OUTRO_FADE_OUT_FRAMES;
      factor *= 1 - t;
    }
    return baseVolume * factor;
  };

  // Vertices for a step/ramp polyline: each video item start (level steps), the
  // outro fade start + its last frame + the outro end (ramp to 0), and 0/total.
  const totalFrames = msToFrames(reel.meta.totalDurationMs);
  const verts = new Set<number>([0, totalFrames]);
  for (const v of reel.tracks.video) verts.add(msToFrames(v.startMs));
  if (outroFadeOutStart !== null) verts.add(outroFadeOutStart);
  if (outroEndFrame !== null) { verts.add(outroEndFrame); verts.add(Math.max(0, outroEndFrame - 1)); }
  const points = [...verts]
    .filter((f) => f >= 0 && f <= totalFrames)
    .sort((a, b) => a - b)
    .map((frame) => ({ frame, gain: volumeAt(frame) }));

  return { volumeAt, points };
}
