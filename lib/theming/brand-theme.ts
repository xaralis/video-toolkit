import type {
  BrandTheme,
  CompositionTheme,
  CoreOverlayKind,
  OverlayItemRegistration,
  OverlayKind,
  OverlayRenderer,
  VideoKind,
  VideoRenderer,
  VideoRenderProps,
} from './types';
import type { Registry } from './registry';
import { resolveRegistered, registrationConfig } from './registry';
import { GenericTextOverlay } from './generic/GenericTextOverlay';
import { GenericOutro } from './generic/GenericOutro';
import { GenericMultiClip } from './generic/GenericMultiClip';
import { GenericCard } from './generic/GenericCard';
import { SegmentMedia } from './segment/SegmentMedia';

// Core generic fallback per kind. GenericTextOverlay imports only TYPES from
// ./types (erased at runtime), so this runtime edge is one-directional — no cycle.
const GENERIC_RENDERERS: Record<CoreOverlayKind, OverlayRenderer> = {
  text: GenericTextOverlay,
};

/** THE overlay registry for a theme: the brand tier (`overlays`) with the
 *  deprecated composition tier (`overlayItems`) merged over it, winning per
 *  kind. One definition, so routing, item rendering and renderer resolution
 *  can never disagree about what a brand registered. */
export function overlayRegistry(theme: BrandTheme): Record<OverlayKind, OverlayItemRegistration> {
  const items = (theme as CompositionTheme).overlayItems;
  return items ? { ...theme.overlays, ...items } : (theme.overlays ?? {});
}

/** The "generic OR brand-custom" switch: the brand's registered renderer for a
 *  kind, else the core generic fallback. Overloads keep the core kinds — the
 *  only ones with a generic beneath them — resolving non-optionally. */
export function resolveOverlayRenderer(theme: BrandTheme, kind: CoreOverlayKind): OverlayRenderer;
export function resolveOverlayRenderer(theme: BrandTheme, kind: OverlayKind): OverlayRenderer | undefined;
export function resolveOverlayRenderer(theme: BrandTheme, kind: OverlayKind): OverlayRenderer | undefined {
  return resolveRegistered(overlayRegistry(theme), kind, GENERIC_RENDERERS);
}

/** The brand config registered for a kind (undefined when none). */
export function overlayConfig(theme: BrandTheme, kind: OverlayKind): unknown {
  return registrationConfig(overlayRegistry(theme), kind);
}

// Core generic fallback per video kind. The generics import only TYPES from
// ./types (erased at runtime), so this runtime edge is one-directional — no cycle.
//
// THIS TABLE IS THE CONTRACT. Every VideoKind is in it, so a brand that
// registers nothing at all still renders a whole reel — before Phase 3 Task 3,
// `multi-clip`/`card`/`outro` resolved to undefined and
// `renderVideoItemNode`'s `if (!Renderer) return null` dropped them silently,
// which is what forced every brand to copy the same three components.
// A brand registration still wins over any entry here (resolveRegistered).
const GENERIC_VIDEO_RENDERERS: Record<string, VideoRenderer> = {
  clip: SegmentMedia,
  broll: SegmentMedia,
  photo: SegmentMedia,
  'multi-clip': GenericMultiClip,
  card: GenericCard,
  outro: GenericOutro,
};

/** The "generic OR brand-custom" switch for the video axis, resolved by the
 *  SAME rule as overlays and effects (see registry.ts): brand registration
 *  wins, core generic beneath.
 *
 *  ONE signature since Task 3. The old FootageVideoKind-vs-VideoKind overload
 *  split existed only because footage kinds were the only ones with a generic
 *  beneath them; now every kind has one. It still returns `| undefined`,
 *  because `kind` reaches here off a permissive record in practice and a name
 *  neither side knows must resolve to nothing rather than to a wrong renderer. */
export function resolveVideoRenderer(theme: BrandTheme, kind: VideoKind): VideoRenderer | undefined {
  // `theme.video` is keyed by the closed VideoKind union while the shared
  // resolver takes an open Registry; the cast is the key-type widening only —
  // the shapes are identical (VideoRegistration extends Registration).
  return resolveRegistered(theme.video as Registry<VideoRenderProps> | undefined, kind, GENERIC_VIDEO_RENDERERS);
}

/** The brand config registered for a kind (undefined when none). */
export function videoConfig(theme: BrandTheme, kind: VideoKind): unknown {
  return theme.video?.[kind]?.config;
}
