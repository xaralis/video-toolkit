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
// composite against (Phase 4 Task 2.2). `EdgePlate` is a timeline sibling
// materialised by `video-track.tsx`'s `edge()`, reached through the same
// `LayerShell` a real clip is. `edgeInput` (the `composite`-arm helper that
// used to resolve a nullable React-subtree input to this plate) is deleted —
// Phase 5 Task 5, see `edge-plate.tsx`'s own note.
export { EdgePlate } from './edge-plate';

// Custom transitions
export { glitch } from './presentations/glitch';
export type { GlitchProps } from './presentations/glitch';
export { burn } from './presentations/burn';
export type { BurnProps } from './presentations/burn';

// A dip to a colour the BRAND chose (Phase 4 Task 2.3) — the parameter that
// core's old brand-named fade kind was missing. See the note at the top of the
// module.
export { fadeToColor } from './presentations/fade-to-color';
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
//
// The same principle, applied again in Phase 4 Task 2.5: `TransitionGallery.tsx`
// used to import `@remotion/transitions/wipe` and show it under the label a reel
// uses for the `wipe` BELOW. Two components, one name. The official wipe is gone
// from core entirely, and the gallery now resolves through the reel's own
// `transitionNodeFor` — so the answer to "which component is `wipe`?" is
// production's, and there is only one.
//
// Task 2.6 finished the job: the gallery imports NO presentation from this file
// any more. It derives its entries from `TRANSITION_CATALOG` and resolves every
// one of them through `transitionNodeFor`, so the same guarantee now covers all
// 20 demonstrable kinds rather than just `wipe`.

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
