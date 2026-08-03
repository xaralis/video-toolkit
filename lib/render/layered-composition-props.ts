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
// This file itself deliberately has NO static `remotion` or `@remotion/media-utils`
// import — `calculateMetadata` reaches the real measuring code in `./measure-sources.ts`
// through a DYNAMIC `import()` instead (see that file's header for why: a static import
// here would drag `@remotion/media-utils` into every consumer of `MIN_FRAMES`, in
// particular `lib/editor/host/host-duration.ts`, which wants only a plain constant and
// must never pull a media package into the editor's Vite bundle — CRITICAL 2 of the
// 2026-08-03 whole-branch review). `resolveMediaSource` below is safe to import
// statically: it is dependency-free by design (see its own header), so it adds nothing
// to that bundle.
import type { LayeredReel } from '../reel-config-base/layered-schema';
import { resolveMediaSource } from '../theming/media-source';
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
 *  guess: see `handleRoomFrames`.
 *
 *  `durationsMs` is keyed by the RESOLVED source string (`resolveMediaSource(source, kind)`
 *  — see `./measure-sources.ts`'s `measureSourceDurationsMs`, which builds it), not the raw
 *  `source`. A brand's bare-filename convention (`lib/theming/media-source.ts:7-9`) resolves
 *  to a different string than what's authored (`seg-002.mp4` → `recordings/seg-002.mp4`), so
 *  looking the raw source up directly missed every measurement for that convention — the
 *  bug CRITICAL 1 of the 2026-08-03 review named. */
export function checkBoundaries(
  reel: LayeredReel,
  durationsMs: Record<string, number>,
  fps: number,
): string[] {
  const items = reel.tracks.video;
  const roomOf = (i: number) => {
    const it = items[i];
    if (!it) return undefined;
    // Only clip/broll carry a measurable source window at all — the same gate
    // `handleRoomFrames` applies internally, matched here so the durations lookup key is
    // only ever computed for a kind resolveMediaSource actually understands.
    if (it.kind !== 'clip' && it.kind !== 'broll') return handleRoomFrames(it, undefined, fps);
    const key = resolveMediaSource(it.source, it.kind);
    return handleRoomFrames(it, durationsMs[key], fps);
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
      // Computed up front, independent of whether measurement below succeeds —
      // unchanged from before this task, byte-for-byte the same expression.
      const durationInFrames = layeredDurationInFrames(props.reel, fps);
      try {
        // Dynamic import, deliberately not a static one at this file's top — see
        // measure-sources.ts's header comment (CRITICAL 2 of the 2026-08-03 review). A static
        // import there would make `MIN_FRAMES` drag `remotion` + `@remotion/media-utils` into
        // every consumer of this module, including `lib/editor/host/host-duration.ts`, which
        // wants only a plain constant and must not pull a media package into the editor's
        // Vite bundle (a brand project's own `node_modules` does not have it until that repo
        // applies `docs/superpowers/handle-starvation-migrations.md`).
        //
        // Both calls are inside this try. A re-review of this branch (2026-08-03, guard
        // follow-up) found that neither was guarded: the dynamic import rejects with
        // MODULE_NOT_FOUND when a brand repo bumps its `toolkit/` pin before adding
        // `@remotion/media-utils` — precisely the scenario the migrations doc describes as an
        // acceptable "loud" failure, except an unguarded rejection here does not fail loudly at
        // `npm install` time, it fails composition resolution itself: Studio never opens the
        // composition and a CLI render dies before a single frame, which is the exact class of
        // defect this whole feature exists to prevent, just moved to the render/dependency axis
        // instead of the picture axis. Validation must never gate the render it validates.
        const { measureSourceDurationsMs } = await import('./measure-sources');
        const durationsMs = await measureSourceDurationsMs(props.reel.tracks.video);
        for (const msg of checkBoundaries(props.reel, durationsMs, fps)) {
          // eslint-disable-next-line no-console
          console.warn('[transition] handle starvation —', msg);
        }
      } catch (err) {
        // No durations, no diagnostics this run — NOT the composition's duration, which is
        // computed above and returned regardless. A brand author needs to be able to tell "the
        // package is missing" apart from a transient failure, so the message names it and
        // points at the doc that says what to add, rather than a bare "measurement failed".
        // eslint-disable-next-line no-console
        console.warn(
          '[transition] could not measure source durations — handle-starvation diagnostics are unavailable this run. ' +
            'If this is a module-not-found error for "@remotion/media-utils", your project is missing it — see ' +
            'docs/superpowers/handle-starvation-migrations.md for what to add.',
          err,
        );
      }
      return { durationInFrames };
    },
  };
}
