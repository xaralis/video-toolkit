// lib/render/audio-track.tsx — the shared AUDIO TRACK assembly. Lifted from
// campaign-reels' LayeredCampaignReel.tsx audioNodes map (the only template
// that mounted the audio track — see spec 2026-07-25) so every brand renders
// voice/bed items identically. Gain math is pure in ./audio-gain.
import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { audioGainAt } from './audio-gain';
import type { AudioItem } from '../reel-config-base/layered-schema';

// AudioItem.source is a bare filename by convention (derive-layered emits the
// clip's own source). Campaign's folder convention is the core default; a
// brand with different folders overrides via CompositionTheme.resolveAudioSource.
export function defaultResolveAudioSource(raw: string): string {
  return raw.startsWith('recordings/') || raw.startsWith('broll/') ? raw : `recordings/${raw}`;
}

export function buildAudioNodes(
  items: AudioItem[],
  opts: { fps: number; resolveSource?: (raw: string) => string },
): React.ReactNode[] {
  const resolve = opts.resolveSource ?? defaultResolveAudioSource;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * opts.fps);
  return items.map((a) => {
    const from = msToFrames(a.startMs);
    const durationInFrames = Math.max(1, msToFrames(a.endMs) - from);
    return (
      <Sequence key={a.id} from={from} durationInFrames={durationInFrames} name={a.id}>
        <Audio
          src={staticFile(resolve(a.source))}
          startFrom={msToFrames(a.sourceInMs)}
          volume={(f) => audioGainAt(a, f, opts.fps)}
        />
      </Sequence>
    );
  });
}
