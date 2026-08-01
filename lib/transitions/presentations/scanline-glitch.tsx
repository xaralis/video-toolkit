// lib/transitions/presentations/scanline-glitch.tsx
//
// Digital distortion: an incoming clip crossfades in over the outgoing one,
// with a jittered chromatic-aberration split ramping up and back down across
// the window, plus a scanline overlay.
//
// TWO consequences of the ORIGINAL (pre-Phase-4) design, both real and both
// measured:
//
//   1. At a cut it was not a dissolve at all: the entering mount painted the
//      incoming clip opaquely from the transition's first frame, so the cut
//      effectively landed half a window early.
//   2. The RGB-shifted copies were INVISIBLE, sitting under an opaque third
//      layer, so the only thing that ever showed was the scanline gradient.
//
// PHASE 4 TASK 2.1 made this a native two-input `composite` node: B fades in
// over A, and the jittered RGB copies are ramped by the transition's own peak
// so they are visible mid-cut and absent at both ends.
//
// SINGLE-MOUNT (Phase 5 Task 0.2, `composite` arm): the RGB split, expressed as
// ONE SVG filter (`feOffset` → `feColorMatrix` → `feBlend mode="screen"`,
// applied twice, once per shifted copy, against one `SourceGraphic`) instead of
// re-rendering `from`/`to` three times — 7 → 3 media elements.
//
// PHASE 5 TASK 3 — `composite` → `plan`, THE `post` SLOT'S FIRST REAL
// EXERCISE. `from`/`to` are already-mounted shells now, not subtrees this node
// instantiates: `from` is untouched (`{}`, the identity — it never faded under
// this kind, exactly as `fade`'s exiting branch never does), `to.style.opacity
// = progress` is the blend. The scanline gradient becomes an `over` PlateLayer
// (media-free, so its progress-driven opacity costs nothing extra). The RGB
// split becomes `post`: a `filter: url(#id)` applied to the WHOLE video track
// for this window, referencing an SVG `<filter>` this node emits as a
// media-free `under` plate's `content` (the defs render nothing visible
// themselves; `z` is irrelevant for an invisible 0×0 `<svg>`, `under` is
// chosen only so it never sits between the track's own visible layers).
// `post` is the ONLY slot that can express "the composite of A and B", which
// two independent per-side shells cannot — see `lib/theming/transitions.ts`'s
// `TransitionComposite.post` doc comment.
//
// THE FILTER ID IS BUILT ONCE, OUTSIDE `plan` — the SAME pattern
// `wrapRemotionPresentation` (`lib/render/at-cut-transitions.tsx`) uses for its
// two `Wrap` components: `plan` is invoked fresh every live frame, so anything
// that must be STABLE for the node's whole life (here, the `id` a `url(#id)`
// reference and the `<filter id>` it targets must agree on) is computed at
// FACTORY time, not per call. This is a behavioural narrowing from the
// pre-migration `composite`, which minted a FRESH id per REACT MOUNT via
// `useState` — i.e., two structurally-identical `scanline-glitch` boundaries
// in the same reel always had independent ids before, because two JSX call
// sites are two component instances. A `plan` node is memoized by
// `transitionNodeFor` PER DISTINCT (record, dims) — so two boundaries with
// byte-identical authored config (same `kind`+`frames`+`rgbShiftPx`) now SHARE
// one node object and therefore one `filterId`. This can only collide if both
// boundaries are LIVE SIMULTANEOUSLY (only a live boundary's plate ever
// renders its `<filter>` defs at all) — already the `post`-conflict pathology
// `video-track-plan.tsx` dev-warns ("two live transitions... both set
// `post`... the LATER one wins"). What keeps a shared id benign in the ONE
// simultaneity a legal reel can reach (two abutting windows sharing exactly
// one frame) is ARITHMETIC, not the shared config: `peak` is exactly 0 at
// every window's own edge, so both boundaries' filter graphs are the
// identity there regardless of which duplicate-id element `url(#id)`
// resolves to by document order. That benignity is kind-specific and does
// NOT generalise to a future `post` kind whose filter is non-identity at its
// own endpoints — see `scanline-glitch-single-mount.test.tsx`'s "two
// simultaneous post boundaries" block and task-3-report.md for the measured
// detail, and why this is flagged, not fixed, in this task's scope.
//
// `frame` REPLACES `useCurrentFrame()`. A `plan` is a plain function and
// cannot call hooks (design's contract) — `xJitter` used to read
// `useCurrentFrame()` directly (boundary-relative since Task 1.3), and now
// reads `TransitionPlanProps.frame`, the same boundary-relative value, passed
// explicitly instead of read off a hook.
import { interpolate, random } from 'remotion';
import type {
  TransitionNode,
  TransitionPlanProps,
  TransitionComposite,
  PlateLayer,
} from '../../theming/transitions';

