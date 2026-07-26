import type {
  BrandTheme,
  CompositionTheme,
  CoreOverlayKind,
  OverlayItemRegistration,
  OverlayKind,
  OverlayRenderer,
  VideoKind,
  VideoRenderer,
  FootageVideoKind,
} from './types';
import { resolveRegistered, registrationConfig } from './registry';
import { GenericTextOverlay } from './generic/GenericTextOverlay';
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

// Core generic fallback per footage video kind. SegmentMedia imports only TYPES
// from ./types (erased at runtime), so this runtime edge is one-directional — no cycle.
const GENERIC_VIDEO_RENDERERS: Record<FootageVideoKind, VideoRenderer> = {
  clip: SegmentMedia,
  broll: SegmentMedia,
  photo: SegmentMedia,
};

/** Footage kinds always resolve (core generic fallback); other kinds resolve
 *  only when the brand registered them. Overloads keep pre-widening call
 *  sites (guard-then-resolve on footage kinds) compiling non-optionally. */
export function resolveVideoRenderer(theme: BrandTheme, kind: FootageVideoKind): VideoRenderer;
export function resolveVideoRenderer(theme: BrandTheme, kind: VideoKind): VideoRenderer | undefined;
export function resolveVideoRenderer(theme: BrandTheme, kind: VideoKind): VideoRenderer | undefined {
  return theme.video?.[kind]?.renderer ?? GENERIC_VIDEO_RENDERERS[kind as FootageVideoKind]; // non-footage kinds miss the record → undefined, matching the | undefined overload
}

/** The brand config registered for a kind (undefined when none). */
export function videoConfig(theme: BrandTheme, kind: VideoKind): unknown {
  return theme.video?.[kind]?.config;
}
