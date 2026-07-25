import type { BrandTheme, OverlayKind, OverlayRenderer, VideoKind, VideoRenderer, FootageVideoKind } from './types';
import { GenericTextOverlay } from './generic/GenericTextOverlay';
import { SegmentMedia } from './segment/SegmentMedia';

// Core generic fallback per kind. GenericTextOverlay imports only TYPES from
// ./types (erased at runtime), so this runtime edge is one-directional — no cycle.
const GENERIC_RENDERERS: Record<OverlayKind, OverlayRenderer> = {
  text: GenericTextOverlay,
};

/** The "generic OR brand-custom" switch: the brand's registered renderer for a
 *  kind, else the core generic fallback. */
export function resolveOverlayRenderer(theme: BrandTheme, kind: OverlayKind): OverlayRenderer {
  return theme.overlays?.[kind]?.renderer ?? GENERIC_RENDERERS[kind];
}

/** The brand config registered for a kind (undefined when none). */
export function overlayConfig(theme: BrandTheme, kind: OverlayKind): unknown {
  return theme.overlays?.[kind]?.config;
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
