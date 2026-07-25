// lib/render/audio-gain.ts — pure per-frame gain for an audio-track item.
// Local frame = frames since the item's own Sequence start. No Remotion import
// so it unit-tests in core (same split as video-track-layout).
import type { AudioItem } from '../reel-config-base/layered-schema';

export function audioGainAt(item: AudioItem, localFrame: number, fps: number): number {
  if (item.mute) return 0;
  const msToFrames = (ms: number) => (ms / 1000) * fps;
  const base = Math.pow(10, (item.volumeDb ?? 0) / 20);
  const spanF = msToFrames(item.endMs - item.startMs);
  const fadeInF = msToFrames(item.fadeInMs ?? 0);
  const fadeOutF = msToFrames(item.fadeOutMs ?? 0);
  let factor = 1;
  if (fadeInF > 0 && localFrame < fadeInF) factor *= Math.max(0, localFrame / fadeInF);
  if (fadeOutF > 0 && localFrame > spanF - fadeOutF) factor *= Math.max(0, (spanF - localFrame) / fadeOutF);
  return base * factor;
}
