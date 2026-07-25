import type { LayeredReel } from '../../reel-config-base/layered-schema';
import { MIN_FRAMES } from '../../render/layered-composition-props';

/** The editor's timeline length. Deliberately NOT
 *  `layeredDurationInFrames`: the render uses the authored total, but the editor
 *  must show anything an item currently reaches, so dragging a clip past the end
 *  extends the view instead of hiding it. The 60-frame floor itself IS shared
 *  with the render (`MIN_FRAMES`) — only the max-over-item-ends behaviour above
 *  it differs. */
export function framesForReel(reel: LayeredReel, fps: number): number {
  const ends = [
    reel.meta.totalDurationMs,
    ...reel.tracks.video.map((v) => v.endMs),
    ...reel.tracks.overlays.map((o) => o.endMs),
    ...reel.tracks.audio.map((a) => a.endMs),
    ...reel.tracks.brand.map((b) => b.endMs),
  ];
  return Math.max(MIN_FRAMES, Math.round((Math.max(...ends) / 1000) * fps));
}
