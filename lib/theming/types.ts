import type React from 'react';
import type { Registration, Registry } from './registry';
// Type-only import — erased at runtime, so this does NOT create a module cycle
// with effects/index.ts (which imports BrandTheme back, also type-only).
import type { EffectRenderProps } from './effects';
import type { AccentSlot } from './palette';
import type { ThemeTokens } from './tokens';
import type { Placement } from './placement';
import type { MediaSourceResolver } from './media-source';
import type { VideoItem, AudioItem, OverlayItem, BrandLayerItem } from '../reel-config-base/layered-schema';

/** The static prop bag every text-overlay renderer receives. Frame-derived
 *  values (localFrame/totalFrames/fps) are read from Remotion hooks INSIDE the
 *  renderer's Sequence, not passed here. */
export interface OverlayRenderProps {
  text: string;
  placement: Placement;
  fontSize?: number;
  /** Appear animation. 'none' = shown instantly (no reveal). */
  reveal?: 'line' | 'all' | 'none';
  /** Disappear animation. 'fade' = fade out at the end; 'none' = cut (no hide). */
  hide?: 'fade' | 'none';
  /** Brand palette; renderers resolve keys→hex via paletteMap/resolveAccentColor. */
  palette: readonly AccentSlot[];
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Usually 0 — the overlay is mounted in a Sequence at the item's start. */
  appearAtMs: number;
  durationMs: number;
}

export type OverlayRenderer = React.FC<OverlayRenderProps>;

/** Overlay kinds are OPEN — a brand names them, core never enumerates them.
 *  Core knows routing MODES and the handful of kinds it can draw itself. */
export type OverlayKind = string;

/** The overlay kinds core has a generic renderer for ('quote-pull' is the
 *  legacy alias of 'text'). Everything else draws only if a brand registers it. */
export type CoreOverlayKind = 'text';

/** The theming contract a brand's theme object satisfies. */
export interface BrandTheme {
  accentSlots: readonly AccentSlot[];
  /** ONE open-keyed overlay registry. Absent kind → core generic (text) → null.
   *
   *  Caveat on which field draws what: at item level core honours `render`
   *  (the escape hatch) for ANY kind, but `renderer` — which takes
   *  OverlayRenderProps — is consumed only through the core text adapter, i.e.
   *  for the core kinds 'text' and its legacy alias 'quote-pull'. A `renderer`
   *  on a non-core kind (`{ chevron: { renderer: X } }`) is therefore ignored;
   *  register such kinds with `render`. */
  overlays?: Record<OverlayKind, OverlayItemRegistration>;
  /** Per-kind brand-custom video renderer + config. Absent kind → core generic. */
  video?: Partial<Record<VideoKind, VideoRegistration>>;
  /** ONE open-keyed effect registry. Effect types are OPEN — a brand names
   *  them, core never enumerates them. Absent type → core generic primitive
   *  (grain/scanlines/vignette/grade/transform) → silently skipped. */
  effects?: Registry<EffectRenderProps>;
  /** ONE open-keyed brand-layer registry (watermark / disclaimer / whatever a
   *  brand names). Absent kind → core generic (GenericWatermark /
   *  GenericDisclaimer) → silently skipped. Consumed by
   *  `defaultRenderBrandTrack`; the whole-track escape hatch
   *  {@link CompositionTheme.renderBrandTrack} still wins over it entirely. */
  brand?: Registry<BrandRenderProps>;
  /** Look constants for core's GENERIC renderers (see ./tokens.ts). Every
   *  field is optional with a neutral core default, so omitting `tokens`
   *  entirely still renders. This is how a brand re-colours a generic instead
   *  of copy-pasting it into its own renderer. */
  tokens?: ThemeTokens;
}

/** All video-track item kinds. EVERY kind now has a core generic renderer
 *  (footage kinds → SegmentMedia; multi-clip/card/outro → the generics in
 *  ./generic), so a brand that registers nothing still renders a whole reel. */
export type VideoKind = 'clip' | 'broll' | 'photo' | 'multi-clip' | 'card' | 'outro';
/** @deprecated The footage/non-footage split existed only because footage
 *  kinds were the ones with a generic beneath them. Since Phase 3 Task 3 every
 *  kind has one, so `resolveVideoRenderer` no longer distinguishes them. Kept
 *  as an alias so existing brand imports keep compiling. */
export type FootageVideoKind = 'clip' | 'broll' | 'photo';

/** The static prop bag every video renderer receives. Frame-derived values
 *  (localFrame/fps/dims) are read from Remotion hooks INSIDE the renderer,
 *  not passed here — mirrors OverlayRenderProps. */
