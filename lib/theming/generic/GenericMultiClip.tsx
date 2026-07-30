// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { Sequence, useVideoConfig } from 'remotion';
import type { VideoItem } from '../../reel-config-base/layered-schema';
import type { VideoRenderProps } from '../types';
import type { MultiClipTokens } from '../tokens';
import { SegmentMedia } from '../segment/SegmentMedia';
import { MediaEffectsBoundary } from '../effects/media-effects-context';
import { anchorTiming } from '../../render/overlay-anchor';

// ---- defaults --------------------------------------------------------------
// Every value here is a default for a token in ../tokens.ts, so a brand can
// move any of them. Two different kinds of default live below:
//  - COLOURS and FONTS are genuinely neutral — where campaign-reels' literal
//    was an identity colour (its coal `#0a0a0a`, its accent `#c6f432`) core
//    uses plain black/white instead, and the font is `monospace`.
//  - GEOMETRY AND TYPOGRAPHY MAGNITUDES are campaign-reels' tuned numbers,
//    carried over verbatim for render parity: the border widths, the PIP box,
//    the label's `fontSize` 22 / `letterSpacing` '0.08em' / `textShadow`.
//    They are PP-derived defaults, not values derived from nothing — every
//    other brand overrides them through tokens.multiClip.
const DEFAULT_BORDER_PX = 4;
const DEFAULT_BORDER_COLOR = '#000000';
const DEFAULT_BACKGROUND = '#000000';
const DEFAULT_QUAD_GAP_PX = 4;
// Split ratio and quad template are proportions, not px — CSS flex-grow and
// grid `fr` units are already scale-free, so no unit conversion is needed to
// keep them token-driven. Defaults reproduce campaign-reels' only split (an
// even one): `flex: 0.5` on both split panes is visually identical to the
// former hardcoded `flex: 1` on both (flex-grow only distributes surplus
// space in PROPORTION, so 0.5:0.5 splits exactly like 1:1), and `1fr 1fr` is
// unchanged from the former literal grid-template string.
const DEFAULT_SPLIT_RATIO = 0.5;
const DEFAULT_QUAD_COLUMNS: [number, number] = [1, 1];
const DEFAULT_QUAD_ROWS: [number, number] = [1, 1];
// PIP geometry defaults are sized for the 1080x1920 vertical frame the reel
// templates use; any other frame overrides them via tokens.multiClip.pip.
const DEFAULT_PIP = { width: 360, height: 480, right: 60, bottom: 280, borderPx: 4, borderColor: '#ffffff' };
const DEFAULT_LABEL = {
  fontFamily: 'monospace',
  fontSize: 22,
  fontWeight: 700,
  color: '#ffffff',
  top: 24,
  left: 24,
  letterSpacing: '0.08em',
  textShadow: '0 2px 8px rgba(0,0,0,0.6)',
};

// A sub-source that is not a video file is fed to SegmentMedia as a `photo`
// rather than a `clip`. campaign-reels only ever used video sub-sources and
// hardcoded `kind: 'clip'`, which would hand a still to <OffthreadVideo>; core
// cannot assume that, and SegmentMedia already distinguishes the two (it even
// handles a video-as-photo by the same extension test). Nothing changes for a
// video sub-source, which is every sub-source campaign-reels has.
const VIDEO_EXT_RE = /\.(mp4|mov|webm)$/i;

/** How many panes each layout draws. An unknown layout falls through to `quad`,
 *  mirroring campaign-reels' `else` branch. */
const PANES_PER_LAYOUT: Record<string, number> = { 'split-h': 2, 'split-v': 2, pip: 2, quad: 4 };

const fillStyle: React.CSSProperties = { position: 'absolute', inset: 0 };

