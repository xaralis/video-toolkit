import type { BrandTheme, OverlayKind, OverlayRenderer } from './types';
import { GenericTextOverlay } from './generic/GenericTextOverlay';

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
