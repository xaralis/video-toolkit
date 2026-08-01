// Phase 5 Task 0.2 — `scanline-glitch`'s RGB split, re-expressed as ONE SVG
// filter chain over a single mounted `blend`, instead of the `blend` fragment
// (both `from` and `to`) being re-rendered three times (6 media mounts total).
//
// Phase 5 Task 3 — `composite` → `plan`, the `post` slot's first real
// exercise. `scanline-glitch` no longer instantiates `from`/`to` at all (they
// are already-mounted shells the ASSEMBLY drives — see
// `video-track-remount.test.tsx`'s derived ratchet, which now covers
// `scanline-glitch`'s mount-count/identity guarantees generically, as a real
// catalog `plan` kind). What THIS file settles is `scanline-glitch`'s OWN
// `plan` output: the filter chain's primitives are genuinely driven by
// peak/xJitter/shift, the RGB contribution is zero at both ends, the element
// count (filter primitives) never varies with progress, the filter id is
// stable for one node's whole life, and the SVG defs it emits actually render
// and wire up to the `post.filter` value the node returns.
//
// `useCurrentFrame()` is GONE from this kind entirely — `frame` is now an
// explicit argument on `TransitionPlanProps` (design's "a plan cannot call
// React hooks" contract), so this file needs no `remotion` mock at all, unlike
// its pre-Task-3 self.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import {
  transitionNodeFor,
  resetTransitionNodeCache,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import type { TransitionComposite } from '@video-toolkit/lib/theming/transitions';

const DIMS = { width: 1080, height: 1920 };

/** Calls the node's `plan` directly with a fully-populated, real `LayerHandle`
 *  pair on both sides — the shape `VideoTrackHost` feeds a live boundary. */
function planAt(t: Partial<TransitionRecord> & { kind: 'scanline-glitch' }, progress: number, frame?: number): TransitionComposite {
  const durationInFrames = 15;
  const node = transitionNodeFor(t as TransitionRecord, DIMS)!;
  if (typeof node.plan !== 'function') throw new Error('expected scanline-glitch to resolve to a plan node');
  return node.plan({
    from: { range: [0, durationInFrames] },
    to: { range: [0, durationInFrames] },
    progress,
    frame: frame ?? Math.round(progress * durationInFrames),
    durationInFrames,
    params: {},
    dims: { width: DIMS.width, height: DIMS.height, fps: 30 },
    palette: [],
    background: 'transparent',
  });
}

/** Mounts a plan's `layers` (the ONLY place a `<filter>` element exists — the
 *  filter is APPLIED via `post`, never mounted directly around `from`/`to`
 *  any more) so real DOM assertions (attribute values, element counts) can be
 *  made against the actual rendered SVG, not against the plan object alone. */
function renderLayers(composite: TransitionComposite) {
  return render(
    <>
      {(composite.layers ?? []).map((l) => (
        <div key={l.key}>{l.content}</div>
      ))}
    </>,
  );
}

const feOffsetEls = (container: HTMLElement) => [...container.querySelectorAll('feOffset')];
const filterEls = (container: HTMLElement) => [...container.querySelectorAll('filter')];

describe('scanline-glitch: `from`/`to` carry no extra mounts — the picture lives in `style` + `layers` + `post`', () => {
  it('`from` is untouched (the identity) and `to` carries a plain opacity ramp, on every progress', () => {
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const composite = planAt({ kind: 'scanline-glitch' }, progress);
      expect(composite.from).toEqual({});
      expect(composite.to).toEqual({ style: { opacity: progress } });
    }
  });

  it('never returns `ghosts` on either side — the RGB split is a `post` filter, not an extra mount', () => {
    const composite = planAt({ kind: 'scanline-glitch' }, 0.5);
    expect(composite.from?.ghosts).toBeUndefined();
    expect(composite.to?.ghosts).toBeUndefined();
  });
});

