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
  BrandRenderProps,
  BrandRenderer,
  BrandKind,
  BrandRegistration,
  BrandTheme,
  OverlayRouting,
  OverlayItemRegistration,
  CompositionTheme,
} from './types';
export { overlayRegistry, resolveOverlayRenderer, overlayConfig, resolveVideoRenderer, videoConfig } from './brand-theme';
export {
  resolveEffectRenderer,
  effectConfig,
  applyEffects,
  kenBurnsStyle,
  findKenBurns,
  GrainEffect,
  ScanlinesEffect,
  VignetteEffect,
  GradeEffect,
  TransformEffect,
  type EffectRenderProps,
  type EffectRenderer,
  type EffectRegistration,
  type KenBurnsEffect,
} from './effects';
export { SegmentMedia } from './segment/SegmentMedia';
export { GenericTextOverlay } from './generic/GenericTextOverlay';
export {
  GenericWatermark,
  watermarkStyle,
  resolveWatermarkMargin,
  DEFAULT_WATERMARK_MARGIN_PX,
  DEFAULT_WATERMARK_TINT_COLOR,
  DEFAULT_WATERMARK_SIZE_PX,
  type WatermarkProps,
  type WatermarkMode,
  type WatermarkMargin,
} from './generic/GenericWatermark';
export { GenericDisclaimer, type DisclaimerProps } from './generic/GenericDisclaimer';
export { defaultRenderBrandTrack, resolveBrandRenderer, brandConfig } from './brand-track';
export { GenericOutro } from './generic/GenericOutro';
export { GenericMultiClip } from './generic/GenericMultiClip';
export { GenericCard } from './generic/GenericCard';
export { resolveGenericSource } from './generic/media-source';
export type { ThemeTokens, MultiClipTokens, CardTokens, WatermarkTokens, DisclaimerTokens } from './tokens';
