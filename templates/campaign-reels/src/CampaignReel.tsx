import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import {
  whipPan, zoomThrough, wipe as customWipe, glitch,
} from '../../../lib/transitions';

import { PersistentOverlay } from './layers/PersistentOverlay';
import { ChevronMarker } from './overlays/ChevronMarker';
import { ClipSegment } from '../../../lib/segments/ClipSegment';
import { BrollSegment } from '../../../lib/segments/BrollSegment';
import { MultiClipSegment } from '../../../lib/segments/MultiClipSegment';
import { CardSegment } from './segments/CardSegment';
import { OutroSegment } from './segments/OutroSegment';
import type { Segment, Transition } from './config/types';
import type { ReelConfigInput } from './config/schema';
import { buildReelConfig, fps, outroFrames } from './config/reel-config';
import { segmentDurationFrames } from '../../../lib/reel-config-base/duration';
import { transcriptWindow } from '../../../lib/transcripts/transcript-window';
import { loadTranscriptSync } from '../../../lib/transcripts/load-transcripts';
import { loadBrandFonts } from './lib/load-fonts';

loadBrandFonts();

const renderTransition = (t: Transition) => {
  const frames = t.kind === 'cut' ? 0 : t.frames;
  switch (t.kind) {
    case 'cut':          return null;
    case 'dissolve':     return { presentation: fade(),                                                  timing: linearTiming({ durationInFrames: frames }) };
    case 'fade-coal':    return { presentation: fade(),                                                  timing: linearTiming({ durationInFrames: frames }) };
    case 'glitch':       return { presentation: glitch(),                                                timing: linearTiming({ durationInFrames: frames }) };
    case 'whip-pan':     return { presentation: whipPan({ direction: t.direction }),                     timing: linearTiming({ durationInFrames: frames }) };
    case 'zoom-through': return { presentation: zoomThrough({ direction: t.from }),                      timing: linearTiming({ durationInFrames: frames }) };
    case 'wipe':         return { presentation: customWipe({ color: t.color, direction: t.direction }),  timing: linearTiming({ durationInFrames: frames }) };
  }
};

const renderSegment = (seg: Segment, chevron: string): React.ReactNode => {
  if (seg.type === 'clip') {
    const t = seg.audioMode === 'silent' ? null : loadTranscriptSync(seg.source);
    const words = t ? transcriptWindow(t, seg.trimIn, seg.trimOut) : undefined;
    const transcript = words && words.length > 0 ? { words } : undefined;
    return <ClipSegment segment={seg} chevron={chevron} transcript={transcript} />;
  }
  if (seg.type === 'broll') {
    let transcript: { words: Array<{ start: number; end: number; word: string }> } | undefined;
    if (seg.audioMode === 'inherit-from-clip' && seg.audioSource) {
      const t = loadTranscriptSync(seg.audioSource);
      const duration = seg.trimOut - seg.trimIn;
      const startSec = seg.audioStartSec ?? 0;
      const words = t ? transcriptWindow(t, startSec, startSec + duration) : undefined;
      if (words && words.length > 0) transcript = { words };
    }
    return <BrollSegment segment={seg} chevron={chevron} transcript={transcript} />;
  }
  if (seg.type === 'multi-clip') return <MultiClipSegment segment={seg} chevron={chevron} />;
  if (seg.type === 'card')       return <CardSegment segment={seg} chevron={chevron} />;
  if (seg.type === 'outro')      return <OutroSegment />;
  return null;
};

