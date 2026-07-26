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
export { resolveMediaSource, ROLE_FOLDERS, type MediaRole, type MediaSourceResolver } from './media-source';
export {
  GenericCaptions,
  type GenericCaptionsProps,
  type CaptionLiftWindow,
} from './generic/GenericCaptions';
export {
  linesFromWords,
  activeAmount,
  chunkWords,
  strokeShadow,
  DEFAULT_CAPTION_MAX_CHARS,
  DEFAULT_CAPTION_GAP_BREAK_MS,
  DEFAULT_CAPTION_LAST_LINE_GRACE_MS,
  DEFAULT_CAPTION_MAX_WORDS_PER_CHUNK,
  DEFAULT_CAPTION_WORD_FADE_MS,
  type CaptionLine,
  type CaptionLineWord,
  type CaptionSourceWord,
  type LinesFromWordsOptions,
} from './generic/caption-lines';
export type {
  ThemeTokens,
  MultiClipTokens,
  CardTokens,
  WatermarkTokens,
  DisclaimerTokens,
  CaptionTokens,
} from './tokens';
