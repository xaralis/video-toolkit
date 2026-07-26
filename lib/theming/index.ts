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
export {
  resolveRegistered,
  registrationConfig,
  registrationParams,
  type ParamField,
  type Registration,
  type Registry,
} from './registry';
export type {
  OverlayRenderProps,
  OverlayRenderer,
  OverlayKind,
  CoreOverlayKind,
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
export { overlayRegistry, resolveOverlayRenderer, overlayConfig, resolveVideoRenderer, videoConfig } from './brand-theme';
export { SegmentMedia } from './segment/SegmentMedia';
export { GenericTextOverlay } from './generic/GenericTextOverlay';
export { GenericWatermark, type WatermarkProps } from './generic/GenericWatermark';
