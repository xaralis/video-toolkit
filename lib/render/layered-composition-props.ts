// The <Composition> prop bundle every layered reel needs, in one place.
//
// Each brand Root.tsx used to repeat the same three things: a calculateMetadata
// deriving the duration from meta.totalDurationMs, the 60-frame floor, and a
// throwaway durationInFrames to satisfy the prop type. Two copies of a floor is
// how a composition and its render drift apart, so core owns it.
//
// NOT a component: it returns a plain object the brand spreads onto <Composition>.
// The spread is type-checked against a real <Composition> by the
// `examples/layered-minimal` gate.
//
// `calculateMetadata` DOES import `remotion` (`staticFile`) and
// `@remotion/media-utils` (`getVideoMetadata`) now, to measure each source's
// real duration and warn on a starved transition boundary (see
// `checkBoundaries` below) — a change from this file's earlier
// no-framework-import stance. Both resolve at bundle time via
// `lib/project/remotion-config.ts`'s webpack `modules` override (the
// generic fix for out-of-tree `lib/**` files, already relied on by
// `lib/render/at-cut-transitions.tsx` for `@remotion/transitions`); under
// `lib/editor`'s own vitest/tsc, `@remotion/media-utils` is a pinned
// devDependency there (see its `package.json`), the same pattern `remotion`
// itself already uses for that toolchain.
import { staticFile } from 'remotion';
import { getVideoMetadata } from '@remotion/media-utils';
import type { LayeredReel } from '../reel-config-base/layered-schema';
import { handleRoomFrames, boundaryState, starvationMessage } from '../reel-config-base/handle-room';

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

/** Every starved boundary in `reel`, one human-readable message each.
 *
 *  Validation only — this NEVER changes the reel. The editor decides a
 *  transition's length and writes it into the model; if the renderer also
 *  decided, Studio and the final render could disagree, which is the exact
 *  class of defect Phase 5 removed. A missing duration yields silence, not a
 *  guess: see `handleRoomFrames`. */
export function checkBoundaries(
  reel: LayeredReel,
  durationsMs: Record<string, number>,
  fps: number,
): string[] {
  const items = reel.tracks.video;
  const roomOf = (i: number) => {
    const it = items[i];
    if (!it) return undefined;
    const src = (it as { source?: string }).source;
    return handleRoomFrames(it, src ? durationsMs[src] : undefined, fps);
  };
  const out: string[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const t = items[i].transitionOut;
    if (boundaryState(t, roomOf(i), roomOf(i + 1)) === 'ok') continue;
    const msg = starvationMessage(t, roomOf(i), roomOf(i + 1));
    if (msg) out.push(`${items[i].id} → ${items[i + 1].id}: ${msg}`);
  }
  return out;
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
  calculateMetadata: (arg: { props: { reel: LayeredReel } }) => Promise<{ durationInFrames: number }>;
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
    calculateMetadata: async ({ props }) => {
      // Measure every DISTINCT source once, so a boundary starved of real
      // footage warns instead of silently dropping frames. A source that
      // fails to measure (network hiccup, unsupported format) is left
      // ABSENT from `durationsMs` rather than defaulted to 0 —
      // `handleRoomFrames` reads an absent entry as unbounded, so a
      // measurement failure never masquerades as starvation. Nothing here
      // throws: a starved boundary only ever warns.
      const sources = [
        ...new Set(
          props.reel.tracks.video
            .map((v) => (v as { source?: string }).source)
            .filter((s): s is string => !!s),
        ),
      ];
      const durationsMs: Record<string, number> = {};
      await Promise.all(
        sources.map(async (s) => {
          try {
            const meta = await getVideoMetadata(staticFile(s));
            durationsMs[s] = meta.durationInSeconds * 1000;
          } catch {
            // Left absent deliberately — see the comment above.
          }
        }),
      );
      for (const msg of checkBoundaries(props.reel, durationsMs, fps)) {
        // eslint-disable-next-line no-console
        console.warn('[transition] handle starvation —', msg);
      }
      // Unchanged from before this task — measurement and warnings are
      // additive, and change nothing about the composition's length.
      return { durationInFrames: layeredDurationInFrames(props.reel, fps) };
    },
  };
}
