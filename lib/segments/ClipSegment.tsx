import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from 'remotion';
import { CaptionStrip } from '../overlays/CaptionStrip';
import { StatCalloutOverlay } from '../overlays/StatCalloutOverlay';
import { QuotePullOverlay } from '../overlays/QuotePullOverlay';
import { SourceTagOverlay } from '../overlays/SourceTagOverlay';
import { TitleOverlay } from '../overlays/TitleOverlay';
import type { ClipSegmentBase } from '../reel-config-base/base-types';
import { cropCoverStyle } from '../reel-config-base/crop';
import { gradeFilter } from '../reel-config-base/grade';
import { GradeDefs } from './GradeDefs';

// Locally augment the base with the optional render-time fields this
// component knows how to display. Templates that don't set these get a
// fullbleed clip with no overlays.
interface ClipSegmentInput extends ClipSegmentBase {
  caption?: { lines?: Array<{ startMs: number; endMs: number; text: string }> };
  overlays?: Array<
    | { kind: 'title'; text: string; appearAt: number; durationMs: number }
    | { kind: 'quote-pull'; text: string; placement: string; appearAt: number; durationMs: number }
    | { kind: 'stat-callout'; number: string; unit?: string; label?: string; color: 'lime' | 'teal'; appearAt: number; durationMs: number }
    | { kind: 'source-tag'; text: string; position: 'bottom-left' | 'bottom-right' | 'top-right'; appearAt: number; durationMs: number }
  >;
}

interface Props {
  segment: ClipSegmentInput;
  chevron: string; // unused — chevron renders once at composition root
  transcript?: { words: Array<{ start: number; end: number; word: string }> };
}

export const ClipSegment: React.FC<Props> = ({ segment, transcript }) => {
  const { fps } = useVideoConfig();
  const videoCrop = cropCoverStyle(segment.crop, segment.focalX, segment.focalY);
  const gradeId = `grade-${segment.id}`;
  const filter = gradeFilter(segment.grade, gradeId);
  // Captions sit in a FIXED lower-third lane and never move for quote-pulls —
  // quote-pulls now live in their own fixed lane above the caption band (two
  // fixed lanes, no jumping; brand rule #5/#16). Only the bottom-anchored
  // TitleOverlay, which physically covers the caption band, still lifts the
  // caption for its window (the one-time opener).
  const captionLiftWindows = (segment.overlays ?? [])
    .filter((ov) => ov.kind === 'title')
    .map((ov) => {
      const o = ov as { appearAt: number; durationMs: number };
      return { startMs: o.appearAt, endMs: o.appearAt + o.durationMs };
    });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <GradeDefs id={gradeId} grade={segment.grade} />
      {segment.audioMode === 'silent' ? (
        <OffthreadVideo
          src={staticFile(`recordings/${segment.source}`)}
          trimBefore={Math.round(segment.trimIn * fps)}
          trimAfter={Math.round(segment.trimOut * fps)}
          muted
          volume={0}
          style={{ width: '100%', height: '100%', objectFit: 'cover', ...videoCrop, filter }}
        />
      ) : (
        <OffthreadVideo
          src={staticFile(`recordings/${segment.source}`)}
          trimBefore={Math.round(segment.trimIn * fps)}
          trimAfter={Math.round(segment.trimOut * fps)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', ...videoCrop, filter }}
        />
      )}
      {segment.audioMode !== 'silent' && (segment.caption || transcript) && (
        <CaptionStrip
          caption={segment.caption}
          transcript={transcript}
          liftWindows={captionLiftWindows}
        />
      )}
      {(segment.overlays ?? []).map((ov, i) => {
        if (ov.kind === 'stat-callout') return <StatCalloutOverlay key={i} {...ov} />;
        if (ov.kind === 'quote-pull')   return <QuotePullOverlay key={i} {...ov} />;
        if (ov.kind === 'source-tag')   return <SourceTagOverlay key={i} {...ov} />;
        if (ov.kind === 'title')        return <TitleOverlay key={i} {...ov} />;
        return null;
      })}
    </AbsoluteFill>
  );
};
