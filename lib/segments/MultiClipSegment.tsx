import { AbsoluteFill, OffthreadVideo, staticFile, useVideoConfig } from 'remotion';
import { StatCalloutOverlay } from '../overlays/StatCalloutOverlay';
import { QuotePullOverlay } from '../overlays/QuotePullOverlay';
import { SourceTagOverlay } from '../overlays/SourceTagOverlay';
import { TitleOverlay } from '../overlays/TitleOverlay';
import type { MultiClipSegmentBase } from '../reel-config-base/base-types';

// Locally augment the base with the optional render-time fields this
// component knows how to display. Templates that don't set these get a
// plain multi-clip layout with no overlay.
interface MultiClipSegmentInput extends MultiClipSegmentBase {
  overlay?:
    | { kind: 'title'; text: string; appearAt: number; durationMs: number }
    | { kind: 'quote-pull'; text: string; placement: string; appearAt: number; durationMs: number }
    | { kind: 'stat-callout'; number: string; unit?: string; label?: string; color: 'lime' | 'teal'; appearAt: number; durationMs: number }
    | { kind: 'source-tag'; text: string; position: 'bottom-left' | 'bottom-right' | 'top-right'; appearAt: number; durationMs: number };
}

interface Props { segment: MultiClipSegmentInput; chevron: string; }

const resolveSource = (raw: string): string => {
  if (raw.startsWith('broll/') || raw.startsWith('recordings/')) return raw;
  return `broll/${raw}`;
};

// `chevron` kept in Props for call-site symmetry with ClipSegment/BrollSegment;
// MultiClipSegment never renders a chevron itself, so we ignore it here.
export const MultiClipSegment: React.FC<Props> = ({ segment }) => {
  const { fps } = useVideoConfig();
  const renderClip = (i: number) => {
    const c = segment.sources[i];
    if (!c) return null;
    const isMuted =
      segment.audioMode === 'silent' ||
      (i > 0 && segment.audioMode !== 'mix');
    return (
      <OffthreadVideo
        src={staticFile(resolveSource(c.source))}
        trimBefore={Math.round(c.trimIn * fps)}
        trimAfter={Math.round(c.trimOut * fps)}
        muted={isMuted}
        volume={isMuted ? 0 : 1}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    );
  };

  const labelOverlay = (i: number) => {
    const lbl = segment.sources[i]?.label;
    if (!lbl) return null;
    return (
      <div style={{
        position: 'absolute', top: 24, left: 24,
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700, fontSize: 22,
        color: '#c6f432', letterSpacing: '0.08em',
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}>{lbl}</div>
    );
  };

  let layout: React.ReactNode;
  if (segment.layout === 'split-h') {
    layout = (
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', borderBottom: '4px solid #0a0a0a' }}>
          {renderClip(0)}{labelOverlay(0)}
        </div>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {renderClip(1)}{labelOverlay(1)}
        </div>
      </AbsoluteFill>
    );
  } else if (segment.layout === 'split-v') {
    layout = (
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'row' }}>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden', borderRight: '4px solid #0a0a0a' }}>
          {renderClip(0)}{labelOverlay(0)}
        </div>
        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
          {renderClip(1)}{labelOverlay(1)}
        </div>
      </AbsoluteFill>
    );
  } else if (segment.layout === 'pip') {
    layout = (
      <AbsoluteFill>
        <div style={{ position: 'absolute', inset: 0 }}>{renderClip(0)}</div>
        <div style={{
          position: 'absolute', right: 60, bottom: 280,
          width: 360, height: 480, overflow: 'hidden',
          border: '4px solid #c6f432',
        }}>
          {renderClip(1)}{labelOverlay(1)}
        </div>
      </AbsoluteFill>
    );
  } else {
    // quad
    layout = (
      <AbsoluteFill style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 4,
        backgroundColor: '#0a0a0a',
      }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ position: 'relative', overflow: 'hidden' }}>
            {renderClip(i)}{labelOverlay(i)}
          </div>
        ))}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {layout}
      {segment.overlay?.kind === 'stat-callout' && <StatCalloutOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'quote-pull'   && <QuotePullOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'source-tag' && <SourceTagOverlay {...segment.overlay} />}
      {segment.overlay?.kind === 'title'       && <TitleOverlay {...segment.overlay} />}
    </AbsoluteFill>
  );
};
