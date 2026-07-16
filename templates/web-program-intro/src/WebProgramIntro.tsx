import { AbsoluteFill, Audio, staticFile } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import {
  whipPan, zoomThrough, wipe as customWipe, glitch,
} from '../../../lib/transitions';

import { ClipSegment } from '../../../lib/segments/ClipSegment';
import { BrollSegment } from '../../../lib/segments/BrollSegment';
import { MultiClipSegment } from '../../../lib/segments/MultiClipSegment';
import type { Transition } from '../../../lib/reel-config-base/base-types';
import { segmentDurationFrames } from '../../../lib/reel-config-base/duration';
import { loadBrandFonts } from './lib/load-fonts';
import { buildReelConfig, fps } from './config/reel-config';
import type { WebProgramIntroConfigInput } from './config/schema';

loadBrandFonts();

const renderTransition = (t: Transition) => {
  const frames = t.kind === 'cut' ? 0 : t.frames;
  switch (t.kind) {
    case 'cut':          return null;
    case 'dissolve':     return { presentation: fade(),                                                 timing: linearTiming({ durationInFrames: frames }) };
    case 'fade-coal':    return { presentation: fade(),                                                 timing: linearTiming({ durationInFrames: frames }) };
    case 'glitch':       return { presentation: glitch(),                                               timing: linearTiming({ durationInFrames: frames }) };
    case 'whip-pan':     return { presentation: whipPan({ direction: t.direction }),                    timing: linearTiming({ durationInFrames: frames }) };
    case 'zoom-through': return { presentation: zoomThrough({ direction: t.from }),                     timing: linearTiming({ durationInFrames: frames }) };
    case 'wipe':         return { presentation: customWipe({ color: t.color, direction: t.direction }), timing: linearTiming({ durationInFrames: frames }) };
  }
};

export const WebProgramIntro: React.FC<WebProgramIntroConfigInput> = (props) => {
  const reelConfig = buildReelConfig(props);
  const items: React.ReactNode[] = [];

  reelConfig.segments.forEach((seg, i) => {
    // No outro here — pass 0 for outroFrames placeholder.
    const dur = segmentDurationFrames(seg, fps, 0);
    items.push(
      <TransitionSeries.Sequence
        key={`s-${i}`}
        name={seg.id ?? `${seg.type}-${i + 1}`}
        durationInFrames={dur}
      >
        {renderSegment(seg)}
      </TransitionSeries.Sequence>,
    );
    const next = reelConfig.segments[i + 1];
    const transitionOut = seg.transitionOut;
    if (next && transitionOut && transitionOut.kind !== 'cut') {
      const t = renderTransition(transitionOut);
      if (t) items.push(<TransitionSeries.Transition key={`t-${i}`} {...t} />);
    }
  });

  // ---- Audio: voice baseline, broll-silent +6 dB, music ducked under voice
  const musicFile = reelConfig.audio?.music;
  const musicVolume = reelConfig.audio?.musicVolumeDb !== undefined
    ? Math.pow(10, reelConfig.audio.musicVolumeDb / 20)
    : 0.12; // ambient default

  // Composition-time per-segment positions accounting for transition overlap.
  const timeline = (() => {
    type Entry = { seg: typeof reelConfig.segments[number]; startFrame: number; endFrame: number };
    const out: Entry[] = [];
    let cum = 0;
    let overlap = 0;
    for (const seg of reelConfig.segments) {
      const dur = segmentDurationFrames(seg, fps, 0);
      const startFrame = cum - overlap;
      out.push({ seg, startFrame, endFrame: startFrame + dur });
      cum += dur;
      if (seg.transitionOut && seg.transitionOut.kind !== 'cut') {
        overlap += seg.transitionOut.frames;
      }
    }
    return out;
  })();

  const BROLL_BOOST_DB = 6;
  const brollFactor = Math.pow(10, BROLL_BOOST_DB / 20);

  const classifyFrame = (f: number): 'voice' | 'broll-silent' | 'none' => {
    let primary: typeof timeline[number] | null = null;
    for (const e of timeline) {
      if (f >= e.startFrame && f < e.endFrame) {
        if (!primary || e.startFrame > primary.startFrame) primary = e;
      }
    }
    if (!primary) return 'none';
    if (primary.seg.type === 'clip') return primary.seg.audioMode === 'silent' ? 'broll-silent' : 'voice';
    if (primary.seg.type === 'broll') {
      return primary.seg.audioMode === 'inherit-from-clip' || primary.seg.audioMode === 'extend-previous'
        ? 'voice'
        : 'broll-silent';
    }
    if (primary.seg.type === 'multi-clip') {
      return primary.seg.audioMode === 'silent' ? 'broll-silent' : 'voice';
    }
    return 'voice';
  };

  const musicVolumeAt = (f: number) => {
    const klass = classifyFrame(f);
    const factor = klass === 'broll-silent' ? brollFactor : 1;
    return musicVolume * factor;
  };

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <TransitionSeries>{items}</TransitionSeries>
      {musicFile && <Audio src={staticFile(musicFile)} volume={musicVolumeAt} />}
    </AbsoluteFill>
  );
};

// Web-intro NEVER burns captions into the MP4 — captions are emitted as an
// external .vtt by tools/export_vtt.py and rendered by the website's HTML
// <track>. We deliberately do NOT load *.transcript.json sidecars here even
// when they exist (which they do whenever tools/transcribe.py is run against
// the footage), to prevent silent caption burn-in regressions.
const renderSegment = (seg: WebProgramIntroConfigInput['segments'][number]): React.ReactNode => {
  // chevron="" — web-intro segments don't render a chevron.
  if (seg.type === 'clip') return <ClipSegment segment={seg} chevron="" />;
  if (seg.type === 'broll') return <BrollSegment segment={seg} chevron="" />;
  if (seg.type === 'multi-clip') return <MultiClipSegment segment={seg} chevron="" />;
  return null;
};
