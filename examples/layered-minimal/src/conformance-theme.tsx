// The CONFORMANCE fixture theme — Phase 4 Task 6.2.
//
// `theme.tsx` (MinimalReel's own theme) shows a brand that registers almost
// nothing: one overlay renderer, some tokens. That is the common case, but it
// proves nothing about the SEVEN extension axes Phase 3/4 built — nothing
// here exercises a registered video kind, a non-text overlay, an anchored
// overlay, a clip- or media-scope effect, a STYLE-axis effect
// (`theme.styleEffects`, Task 3.2), a brand-layer kind, a brand-authored
// transition, or a media-source override. This theme registers all seven,
// each with a look UNMISTAKABLY different from the core generic it replaces —
// magenta-on-ink, monospace, hard angles — so a test asserting "the brand
// renderer won" cannot be satisfied by a brand renderer that happens to look
// like core's own.
//
// This is the file a new brand is meant to copy registrations OUT of. Each
// block below is deliberately minimal — the point Task 1.2/3.2/3.3/4.1/4.2
// each made is that a brand adds an axis in a handful of lines, not a rewrite.
import React from 'react';
import type {
  CompositionTheme,
  VideoRenderProps,
  EffectRenderer,
  BrandRenderer,
  StyleEffectRenderer,
} from '@video-toolkit/lib/theming';
import { resolveMediaSource as coreResolveMediaSource } from '@video-toolkit/lib/theming';
import type { OverlayItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const INK = '#14001a';
const MAGENTA = '#ff2fb0';

// ---------------------------------------------------------------------------
// AXIS 1 — video: a registered kind. Replaces core's GenericCard (a plain
// background + staggered lines) with a diagonal-striped plate — five lines.
// ---------------------------------------------------------------------------
const ConformanceCard: React.FC<VideoRenderProps> = ({ item }) => {
  if (item.kind !== 'card') return null;
  const lines = Array.isArray(item.cardProps?.lines) ? (item.cardProps!.lines as unknown[]).map(String) : [];
  return (
    <div
      data-conformance-card=""
      style={{
        position: 'absolute',
        inset: 0,
        background: `repeating-linear-gradient(45deg, ${MAGENTA}, ${MAGENTA} 12px, ${INK} 12px, ${INK} 28px)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontWeight: 800,
        fontSize: 56,
        textAlign: 'center',
      }}
    >
      {lines.join(' / ')}
    </div>
  );
};

// ---------------------------------------------------------------------------
// AXIS 2 — overlay: a non-'text' kind, routed 'anchored', drawn via the
// item-level `render` escape hatch (the only way a non-core kind draws — see
// BrandTheme.overlays' own doc comment).
// ---------------------------------------------------------------------------
const ConformanceBadge: React.FC<{ item: OverlayItem }> = ({ item }) => {
  const content = item.content as { label?: string };
  return (
    <div
      data-conformance-badge=""
      style={{
        position: 'absolute',
        top: 64,
        right: 48,
        padding: '10px 22px',
        background: MAGENTA,
        color: INK,
        fontFamily: 'monospace',
        fontWeight: 800,
        letterSpacing: '0.08em',
        clipPath: 'polygon(12% 0, 100% 0, 88% 100%, 0 100%)',
      }}
    >
      {content.label ?? ''}
    </div>
  );
};

// ---------------------------------------------------------------------------
// AXIS 3a — effect, scope: 'clip' (the default). Wraps the WHOLE item
// renderer's output in a hard magenta frame + a blend mode core's own
// grain/vignette primitives never use.
// ---------------------------------------------------------------------------
const GlitchFrameEffect: EffectRenderer = ({ children }) => (
  <div data-conformance-glitch-frame="" style={{ position: 'absolute', inset: 0, border: `6px solid ${MAGENTA}`, mixBlendMode: 'difference' }}>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// AXIS 3b — effect, scope: 'media'. Builds a SECOND element carrying the
// media's own merged style (crop + ken-burns + grade — see `mediaStyle`'s
// doc), offset sideways for a cheap RGB-split ghost. This is the shape a
// media-scope effect earns (Task 3.3's `blend`), not a wrapper.
// ---------------------------------------------------------------------------
const GhostEchoEffect: EffectRenderer = ({ children, mediaStyle, config }) => {
  const offsetPx = (config as { offsetPx?: number } | undefined)?.offsetPx ?? 18;
  return (
    <>
      {children}
      {/* Re-mounts `children` itself (the media element this effect wraps),
          not an empty styled div — a visible magenta-shifted ghost of the
          SAME image, not just a faint blend nobody can see (fix round 1,
          Minor 7: the first version rendered an empty div and contributed no
          visible content to a real frame). This is the shape a media-scope
          effect actually earns (Task 3.3's `blend`): a SECOND media element
          carrying the first one's own merged style. */}
      <div
        data-conformance-ghost-echo=""
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.55,
          mixBlendMode: 'screen',
          filter: 'hue-rotate(280deg) saturate(3)',
          transform: `${mediaStyle?.transform ?? ''} translateX(${offsetPx}px)`.trim(),
        }}
      >
        {children}
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// AXIS 4 — brand-layer. `BrandKind` (lib/theming/types.ts) is documented as
// OPEN ("watermark / disclaimer / whatever a brand names") — but
// `BrandLayerItemSchema.kind` (lib/reel-config-base/layered-schema.ts) is a
// CLOSED `z.enum(['watermark','disclaimer'])`, so a schema-valid,
// literal-JSON `defaultProps` cannot actually author a THIRD kind — doing so
// does not typecheck against `LayeredReel`. This is a CONTRACT FINDING (see
// task-6.2-report.md), not something this fixture works around: it registers
// its own renderer for the EXISTING 'disclaimer' kind instead, which still
// demonstrates the real capability (a brand-layer renderer replaces core's
// generic, config and all) without leaning on the still-open gap.
// ---------------------------------------------------------------------------
const ConformanceSticker: BrandRenderer = ({ item }) => {
  const text = (item.props ?? {}).text;
  return (
    <div
      data-conformance-sticker=""
      style={{
        position: 'absolute',
        left: 40,
        bottom: 220,
        padding: '8px 16px',
        background: INK,
        border: `3px solid ${MAGENTA}`,
        color: MAGENTA,
        fontFamily: 'monospace',
        transform: 'rotate(-6deg)',
      }}
    >
      {typeof text === 'string' ? text : ''}
    </div>
  );
};

// ---------------------------------------------------------------------------
// AXIS 5 — transition: a brand-authored kind ('shard-cut') core has never
// catalogued. Returned as a one-sided `@remotion/transitions`-shaped
// presentation (passedProps/presentationDirection/presentationProgress/
// presentationDurationInFrames) — core LIFTS it into the two-input model
// (see lib/render/at-cut-transitions.tsx, `fromRemotionPresentation`), so a
// brand never has to write the two-input compositing itself. A zigzag
// clip-path reveal, unmistakably not one of core's own wipes.
// ---------------------------------------------------------------------------
const ShardCut: React.FC<{
  passedProps: { teeth: number };
  presentationDirection: 'entering' | 'exiting';
  presentationProgress: number;
  children: React.ReactNode;
}> = ({ passedProps, presentationDirection, presentationProgress, children }) => {
  const teeth = Math.max(2, Math.round(passedProps.teeth));
  // Exiting shrinks from 100%->0%, entering grows 0%->100% — a jagged
  // (zigzag) reveal edge instead of a straight sweep, `teeth` spikes wide.
  const p = presentationDirection === 'exiting' ? 1 - presentationProgress : presentationProgress;
  const points: string[] = ['0% 0%'];
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 100;
    const jitter = i % 2 === 0 ? 0 : 8;
    points.push(`${Math.min(100, x + p * 100 - jitter).toFixed(2)}% ${((i / teeth) * 100).toFixed(2)}%`);
  }
  points.push('0% 100%');
  return (
    <div
      data-conformance-shard-cut={presentationDirection}
      style={{ position: 'absolute', inset: 0, clipPath: `polygon(${points.join(', ')})` }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// AXIS 7 — style effect (`theme.styleEffects`, Task 3.2). Unlike a WRAPPER
// effect (axis 3 above), a style effect never sees `children` — it is a pure
// function of the item/frame to a `MediaStyleFragment` that gets MERGED onto
// the media element's own style, the same element the crop/ken-burns/grade
// fragments already write onto (see lib/theming/effects/style-effect.ts). An
// `ink-wash` desaturation is a legible, unmistakably non-core look for this:
// core's own two style types (`ken-burns`, `grade`) move/tint the image, they
// never flatten it to grayscale.
// ---------------------------------------------------------------------------
const InkWashStyleEffect: StyleEffectRenderer = ({ effect }) => {
  // Reads straight off the authored effect entry — a style effect has no
  // registration-level `config` the way a wrapper effect does (there is no
  // `EffectRenderProps.config` equivalent here); see StyleEffectRenderProps.
  const strength = (effect as { strength?: number }).strength ?? 1;
  return { filter: `grayscale(${strength}) contrast(1.35)` };
};

export const conformanceTheme: CompositionTheme = {
  accentSlots: [{ key: 'accent', label: 'Accent', color: MAGENTA }],
  background: INK,

  // AXIS 1 — video.
  video: { card: { renderer: ConformanceCard } },

  // AXIS 2 — overlay: non-'text' kind, anchored.
  overlays: {
    badge: { routing: 'anchored', render: (item) => <ConformanceBadge item={item} /> },
  },

  // AXIS 3 — effect, both scopes. `teeth` on the transition below is the
  // `params` axis this file exercises; this registration carries none, which
  // is itself the point (params are OPTIONAL — see registry.ts).
  effects: {
    'glitch-frame': { renderer: GlitchFrameEffect },
    // 24, deliberately DIFFERENT from GhostEchoEffect's own `?? 18` default —
    // a config-key typo (reading `.offset` instead of `.offsetPx`) would fall
    // through to that default and still render SOMETHING, so the two values
    // must differ for a test to tell "read from config" apart from "fell
    // back to the default that happens to match".
    'ghost-echo': { renderer: GhostEchoEffect, scope: 'media', config: { offsetPx: 24 } },
  },

  // AXIS 4 — brand-layer. 'disclaimer' — see the CONTRACT FINDING above.
  brand: { disclaimer: { renderer: ConformanceSticker } },

  // AXIS 7 — style effect. Composes onto the SAME media element ken-burns'
  // own style fragment lands on — see `InkWashStyleEffect` above.
  styleEffects: { 'ink-wash': { renderer: InkWashStyleEffect } },

  // AXIS 5 — transition, WITH params (the schema-driven inspector path).
  transitions: {
    'shard-cut': {
      renderer: ({ transition }) => ({
        component: ShardCut,
        // A brand reads its own params through a cast — `transition` is a
        // union of every core kind plus the brand's own, so a bare property
        // access does not typecheck (see Task 1.2's report, concern 1).
        props: { teeth: (transition as { teeth?: number }).teeth ?? 6 },
      }),
      params: [{ prop: 'teeth', label: 'Teeth', type: 'number', min: 2, max: 20 }],
    },
  },

  // AXIS 6 — media-source override. Core's own rule leaves a bare `photo`
  // source UNPREFIXED (see lib/theming/media-source.ts) — this fixture's reel
  // authors photo sources as bare filenames ANYWAY, so the override is what
  // makes them resolve to a real asset (`public/photos/...`) at all: remove
  // this registration and the photo item points at a file that doesn't exist.
  resolveMediaSource: (raw, role) => {
    if (raw.startsWith('http')) return raw;
    if (role === 'photo' && !raw.includes('/')) return `photos/${raw}`;
    return coreResolveMediaSource(raw, role);
  },
};
