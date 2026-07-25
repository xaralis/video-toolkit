/**
 * Shared video components
 *
 * Building blocks a template can drop into a composition. Import via:
 *   import { FilmGrain } from '@video-toolkit/lib/components';
 *
 * NOTE: these are stand-alone visual primitives, not part of the layered
 * rendering contract — that lives in `lib/theming` (renderers, palette,
 * placement) and `lib/render` (the assembly). `TextOverlay.tsx` is deliberately
 * NOT re-exported here: it is imported by path (`.../lib/components/TextOverlay`)
 * and belongs beside `GenericTextOverlay` in `lib/theming` once the brand repos
 * are being touched anyway.
 */

// Decorations
export { MazeDecoration } from './MazeDecoration';
export type { MazeDecorationProps } from './MazeDecoration';

// Overlays
export { Vignette } from './Vignette';
export type { VignetteProps } from './Vignette';

export { FilmGrain } from './FilmGrain';
export type { FilmGrainProps } from './FilmGrain';

// Motion graphics
export { LottieAnimation, recolorLottie } from './LottieAnimation';
export type { LottieAnimationProps } from './LottieAnimation';

// Transitions
export { SlideTransition } from './SlideTransition';
export type { SlideTransitionProps, TransitionStyle } from './SlideTransition';

// Animations
export { Envelope } from './Envelope';
export type { EnvelopeProps } from './Envelope';

export { PointingHand } from './PointingHand';
export type { PointingHandProps } from './PointingHand';

// Utilities
export { hexToRgba, SIZE_PRESETS, POSITION_PRESETS } from './utils';
export type { SizePreset, PositionPreset } from './utils';
