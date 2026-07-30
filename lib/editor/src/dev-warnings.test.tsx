// Phase 4 Task 6.3 — the eight dev-only warnings.
//
// Each warning is pinned through the REAL render path it lives on (per
// CONSTRAINTS.md's "PIN THE WIRING, NOT JUST THE PURE FUNCTION"): the real
// `LayeredReelComposition` for the four render-path warnings that live there
// (1, 2, 3 partially, 6, 7, 8 — see per-section notes), the real
// `LayeredInspector` for warning 4 (an editor-authoring concern, not a render
// one). Warning 5 (an unrecognised transition kind) already existed before
// this task — see `transition-record.test.ts` and
// `transition-record-lazy-warn.test.ts` — and is not re-pinned here.
//
// All eight share the same helper (`lib/render/warn-once.ts`); this file does
// not add a second de-duplication mechanism. `resetWarnOnce()` runs before and
// after every test — the SEEN set is module-global, so a leaked key would make
// a later test's "warns once" assertion pass by accident (nothing warns
// because the key was already seen from a PRIOR test, not because
// de-duplication actually worked for THIS test's input).
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';

// REVIEW ROUND 1, CRITICAL 1 — the ORIGINAL mock here was a bare passthrough
// (`Sequence: ({children}) => <>{children}</>`), which rendered every item at
// every "frame" regardless of its own `[from, from+durationInFrames)` window —
// the exact property real Remotion does NOT have (a Sequence outside its
// window sets `content = null`). That made the false-positive Critical 1
// describes below structurally invisible to this file's own suite. Fixed: a
// mutable `clock` (the same hoisted-object pattern `transition-registry.test.tsx`
// already uses) and a `Sequence` mock that actually honours the window.
const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => clock.frame,
    useVideoConfig: () => ({
      width: 1080, height: 1920, fps: 30, durationInFrames: 300,
      id: 'test', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
    Sequence: ({ children, from = 0, durationInFrames = Infinity }: { children?: React.ReactNode; from?: number; durationInFrames?: number }) => {
      if (clock.frame < from || clock.frame >= from + durationInFrames) return null;
      // eslint-disable-next-line react/jsx-no-useless-fragment
      return <>{children}</>;
    },
    Audio: () => null,
    Img: (props: { src?: string; style?: React.CSSProperties }) => (
      <img data-testid="core-img" data-src={props.src} style={props.style} />
    ),
    OffthreadVideo: (props: { src?: string; style?: React.CSSProperties }) => (
      <video data-testid="core-video" data-src={props.src} style={props.style} />
    ),
  };
});

import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import { SegmentMedia } from '@video-toolkit/lib/theming/segment/SegmentMedia';
import { transitionNodeFor, resetTransitionNodeCache } from '@video-toolkit/lib/render/at-cut-transitions';
import { LayeredInspector } from '../app/LayeredInspector';
import { editorMetaFromTheme } from '../app/editor-meta';
import type { CompositionTheme, VideoRenderProps, OverlayRenderer } from '@video-toolkit/lib/theming';
import type { LayeredReel, OverlayItem, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetWarnOnce();
  resetTransitionNodeCache();
  clock.frame = 0;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  resetWarnOnce();
  resetTransitionNodeCache();
  clock.frame = 0;
});

const bareTheme: CompositionTheme = { background: '#000', accentSlots: [] };

function reelWith(video: VideoItem[], overlays: OverlayItem[] = []): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'dev-warnings', totalDurationMs: 6000 },
    tracks: { video, audio: [], music: { baseVolumeDb: -8 }, overlays, brand: [] },
  };
}

