export { paletteMap, resolveAccentColor, type AccentSlot } from './palette';
export {
  placementGeometry,
  compactPlacementGeometry,
  DEFAULT_PLACEMENT,
  type Placement,
  type PlacementGeometry,
  type CompactPlacementGeometry,
} from './placement';
export {
  useOverlayEnvelope,
  overlayEnvelope,
  DEFAULT_FADE_IN_FRAMES,
  DEFAULT_FADE_OUT_FRAMES,
  type OverlayEnvelope,
  type OverlayEnvelopeOptions,
} from './envelope';
export type {
  OverlayRenderProps,
  OverlayRenderer,
  OverlayKind,
  OverlayRegistration,
  VideoRenderProps,
  VideoRenderer,
  VideoKind,
  FootageVideoKind,
  VideoRegistration,
  BrandTheme,
  OverlayRouting,
  OverlayItemRegistration,
  CompositionTheme,
} from './types';
export { resolveOverlayRenderer, overlayConfig, resolveVideoRenderer, videoConfig } from './brand-theme';
export { SegmentMedia } from './segment/SegmentMedia';
export { GenericTextOverlay } from './generic/GenericTextOverlay';
export { GenericWatermark, type WatermarkProps } from './generic/GenericWatermark';
