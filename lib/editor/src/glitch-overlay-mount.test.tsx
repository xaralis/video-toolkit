// PHASE 5 TASK 2.3 — the `glitch` overlay-toggle fix, pinned directly.
//
// THE GAP THIS FILE CLOSES. `video-track-remount.test.tsx`'s derived identity
// ratchet queries ONLY the item's own `[data-testid="vid-…"]` element — by
// design, that is the instrument for "did the CLIP remount". `glitch.tsx`'s
// three threshold-gated overlays (scan lines, noise texture, neon blocks) are
// DECORATIVE SIBLINGS of the `<AbsoluteFill>` that wraps `children` — never
// ancestors of it — so toggling their PRESENCE never changes the video
// element's own tree position or type. Measured directly, not assumed:
// reverting this file's fix and re-running the full derived "glitch" ratchet
// (`npx vitest run --no-file-parallelism -t glitch
// src/video-track-remount.test.tsx`) reports 16/16 PASSING even against the
// unfixed presentation — the ratchet is genuinely blind to this defect class,
// which is exactly what the task brief's law 8 warns about ("the pixel
// harness cannot see mount-lifecycle defects... in either direction") applied
// one level down: the CLIP-identity ratchet is blind to an OVERLAY'S
// mount-lifecycle the same way the pixel harness is blind to the clip's.
//
// So this file builds a narrower, dedicated instrument: it samples the exact
// SAME `Wrap` component reference `wrapRemotionPresentation` hands to
// `LayerShell`, drives it `active` at progress values that straddle 0.1 and
// 0.15 within one window, and asserts DOM REFERENCE IDENTITY (not mere
// presence) for the three overlay elements across that sweep — the same
// "never touch it directly, use RTL's own re-render" discipline
// `video-track-remount.test.tsx` itself follows.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => clock.frame,
  };
});

