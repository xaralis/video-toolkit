// lib/render/audio-track.tsx — the shared AUDIO TRACK assembly. Lifted from
// campaign-reels' LayeredCampaignReel.tsx audioNodes map (the only template
// that mounted the audio track — see spec 2026-07-25) so every brand renders
// voice/bed items identically. Gain math is pure in ./audio-gain.
import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { audioGainAt } from './audio-gain';
import { resolveMediaSource } from '../theming/media-source';
import type { AudioItem } from '../reel-config-base/layered-schema';

// AudioItem.source is a bare filename by convention (derive-layered emits the
// clip's own source), living under recordings/.
//
// Phase 3 Task 6: this is now core's ONE media-path rule bound to the 'audio'
// role, not a fourth private copy of the convention. Identical for every shape
// either brand actually stores — bare filenames prefix, `recordings/…` and
// `broll/…` pass through — and it additionally leaves any OTHER path with a
// slash alone (e.g. `audio/bed.wav`), which the old prefix list mangled into
// `recordings/audio/bed.wav`. A brand overrides wholesale via
// CompositionTheme.resolveMediaSource (or the deprecated resolveAudioSource,
// which still wins).
export function defaultResolveAudioSource(raw: string): string {
  return resolveMediaSource(raw, 'audio');
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
        {/* No acceptableTimeShiftInSeconds here on purpose — see media-sync.ts.
            Sound is the reference the ear judges everything against; audio
            barely drifts, and a seek in it is audible, so Remotion's own
            default governs this element. */}
        <Audio
          src={staticFile(resolve(a.source))}
          startFrom={msToFrames(a.sourceInMs)}
          volume={(f) => audioGainAt(a, f, opts.fps)}
        />
      </Sequence>
    );
  });
}