export type ScanlineGlitchProps = { rgbShiftPx?: number };

export const scanlineGlitch = (props: ScanlineGlitchProps = {}): TransitionNode => {
  const shift = props.rgbShiftPx ?? 16;

  // Built ONCE per resolved node — see the module doc comment above for why
  // this cannot live inside `plan`. `random(null)` (not `React.useId()`,
  // not usable here anyway since this is not a component) — the same
  // per-instance-id pattern `burn.tsx`/`glitch.tsx` use, so two `<Player>`s
  // (or an editor root beside a preview root) sharing one document never mint
  // the same id.
  const filterId = `scanline-glitch-${String(random(null)).slice(2, 10)}`;

  const plan = ({ progress, frame }: TransitionPlanProps): TransitionComposite => {
    const peak = interpolate(progress, [0, 0.5, 1], [0, 1, 0]);
    const xJitter = ((frame * 31) % 7 - 3) * peak;

    // The two shifted copies' horizontal offsets — byte-identical arithmetic
    // to the pre-migration composite. Both fold `peak` in already, so they
    // land on 0 at progress 0/1, the same as the jitter itself.
    const redDx = shift * peak + xJitter;
    const blueDx = -shift * peak + xJitter;

    const layers: PlateLayer[] = [
      {
        key: 'scanlines',
        z: 'over',
        style: {
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0 1px, transparent 1px 3px)',
          opacity: peak,
          mixBlendMode: 'multiply',
        },
      },
      {
        // Media-free defs only — the filter is APPLIED via `post`, not via
        // this plate's own `style`. `z: 'under'` is arbitrary (a 0×0 `<svg>`
        // paints nothing at any z), chosen so it never sits between the two
        // real clips' shells.
        key: 'rgb-split-filter-defs',
        z: 'under',
        style: { pointerEvents: 'none' },
        content: (
          <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
            <defs>
              <filter
                id={filterId}
                x="-10%"
                y="-10%"
                width="120%"
                height="120%"
                colorInterpolationFilters="sRGB"
              >
                <feOffset in="SourceGraphic" dx={redDx} dy={0} result="rShift" />
                <feColorMatrix in="rShift" type="hueRotate" values="-25" result="rHue" />
                <feColorMatrix in="rHue" type="saturate" values="2" result="rSat" />
                <feColorMatrix
                  in="rSat"
                  type="matrix"
                  values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${peak} 0`}
                  result="rAlpha"
                />
                <feBlend in="SourceGraphic" in2="rAlpha" mode="screen" result="screenR" />

                <feOffset in="SourceGraphic" dx={blueDx} dy={0} result="bShift" />
                <feColorMatrix in="bShift" type="hueRotate" values="180" result="bHue" />
                <feColorMatrix in="bHue" type="saturate" values="2" result="bSat" />
                <feColorMatrix
                  in="bSat"
                  type="matrix"
                  values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${peak} 0`}
                  result="bAlpha"
                />
                <feBlend in="screenR" in2="bAlpha" mode="screen" />
              </filter>
            </defs>
          </svg>
        ),
      },
    ];

    // REEL EDGE: no forcing needed, on either side — argued from this kind's
    // own arithmetic, not copied from another kind. `from` never carries a
    // style at all (the identity, like `fade`'s exiting branch), so a
    // materialised `from` EdgePlate at a leading edge is simply always visible
    // underneath the incoming clip, which fades in over it — correct, a fade
    // in from the background. `to.style.opacity = progress` reaches full
    // opacity (1) only exactly AT progress 1, the boundary's own last frame —
    // never early — so a materialised `to` EdgePlate at a trailing edge only
    // ever fully occludes the real `from` clip at the instant the cut itself
    // completes, which is correct (that IS the cut), not `pixelate`'s
    // premature-curtain defect (whose `to` curve reached 1 by progress 0.4).
    return {
      from: {},
      to: { style: { opacity: progress } },
      layers,
      post: { filter: `url(#${filterId})` },
    };
  };

  return { plan };
};
