// Phase 5 Task 0.2 — `scanline-glitch`'s RGB split, re-expressed as ONE SVG
// filter chain over a single mounted `blend`, instead of the `blend` fragment
// (both `from` and `to`) being re-rendered three times (6 media mounts total).
//
// See lib/transitions/presentations/scanline-glitch.tsx for the mechanism: the
// `blend` (`from` + `to`) mounts once, wrapped in an `AbsoluteFill` carrying
// `filter: url(#<id>)`; the filter chain is `feOffset` (per-copy shift) →
// `feColorMatrix` (hue-rotate, then saturate, then an alpha-scale by `peak`)
// → `feBlend mode="screen"`, applied twice — once per shifted copy — against
// the single `SourceGraphic`.
//
// This file runs under jsdom like at-cut-transitions.test.tsx, so — same
// caveat as that file — it settles WIRING and STRUCTURE (mount counts, filter
// application, which numbers drive which primitives), not what a frame LOOKS
// like. That is the pixel harness's job (examples/layered-minimal).
//
// `useCurrentFrame()` throws outside a registered composition (real remotion
// behaviour, not a test artifact — see `use-current-frame.js`), and
// `scanline-glitch`'s jitter depends on it, so — like at-cut-transitions.test.tsx
// — `remotion` is mocked here to hand back a controllable clock.
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
  transitionNodeFor,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';

const DIMS = { width: 1080, height: 1920 };

const A = <div data-testid="a" />;
const B = <div data-testid="b" />;

const mount = (
  t: Partial<TransitionRecord> & { kind: 'scanline-glitch' },
  progress: number,
  inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null } = {},
) => {
  const Composite = transitionNodeFor(t as TransitionRecord, DIMS)!.composite;
  return render(
    <Composite
      from={inputs.from === undefined ? A : inputs.from}
      to={inputs.to === undefined ? B : inputs.to}
      progress={progress}
      durationInFrames={15}
      width={1080}
      height={1920}
      fps={30}
      palette={[]}
      background="transparent"
    />,
  );
};

const aCount = (container: HTMLElement) => container.querySelectorAll('[data-testid="a"]').length;
const bCount = (container: HTMLElement) => container.querySelectorAll('[data-testid="b"]').length;
const filterEls = (container: HTMLElement) => [...container.querySelectorAll('filter')];
const feOffsetEls = (container: HTMLElement) => [...container.querySelectorAll('feOffset')];
const filteredWrapperOf = (container: HTMLElement, id: string) =>
  [...container.querySelectorAll('div')].find((d) => d.style.filter === `url(#${id})`);

describe('scanline-glitch mounts `from` and `to` exactly once, not three times', () => {
  it.each([0, 0.2, 0.5, 0.8, 1])('progress=%s: exactly one `a` mount and one `b` mount', (progress) => {
    const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, progress);
    expect({ a: aCount(container), b: bCount(container) }).toEqual({ a: 1, b: 1 });
    unmount();
  });

  it('a missing `to` (the reel\'s trailing edge) still mounts `from` exactly once', () => {
    const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, 0.4, { to: null });
    expect({ a: aCount(container), b: bCount(container) }).toEqual({ a: 1, b: 0 });
    unmount();
  });
});

describe('scanline-glitch the filter is actually wired to the mounted layer, not just present nearby', () => {
  it('the wrapper carrying `from`+`to` has `filter: url(#<id>)` where `<id>` is the real `<filter>` element\'s id', () => {
    const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, 0.5);
    const filters = filterEls(container);
    expect(filters.length).toBe(1);
    const id = filters[0].getAttribute('id');
    expect(id).toBeTruthy();
    const wrapper = filteredWrapperOf(container, id!);
    expect(wrapper).toBeTruthy();
    // Guard the guard: the wrapper must actually CONTAIN the mounted `a`/`b`,
    // not merely sit next to them.
    expect(wrapper!.querySelector('[data-testid="a"]')).toBeTruthy();
    expect(wrapper!.querySelector('[data-testid="b"]')).toBeTruthy();
    unmount();
  });

  it('the filter id is stable across re-renders of the same instance and distinct across two instances', () => {
    const node = transitionNodeFor({ kind: 'scanline-glitch', frames: 15 } as TransitionRecord, DIMS)!;
    const Composite = node.composite;
    const { container, rerender, unmount } = render(
      <Composite from={A} to={B} progress={0} durationInFrames={15} width={1080} height={1920} fps={30} palette={[]} background="transparent" />,
    );
    const idAt = () => container.querySelector('filter')!.getAttribute('id');
    const first = idAt();
    rerender(
      <Composite from={A} to={B} progress={0.4} durationInFrames={15} width={1080} height={1920} fps={30} palette={[]} background="transparent" />,
    );
    expect(idAt()).toBe(first);
    rerender(
      <Composite from={A} to={B} progress={0.9} durationInFrames={15} width={1080} height={1920} fps={30} palette={[]} background="transparent" />,
    );
    expect(idAt()).toBe(first);
    unmount();

    const { container: c2, unmount: u2 } = mount({ kind: 'scanline-glitch', frames: 15 }, 0);
    expect(c2.querySelector('filter')!.getAttribute('id')).not.toBe(first);
    u2();
  });
});

