// Phase 4 Task 4.3 — captions get a core mount.
//
// Before this task `GenericCaptions` was fully built, fully tested and mounted
// NOWHERE, and `ThemeTokens.caption` was threaded nowhere either. Both halves
// are pinned here, and both are pinned through the REAL composition path
// (`LayeredReelComposition` → `makeOverlayRenderer` → the core generic), never
// by calling `GenericCaptions` directly — a capability pinned only against a
// hand-rolled render path is the recurring hole in this programme
// (CONSTRAINTS.md, "PIN THE WIRING, NOT JUST THE PURE FUNCTION").
//
// The `remotion` mock below models the ONE behaviour this task turns on:
// `<Sequence from={n}>` REBASES `useCurrentFrame()`. That is not incidental —
// it is the whole units question. A passthrough Sequence mock (what the sibling
// anchored-overlay test uses, correctly, for its own purposes) makes local and
// composition time identical and would make every assertion here vacuous.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const frameState = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const ReactMod = await import('react');
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  // Accumulated Sequence offset, exactly as Remotion nests them.
  const OffsetCtx = ReactMod.createContext(0);
  const Sequence: React.FC<{ from?: number; children?: React.ReactNode }> = ({ from = 0, children }) => {
    const parent = ReactMod.useContext(OffsetCtx);
    return ReactMod.createElement(OffsetCtx.Provider, { value: parent + from }, children);
  };
  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => frameState.frame - ReactMod.useContext(OffsetCtx),
    useVideoConfig: () => ({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 900,
      id: 'test',
      defaultProps: {},
      props: {},
    }),
    staticFile: (s: string) => s,
    Audio: () => null,
    Img: () => null,
    OffthreadVideo: () => null,
  };
});

