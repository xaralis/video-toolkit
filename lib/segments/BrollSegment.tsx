import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  staticFile,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import { CaptionStrip } from '../overlays/CaptionStrip';
import { StatCalloutOverlay } from '../overlays/StatCalloutOverlay';
import { QuotePullOverlay } from '../overlays/QuotePullOverlay';
import { PartyLogosOverlay } from '../overlays/PartyLogosOverlay';
import { SourceTagOverlay } from '../overlays/SourceTagOverlay';
import { TitleOverlay } from '../overlays/TitleOverlay';
import { UpdateBadgeOverlay } from '../overlays/UpdateBadgeOverlay';
import { AIVisualTag } from '../overlays/AIVisualTag';
import type { BrollSegmentBase } from '../reel-config-base/base-types';
import { cropCoverStyle } from '../reel-config-base/crop';
import { gradeFilter } from '../reel-config-base/grade';
import { GradeDefs } from './GradeDefs';

// Locally augment the base with the optional render-time fields this
// component knows how to display. Templates that don't set these get a
// plain b-roll clip with no overlays.
interface BrollSegmentInput extends BrollSegmentBase {
  aiGenerated?: boolean;
  kenBurns?: {
    fromX?: number;
    toX?: number;
    fromY?: number;
    toY?: number;
    fromScale?: number;
    toScale?: number;
  };
  // Optional "before → after" gradient cross-blend: render `source` then sweep
  // a feathered diagonal gradient that reveals `blendTo` on top, within this
  // single segment (single inherited audio — no transition overlap, no echo).
  blendTo?: string;
  blend?: {
    direction?: 'tl-br' | 'tr-bl' | 'bl-tr' | 'br-tl';
    startPct?: number;
    endPct?: number;
    softness?: number;
  };
  overlay?:
    | { kind: 'title'; text: string; appearAt: number; durationMs: number }
    | { kind: 'quote-pull'; text: string; placement: string; appearAt: number; durationMs: number }
    | { kind: 'party-logos'; logos: Array<{ src: string; appearAt: number }>; durationMs: number }
    | { kind: 'stat-callout'; number: string; unit?: string; label?: string; color: 'lime' | 'teal'; appearAt: number; durationMs: number }
    | { kind: 'source-tag'; text: string; position: 'bottom-left' | 'bottom-right' | 'top-right'; appearAt: number; durationMs: number }
    | { kind: 'update-badge'; text: string; eyebrow?: string; appearAt: number; durationMs: number };
}

interface Props {
  segment: BrollSegmentInput;
  chevron: string; // unused — chevron renders once at composition root
  /** Transcript slice for the inherited-clip audio, when audioMode is
   *  'inherit-from-clip'. Captions render over the b-roll. (Rule #17.) */
  transcript?: { words: Array<{ start: number; end: number; word: string }> };
}

// CSS gradient angle whose 0% endpoint sits at the reveal-start corner, so
// `black` at low stops makes that corner of `blendTo` appear first.
const BLEND_ANGLE: Record<'tl-br' | 'tr-bl' | 'bl-tr' | 'br-tl', number> = {
  'tl-br': 135,
  'tr-bl': 225,
  'bl-tr': 45,
  'br-tl': 315,
};