export interface VideoRenderProps {
  item: VideoItem;
  /** Extra frames borrowed at each edge for cross-item transitions (0 when none). */
  handles: { inHalf: number; outHalf: number };
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Overlay items anchored to this video item whose kind routes 'anchored'
   *  (core-supplied — e.g. campaign's title, whose caption-lift lives in the body). */
  anchoredOverlays?: OverlayItem[];
  /** The audio item following this video item, for READ-ONLY use (e.g. deriving
   *  captions via transcriptWindow). The core composition already mounts every
   *  audio-track item on the audio track — a renderer must NOT mount this as an
   *  <Audio> itself, or the voice double-plays. */
  boundAudio?: AudioItem;
  /** The theme's look constants for core's generic renderers (see ./tokens.ts).
   *  Core-supplied — `renderVideoItemNode` threads `theme.tokens` through here.
   *  Deliberately this ONE narrow typed field rather than the theme itself:
   *  VideoRenderProps still carries no CompositionTheme. */
  tokens?: ThemeTokens;
  /** The theme's wholesale media-path override, threaded by
   *  `renderVideoItemNode` the same narrow way `tokens` is. Absent → the
   *  renderer falls back to core's `resolveMediaSource` (./media-source.ts).
   *  A renderer must apply this at render time only — never write the result
   *  back onto `item.source`, which captions are derived from. */
  resolveMediaSource?: MediaSourceResolver;
}

export type VideoRenderer = React.FC<VideoRenderProps>;

/** One video kind's registration. Built on the shared `Registration`
 *  primitive, so this axis resolves through `resolveRegistered` like the
 *  overlay and effect axes do — and, like them, a registration with NO
 *  `renderer` contributes `config`/`params` only and does not mask the core
 *  generic for that kind.
 *
 *  Like `Registration`, deliberately NOT open with an index signature: a
 *  typo'd `renderer` must not compile clean and silently drop the brand's
 *  renderer into the core generic. */
export interface VideoRegistration extends Registration<VideoRenderProps> {
  renderer?: VideoRenderer;
}

/** The static prop bag every brand-layer renderer receives. Mirrors
 *  VideoRenderProps: the raw item, the brand's opaque per-kind config, and the
 *  theme's typed look constants — deliberately NOT the theme itself. */
export interface BrandRenderProps {
  item: BrandLayerItem;
  /** Opaque brand-level config threaded down from the theme's registration. */
  config?: unknown;
  /** The theme's look constants for core's generic brand renderers
   *  (see ./tokens.ts). Core-supplied by `defaultRenderBrandTrack`. */
  tokens?: ThemeTokens;
}

export type BrandRenderer = React.FC<BrandRenderProps>;

/** Brand-layer kinds are OPEN, like overlay kinds and effect types — the
 *  schema names two today ('watermark' | 'disclaimer'), and core has a generic
 *  for exactly those two. A brand may register more. */
export type BrandKind = string;

/** One brand-layer kind's registration. Built on the shared `Registration`
 *  primitive, so this axis resolves through `resolveRegistered` like the
 *  overlay, video and effect axes do — and, like them, a registration with NO
 *  `renderer` contributes `config`/`params` only and does NOT mask the core
 *  generic for that kind.
 *
 *  Like `Registration`, deliberately NOT open with an index signature: a
 *  typo'd `renderer` must not compile clean and silently drop the brand's
 *  renderer into the core generic. */
export interface BrandRegistration extends Registration<BrandRenderProps> {
  renderer?: BrandRenderer;
}

/** How an overlay kind reaches the screen. 'track' (default): one absolute
 *  Sequence per item, so every item animates in its own [startMs, endMs) window.
 *  'anchored': delivered to the owning video renderer via anchoredOverlays
 *  instead (items without anchorVideoId fall back to track). */
export type OverlayRouting = 'track' | 'anchored';

/** One overlay kind's registration. `renderer`/`config`/`params` come from the
 *  shared Registration primitive; `routing` and `render` are this axis's own.
 *  A registration with NO renderer and NO render contributes routing/config
 *  only — it does not mask a core generic for a kind core can draw. */
export interface OverlayItemRegistration extends Registration<OverlayRenderProps> {
  routing?: OverlayRouting;
  /** Item-level escape hatch: full control over the node, bypassing
   *  OverlayRenderProps. Wins over `renderer` when both are present. */
  render?: (item: OverlayItem) => React.ReactNode;
}

/** @deprecated Use {@link OverlayItemRegistration} — the two overlay
 *  registries collapsed into one in Phase 3 Task 1. Kept as an alias so
 *  existing brand imports keep compiling. */
export type OverlayRegistration = OverlayItemRegistration;

/** The full composition contract a brand hands to LayeredReelComposition. */
export interface CompositionTheme extends BrandTheme {
  /** Root AbsoluteFill background. */
  background: string;
  /** @deprecated The composition tier of what is now ONE registry. It still
   *  works — it merges over {@link BrandTheme.overlays}, winning per kind — but
   *  new registrations belong on `overlays`. Phase 3 Task 11 writes the
   *  migration that collapses this away. */
  overlayItems?: Record<OverlayKind, OverlayItemRegistration>;
  /** Pre-pass over the video track before buildVideoNodes (e.g. brand-owned
   *  transition asset injection). */
  prepareVideoTrack?: (items: VideoItem[]) => VideoItem[];
  /** WHOLE-TRACK escape hatch for the brand layer. When present it wins
   *  outright and core's `defaultRenderBrandTrack` never runs — that is what
   *  keeps a brand that mounts ONE component for several items (or spans every
   *  item from 0) working unchanged.
   *
   *  Prefer {@link BrandTheme.brand}: registering per kind gets core's
   *  Sequencing, config threading and token plumbing for free, and each item
   *  then spans its OWN [startMs, endMs) — which is NOT what a track written
   *  against this hook necessarily does. */
  renderBrandTrack?: (items: BrandLayerItem[]) => React.ReactNode;
  /** @deprecated Superseded by {@link CompositionTheme.resolveMediaSource},
   *  which covers the video and brand tracks too. Still honoured and still
   *  WINS over `resolveMediaSource` on the audio track when present, because a
   *  brand (campaign-reels) registers one — dropping it would silently change
   *  its audio paths. New brands should register `resolveMediaSource` instead. */
  resolveAudioSource?: (raw: string) => string;
  /** Wholesale override of core's ONE media-path rule (./media-source.ts) for
   *  EVERY role — clip/broll/photo footage, audio, music and brand assets.
   *  Absent → `resolveMediaSource` from ./media-source.
   *
   *  Like the default, it must resolve at RENDER TIME and never write back
   *  onto the item: `loadTranscriptSync` derives the caption sidecar path from
   *  the BARE source. */
  resolveMediaSource?: MediaSourceResolver;
}