/** Core's generic `multi-clip`: two or four sub-sources sharing the frame in
 *  one of four layouts (`split-h`, `split-v`, `pip`, `quad`).
 *
 *  Ported from campaign-reels' MultiClipSegment — the only implementation of
 *  this kind in any brand repo — with every brand literal replaced by a token
 *  from ../tokens.ts carrying a neutral default.
 *
 *  CAVEAT, carried forward from campaign-reels deliberately: a sub-source's
 *  trim is NOT extended into the item's handle frames. So a transition on a
 *  multi-clip item shifts its Sequence (core's buildVideoNodes) and wraps it in
 *  the presentation, but the sub-sources themselves do not grow — the same "no
 *  source clamp" fallback card/outro have. Sizing each sub-source's own handle
 *  would need per-source in/out bookkeeping that no fixture in either brand
 *  repo exercises; campaign-reels marked this unverified. Preserved as-is
 *  because changing it would be an unrequested LOOK change, not a fix.
 *
 *  Sound: sub-clips are always muted (SegmentMedia mutes unconditionally) —
 *  audio lives on the audio track. Effects on the parent item are applied
 *  AROUND this whole renderer by `renderVideoItemNode`, not here.
 *
 *  `SubSource.zoom` is currently ignored, as it is in campaign-reels. */
