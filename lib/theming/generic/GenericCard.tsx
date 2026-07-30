// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoRenderProps } from '../types';
import type { CardTokens } from '../tokens';
import { anchorTiming } from '../../render/overlay-anchor';

// ---- defaults --------------------------------------------------------------
// Every value is a default for a token in ../tokens.ts, so a brand can move any
// of them. Two different kinds of default live below:
//  - COLOURS and FONTS are genuinely neutral: campaign-reels' own values (coal
//    `#0a0a0a`, paper `#f5f5f0`, accent `#c6f432`, `Geist`, its endpoint colour
//    `#2ad4c5`) are named in tokens.ts as migration examples only, and nothing
//    here is one of them.
//  - GEOMETRY AND TYPOGRAPHY MAGNITUDES are campaign-reels' tuned numbers,
//    carried over verbatim for render parity: `fontSize` 120, `lineHeight`
//    1.05, `letterSpacing` '-0.02em', `paddingX` 80, the pattern `opacity`
//    0.36, the stagger frames. PP-derived defaults, not values derived from
//    nothing — a second brand overrides them through tokens.card.
const DEFAULT_BACKGROUND = '#000000';
const DEFAULT_PATTERN = { color: '#ffffff', accentColor: '#ffffff', opacity: 0.36 };
// Pattern radii, pitches and angle are the pattern's own density — they do not
// scale against any other exposed token (a pattern's grain is not tied to
// type size the way the caption padding is to fontSize), so they stay
// absolute px/deg rather than an em ratio. Promoted to tokens at Task 5.1 so a
// brand CAN move them; defaults are campaign-reels' tuned literals, verbatim.
const DEFAULT_PIXELS_GEOMETRY = { radiusPx: 1.5, pitchPx: 36 };
const DEFAULT_DOTS_GEOMETRY = { radiusPx: 1, pitchPx: 60 };
const DEFAULT_GRID_GEOMETRY = { radiusPx: 1, pitchPx: 60 };
const DEFAULT_DIAGONALS_GEOMETRY = { angleDeg: 135, pitchPx: 24 };
// The diagonals' rule THICKNESS (not its pitch) is a hairline stroke width —
// genuinely absolute per CONSTRAINTS' own example, so it is not a token.
const DIAGONAL_LINE_WIDTH_PX = 1;
const DEFAULT_TEXT = {
  fontFamily: 'sans-serif',
  fontWeight: 700,
  fontSize: 120,
  color: '#ffffff',
  lineHeight: 1.05,
  letterSpacing: '-0.02em',
  paddingX: 80,
};
const DEFAULT_STAGGER = { stepFrames: 6, revealFrames: 12, risePx: 40 };

/** The CSS-gradient pattern layer. Pure `background-image`, no assets — which
 *  is what lets core ship it without owning any brand artwork. `accentColor`
 *  drives the denser pixel/dot fields; `color` the sparser grid/diagonal rules.
 *  Returns null for `none`, for an absent pattern, and for any UNKNOWN name —
 *  an unrecognised pattern degrades to a plain background, never a throw. */
function patternLayer(name: string | undefined, t: CardTokens['pattern']): React.ReactNode {
  const p = { ...DEFAULT_PATTERN, ...(t ?? {}) };
  let backgroundImage: string | undefined;
  let backgroundSize: string | undefined;
  switch (name) {
    case 'pixels': {
      const g = { ...DEFAULT_PIXELS_GEOMETRY, ...(t?.pixels ?? {}) };
      backgroundImage = `radial-gradient(circle at ${g.radiusPx * 2}px ${g.radiusPx * 2}px, ${p.accentColor} ${g.radiusPx}px, transparent ${g.radiusPx}px)`;
      backgroundSize = `${g.pitchPx}px ${g.pitchPx}px`;
      break;
    }
    case 'dots': {
      const g = { ...DEFAULT_DOTS_GEOMETRY, ...(t?.dots ?? {}) };
      backgroundImage = `radial-gradient(circle at ${g.radiusPx * 2}px ${g.radiusPx * 2}px, ${p.accentColor} ${g.radiusPx}px, transparent ${g.radiusPx}px)`;
      backgroundSize = `${g.pitchPx}px ${g.pitchPx}px`;
      break;
    }
    case 'grid': {
      const g = { ...DEFAULT_GRID_GEOMETRY, ...(t?.grid ?? {}) };
      backgroundImage = `radial-gradient(circle at ${g.radiusPx * 2}px ${g.radiusPx * 2}px, ${p.color} ${g.radiusPx}px, transparent ${g.radiusPx}px)`;
      backgroundSize = `${g.pitchPx}px ${g.pitchPx}px`;
      break;
    }
    case 'diagonals': {
      const g = { ...DEFAULT_DIAGONALS_GEOMETRY, ...(t?.diagonals ?? {}) };
      backgroundImage = `repeating-linear-gradient(${g.angleDeg}deg, ${p.color} 0 ${DIAGONAL_LINE_WIDTH_PX}px, transparent ${DIAGONAL_LINE_WIDTH_PX}px ${g.pitchPx}px)`;
      break;
    }
    default:
      return null;
  }
  return (
    <div
      data-card-pattern=""
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage,
        ...(backgroundSize ? { backgroundSize } : {}),
        opacity: Math.min(1, Math.max(0, p.opacity)),
      }}
    />
  );
}