// ---------------------------------------------------------------------------
// Warning 1 — `renderer` on a non-core overlay kind is silently ignored.
// ---------------------------------------------------------------------------
describe('warning 1 — renderer on a non-core overlay kind', () => {
  const BrandChevron: OverlayRenderer = () => <div data-testid="ignored-renderer" />;

  it('warns once, naming the kind and `render` as the fix', () => {
    const theme: CompositionTheme = { ...bareTheme, overlays: { chevron: { renderer: BrandChevron } } };
    const overlay: OverlayItem = { id: 'ov1', startMs: 0, endMs: 1000, content: { kind: 'chevron' } };
    render(<LayeredReelComposition reel={reelWith([], [overlay])} theme={theme} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"chevron"');
    expect(text).toContain('`render`');
  });

  it('does not warn for `text`/`quote-pull` (the kinds `renderer` IS consumed for), or when unregistered', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      overlays: { text: { renderer: () => <div /> }, 'quote-pull': { renderer: () => <div /> } },
    };
    const overlays: OverlayItem[] = [
      { id: 'a', startMs: 0, endMs: 1000, content: { kind: 'text', text: 'hi' } },
      { id: 'b', startMs: 0, endMs: 1000, content: { kind: 'quote-pull', text: 'hi' } },
    ];
    render(<LayeredReelComposition reel={reelWith([], overlays)} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Warning 2 — anchored overlays delivered to a renderer that drew none.
// ---------------------------------------------------------------------------
describe('warning 2 — anchored overlays delivered but never drawn', () => {
  // A brand video renderer that never touches `renderAnchoredOverlay` at all —
  // the exact write-only-prop shape (Task 4.1's failure returning by a
  // different door, per the brief).
  const IgnorantCard: React.FC<VideoRenderProps> = ({ item }) => <div data-testid="ignorant-card">{item.id}</div>;
  const ConsumingCard: React.FC<VideoRenderProps> = ({ item, anchoredOverlays, renderAnchoredOverlay }) => (
    <div data-testid="consuming-card">
      {item.id}
      {(anchoredOverlays ?? []).map((o) => <React.Fragment key={o.id}>{renderAnchoredOverlay?.(o)}</React.Fragment>)}
    </div>
  );

  const card: VideoItem = { id: 'v-card', kind: 'card', startMs: 0, endMs: 3000, cardKind: 'claim-plate' };
  const badge: OverlayItem = {
    id: 'o-badge', startMs: 0, endMs: 2000, content: { kind: 'badge', label: 'x' }, anchorVideoId: 'v-card',
  };

  it('warns once, naming the item, when the resolved renderer never calls renderAnchoredOverlay', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      video: { card: { renderer: IgnorantCard } },
      overlays: { badge: { routing: 'anchored' } },
    };
    render(<LayeredReelComposition reel={reelWith([card], [badge])} theme={theme} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"v-card"');
    expect(text).toContain('renderAnchoredOverlay');
  });

  it('does not warn when the resolved renderer DOES call renderAnchoredOverlay', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      video: { card: { renderer: ConsumingCard } },
      overlays: { badge: { routing: 'anchored' } },
    };
    render(<LayeredReelComposition reel={reelWith([card], [badge])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when nothing is anchored to the item at all', () => {
    const theme: CompositionTheme = { ...bareTheme, video: { card: { renderer: IgnorantCard } } };
    render(<LayeredReelComposition reel={reelWith([card], [])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Review round 1, CRITICAL 1 — the reviewer's exact two reproductions.
// Both are CORRECT configurations (a renderer that DOES consume, or core's
// own SegmentMedia) whose SECOND item is simply not on screen yet at frame 0
// — the false-positive class a frame-agnostic Sequence mock cannot see.
// ---------------------------------------------------------------------------
describe('review round 1, CRITICAL 1 — no false warning for an item whose Sequence window is not open yet', () => {
  it('two card items, an anchored badge on the SECOND, a renderer that DOES call renderAnchoredOverlay — frame 0', () => {
    const Consuming: React.FC<VideoRenderProps> = ({ item, anchoredOverlays, renderAnchoredOverlay }) => (
      <div data-testid={`card-${item.id}`}>
        {(anchoredOverlays ?? []).map((o) => <React.Fragment key={o.id}>{renderAnchoredOverlay?.(o)}</React.Fragment>)}
      </div>
    );
    const theme: CompositionTheme = { ...bareTheme, video: { card: { renderer: Consuming } }, overlays: { badge: { routing: 'anchored' } } };
    const cardA: VideoItem = { id: 'v-card-a', kind: 'card', startMs: 0, endMs: 1000, cardKind: 'claim-plate' };
    const cardB: VideoItem = { id: 'v-card-b', kind: 'card', startMs: 1000, endMs: 2000, cardKind: 'claim-plate' };
    const badge: OverlayItem = { id: 'o-badge', startMs: 1000, endMs: 1800, content: { kind: 'badge' }, anchorVideoId: 'v-card-b' };
    // frame 0 — cardA's Sequence [0,30) is open; cardB's [30,60) is NOT.
    render(<LayeredReelComposition reel={reelWith([cardA, cardB], [badge])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it("two clip items, a scope:'media' effect on the SECOND, renderer = core's SegmentMedia — frame 0", () => {
    const theme: CompositionTheme = { ...bareTheme, effects: { ghost: { renderer: () => <div />, scope: 'media' } } };
    const clipA: VideoItem = { id: 'v-clip-a', kind: 'clip', startMs: 0, endMs: 1000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000 };
    const clipB: VideoItem = {
      id: 'v-clip-b', kind: 'clip', startMs: 1000, endMs: 2000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000,
      effects: [{ type: 'ghost' }],
    };
    // frame 0 — clipA's Sequence [0,30) is open; clipB's [30,60) is NOT.
    render(<LayeredReelComposition reel={reelWith([clipA, clipB])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('but DOES still warn once clipB\'s own Sequence window is reached (with a renderer that genuinely never consumes)', () => {
    // An ignorant renderer here, deliberately — the earlier test in this
    // block uses core's SegmentMedia to prove windowing does not mask a
    // GENUINELY correct renderer; this one proves windowing does not mask a
    // GENUINELY incorrect one either, once its Sequence is actually open.
    const IgnorantClip: React.FC<VideoRenderProps> = ({ item }) => <div data-testid={`node-${item.id}`} />;
    const theme: CompositionTheme = {
      ...bareTheme,
      video: { clip: { renderer: IgnorantClip } },
      effects: { ghost: { renderer: () => <div />, scope: 'media' } },
    };
    const clipA: VideoItem = { id: 'v-clip-a', kind: 'clip', startMs: 0, endMs: 1000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000 };
    const clipB: VideoItem = {
      id: 'v-clip-b', kind: 'clip', startMs: 1000, endMs: 2000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000,
      effects: [{ type: 'ghost' }],
    };
    const reel = reelWith([clipA, clipB]);
    clock.frame = 45; // inside clipB's own [30,60) window
    render(<LayeredReelComposition reel={reel} theme={theme} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"v-clip-b"');
  });
});

// ---------------------------------------------------------------------------
// Warning 3 — a registration for a reserved effect type.
// ---------------------------------------------------------------------------
describe('warning 3 — a wrapper-axis registration for a RESERVED effect type', () => {
  const photo: VideoItem = {
    id: 'v1', kind: 'photo', startMs: 0, endMs: 1000, source: 'a.jpg',
    effects: [{ type: 'ken-burns', fromScale: 1, toScale: 1.1 }],
  };

  it('warns once, naming the type, when theme.effects registers a reserved (style-axis) type', () => {
    const theme: CompositionTheme = { ...bareTheme, effects: { 'ken-burns': { renderer: () => <div /> } } };
    render(<LayeredReelComposition reel={reelWith([photo])} theme={theme} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"ken-burns"');
    expect(text).toContain('RESERVED');
  });

  it('does not warn for the ordinary case — a reserved type with NO wrapper-axis registration', () => {
    const theme: CompositionTheme = { ...bareTheme };
    render(<LayeredReelComposition reel={reelWith([photo])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for an ordinary (non-reserved) wrapper-axis registration', () => {
    const withGrain: VideoItem = { ...photo, effects: [{ type: 'grain' }] };
    const theme: CompositionTheme = { ...bareTheme, effects: { grain: { config: { amount: 0.5 } } } };
    render(<LayeredReelComposition reel={reelWith([withGrain])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Warning 4 — a ParamField with neither `options` nor `type`.
// ---------------------------------------------------------------------------
describe('warning 4 — ParamField declares neither `type` nor `options`', () => {
  const overlayReel = (content: Record<string, unknown>): LayeredReel => ({
    version: 'layered-1',
    meta: { topic: 't', totalDurationMs: 2000 },
    tracks: { video: [], audio: [], music: { baseVolumeDb: -8 }, brand: [], overlays: [{ id: 'ov1', startMs: 0, endMs: 2000, content }] },
  });

  it('warns once, naming the field, through the real inspector', () => {
    const theme: CompositionTheme = { ...bareTheme, overlays: { chevron: { params: [{ prop: 'mode' }] } } };
    const meta = editorMetaFromTheme(theme);
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron', mode: 'a' })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"mode"');
    expect(text).toContain('`type`');
  });

  it('does not warn when `type` or `options` is declared', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      overlays: { chevron: { params: [{ prop: 'mode', type: 'string' }, { prop: 'weight', options: ['a', 'b'] }] } },
    };
    const meta = editorMetaFromTheme(theme);
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron', mode: 'a', weight: 'a' })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  // Review round 1, CRITICAL 2 — `ParamFields` synthesizes a bare `{ prop }`
  // descriptor for EVERY undeclared key in a params bag (the documented "a
  // host that supplies no metadata still reaches every value" fallback). That
  // descriptor has no `type`/`options` BY DESIGN, and the hazard warning 4
  // names cannot occur on that path (the value already exists, so `typeof
  // value` is accurate) — it must never fire for a rest field.
  it('does NOT warn for an UNDECLARED rest field, even though it also has neither type nor options', () => {
    const theme: CompositionTheme = { ...bareTheme, overlays: { chevron: { params: [{ prop: 'mode', type: 'string' }] } } };
    const meta = editorMetaFromTheme(theme);
    render(
      <LayeredInspector
        // `wobblePx` is NOT declared in `params` above — a rest field.
        reel={overlayReel({ kind: 'chevron', mode: 'a', wobblePx: 12 })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  // Review round 1, IMPORTANT 2 — the key (and message) must include the
  // axis + kind, not just the bare prop name, or two different registrations
  // that happen to declare the same untyped prop collide into ONE warning
  // that cannot tell the author which registration to fix.
  it('warns TWICE (not once) for two different overlay kinds each declaring an untyped "mode", naming each kind', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      overlays: { chevron: { params: [{ prop: 'mode' }] }, badge: { params: [{ prop: 'mode' }] } },
    };
    const meta = editorMetaFromTheme(theme);
    const reel: LayeredReel = {
      version: 'layered-1',
      meta: { topic: 't', totalDurationMs: 2000 },
      tracks: {
        video: [], audio: [], music: { baseVolumeDb: -8 }, brand: [],
        overlays: [
          { id: 'ov1', startMs: 0, endMs: 1000, content: { kind: 'chevron', mode: 'a' } },
          { id: 'ov2', startMs: 1000, endMs: 2000, content: { kind: 'badge', mode: 'b' } },
        ],
      },
    };
    render(<LayeredInspector reel={reel} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    render(<LayeredInspector reel={reel} selectedId="overlays:ov2" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect(warn).toHaveBeenCalledTimes(2);
    const texts = warn.mock.calls.map((c) => String(c[0]));
    expect(texts.some((t) => t.includes('"chevron"'))).toBe(true);
    expect(texts.some((t) => t.includes('"badge"'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Warning 6 — `item.grade` and a `grade` effect on the same item.
// ---------------------------------------------------------------------------
describe('warning 6 — item.grade AND an authored type:"grade" effect', () => {
  const item: VideoItem = {
    id: 'v-grade', kind: 'photo', startMs: 0, endMs: 1000, source: 'a.jpg',
    grade: { brightness: 1.2 },
    effects: [{ type: 'grade', brightness: 3 }],
  };

  it('warns once, naming the item, through the real SegmentMedia render path', () => {
    render(<SegmentMedia item={item} handles={{ inHalf: 0, outHalf: 0 }} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"v-grade"');
    expect(text).toContain("type: 'grade'");
  });

  it('does not warn for item.grade alone, or a type:"grade" effect alone', () => {
    render(<SegmentMedia item={{ ...item, effects: undefined }} handles={{ inHalf: 0, outHalf: 0 }} />);
    render(<SegmentMedia item={{ ...item, grade: undefined }} handles={{ inHalf: 0, outHalf: 0 }} />);
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Warning 7 — media-scope effects present but unconsumed.
// ---------------------------------------------------------------------------
describe('warning 7 — a media-scope effect delivered to a renderer that never calls useMediaEffects()', () => {
  // A brand-hand-rolled video renderer that never calls `useMediaEffects()` —
  // the media-effects-context analogue of warning 2's IgnorantCard.
  const IgnorantClip: React.FC<VideoRenderProps> = ({ item }) => <div data-testid="ignorant-clip">{item.id}</div>;

  const item: VideoItem = {
    id: 'v-clip', kind: 'clip', startMs: 0, endMs: 1000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000,
    effects: [{ type: 'ghost' }],
  };

  it('warns once, naming the item, when nothing calls useMediaEffects()', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      video: { clip: { renderer: IgnorantClip } },
      effects: { ghost: { renderer: () => <div />, scope: 'media' } },
    };
    render(<LayeredReelComposition reel={reelWith([item])} theme={theme} />);
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"v-clip"');
    expect(text).toContain('useMediaEffects');
  });

  it('does not warn when the resolved renderer is SegmentMedia (calls useMediaEffects unconditionally)', () => {
    const theme: CompositionTheme = { ...bareTheme, effects: { ghost: { renderer: () => <div />, scope: 'media' } } };
    render(<LayeredReelComposition reel={reelWith([item])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn when the item has no media-scope effect at all', () => {
    const theme: CompositionTheme = { ...bareTheme, video: { clip: { renderer: IgnorantClip } } };
    render(<LayeredReelComposition reel={reelWith([{ ...item, effects: [] }])} theme={theme} />);
    expect(warn).not.toHaveBeenCalled();
  });

  // Review round 1, IMPORTANT 1 — `MediaEffectsBoundary` (GenericMultiClip's
  // wrapper around its synthetic per-pane SegmentMedia calls) must reset BOTH
  // the entries context (`[]`) AND the consumption ping (`undefined`), or a
  // pane's own (always-run) `useMediaEffects()` call pings the OUTER
  // multi-clip item's tracker — marking the multi-clip's OWN, genuinely
  // unconsumed media-scope effect as consumed by accident.
  it("still warns for a multi-clip item's OWN unconsumed media-scope effect — a pane's SegmentMedia call must not satisfy it", () => {
    const theme: CompositionTheme = { ...bareTheme, effects: { ghost: { renderer: () => <div />, scope: 'media' } } };
    const multiClip: VideoItem = {
      id: 'v-multi', kind: 'multi-clip', startMs: 0, endMs: 1000, layout: 'split-h',
      sources: [
        { source: 'a.mp4', sourceInMs: 0, sourceOutMs: 500 },
        { source: 'b.mp4', sourceInMs: 0, sourceOutMs: 500 },
      ],
      effects: [{ type: 'ghost' }],
    };
    render(<LayeredReelComposition reel={reelWith([multiClip])} theme={theme} />);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('"v-multi"');
  });
});

// ---------------------------------------------------------------------------
// Warning 8 — a config-only registration for a BRAND-ONLY transition kind.
// ---------------------------------------------------------------------------
describe('warning 8 — config-only registration for a brand-only transition kind', () => {
  it('warns once, naming the kind, and the boundary hard-cuts', () => {
    const node = transitionNodeFor(
      { kind: 'sand-sweep', frames: 12 } as never,
      { width: 100, height: 100, transitions: { 'sand-sweep': { config: { grains: 4 } } } },
    );
    expect(node).toBeNull(); // the hard cut
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('"sand-sweep"');
    expect(text).toContain('no `renderer`');
  });

  it('does not warn — and does not mask the core generic — for a config-only registration of a CORE kind', () => {
    const node = transitionNodeFor(
      { kind: 'dissolve', frames: 12 } as never,
      { width: 100, height: 100, transitions: { dissolve: { config: { note: 'brand tuning only' } } } },
    );
    expect(node).not.toBeNull(); // core's own generic still resolved
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not warn for a brand kind that DOES register a renderer', () => {
    const node = transitionNodeFor(
      { kind: 'sand-sweep', frames: 12 } as never,
      { width: 100, height: 100, transitions: { 'sand-sweep': { renderer: () => ({ component: () => null, props: {} }) } } },
    );
    expect(node).not.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting pin 1 — NEVER THROWS, even with every render-path problem at once.
// ---------------------------------------------------------------------------
describe('cross-cutting — never throws, with every problem present at once', () => {
  // Review round 1, CRITICAL 1 — REWRITTEN to sample multiple real frames
  // across the reel instead of one frame with a passthrough Sequence mock.
  // Three sequential, non-overlapping video items (30 frames each at fps 30)
  // can never all be on screen at once, so this renders the SAME composition
  // at one representative frame INSIDE each item's own window, accumulating
  // warnings across all three renders — exactly how a real playback/render
  // would surface them over time. Warning 8 is deliberately NOT part of this
  // fixture: it lives entirely in `resolveTransition`, never touches
  // Sequence/frame timing at all, and is already pinned in complete isolation
  // above — folding a transition boundary in here would reintroduce
  // handle-borrowed frame math this test has no need for.
  it('renders a theme/reel combining warnings 1, 2, 3, 6 and 7 across a real multi-frame render, without throwing', () => {
    // A brand renderer that draws nothing of its item and consumes neither
    // `renderAnchoredOverlay` (warning 2) nor `useMediaEffects()` (warning 7).
    const Ignorant: React.FC<VideoRenderProps> = ({ item }) => <div data-testid={`node-${item.id}`} />;
    const theme: CompositionTheme = {
      ...bareTheme,
      // warning 1
      overlays: { chevron: { renderer: () => <div /> }, badge: { routing: 'anchored' } },
      // warning 3
      effects: { 'ken-burns': { renderer: () => <div /> }, ghost: { renderer: () => <div />, scope: 'media' } },
      // warnings 2 (card) and 7 (broll): both resolve to the ignorant renderer.
      // 'clip' is deliberately left UN-registered, so `graded` below renders
      // through core's own SegmentMedia — the only path warning 6 lives on.
      video: { card: { renderer: Ignorant }, broll: { renderer: Ignorant } },
    };
    // Frames [0, 30). Triggers warning 3 (its own `ken-burns` effect entry —
    // reached unconditionally, since `applyEffects`'s loop runs as plain JS
    // inside `renderVideoItemNode`, itself called for every item on every
    // render regardless of Sequence windowing) and warning 6 (through core's
    // SegmentMedia, which DOES depend on this item's Sequence being open).
    const graded: VideoItem = {
      id: 'v-grade', kind: 'clip', startMs: 0, endMs: 1000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000,
      grade: { brightness: 1.2 },
      effects: [{ type: 'grade', brightness: 3 }, { type: 'ken-burns', fromScale: 1, toScale: 1.1 }],
    };
    // Frames [30, 60). Triggers warning 7 — a media-scope effect the ignorant
    // `broll` renderer never consumes, once ITS OWN Sequence is open.
    const ignorantBroll: VideoItem = {
      id: 'v-broll', kind: 'broll', startMs: 1000, endMs: 2000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000,
      effects: [{ type: 'ghost' }],
    };
    // Frames [60, 120). Triggers warning 2 — an anchored overlay the ignorant
    // `card` renderer never draws, once ITS OWN Sequence is open.
    const card: VideoItem = { id: 'v-card', kind: 'card', startMs: 2000, endMs: 4000, cardKind: 'claim-plate' };
    const badge: OverlayItem = { id: 'o1', startMs: 0, endMs: 800, content: { kind: 'badge' }, anchorVideoId: 'v-card' };
    const reel = reelWith([graded, ignorantBroll, card], [badge]);

    for (const frame of [15, 45, 90]) {
      clock.frame = frame;
      expect(() => render(<LayeredReelComposition reel={reel} theme={theme} />)).not.toThrow();
    }
    // Five distinct warnings really did fire across the sweep — this is not
    // vacuously true of an empty/no-op fixture. (Warning 4 is separate — an
    // editor-authoring concern, not part of the video render path — pinned in
    // the next test. Warning 8 is pinned in complete isolation above.)
    expect(warn.mock.calls.length).toBe(5);
    const kinds = warn.mock.calls.map((c) => String(c[0]));
    expect(kinds.some((t) => t.includes('"chevron"'))).toBe(true);
    expect(kinds.some((t) => t.includes('"v-card"') && t.includes('renderAnchoredOverlay'))).toBe(true);
    expect(kinds.some((t) => t.includes('"ken-burns"') && t.includes('RESERVED'))).toBe(true);
    expect(kinds.some((t) => t.includes('"v-grade"') && t.includes("type: 'grade'"))).toBe(true);
    expect(kinds.some((t) => t.includes('"v-broll"') && t.includes('useMediaEffects'))).toBe(true);
  });

  it('the inspector renders an untyped ParamField (warning 4) without throwing', () => {
    const theme: CompositionTheme = { ...bareTheme, overlays: { chevron: { params: [{ prop: 'mode' }] } } };
    const reel: LayeredReel = {
      version: 'layered-1',
      meta: { topic: 't', totalDurationMs: 2000 },
      tracks: { video: [], audio: [], music: { baseVolumeDb: -8 }, brand: [], overlays: [{ id: 'ov1', startMs: 0, endMs: 2000, content: { kind: 'chevron', mode: 'a' } }] },
    };
    expect(() =>
      render(<LayeredInspector reel={reel} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={editorMetaFromTheme(theme)} />),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting pin 2 — DEV-ONLY: nothing warns on the production path.
// ---------------------------------------------------------------------------
describe('cross-cutting — dev-only: nothing warns in production', () => {
  it('is silent for warning 1 (and, by the same isDevEnvironment() gate, every other warning) when NODE_ENV=production', () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const theme: CompositionTheme = { ...bareTheme, overlays: { chevron: { renderer: () => <div /> } } };
      const overlay: OverlayItem = { id: 'ov1', startMs: 0, endMs: 1000, content: { kind: 'chevron' } };
      render(<LayeredReelComposition reel={reelWith([], [overlay])} theme={theme} />);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = prior;
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting pin 3 — ONCE PER PROBLEM, not once per frame/render.
// ---------------------------------------------------------------------------
describe('cross-cutting — once per problem, not once per render', () => {
  it('re-rendering the same composition many times still warns exactly once', () => {
    const theme: CompositionTheme = { ...bareTheme, overlays: { chevron: { renderer: () => <div /> } } };
    const overlay: OverlayItem = { id: 'ov1', startMs: 0, endMs: 1000, content: { kind: 'chevron' } };
    const reel = reelWith([], [overlay]);
    const { rerender } = render(<LayeredReelComposition reel={reel} theme={theme} />);
    for (let i = 0; i < 20; i += 1) {
      rerender(<LayeredReelComposition reel={{ ...reel }} theme={{ ...theme }} />);
    }
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
