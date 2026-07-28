/**
 * Transitions Library
 *
 * Unified API for scene transitions in Remotion videos.
 * Combines official @remotion/transitions with custom presentations.
 *
 * Usage with TransitionSeries:
 * ```tsx
 * import { TransitionSeries, linearTiming } from '@remotion/transitions';
 * import { glitch, rgbSplit, zoomBlur, lightLeak } from '../../../lib/transitions';
 *
 * <TransitionSeries>
 *   <TransitionSeries.Sequence durationInFrames={90}>
 *     <SceneA />
 *   </TransitionSeries.Sequence>
 *   <TransitionSeries.Transition
 *     presentation={glitch()}
 *     timing={linearTiming({ durationInFrames: 20 })}
 *   />
 *   <TransitionSeries.Sequence durationInFrames={90}>
 *     <SceneB />
 *   </TransitionSeries.Sequence>
 * </TransitionSeries>
 * ```
 */

// The reel's leading/trailing edge, as a picture a two-input node can
// composite against (Phase 4 Task 2.2). Shared by core's lifter
// (lib/render/at-cut-transitions.tsx) and by the native nodes under
// ./presentations, and available to a brand writing its own node.
export { EdgePlate, edgeInput } from './edge-plate';

// Custom transitions
export { glitch } from './presentations/glitch';
export type { GlitchProps } from './presentations/glitch';
export { burn } from './presentations/burn';
export type { BurnProps } from './presentations/burn';

// A dip to a colour the BRAND chose (Phase 4 Task 2.3) — the parameter
// `fade-coal` was missing. See the note at the top of the module.
export { fadeToColor, fadeToColorOpacities } from './presentations/fade-to-color';
export type { FadeToColorProps } from './presentations/fade-to-color';

export { rgbSplit } from './presentations/rgb-split';
export type { RgbSplitProps } from './presentations/rgb-split';

export { zoomBlur } from './presentations/zoom-blur';
export type { ZoomBlurProps } from './presentations/zoom-blur';

export { lightLeak } from './presentations/light-leak';
export type { LightLeakProps } from './presentations/light-leak';

// NB: no `clockWipe` here. The `clock-wipe` transition kind renders via
// @remotion/transitions/clock-wipe (see lib/render/at-cut-transitions.tsx);
// this package's own richer implementation (startAngle/segments/counter-
// clockwise) was never reachable from the schema, the editor or the renderer,
// so it was deleted rather than kept as a second answer to the same kind.

export { pixelate } from './presentations/pixelate';
export type { PixelateProps } from './presentations/pixelate';

export { checkerboard } from './presentations/checkerboard';
export type { CheckerboardProps, CheckerboardPattern } from './presentations/checkerboard';

export { whipPan } from './presentations/whip-pan';
export type { WhipPanProps } from './presentations/whip-pan';

export { zoomThrough } from './presentations/zoom-through';
export type { ZoomThroughProps } from './presentations/zoom-through';

export { wipe } from './presentations/wipe';
export type { WipeProps } from './presentations/wipe';

export { gradientWipe } from './presentations/gradient-wipe';
export type { GradientWipeProps } from './presentations/gradient-wipe';

export { scanlineGlitch } from './presentations/scanline-glitch';
export type { ScanlineGlitchProps } from './presentations/scanline-glitch';

// Official transitions (slide, fade, wipe, flip) and timing functions
// (linearTiming, springTiming, TransitionSeries) should be imported directly
// from '@remotion/transitions' in your project — not re-exported from here.
// This avoids module resolution issues when lib/ is outside node_modules scope.
//
// Example:
//   import { TransitionSeries, linearTiming } from '@remotion/transitions';
//   import { fade } from '@remotion/transitions/fade';
//   import { glitch, lightLeak } from '../../../lib/transitions';

// Gallery/showcase components — import directly from './TransitionGallery'
// in the showcase project. Not re-exported here to avoid pulling in
// @remotion/transitions at barrel import time.
// Usage: import { TransitionGallery } from '../../../lib/transitions/TransitionGallery';