import {
  transitionNodeFor, resetTransitionNodeCache, type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import { ActiveTransitionProgressContext } from '@video-toolkit/lib/render/video-track-plan';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';

const DIMS = { width: 1080, height: 1920 };
const FRAMES = 20;

/** The three threshold-gated overlays, located by the ONE style property each
 *  carries that nothing else in this subtree does — the same "locate by a
 *  distinctive style value" technique `at-cut-transitions.test.tsx`'s
 *  `platesOf` already uses, so a wrong element is never silently matched. */
function findOverlays(container: HTMLElement): {
  scanLines: HTMLElement | undefined;
  noise: HTMLElement | undefined;
  neonBlocks: HTMLElement | undefined;
} {
  const divs = [...container.querySelectorAll('div')] as HTMLElement[];
  return {
    scanLines: divs.find((d) => d.style.background.includes('repeating-linear-gradient')),
    // jsdom does not preserve this element's `backgroundImage` value in its
    // serialized `CSSStyleDeclaration` (a `data:image/svg+xml,...` URI with
    // unescaped `%3C`/`%25` sequences — verified by dumping `innerHTML`
    // directly: the attribute is simply absent from jsdom's own style string,
    // not merely un-matched by a substring check). `mixBlendMode: 'overlay'`
    // is unique to this one overlay among the three (scan lines sets no
    // blend mode at all; the neon-blocks wrapper's own blend mode is
    // `undefined` too — only its INNER per-block divs use `'screen'`), so it
    // is what this test locates the noise overlay by instead.
    noise: divs.find((d) => d.style.mixBlendMode === 'overlay'),
    // The neon-blocks OUTER wrapper carries no distinctive background of its
    // own (its children do) — located as the one div whose `pointerEvents`
    // is `none` but which sets neither `background` (scan lines) nor
    // `mixBlendMode` (noise).
    neonBlocks: divs.find(
      (d) => d.style.pointerEvents === 'none' && d.style.background === '' && d.style.mixBlendMode === '',
    ),
  };
}

describe('glitch\'s three threshold-gated overlays are mounted life-long, driven by opacity', () => {
  it('keeps the SAME DOM node for all three overlays as progress sweeps across 0.1 and 0.15, in both directions', () => {
    resetWarnOnce();
    resetTransitionNodeCache();
    const record = { kind: 'glitch', frames: FRAMES } as TransitionRecord;
    const node = transitionNodeFor(record, DIMS)!;
    expect(typeof node.plan).toBe('function');
    const composite = node.plan!({
      from: { range: [0, FRAMES] },
      to: { range: [0, FRAMES] },
      progress: 0,
      frame: 0,
      durationInFrames: FRAMES,
      params: {},
      dims: { ...DIMS, fps: 30 },
      palette: [],
      background: 'transparent',
    });
    const Wrap = composite.to!.wrap!;

    const renderAt = (progress: number) => (
      <ActiveTransitionProgressContext.Provider value={{ progress, frame: Math.round(progress * FRAMES), durationInFrames: FRAMES }}>
        <Wrap active>
          <div data-testid="clip" />
        </Wrap>
      </ActiveTransitionProgressContext.Provider>
    );

    // Sweep progress 0 -> 1 -> 0 across enough points to cross BOTH
    // thresholds (glitchIntensity ramps 0->1->0 via
    // interpolate(progress,[0,0.2,0.8,1],[0,1,1,0]), crossing 0.1/0.15 twice
    // each within one window) and back down again, capturing each overlay's
    // reference the FIRST time it is observed and asserting every later
    // sample is the SAME reference — the identical technique
    // `video-track-remount.test.tsx`'s `sweepIdentity` uses for the clip
    // itself, applied here to the three overlays.
    const sweep = [0, 0.05, 0.1, 0.12, 0.15, 0.18, 0.3, 0.5, 0.7, 0.82, 0.88, 0.85, 0.6, 0.2, 0.05, 0];
    const { container, rerender } = render(renderAt(sweep[0]));
    let baseline = findOverlays(container);
    expect(baseline.scanLines).toBeTruthy();
    expect(baseline.noise).toBeTruthy();
    expect(baseline.neonBlocks).toBeTruthy();

    for (const progress of sweep.slice(1)) {
      rerender(renderAt(progress));
      const now = findOverlays(container);
      expect(now.scanLines, `scanLines at progress ${progress}`).toBe(baseline.scanLines);
      expect(now.noise, `noise at progress ${progress}`).toBe(baseline.noise);
      expect(now.neonBlocks, `neonBlocks at progress ${progress}`).toBe(baseline.neonBlocks);
    }
  });

  it('still hides each overlay below its own threshold — opacity 0, not merely absent', () => {
    resetWarnOnce();
    resetTransitionNodeCache();
    const record = { kind: 'glitch', frames: FRAMES } as TransitionRecord;
    const node = transitionNodeFor(record, DIMS)!;
    const composite = node.plan!({
      from: { range: [0, FRAMES] }, to: { range: [0, FRAMES] }, progress: 0, frame: 0,
      durationInFrames: FRAMES, params: {}, dims: { ...DIMS, fps: 30 }, palette: [], background: 'transparent',
    });
    const Wrap = composite.to!.wrap!;
    // progress 0.02 -> glitchIntensity = 0.8 * interpolate(0.02,[0,0.2],[0,1])
    // = 0.8 * 0.1 = 0.08, below BOTH 0.1 and 0.15 (measured — 0.05 is NOT
    // low enough: 0.8 * (0.05/0.2) = 0.2, already past both thresholds,
    // which the first draft of this test picked and got wrong).
    const { container } = render(
      <ActiveTransitionProgressContext.Provider value={{ progress: 0.02, frame: 0, durationInFrames: FRAMES }}>
        <Wrap active><div data-testid="clip" /></Wrap>
      </ActiveTransitionProgressContext.Provider>,
    );
    const { scanLines, noise, neonBlocks } = findOverlays(container);
    // Every overlay must be invisible, not merely present with stale opacity.
    expect(scanLines?.style.opacity).toBe('0');
    expect(noise?.style.opacity).toBe('0');
    expect(neonBlocks?.style.opacity).toBe('0');
  });

  // FIX ROUND 1, IMPORTANT 2 (opus review). The FIRST fix (round 0) stopped
  // the neon-blocks OUTER wrapper from toggling presence, but left its 8
  // INNER blocks exactly as before: `if (random(s) < 0.5) return null`,
  // seeded by `block-${i}-${flickerFrame}`. The reviewer traced what that
  // means now that `Wrap` mounts `TransitionLayer`/`GlitchPresentation`
  // UNCONDITIONALLY (Task 1.4's own contract, correct and unchanged) — the
  // presentation's `useCurrentFrame()` ticks across the CLIP'S ENTIRE LIFE,
  // not just inside the ~20-frame boundary window, so `flickerFrame =
  // Math.floor(frame / 2)` advances every 2 frames for as long as the item
  // is mounted. Before this task the churn was bounded TWICE — by the
  // boundary Sequence's own short duration and by `glitchIntensity > 0.15` —
  // and round 0 removed the second bound while the first bound had ALREADY
  // been removed by moving to `wrap`. Net effect: this task made an
  // ALREADY-conditional mount unconditionally churn for the item's whole
  // life, exactly backwards from the direction Phase 5 moves in, even though
  // the effect itself (decorative CSS, no media) is not the media-remount
  // stutter this phase targets.
  //
  // This test renders the neon-blocks wrapper's 8 CHILDREN directly (not
  // just the wrapper itself, which the tests above already cover) across a
  // wide sweep of `clock.frame` values — spanning far more than one 20-frame
  // window, both while the boundary is `active` and while it is not (the
  // life-long, inactive case IS the defect: before this fix, `active={false}`
  // + a changing `clock.frame` alone flips block membership with no boundary
  // in sight at all) — and asserts exactly 8 DOM nodes exist at every frame,
  // by the SAME REFERENCES throughout, not merely the same count.
  it('keeps the SAME 8 DOM nodes for the neon-block cluster across the clip\'s WHOLE LIFE, active or not — only opacity toggles, never presence', () => {
    resetWarnOnce();
    resetTransitionNodeCache();
    const record = { kind: 'glitch', frames: FRAMES } as TransitionRecord;
    const node = transitionNodeFor(record, DIMS)!;
    const composite = node.plan!({
      from: { range: [0, FRAMES] }, to: { range: [0, FRAMES] }, progress: 0, frame: 0,
      durationInFrames: FRAMES, params: {}, dims: { ...DIMS, fps: 30 }, palette: [], background: 'transparent',
    });
    const Wrap = composite.to!.wrap!;

    const renderAt = (active: boolean, frame: number) => {
      clock.frame = frame;
      return (
        <ActiveTransitionProgressContext.Provider
          value={{ progress: active ? 0.5 : 0, frame, durationInFrames: FRAMES }}
        >
          <Wrap active={active}><div data-testid="clip" /></Wrap>
        </ActiveTransitionProgressContext.Provider>
      );
    };

    const { container, rerender } = render(renderAt(false, 0));
    const wrapperAt = () => findOverlays(container).neonBlocks!;
    const baseline = [...wrapperAt().children];
    expect(baseline.length).toBe(8); // exactly 8, always — the fix's own claim

    // Far outside any 20-frame window, `active` false throughout — this is
    // the life-long-mount case the fix must hold for, not just the
    // already-covered active sweep above.
    for (const frame of [2, 4, 6, 50, 137, 300, 1000]) {
      rerender(renderAt(false, frame));
      const now = [...wrapperAt().children];
      expect(now.length, `count at inactive frame ${frame}`).toBe(8);
      now.forEach((el, i) => expect(el, `block ${i} at inactive frame ${frame}`).toBe(baseline[i]));
    }

    // And while genuinely active, for completeness — the same 8 references,
    // never recreated by the `active` flag flipping either.
    for (const frame of [1005, 1010, 1015]) {
      rerender(renderAt(true, frame));
      const now = [...wrapperAt().children];
      expect(now.length, `count at active frame ${frame}`).toBe(8);
      now.forEach((el, i) => expect(el, `block ${i} at active frame ${frame}`).toBe(baseline[i]));
    }
  });
});