describe('scanline-glitch the filter primitives are genuinely driven by peak / xJitter / shift', () => {
  it('the two feOffset dx values move as progress moves (peak, xJitter both depend on it)', () => {
    clock.frame = 3; // fixed frame so only `progress` varies across samples
    const dxAt = (progress: number) => {
      const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, progress);
      const dx = feOffsetEls(container).map((el) => Number(el.getAttribute('dx')));
      unmount();
      return dx;
    };
    const at0 = dxAt(0);
    const at05 = dxAt(0.5);
    const at1 = dxAt(1);
    expect(at05).not.toEqual(at0);
    expect(at05).not.toEqual(at1);
    clock.frame = 0;
  });

  it('rgbShiftPx changes the two feOffset dx values at mid-progress', () => {
    clock.frame = 0; // xJitter is 0 at frame 0, isolating shift's own contribution
    const dxAt = (rgbShiftPx: number) => {
      const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15, rgbShiftPx }, 0.5);
      const dx = feOffsetEls(container).map((el) => Number(el.getAttribute('dx')));
      unmount();
      return dx;
    };
    expect(dxAt(40)).not.toEqual(dxAt(16));
  });

  // ISOLATES xJitter specifically. The test above ("dx values move as
  // progress moves") varies `progress`, which moves `peak` too — `peak` alone
  // is sufficient to move `dx` (via `shift * peak`), so that test cannot tell
  // whether `xJitter` itself is wired in at all. Reviewer's deletion sweep:
  // setting `xJitter = 0` at scanline-glitch.tsx left the ENTIRE suite green,
  // including that test. This one holds `progress` fixed (so `peak` and
  // `shift * peak` are constant) and varies only `clock.frame` — the one
  // input `xJitter` reads that nothing else in `dx` depends on.
  it('the two feOffset dx values move as the frame moves, progress held fixed (xJitter)', () => {
    const dxAtFrame = (frame: number) => {
      clock.frame = frame;
      const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, 0.5);
      const dx = feOffsetEls(container).map((el) => Number(el.getAttribute('dx')));
      unmount();
      return dx;
    };
    const atFrame1 = dxAtFrame(1);
    const atFrame4 = dxAtFrame(4); // (4*31)%7=5 vs (1*31)%7=3 — distinct jitter buckets
    clock.frame = 0;
    expect(atFrame4).not.toEqual(atFrame1);
  });
});

describe('scanline-glitch element count is progress-invariant', () => {
  it('no conditional mounting on progress: filter primitive counts hold across the range', () => {
    const countsAt = [0, 0.1, 0.5, 0.9, 1].map((p) => {
      const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, p);
      const n = {
        filters: filterEls(container).length,
        feOffsets: feOffsetEls(container).length,
        feColorMatrix: container.querySelectorAll('feColorMatrix').length,
        feBlend: container.querySelectorAll('feBlend').length,
        divs: container.querySelectorAll('div').length,
      };
      unmount();
      return n;
    });
    expect(countsAt).toEqual(countsAt.map(() => countsAt[0]));
    // And it isn't trivially all-zero.
    expect(countsAt[0].filters).toBeGreaterThan(0);
  });
});

describe('scanline-glitch the RGB contribution is zero at both ends, exactly the outgoing/incoming clip', () => {
  it('at progress 0 and progress 1 both feBlend copies\' alpha-scale (peak) is 0', () => {
    const alphaScaleAt = (progress: number) => {
      const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, progress);
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

  it('at progress 0 `to` is fully transparent and at progress 1 fully opaque, either side of the filter', () => {
    const opacityOfB = (progress: number) => {
      const { container, unmount } = mount({ kind: 'scanline-glitch', frames: 15 }, progress);
      const b = container.querySelector('[data-testid="b"]')!;
      const opacity = (b.parentElement as HTMLElement).style.opacity;
      unmount();
      return opacity;
    };
    expect(opacityOfB(0)).toBe('0');
    expect(opacityOfB(1)).toBe('1');
  });
});