export const BrollSegment: React.FC<Props> = ({ segment, transcript }) => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const videoCrop = cropCoverStyle(segment.crop, segment.focalX, segment.focalY);
  const gradeId = `grade-${segment.id}`;
  const filter = gradeFilter(segment.grade, gradeId);

  // Ken Burns (opt-in): animate objectPosition + scale across the segment's own
  // frame span. useCurrentFrame() here is 0-based within the Sequence, so derive
  // the local span from the trims — NOT useVideoConfig().durationInFrames, which
  // is the whole composition. Default (no kenBurns) keeps the static focal crop.
  const kb = segment.kenBurns;
  // Absolutely-positioned so multiple video layers (base + optional blendTo)
  // OVERLAP in the same full-frame box. AbsoluteFill defaults to a column
  // flexbox; leaving the videos in flex flow would shrink two sibling layers
  // to half-height each (a vertical split, not a cross-blend).
  let videoStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    ...videoCrop,
  };
  if (kb) {
    const segFrames = Math.max(1, Math.round((segment.trimOut - segment.trimIn) * fps));
    const e = interpolate(frame, [0, Math.max(1, segFrames - 1)], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.ease),
    });
    const baseX = segment.focalX ?? 0.5;
    const baseY = segment.focalY ?? 0.5;
    const lerp = (a: number, b: number) => a + (b - a) * e;
    const x = lerp(kb.fromX ?? baseX, kb.toX ?? baseX);
    const y = lerp(kb.fromY ?? baseY, kb.toY ?? baseY);
    const scale = lerp(kb.fromScale ?? 1, kb.toScale ?? 1);
    videoStyle = {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: `${x * 100}% ${y * 100}%`,
      transform: `scale(${scale})`,
      transformOrigin: `${x * 100}% ${y * 100}%`,
    };
  }

  // Colour correction (rule #32 pre-LUT) applies to the base layer and — via
  // the spread below — the optional blend layer, so both stay matched.
  if (filter) videoStyle = { ...videoStyle, filter };

  // "before → after" gradient cross-blend (opt-in via blendTo): a feathered
  // diagonal band sweeps over the segment's own frame span, revealing the
  // blendTo layer on top of the base source. Both layers share videoStyle
  // (incl. Ken Burns) so the two visuals stay registered during the sweep.
  let blendLayerStyle: React.CSSProperties | null = null;
  if (segment.blendTo) {
    const b = segment.blend ?? {};
    const segFrames = Math.max(1, Math.round((segment.trimOut - segment.trimIn) * fps));
    const startF = ((b.startPct ?? 30) / 100) * (segFrames - 1);
    const endF = ((b.endPct ?? 65) / 100) * (segFrames - 1);
    const soft = b.softness ?? 40;
    const angle = BLEND_ANGLE[b.direction ?? 'tl-br'];
    // Map the sweep so the feathered band travels from FULLY off-frame (nothing
    // revealed → official holds) to FULLY past-frame (blendTo holds). Before
    // startF the black band ends at 0% (blendTo hidden); after endF it begins at
    // 100% (blendTo fully shown). Without the ±soft/2 offsets, a soft/2-wide
    // wedge of blendTo would already peek at the reveal corner from frame 0.
    const edge = interpolate(frame, [startF, Math.max(startF + 1, endF)], [-soft / 2, 100 + soft / 2], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const maskImg = `linear-gradient(${angle}deg, black ${edge - soft / 2}%, transparent ${edge + soft / 2}%)`;
    blendLayerStyle = {
      ...videoStyle,
      WebkitMaskImage: maskImg,
      maskImage: maskImg,
      WebkitMaskSize: '100% 100%',
      maskSize: '100% 100%',
    };
  }

  const inheritsAudio = segment.audioMode === 'inherit-from-clip' && segment.audioSource;
  // Mute the b-roll's own audio when:
  //   - audioMode === 'silent' or 'voiceover' (no native audio wanted)
  //   - audioMode === 'inherit-from-clip' (a separate <Audio> drives the soundtrack)
  // Only 'extend-previous' (legacy semantic — uses the b-roll's own audio) keeps it unmuted.
  const videoMuted = segment.audioMode !== 'extend-previous';
  // Captions stay in a FIXED lower lane and never move for quote-pulls (which
  // now sit in their own fixed lane above the caption band — two fixed lanes,
  // brand rule #5/#16). Only the bottom-anchored TitleOverlay, which physically
  // covers the caption band, still lifts the caption for its window.
  const liftWindows =
    segment.overlay?.kind === 'title'
      ? [{ startMs: segment.overlay.appearAt, endMs: segment.overlay.appearAt + segment.overlay.durationMs }]
      : undefined;
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <GradeDefs id={gradeId} grade={segment.grade} />
      <OffthreadVideo
        src={staticFile(`broll/${segment.source}`)}
        trimBefore={Math.round(segment.trimIn * fps)}
        trimAfter={Math.round(segment.trimOut * fps)}
        muted={videoMuted}
        volume={videoMuted ? 0 : 1}
        style={videoStyle}
      />
      {segment.blendTo && blendLayerStyle && (
        <OffthreadVideo
          src={staticFile(`broll/${segment.blendTo}`)}
          trimBefore={Math.round(segment.trimIn * fps)}
          trimAfter={Math.round(segment.trimOut * fps)}
          muted
          volume={0}
          style={blendLayerStyle}
        />
      )}
      {inheritsAudio && (
        <Audio
          src={staticFile(`recordings/${segment.audioSource}`)}
          startFrom={Math.round((segment.audioStartSec ?? 0) * fps)}
        />
      )}
      {/* Captions render whenever voice is active over the b-roll (rule #17).
          Lifted only for TitleOverlay windows — quote-pulls now occupy a fixed
          lane above the caption band (brand rule #5/#16). */}
      {transcript && transcript.words.length > 0 && (
        <CaptionStrip transcript={transcript} liftWindows={liftWindows} />
      )}
      {segment.aiGenerated && <AIVisualTag />}
      {segment.overlay?.kind === 'stat-callout' && <StatCalloutOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'quote-pull'   && <QuotePullOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'party-logos'  && <PartyLogosOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'source-tag'   && <SourceTagOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'title'        && <TitleOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'update-badge' && <UpdateBadgeOverlay {...segment.overlay} />}
    </AbsoluteFill>
  );
};