export const GenericMultiClip: React.FC<VideoRenderProps> = ({
  item,
  handles,
  tokens,
  resolveMediaSource,
  styleEffects,
  anchoredOverlays,
  renderAnchoredOverlay,
}) => {
  // Read before the early return below so the hook order never depends on
  // `item.kind` (rules of hooks) — mirrors SegmentMedia's same discipline.
  const { fps } = useVideoConfig();
  if (item.kind !== 'multi-clip') return null;

  const t: MultiClipTokens = tokens?.multiClip ?? {};
  const borderPx = t.borderPx ?? DEFAULT_BORDER_PX;
  const borderColor = t.borderColor ?? DEFAULT_BORDER_COLOR;
  const divider = `${borderPx}px solid ${borderColor}`;
  const pip = { ...DEFAULT_PIP, ...(t.pip ?? {}) };
  const label = { ...DEFAULT_LABEL, ...(t.label ?? {}) };
  const splitRatio = t.splitRatio ?? DEFAULT_SPLIT_RATIO;
  const [quadCol0, quadCol1] = t.quadColumns ?? DEFAULT_QUAD_COLUMNS;
  const [quadRow0, quadRow1] = t.quadRows ?? DEFAULT_QUAD_ROWS;

  /** One pane's media: a SYNTHETIC VideoItem with a 0-BASED span whose length
   *  is the sub-source's own trim span, and `handles {0,0}` — sub-clips never
   *  participate in cross-item transitions, so they borrow nothing. */
  const renderPane = (i: number): React.ReactNode => {
    const s = item.sources[i];
    if (!s) return null; // fewer sources than the layout expects: draw what there is
    const span = { id: `${item.id}-${i}`, source: s.source, startMs: 0, endMs: Math.max(0, s.sourceOutMs - s.sourceInMs) };
    const subItem: VideoItem = VIDEO_EXT_RE.test(s.source)
      ? { ...span, kind: 'clip', sourceInMs: s.sourceInMs, sourceOutMs: s.sourceOutMs }
      : { ...span, kind: 'photo' }; // a still has no source trim — its span IS its on-screen span
    // The brand's wholesale source resolver (if any) is forwarded, so a
    // sub-source follows the same media-path rule as a top-level clip. Same
    // for the style-effect registry — a sub-source's synthetic VideoItem
    // carries no `effects` today, so this is currently inert, but forwarding
    // it keeps this call site consistent with every other prop SegmentMedia
    // reads off the theme, rather than a silent gap waiting for the day a
    // sub-source DOES get an `effects[]`.
    return (
      <SegmentMedia
        item={subItem}
        handles={{ inHalf: 0, outHalf: 0 }}
        resolveMediaSource={resolveMediaSource}
        styleEffects={styleEffects}
      />
    );
  };

  const renderLabel = (i: number): React.ReactNode => {
    const text = item.sources[i]?.label;
    if (!text) return null;
    return (
      <div
        data-pane-label=""
        style={{
          position: 'absolute',
          top: label.top,
          left: label.left,
          fontFamily: label.fontFamily,
          fontWeight: label.fontWeight,
          fontSize: label.fontSize,
          color: label.color,
          letterSpacing: label.letterSpacing,
          textShadow: label.textShadow,
        }}
      >
        {text}
      </div>
    );
  };

  const pane = (i: number, style: React.CSSProperties): React.ReactNode => (
    <div key={i} data-pane="" style={{ position: 'relative', overflow: 'hidden', ...style }}>
      {renderPane(i)}
      {renderLabel(i)}
    </div>
  );

  const layoutKey = PANES_PER_LAYOUT[item.layout] === undefined ? 'quad' : item.layout;

  let layout: React.ReactNode;
  if (layoutKey === 'split-h') {
    layout = (
      <div data-multiclip-layout="" style={{ ...fillStyle, display: 'flex', flexDirection: 'column' }}>
        {pane(0, { flex: splitRatio, borderBottom: divider })}
        {pane(1, { flex: 1 - splitRatio })}
      </div>
    );
  } else if (layoutKey === 'split-v') {
    layout = (
      <div data-multiclip-layout="" style={{ ...fillStyle, display: 'flex', flexDirection: 'row' }}>
        {pane(0, { flex: splitRatio, borderRight: divider })}
        {pane(1, { flex: 1 - splitRatio })}
      </div>
    );
  } else if (layoutKey === 'pip') {
    layout = (
      <div data-multiclip-layout="" style={fillStyle}>
        <div data-pane="" style={{ ...fillStyle, overflow: 'hidden' }}>
          {renderPane(0)}
          {renderLabel(0)}
        </div>
        <div
          data-pip-box=""
          data-pane=""
          style={{
            position: 'absolute',
            right: pip.right,
            bottom: pip.bottom,
            width: pip.width,
            height: pip.height,
            overflow: 'hidden',
            border: `${pip.borderPx}px solid ${pip.borderColor}`,
          }}
        >
          {renderPane(1)}
          {renderLabel(1)}
        </div>
      </div>
    );
  } else {
    layout = (
      <div
        data-multiclip-layout=""
        style={{
          ...fillStyle,
          display: 'grid',
          gridTemplateColumns: `${quadCol0}fr ${quadCol1}fr`,
          gridTemplateRows: `${quadRow0}fr ${quadRow1}fr`,
          gap: t.quadGapPx ?? DEFAULT_QUAD_GAP_PX,
        }}
      >
        {/* The gaps show the root background through, which is why the grid
            itself paints none. */}
        {[0, 1, 2, 3].filter((i) => item.sources[i]).map((i) => pane(i, {}))}
      </div>
    );
  }

  return (
    // Phase 4 Task 3.3 — resets media-scope effect delivery for every pane's
    // SegmentMedia call below. Without this, a media-scope effect on the
    // MULTI-CLIP item itself (delivered via MediaEffectsContext one level up,
    // in renderVideoItemNode) would leak onto every synthetic sub-item's own
    // SegmentMedia call — applying it once per pane instead of once, which is
    // not "wrap the media element" but "wrap every media element", a
    // different and unrequested thing. See ../effects/media-effects-context.tsx.
    <MediaEffectsBoundary>
      <div data-multiclip-root="" style={{ ...fillStyle, backgroundColor: t.background ?? DEFAULT_BACKGROUND }}>
        {layout}
        {/* Phase 4 Task 4.1 — this item's anchored overlays, at the same
            composition frame they would land on if routed 'track' instead
            (see ../../render/overlay-anchor.ts). The root div above already
            wraps unconditionally, so appending an empty map here changes
            nothing for the zero-overlay case. */}
        {(anchoredOverlays ?? []).map((o) => {
          if (!renderAnchoredOverlay) return null;
          const { from, durationInFrames } = anchorTiming(o, item, handles, fps);
          if (durationInFrames <= 0) return null;
          return (
            <Sequence key={o.id} from={from} durationInFrames={durationInFrames} name={o.id}>
              {renderAnchoredOverlay(o)}
            </Sequence>
          );
        })}
      </div>
    </MediaEffectsBoundary>
  );
};