describe('scanline-glitch: `post` is wired to a real, rendered `<filter>` element', () => {
  it('`post.filter` is `url(#<id>)` where `<id>` is the id of the ONE `<filter>` element the layers render', () => {
    const composite = planAt({ kind: 'scanline-glitch' }, 0.5);
    const match = /^url\(#(.+)\)$/.exec(String(composite.post?.filter));
    expect(match).toBeTruthy();
    const id = match![1];

    const { container, unmount } = renderLayers(composite);
    const filters = filterEls(container);
    expect(filters).toHaveLength(1);
    expect(filters[0].getAttribute('id')).toBe(id);
    unmount();
  });

  it('`post` carries only `filter` — no `transform`, `opacity` or anything else', () => {
    const composite = planAt({ kind: 'scanline-glitch' }, 0.5);
    expect(Object.keys(composite.post ?? {})).toEqual(['filter']);
  });

  // THE STABLE-ID CONTRACT, ARGUED (see the module doc comment in
  // scanline-glitch.tsx): the id is minted ONCE per resolved node — a
  // FACTORY-time value, not a per-call one — because `post`'s `url(#id)`
  // reference and the `<filter id>` it targets must agree across every LIVE
  // frame of this node's whole life, and `plan` itself is invoked fresh every
  // frame.
  it('the filter id is stable across repeated `plan()` calls on the SAME node, and distinct across two separately-resolved nodes', () => {
    resetTransitionNodeCache();
    const idFor = (progress: number) => {
      const composite = planAt({ kind: 'scanline-glitch' }, progress);
      return /^url\(#(.+)\)$/.exec(String(composite.post?.filter))![1];
    };
    const first = idFor(0);
    expect(idFor(0.4)).toBe(first);
    expect(idFor(0.9)).toBe(first);

    // A DIFFERENT authored config (`rgbShiftPx` differs) resolves to a
    // DIFFERENT node — and therefore a different id — rather than hitting
    // `transitionNodeFor`'s cache.
    const composite2 = planAt({ kind: 'scanline-glitch', rgbShiftPx: 40 }, 0);
    const secondId = /^url\(#(.+)\)$/.exec(String(composite2.post?.filter))![1];
    expect(secondId).not.toBe(first);
  });
});

describe('scanline-glitch: the filter primitives are genuinely driven by peak / xJitter / shift', () => {
  it('the two feOffset dx values move as progress moves (peak, xJitter both depend on it)', () => {
    const dxAt = (progress: number) => {
      const composite = planAt({ kind: 'scanline-glitch' }, progress, 3); // fixed frame
      const { container, unmount } = renderLayers(composite);
      const dx = feOffsetEls(container).map((el) => Number(el.getAttribute('dx')));
      unmount();
      return dx;
    };
    const at0 = dxAt(0);
    const at05 = dxAt(0.5);
    const at1 = dxAt(1);
    expect(at05).not.toEqual(at0);
    expect(at05).not.toEqual(at1);
  });

  it('rgbShiftPx changes the two feOffset dx values at mid-progress', () => {
    const dxAt = (rgbShiftPx: number) => {
      const composite = planAt({ kind: 'scanline-glitch', rgbShiftPx }, 0.5, 0); // frame 0 => xJitter 0, isolates shift
      const { container, unmount } = renderLayers(composite);
      const dx = feOffsetEls(container).map((el) => Number(el.getAttribute('dx')));
      unmount();
      return dx;
    };
    expect(dxAt(40)).not.toEqual(dxAt(16));
  });

  // ISOLATES xJitter specifically. The test above ("dx values move as
  // progress moves") varies `progress`, which moves `peak` too — `peak` alone
  // is sufficient to move `dx` (via `shift * peak`), so that test cannot tell
  // whether `xJitter` itself is wired in at all. Reviewer's deletion sweep
  // (Phase 4): setting `xJitter = 0` at scanline-glitch.tsx left the ENTIRE
  // suite green, including that test. This one holds `progress` fixed (so
  // `peak` and `shift * peak` are constant) and varies only `frame` — the one
  // input `xJitter` reads that nothing else in `dx` depends on.
  it('the two feOffset dx values move as the frame moves, progress held fixed (xJitter)', () => {
    const dxAtFrame = (frame: number) => {
      const composite = planAt({ kind: 'scanline-glitch' }, 0.5, frame);
      const { container, unmount } = renderLayers(composite);
      const dx = feOffsetEls(container).map((el) => Number(el.getAttribute('dx')));
      unmount();
      return dx;
    };
    const atFrame1 = dxAtFrame(1);
    const atFrame4 = dxAtFrame(4); // (4*31)%7=5 vs (1*31)%7=3 — distinct jitter buckets
    expect(atFrame4).not.toEqual(atFrame1);
  });
});

describe('scanline-glitch: element count is progress-invariant', () => {
  it('no conditional layers/plates on progress: filter primitive counts hold across the range', () => {
    const countsAt = [0, 0.1, 0.5, 0.9, 1].map((p) => {
      const composite = planAt({ kind: 'scanline-glitch' }, p);
      const { container, unmount } = renderLayers(composite);
      const n = {
        layers: (composite.layers ?? []).length,
        filters: filterEls(container).length,
        feOffsets: feOffsetEls(container).length,
        feColorMatrix: container.querySelectorAll('feColorMatrix').length,
        feBlend: container.querySelectorAll('feBlend').length,
      };
      unmount();
      return n;
    });
    expect(countsAt).toEqual(countsAt.map(() => countsAt[0]));
    // And it isn't trivially all-zero.
    expect(countsAt[0].filters).toBeGreaterThan(0);
  });
});

describe('scanline-glitch: the RGB contribution is zero at both ends, exactly the outgoing/incoming clip', () => {
  it('at progress 0 and progress 1 both feBlend copies\' alpha-scale (peak) is 0', () => {
    const alphaScaleAt = (progress: number) => {
      const composite = planAt({ kind: 'scanline-glitch' }, progress);
      const { container, unmount } = renderLayers(composite);
      const scales = [...container.querySelectorAll('feColorMatrix[type="matrix"]')].map((el) => {
        const parts = (el.getAttribute('values') ?? '').trim().split(/\s+/);
        return Number(parts[parts.length - 2]);
      });
      unmount();
      return scales;
    };
    expect(alphaScaleAt(0)).toEqual([0, 0]);
    expect(alphaScaleAt(1)).toEqual([0, 0]);
    // And it is non-zero mid-transition, so the pin above is meaningful.
    expect(alphaScaleAt(0.5).every((v) => v > 0)).toBe(true);
  });

  it('at progress 0 `to` is fully transparent and at progress 1 fully opaque', () => {
    expect(planAt({ kind: 'scanline-glitch' }, 0).to).toEqual({ style: { opacity: 0 } });
    expect(planAt({ kind: 'scanline-glitch' }, 1).to).toEqual({ style: { opacity: 1 } });
  });
});

// ---------------------------------------------------------------------------
// TASK 3 BRIEF — "a second `post` on one frame is a discipline hazard design
// §7 flags (`:608`). Check what happens if two boundaries with `post` are
// live simultaneously, and whether anything prevents or detects it."
//
// `transitionNodeFor` memoizes by (record, dims) — see its own doc comment,
// "THE AMPLIFIER" — so two boundaries with BYTE-IDENTICAL authored config
// (same kind + frames + rgbShiftPx) resolve to the SAME node object, and
// therefore the SAME `filterId` (minted once, at factory time — see
// scanline-glitch.tsx's own doc comment on why). This is a real, measured
// narrowing from the pre-Task-3 composite, which minted a fresh id per REACT
// MOUNT (`useState`) — two JSX call sites were always two component
// instances, so two structurally-identical boundaries never collided before.
//
// CORRECTED IN FIX ROUND 1 (opus review) — an earlier version of this comment
// claimed "this does NOT create a wrong picture on the CSS side" reasoning
// from "identical config ⇒ identical filter". That argument does NOT hold in
// general: `video-track-plan.tsx`'s `pickPost` selects the applied `filter`
// BY VALUE ("the LATER one wins", dev-warned), but a duplicate-id `url(#id)`
// resolves BY DOCUMENT ORDER — two entirely different selection rules. If
// both boundaries are live on the same frame, BOTH still render their own
// `<filter id="scanline-glitch-XYZ">` defs (`PlateHost` is per-boundary,
// unconditional) sharing the SAME id, and each boundary's `dx`/`peak` are
// functions of ITS OWN live progress/frame, not of the shared config — so a
// document-order id resolution can serve one boundary's `feOffset`/`peak`
// values while `pickPost` applied the OTHER boundary's `filter` VALUE (in
// this case both are simply `url(#sameId)`, so the two mechanisms cannot
// even disagree on which STRING wins — the disagreement, if any, is entirely
// inside the shared `<filter>` graph the string points at).
//
// What actually makes this benign TODAY is ARITHMETIC, not the shared config:
// the only reachable simultaneity in a legal reel is two ABUTTING transition
// windows (one boundary's closing frame is the next boundary's opening
// frame), and at that ONE shared frame both boundaries' `peak =
// interpolate(progress, [0,0.5,1], [0,1,0])` is exactly `0` (progress is 0 or
// 1 at a window's own edge) — so REGARDLESS of which duplicate-id `<filter>`
// element `url(#id)` happens to resolve to, both are the identity filter at
// that frame, and the ambiguity is invisible. This benignity is
// KIND-SPECIFIC and EVAPORATES for a future `post`-kind whose filter is
// NON-identity at its own window's endpoints — checked here, not fixed
// (the brief asked to "check", not "fix"; two live `post` boundaries is
// already a warned pathology, and the two-clip-wide overlap needed to reach
// it is itself the `overlapping-boundaries` diagnostic in `video-track.tsx`).
// The cheap fix, if a later stage wants it: derive `filterId` INSIDE `plan`
// from something boundary-stable (e.g. the `from`/`to` `LayerHandle.range`)
// rather than once at factory time — still stable for one boundary's whole
// life, but distinct per boundary rather than per distinct authored config.
describe('scanline-glitch: two simultaneous `post` boundaries (the discipline hazard design §7 flags)', () => {
  it('two byte-identically-configured boundaries share the SAME node, and therefore the SAME filter id', () => {
    resetTransitionNodeCache();
    const a = transitionNodeFor({ kind: 'scanline-glitch', frames: 20 } as TransitionRecord, DIMS)!;
    const b = transitionNodeFor({ kind: 'scanline-glitch', frames: 20 } as TransitionRecord, DIMS)!;
    // The amplifier's whole point: identical config -> identical node
    // reference. This is what makes the id collision possible at all.
    expect(a).toBe(b);
    const idOf = (n: typeof a) => {
      const composite = n.plan!({
        from: { range: [0, 20] }, to: { range: [0, 20] }, progress: 0.5, frame: 10,
        durationInFrames: 20, params: {}, dims: { width: DIMS.width, height: DIMS.height, fps: 30 },
        palette: [], background: 'transparent',
      });
      return /^url\(#(.+)\)$/.exec(String(composite.post?.filter))![1];
    };
    expect(idOf(a)).toBe(idOf(b));
  });

  it('a DIFFERENTLY-configured boundary (distinct rgbShiftPx) resolves to a distinct node and a distinct id', () => {
    resetTransitionNodeCache();
    const a = transitionNodeFor({ kind: 'scanline-glitch', frames: 20, rgbShiftPx: 16 } as TransitionRecord, DIMS)!;
    const b = transitionNodeFor({ kind: 'scanline-glitch', frames: 20, rgbShiftPx: 40 } as TransitionRecord, DIMS)!;
    expect(a).not.toBe(b);
  });
});
