// The <Composition> prop bundle every layered reel needs, in one place.
//
// Each brand Root.tsx used to repeat the same three things: a calculateMetadata
// deriving the duration from meta.totalDurationMs, the 60-frame floor, and a
// throwaway durationInFrames to satisfy the prop type. Two copies of a floor is
// how a composition and its render drift apart, so core owns it.
//
// NOT a component and it must not import `remotion`: core has no remotion
// installed. It returns a plain object the brand spreads onto <Composition>.
import type { LayeredReel } from '../reel-config-base/layered-schema';

/** Remotion cannot mount a composition of zero frames, and a reel is routinely
 *  opened in Studio before its timing is authored. Two seconds is enough to be
 *  scrubbable without ever being mistaken for real content. Exported so
 *  `lib/editor/host/host-duration.ts`'s `framesForReel` (the editor's DIFFERENT
 *  floor — see that file's doc comment for why it isn't `layeredDurationInFrames`)
 *  shares this one definition instead of hardcoding its own `60`. */
export const MIN_FRAMES = 60;

/** The authored length of a reel in frames — the ONE definition. Deliberately NOT
 *  unified with `lib/editor/host/host-duration.ts`'s `framesForReel` — see that
 *  file's doc comment for why the editor needs a different (max-over-item-ends)
 *  floor than the render's authored-total floor. */
export function layeredDurationInFrames(reel: LayeredReel, fps: number): number {
  return Math.max(MIN_FRAMES, Math.round((reel.meta.totalDurationMs / 1000) * fps));
}

/** The props a layered reel's <Composition> takes, minus `defaultProps` (the
 *  brand's own authored literal, which stays in Root.tsx as the source of truth). */
export interface LayeredCompositionOptions<C> {
  id: string;
  component: C;
  fps: number;
  width: number;
  height: number;
}

export interface LayeredCompositionProps<C> extends LayeredCompositionOptions<C> {
  durationInFrames: number;
  calculateMetadata: (arg: { props: { reel: LayeredReel } }) => { durationInFrames: number };
}

export function layeredCompositionProps<C>({
  id,
  component,
  fps,
  width,
  height,
}: LayeredCompositionOptions<C>): LayeredCompositionProps<C> {
  return {
    id,
    component,
    fps,
    width,
    height,
    // Placeholder: calculateMetadata replaces it on every mount. Required by
    // the <Composition> prop type all the same.
    durationInFrames: MIN_FRAMES,
    calculateMetadata: ({ props }) => ({
      durationInFrames: layeredDurationInFrames(props.reel, fps),
    }),
  };
}