import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { CompositionTheme, CaptionTokens } from '@video-toolkit/lib/theming';
import { rebaseCaptionTimes } from '@video-toolkit/lib/theming';
import type { LayeredReel, OverlayItem, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const theme = (tokens?: { caption?: CaptionTokens }): CompositionTheme => ({
  background: '#000000',
  accentSlots: [],
  tokens,
});

const reel = (overlays: OverlayItem[], video: VideoItem[] = []): LayeredReel =>
  ({
    meta: { totalDurationMs: 30000 },
    tracks: { video, audio: [], music: { baseVolumeDb: -8 }, overlays, brand: [] },
  }) as unknown as LayeredReel;

const draw = (r: LayeredReel, t: CompositionTheme, frame: number) => {
  frameState.frame = frame;
  return render(<LayeredReelComposition reel={r} theme={t} />);
};

const root = (c: HTMLElement) => c.querySelector('[data-captions-root]') as HTMLElement | null;
const words = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[data-caption-word]')).map((n) => n.textContent);

// ───────────────────────────────────────────────────────────────────────────
// The discriminating fixture. The caption overlay starts at 8000 ms — NOT at
// the reel's origin — so composition-absolute and mount-local ms differ by a
// full 8 seconds. Every authored time below is composition-ABSOLUTE, as every
// time in layered-schema.ts is.
// ───────────────────────────────────────────────────────────────────────────
const CAPTION_START_MS = 8000;

const captionsItem = (over: Partial<OverlayItem> = {}): OverlayItem => ({
  id: 'cap-1',
  startMs: CAPTION_START_MS,
  endMs: 14000,
  content: {
    kind: 'captions',
    lines: [
      { startMs: 8000, endMs: 10000, text: 'first line' },
      { startMs: 10500, endMs: 13000, text: 'second line' },
    ],
    // Absolute window covering the FIRST line only.
    liftWindows: [{ startMs: 8000, endMs: 10000 }],
  },
  ...over,
});

// frame 240 = 8000 ms composition = 0 ms local (the mount's Sequence starts there)
const FRAME_AT_LOCAL_ZERO = 240;

describe('captions have a core mount (Task 4.3, mutation 1)', () => {
  it('renders a `captions` overlay item through LayeredReelComposition', () => {
    const { container } = draw(reel([captionsItem()]), theme(), FRAME_AT_LOCAL_ZERO);
    expect(root(container)).not.toBeNull();
    expect(words(container)).toEqual(['first line']);
  });

  it('draws the SECOND line later in the same item', () => {
    // 11000 ms composition = 3000 ms local → inside line 2 [2500, 5000) local.
    const { container } = draw(reel([captionsItem()]), theme(), 330);
    expect(words(container)).toEqual(['second line']);
  });

  it('draws nothing before the item and nothing between the lines', () => {
    // 10200 ms composition = 2200 ms local → after line 1, before line 2.
    expect(root(draw(reel([captionsItem()]), theme(), 306).container)).toBeNull();
  });

  it('leaves every OTHER overlay kind alone (no accidental capture)', () => {
    const other: OverlayItem = { id: 'o', startMs: 0, endMs: 1000, content: { kind: 'chevron' } };
    const { container } = draw(reel([other]), theme(), 0);
    expect(root(container)).toBeNull();
  });
});

describe('ThemeTokens.caption is threaded to the mount (Task 4.3, mutation 2)', () => {
  it('honours a brand `bottomPct` — the token block reaches GenericCaptions', () => {
    const { container } = draw(
      reel([captionsItem()]),
      theme({ caption: { bottomPct: 0.33, liftBottomPct: 0.77 } }),
      // 11000 ms composition = 3000 ms local → line 2, OUTSIDE the lift window,
      // so this reads `bottomPct` and not `liftBottomPct`.
      330,
    );
    expect(root(container)!.style.bottom).toBe('33%');
  });

  it('honours a brand `liftBottomPct` inside a lift window', () => {
    const { container } = draw(
      reel([captionsItem()]),
      theme({ caption: { bottomPct: 0.33, liftBottomPct: 0.77 } }),
      FRAME_AT_LOCAL_ZERO,
    );
    expect(root(container)!.style.bottom).toBe('77%');
  });

  it('honours a brand `mode`, `color` and `fontFamily`', () => {
    const { container } = draw(
      reel([captionsItem()]),
      theme({ caption: { mode: 'highlight', color: '#123456', fontFamily: 'Brand Sans' } }),
      FRAME_AT_LOCAL_ZERO,
    );
    const line = container.querySelector('[data-caption-line]') as HTMLElement;
    expect(line).not.toBeNull(); // 'highlight' mode drew, not the pop pill
    expect(line.style.color).toBe('rgb(18, 52, 86)');
    expect(line.style.fontFamily).toBe('Brand Sans');
  });

  it('falls back to core neutral defaults when the theme declares no tokens', () => {
    const { container } = draw(reel([captionsItem()]), theme(), 330);
    expect(root(container)!.style.bottom).toBe('20%'); // CaptionTokens default
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Mutation 3 — the units bug.
//
// `CaptionLiftWindow` was documented composition-relative and compared against
// a Sequence-LOCAL `ms`. The mount now rebases; these inputs make the two
// readings give DIFFERENT answers, which inputs on a reel's first item cannot
// (there origin = 0 and rebasing is the identity — that is how this survived).
// ───────────────────────────────────────────────────────────────────────────
describe('caption times are rebased into the mount domain (Task 4.3, mutation 3)', () => {
  it('LIFTS at the start of the item — absolute window [8000,10000] vs local [0,2000]', () => {
    // Competing values at composition frame 240 (= 8000 ms absolute / 0 ms local):
    //   rebased (chosen):  window is local [0,2000], 0 is inside  → bottom 42%
    //   unrebased:         window is local [8000,10000], 0 is out → bottom 20%
    const { container } = draw(reel([captionsItem()]), theme(), FRAME_AT_LOCAL_ZERO);
    expect(root(container)!.style.bottom).toBe('42%'); // liftBottomPct default
  });

  it('DROPS the lift once the window has passed', () => {
    // 11000 ms composition = 3000 ms local, past the local window's 2000 end.
    const { container } = draw(reel([captionsItem()]), theme(), 330);
    expect(root(container)!.style.bottom).toBe('20%'); // bottomPct default
  });

  it('rebases the LINES too, not only the lift windows', () => {
    // Unrebased, line 1 would be live at local 8000..10000 ms = composition
    // 16000..18000 ms — past the item's own 14000 ms end, so it would never
    // draw at all. It draws here, at local 0.
    expect(words(draw(reel([captionsItem()]), theme(), FRAME_AT_LOCAL_ZERO).container)).toEqual([
      'first line',
    ]);
  });

  it('rebases WORDS (seconds) as well as lines and windows (ms)', () => {
    const item = captionsItem({
      content: {
        kind: 'captions',
        // Absolute seconds: 8.0-8.4 "alpha", 8.5-8.9 "beta".
        words: [
          { start: 8.0, end: 8.4, word: 'alpha' },
          { start: 8.5, end: 8.9, word: 'beta' },
        ],
      },
    });
    // local 0 ms → both words are in the same pop chunk, 'alpha' active.
    const { container } = draw(reel([item]), theme(), FRAME_AT_LOCAL_ZERO);
    expect(words(container)).toEqual(['alpha', 'beta']);
    // Unrebased those words would be live at local 8000..8900 ms, i.e. 8 s
    // after the item started — beyond its 6 s span. Nothing at all would draw.
  });

  it('is the IDENTITY at the reel origin — where the two readings agree', () => {
    // The exact case that hid the bug: same content, item at 0.
    const atOrigin = captionsItem({ id: 'cap-0', startMs: 0, endMs: 6000 });
    (atOrigin.content as { lines: unknown }).lines = [{ startMs: 0, endMs: 2000, text: 'first line' }];
    (atOrigin.content as { liftWindows: unknown }).liftWindows = [{ startMs: 0, endMs: 2000 }];
    const { container } = draw(reel([atOrigin]), theme(), 0);
    expect(root(container)!.style.bottom).toBe('42%');
    expect(words(container)).toEqual(['first line']);
  });
});

describe('rebaseCaptionTimes (pure)', () => {
  it('subtracts ms from lines/windows and SECONDS from words', () => {
    const out = rebaseCaptionTimes(
      {
        words: [{ start: 8.5, end: 8.9, word: 'x' }],
        lines: [{ startMs: 9000, endMs: 9500, text: 'x', words: [{ startMs: 9000, endMs: 9500, word: 'x' }] }],
        liftWindows: [{ startMs: 8000, endMs: 10000 }],
      },
      8000,
    );
    // Float subtraction, so compare with tolerance: 8.9 - 8 is
    // 0.9000000000000004 in IEEE-754, not 0.9. Deliberately NOT rounded in the
    // implementation — rounding seconds here would quantise word timings, and
    // a 4e-16 s error is 1.2e-14 frames.
    expect(out.words![0].start).toBeCloseTo(0.5, 10);
    expect(out.words![0].end).toBeCloseTo(0.9, 10);
    expect(out.words![0].word).toBe('x');
    expect(out.lines![0].startMs).toBe(1000);
    expect(out.lines![0].words![0].endMs).toBe(1500);
    expect(out.liftWindows).toEqual([{ startMs: 0, endMs: 2000 }]);
  });

  it('does not clamp — a time before the origin stays negative', () => {
    const out = rebaseCaptionTimes({ liftWindows: [{ startMs: 500, endMs: 9000 }] }, 8000);
    expect(out.liftWindows).toEqual([{ startMs: -7500, endMs: 1000 }]);
  });

  it('returns the SAME object at origin 0 (identity, no per-frame allocation)', () => {
    const input = { liftWindows: [{ startMs: 0, endMs: 1 }] };
    expect(rebaseCaptionTimes(input, 0)).toBe(input);
  });
});

describe('captions coexist with the anchored route (the design criterion)', () => {
  const clip: VideoItem = {
    id: 'seg-1',
    kind: 'clip',
    startMs: 0,
    endMs: 20000,
    source: 'recordings/a.mp4',
    sourceInMs: 0,
    sourceOutMs: 20000,
  };

  it('renders the SAME caption node when a brand routes the kind anchored', () => {
    const anchoredTheme: CompositionTheme = {
      background: '#000000',
      accentSlots: [],
      overlays: { captions: { routing: 'anchored' } },
    };
    const item = captionsItem({ anchorVideoId: 'seg-1' });
    const { container } = draw(reel([item], [clip]), anchoredTheme, FRAME_AT_LOCAL_ZERO);
    // Same dispatch (makeOverlayRenderer) → same DOM, same local rebase, from
    // inside SegmentMedia's own Sequence instead of a top-level one.
    expect(root(container)).not.toBeNull();
    expect(words(container)).toEqual(['first line']);
    expect(root(container)!.style.bottom).toBe('42%');
  });

  it('a TRACK-routed caption is NOT clipped by the video item beneath it', () => {
    // The video item ends at 9000 ms; the caption item runs to 14000 ms. On the
    // track route the caption owns its own Sequence, so it still draws at
    // 11000 ms — the property that motivated choosing 'track' as the default.
    const shortClip: VideoItem = { ...clip, endMs: 9000, sourceOutMs: 9000 };
    const { container } = draw(reel([captionsItem()], [shortClip]), theme(), 330);
    expect(words(container)).toEqual(['second line']);
  });
});