export const CampaignReel: React.FC<ReelConfigInput> = (props) => {
  const reelConfig = buildReelConfig(props);
  const items: React.ReactNode[] = [];
  reelConfig.segments.forEach((seg, i) => {
    const dur = segmentDurationFrames(seg, fps, outroFrames);
    items.push(
      <TransitionSeries.Sequence
        key={`s-${i}`}
        name={seg.id ?? `${seg.type}-${i + 1}`}
        durationInFrames={dur}
      >
        {renderSegment(seg, reelConfig.chevron)}
      </TransitionSeries.Sequence>,
    );
    const next = reelConfig.segments[i + 1];
    const transitionOut = seg.type !== 'outro' ? seg.transitionOut : undefined;
    if (next && transitionOut && transitionOut.kind !== 'cut') {
      const t = renderTransition(transitionOut);
      if (t) items.push(<TransitionSeries.Transition key={`t-${i}`} {...t} />);
    }
  });

  const musicFile = reelConfig.audio?.music;
  const musicVolume = reelConfig.audio?.musicVolumeDb !== undefined
    ? Math.pow(10, reelConfig.audio.musicVolumeDb / 20)
    : 0.15;

  // Compute ACTUAL segment positions in composition time, accounting for
  // TransitionSeries overlap. Each non-cut transitionOut overlaps adjacent
  // segments by its frame count, so naive cumulative sums drift ahead of the
  // actual visual cut. WITHOUT this, audio cues lag visuals by Σ(transition
  // frames) — for pp-smoke-03 that's 2.53s of accumulated drift by the end.
  const timeline = (() => {
    type Entry = { seg: typeof reelConfig.segments[number]; startFrame: number; endFrame: number };
    const out: Entry[] = [];
    let cum = 0;
    let overlap = 0;
    for (const seg of reelConfig.segments) {
      const dur = segmentDurationFrames(seg, fps, outroFrames);
      const startFrame = cum - overlap;
      out.push({ seg, startFrame, endFrame: startFrame + dur });
      cum += dur;
      if (seg.type !== 'outro' && seg.transitionOut && seg.transitionOut.kind !== 'cut') {
        overlap += seg.transitionOut.frames;
      }
    }
    return out;
  })();

  // Brand rule #30 (HARD): music dynamics across reel structure.
  //   - voice / captions      → baseline (1.0×, musicVolume unchanged)
  //   - silent broll          → +6 dB
  //   - outro                 → +10 dB, with last 1s fading linearly to 0
  //   After outro endFrame, music = 0 (composition tail is silent).
  // All windows are computed from `timeline` so they track visual cuts exactly.
  const BROLL_BOOST_DB = 6;
  const OUTRO_BOOST_DB = 10;
  const OUTRO_FADE_OUT_FRAMES = fps; // last 1 second
  const brollFactor = Math.pow(10, BROLL_BOOST_DB / 20);
  const outroFactor = Math.pow(10, OUTRO_BOOST_DB / 20);

  const outroEntry = timeline.find(({ seg }) => seg.type === 'outro');
  const outroStartFrame = outroEntry?.startFrame ?? null;
  const outroEndFrame = outroEntry?.endFrame ?? null;
  const outroFadeOutStart = outroEndFrame !== null ? outroEndFrame - OUTRO_FADE_OUT_FRAMES : null;

  // Brand rule #31 (per-video opt-in): gradual ramp from a configured
  // composition-time frame up to outro level (+10 dB) by outro start.
  // Disabled by default (set to null); enable in a project by setting
  // `RAMP_START_SEC` to a number (composition seconds where ramp begins).
  const RAMP_START_SEC: number | null = null;
  const rampStartFrame = RAMP_START_SEC !== null ? Math.floor(RAMP_START_SEC * fps) : null;

  const classifyFrame = (f: number): 'voice' | 'broll-silent' | 'outro' | 'none' => {
    // Primary = the segment with the latest startFrame containing f (the
    // "incoming" one during a transition).
    let primary: typeof timeline[number] | null = null;
    for (const e of timeline) {
      if (f >= e.startFrame && f < e.endFrame) {
        if (!primary || e.startFrame > primary.startFrame) primary = e;
      }
    }
    if (!primary) return 'none';
    if (primary.seg.type === 'outro') return 'outro';
    if (primary.seg.type === 'clip') return primary.seg.audioMode === 'silent' ? 'broll-silent' : 'voice';
    if (primary.seg.type === 'broll') {
      return primary.seg.audioMode === 'inherit-from-clip' ? 'voice' : 'broll-silent';
    }
    if (primary.seg.type === 'multi-clip') {
      return primary.seg.audioMode === 'silent' ? 'broll-silent' : 'voice';
    }
    return 'voice';
  };

  const musicVolumeAt = (f: number) => {
    // After outro ends, music silent (composition tail is black)
    if (outroEndFrame !== null && f >= outroEndFrame) return 0;

    const klass = classifyFrame(f);
    let baseFactor: number;
    if (klass === 'outro') baseFactor = outroFactor;
    else if (klass === 'broll-silent') baseFactor = brollFactor;
    else baseFactor = 1; // voice or none

    // Per-video gradual rise (rule #31): from rampStartFrame, linear ramp
    // up to outroFactor by outroStartFrame. Result is max(baseFactor, ramp).
    let factor = baseFactor;
    if (rampStartFrame !== null && outroStartFrame !== null && f >= rampStartFrame) {
      const span = outroStartFrame - rampStartFrame;
      const t = span > 0 ? Math.min(1, (f - rampStartFrame) / span) : 1;
      const rampFactor = 1 + (outroFactor - 1) * t;
      factor = Math.max(factor, rampFactor);
    }

    // Outro fade-out (last 1s) — overrides everything
    if (outroFadeOutStart !== null && outroEndFrame !== null && f >= outroFadeOutStart && f < outroEndFrame) {
      const t = (f - outroFadeOutStart) / OUTRO_FADE_OUT_FRAMES;
      factor *= (1 - t);
    }

    return musicVolume * factor;
  };

  // PersistentOverlay (watermark + § 16d disclaimer) renders only during
  // CONTENT segments — not during the outro stinger. The stinger is a
  // full coal frame with its own brand identity baked in; layering the
  // watermark+disclaimer on top stacks redundantly against the coal.
  //
  // CRITICAL: subtract the last content segment's transitionOut frames so
  // PersistentOverlay also hides during the outro's fade-IN window
  // (TransitionSeries overlaps both sequences during the transition). Without
  // this, the watermark visibly hovers over the outro stinger for the
  // transition duration before vanishing.
  const lastContent = [...reelConfig.segments].reverse().find((s) => s.type !== 'outro');
  const lastTransitionOut = lastContent && lastContent.type !== 'outro' ? lastContent.transitionOut : undefined;
  const lastTransitionFrames =
    lastTransitionOut && lastTransitionOut.kind !== 'cut' ? lastTransitionOut.frames : 0;
  const contentFrames =
    reelConfig.segments
      .filter((s) => s.type !== 'outro')
      .reduce((sum, s) => sum + segmentDurationFrames(s, fps, outroFrames), 0) -
    lastTransitionFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <TransitionSeries>{items}</TransitionSeries>
      {musicFile && <Audio src={staticFile(musicFile)} volume={musicVolumeAt} />}
      <ChevronMarker label={reelConfig.chevron} />
      <Sequence from={0} durationInFrames={contentFrames}>
        <PersistentOverlay />
      </Sequence>
    </AbsoluteFill>
  );
};