/** A card PLATE: the content drawn over the background for one `cardKind`. */
type Plate = React.FC<{ props: Record<string, unknown>; tokens: CardTokens }>;

/** The staggered line stack — core's `claim-plate`. */
const ClaimPlate: Plate = ({ props, tokens }) => {
  const frame = useCurrentFrame();
  const text = { ...DEFAULT_TEXT, ...(tokens.text ?? {}) };
  const stagger = { ...DEFAULT_STAGGER, ...(tokens.stagger ?? {}) };
  const endpoint = tokens.endpoint;
  const lines = Array.isArray(props.lines) ? (props.lines as unknown[]).map(String) : [];

  return (
    <div
      data-card-lines=""
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: `0 ${text.paddingX}px`,
        color: text.color,
      }}
    >
      {lines.map((line, i) => {
        const start = i * stagger.stepFrames;
        const range: [number, number] = [start, start + stagger.revealFrames];
        const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
        const opacity = interpolate(frame, range, [0, 1], clamp);
        const translateY = interpolate(frame, range, [stagger.risePx, 0], clamp);
        return (
          <div
            key={i}
            data-card-line=""
            style={{
              fontFamily: text.fontFamily,
              fontWeight: text.fontWeight,
              fontSize: text.fontSize,
              lineHeight: text.lineHeight,
              letterSpacing: text.letterSpacing,
              color: text.color,
              opacity,
              transform: `translateY(${translateY}px)`,
            }}
          >
            {line}
            {endpoint && i === lines.length - 1 ? (
              <span data-card-endpoint="" style={{ color: endpoint.color ?? text.color }}>
                {endpoint.text ?? '.'}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

/** The OPEN cardKind dispatch table. Core implements the one plate that
 *  generalises — a stack of claim lines. A `cardKind` that is not in here draws
 *  the background and nothing else (never a throw), which is exactly how
 *  campaign-reels behaves today for its three declared-but-unimplemented kinds
 *  (`plate = null`). A brand adds a plate by registering its own `card`
 *  renderer, the same way it would any other kind. */
const CARD_PLATES: Record<string, Plate> = {
  'claim-plate': ClaimPlate,
};

/** Core's generic `card`: a full-frame plate — a background (optionally a
 *  CSS-gradient pattern) plus, for a known `cardKind`, its content.
 *
 *  Effects on the item are applied AROUND this by `renderVideoItemNode`, so
 *  nothing is applied here. */
export const GenericCard: React.FC<VideoRenderProps> = ({
  item,
  handles,
  tokens,
  anchoredOverlays,
  renderAnchoredOverlay,
}) => {
  // Read before the early return below so the hook order never depends on
  // `item.kind` (rules of hooks).
  const { fps } = useVideoConfig();
  if (item.kind !== 'card') return null;

  const t: CardTokens = tokens?.card ?? {};
  const PlateComponent = CARD_PLATES[item.cardKind];

  return (
    <div data-card-bg="" style={{ position: 'absolute', inset: 0, backgroundColor: t.background ?? DEFAULT_BACKGROUND }}>
      {patternLayer(item.pattern, t.pattern)}
      {PlateComponent ? <PlateComponent props={item.cardProps ?? {}} tokens={t} /> : null}
      {/* Phase 4 Task 4.1 — this item's anchored overlays, at the same
          composition frame they would land on if routed 'track' instead (see
          ../../render/overlay-anchor.ts). The root div above already wraps
          unconditionally, so an empty map here changes nothing for the
          zero-overlay case. */}
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
  );
};
