// Phase 4 Task 6.2 — the CONFORMANCE example, pinned.
//
// `examples/layered-minimal/src/conformance-theme.tsx` + `ConformanceReel.tsx`
// + the new `ConformanceReel` composition in `Root.tsx` are the worked example
// a new brand copies registrations FROM — see task-6.2-report.md for why each
// registration is shaped the way it is. This file is what makes that example a
// PIN rather than decoration: it renders an theme registering all SIX
// extension axes through the REAL `LayeredReelComposition` (not a stub for any
// one axis) and asserts, per axis, that the BRAND's registration is what
// rendered — never core's generic. It then pins the two NEGATIVE rules that
// are this contract's actual semantics (see registry.ts): a registration
// carrying `config` but no `renderer` must not mask the core generic beneath
// it, and a type/kind neither side has must be silently skipped, never thrown.
//
// The registrations below mirror the example's shapes (same registry keys,
// same `scope`/`routing` fields) — renderer BODIES are reduced to bare
// `data-testid` markers, which is what makes "the brand renderer won"
// assertable by DOM query instead of by eye on a rendered frame.
//
// MUTATION DISCIPLINE (see this file's report for the full table): each axis
// below is independently broken at its OWN delivery line in production code —
// not at the shared `resolveRegistered` rule already pinned by Tasks
// 1.2/3.2/3.3/4.1/4.2 — and the axis-named test here goes red while the
// others stay green. That is the property "a single 'the example renders'
// test" cannot have.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 300,
      id: 'test',
      defaultProps: {},
      props: {},
    }),
    staticFile: (s: string) => s,
    // Passthrough: a real Sequence's own from/durationInFrames windowing is
    // pinned elsewhere (overlay-anchor.test.ts, video-track.test.ts) — here we
    // only need every mounted node to be queryable regardless of frame.
    Sequence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Audio: (props: { src?: string }) => <audio data-testid="core-audio" data-src={props.src} />,
    Img: (props: { src?: string; style?: React.CSSProperties }) => (
      <img data-testid="core-img" data-src={props.src} style={props.style} />
    ),
    OffthreadVideo: (props: { src?: string; style?: React.CSSProperties }) => (
      <video data-testid="core-video" data-src={props.src} style={props.style} />
    ),
  };
});

import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { CompositionTheme, EffectRenderer, VideoRenderProps, BrandRenderer } from '@video-toolkit/lib/theming';
import type { LayeredReel, OverlayItem, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
// The SHIPPED fixture theme (fix round 1, Important 1 — see the describe
// block near the bottom of this file for why this import exists at all).
// `server.fs.allow` in vitest.config.ts is scoped to `lib/`, one level above
// this package, and this file sits outside it — but that restriction gates
// the Vite DEV SERVER's static file serving, not vitest's own module
// transform, so this relative import resolves and runs unaided (verified
// directly with a standalone probe before relying on it; no vitest.config.ts
// change was needed).
import { conformanceTheme } from '../../../examples/layered-minimal/src/conformance-theme';

// ---------------------------------------------------------------------------
// The fixture theme: all six axes, non-core markers.
// ---------------------------------------------------------------------------

// AXIS 1 — video: a registered kind ('card').
const BrandCard: React.FC<VideoRenderProps> = ({ item }) => {
  if (item.kind !== 'card') return null;
  return <div data-testid="brand-card">{item.id}</div>;
};

// AXIS 2 — overlay: a non-'text' kind ('badge'), routed 'anchored', drawn via
// the item-level `render` escape hatch (the only way a non-core kind draws).
const BrandBadge: React.FC<{ item: OverlayItem }> = ({ item }) => (
  <div data-testid="brand-badge">{(item.content as { label?: string }).label ?? ''}</div>
);

// AXIS 3a — effect, scope: 'clip' (default). Wraps the whole item's output.
const ClipMarkEffect: EffectRenderer = ({ children }) => <div data-testid="brand-clip-effect">{children}</div>;

// AXIS 3b — effect, scope: 'media'. Builds a SECOND element from `mediaStyle`.
const MediaMarkEffect: EffectRenderer = ({ children, mediaStyle, config }) => {
  const offsetPx = (config as { offsetPx?: number } | undefined)?.offsetPx ?? 0;
  return (
    <>
      {children}
      <div
        data-testid="brand-media-effect"
        style={{ ...mediaStyle, transform: `${mediaStyle?.transform ?? ''} translateX(${offsetPx}px)`.trim() }}
      />
    </>
  );
};

// AXIS 4 — brand-layer: registers a CUSTOM renderer. Uses the schema's
// 'disclaimer' kind (see the CONTRACT FINDING in the report and in
// conformance-theme.tsx: BrandLayerItemSchema.kind is a CLOSED 2-literal enum,
// so a schema-valid literal reel cannot author a genuinely novel third kind).
const BrandDisclaimer: BrandRenderer = ({ item }) => <div data-testid="brand-layer">{String((item.props ?? {}).text ?? '')}</div>;

// AXIS 5 — transition: a brand-authored kind ('conformance-wipe'), returned as
// a one-sided presentation core lifts into the two-input model.
const ConformanceWipe: React.FC<{ passedProps: { teeth: number }; children: React.ReactNode }> = ({
  passedProps,
  children,
}) => (
  <div data-testid="brand-transition" data-teeth={passedProps.teeth}>
    {children}
  </div>
);

function makeTheme(): CompositionTheme {
  return {
    accentSlots: [],
    background: '#000',
    video: { card: { renderer: BrandCard } },
    overlays: { badge: { routing: 'anchored', render: (item) => <BrandBadge item={item} /> } },
    effects: {
      'clip-mark': { renderer: ClipMarkEffect },
      'media-mark': { renderer: MediaMarkEffect, scope: 'media', config: { offsetPx: 12 } },
    },
    brand: { disclaimer: { renderer: BrandDisclaimer } },
    transitions: {
      'conformance-wipe': {
        renderer: ({ transition }) => ({
          component: ConformanceWipe,
          props: { teeth: (transition as { teeth?: number }).teeth ?? 6 },
        }),
        // AXIS "params" — the schema-driven inspector path.
        params: [{ prop: 'teeth', label: 'Teeth', type: 'number', min: 2, max: 20 }],
      },
    },
    resolveMediaSource: (raw, role) => (role === 'photo' && !raw.includes('/') ? `stock/${raw}` : raw),
  };
}

// NOTE: deliberately NO `transitionOut`/`transitionIn` on either item below.
// `buildVideoNodes` mounts a transition BOUNDARY as a second, re-based copy of
// each side's content (see video-track.tsx's module doc) whose blanking of the
// ORIGINAL copy depends on a real Sequence's frame-offset context — this
// file's `Sequence` mock is a bare passthrough (needed so every mounted node
// is queryable regardless of "current frame"), so it cannot reproduce that
// blanking and a transitioning item would double-mount every marker it
// carries. The TRANSITION axis is exercised on its OWN pair of plain items
// below (`transitionPhotoA`/`B`), which carry no other axis' markers, so
// their unavoidable double-mount (both sides of one boundary) never collides
// with a single-mount assertion for a DIFFERENT axis.
const photo: VideoItem = {
  id: 'v-photo',
  kind: 'photo',
  startMs: 0,
  endMs: 3000,
  source: 'dawn.jpg', // bare — AXIS 6 (media-source override) is what resolves this
  // 'ken-burns' is core's own STYLE-axis type (resolves with NO registration
  // at all) — included so SegmentMedia's `mediaStyle.transform` is non-empty,
  // which is what makes the media-effect test below actually exercise
  // "carries mediaStyle" rather than just its own config (see Minor 4, fix
  // round 1: a photo with no ken-burns/crop leaves `mediaStyle.transform`
  // empty, so the assertion never distinguished mediaStyle arriving from
  // mediaStyle being dropped).
  effects: [{ type: 'clip-mark' }, { type: 'ken-burns', fromScale: 1.0, toScale: 1.2 }, { type: 'media-mark' }],
};

const card: VideoItem = { id: 'v-card', kind: 'card', startMs: 3000, endMs: 6000, cardKind: 'claim-plate' };

const transitionPhotoA: VideoItem = {
  id: 'v-tr-a',
  kind: 'photo',
  startMs: 0,
  endMs: 2000,
  source: 'a.jpg',
  // AXIS 5 — the brand-authored transition kind, WITH its registered param
  // ('teeth') authored to a non-default value.
  // No cast needed: `BrandTransitionSchema` is `.passthrough()`, so a
  // brand-authored kind + its own params typecheck unaided (verified —
  // Root.tsx's real fixture needs none either).
  transitionOut: { kind: 'conformance-wipe', frames: 18, teeth: 9 },
};
const transitionPhotoB: VideoItem = { id: 'v-tr-b', kind: 'photo', startMs: 2000, endMs: 4000, source: 'b.jpg' };

const badge: OverlayItem = {
  id: 'o-badge',
  startMs: 400,
  endMs: 2800,
  content: { kind: 'badge', label: 'BRAND' },
  anchorVideoId: 'v-photo',
};

function makeReel(video: VideoItem[] = [photo, card], overlays: OverlayItem[] = [badge]): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'conformance', totalDurationMs: 6000 },
    tracks: {
      video,
      audio: [],
      music: { baseVolumeDb: -8 },
      overlays,
      brand: [{ id: 'b-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 6000, props: { text: 'v6.2' } }],
    },
  };
}

describe('Task 6.2 — conformance example: all six axes, brand wins', () => {
  it('AXIS video — a registered kind (card) renders the BRAND renderer, not GenericCard', () => {
    const { getByTestId, container } = render(<LayeredReelComposition reel={makeReel()} theme={makeTheme()} />);
    expect(getByTestId('brand-card')).not.toBeNull();
    // GenericCard's own real marker (`data-card-bg`, lib/theming/generic/
    // GenericCard.tsx) — a vacuous testid guessed at random cannot fail; this
    // is the actual attribute core's generic would have left behind.
    expect(container.querySelector('[data-card-bg]')).toBeNull();
  });

  it('AXIS overlay — a non-\'text\' kind, anchored, renders via the item-level render escape hatch', () => {
    const { getByTestId } = render(<LayeredReelComposition reel={makeReel()} theme={makeTheme()} />);
    expect(getByTestId('brand-badge').textContent).toBe('BRAND');
  });

  it("AXIS effect — scope: 'clip' wraps the whole item's output", () => {
    const { getByTestId } = render(<LayeredReelComposition reel={makeReel()} theme={makeTheme()} />);
    const wrap = getByTestId('brand-clip-effect');
    expect(wrap.querySelector('[data-testid="core-img"]')).not.toBeNull();
  });

  it("AXIS effect — scope: 'media' receives its OWN config AND the media's mediaStyle (not just one)", () => {
    const { getByTestId } = render(<LayeredReelComposition reel={makeReel()} theme={makeTheme()} />);
    const echo = getByTestId('brand-media-effect');
    // Its config's offsetPx (12) reached the renderer...
    expect(echo.style.transform).toContain('translateX(12px)');
    // ...COMPOSED onto (not replacing) the SAME mediaStyle.transform the real
    // media element (core-img) rendered with — `photo`'s ken-burns effect is
    // what makes this non-empty; without it, a dropped `mediaStyle` prop and
    // a correctly-threaded one are indistinguishable (Minor 4, fix round 1).
    expect(echo.style.transform).toContain('scale(');
    expect(getByTestId('core-img').style.transform).toContain('scale(');
  });

  it('AXIS brand-layer — a registered kind renders the BRAND renderer, not GenericDisclaimer', () => {
    const { getByTestId } = render(<LayeredReelComposition reel={makeReel()} theme={makeTheme()} />);
    expect(getByTestId('brand-layer').textContent).toBe('v6.2');
  });

  it('AXIS transition — a brand-authored kind renders, carrying its OWN param (teeth)', () => {
    // Its own pair of items (see the note above `transitionPhotoA`) — a real
    // boundary mounts each side's content twice under this file's passthrough
    // Sequence mock, which is fine here: every mount must carry `teeth: 9`.
    const { getAllByTestId } = render(
      <LayeredReelComposition reel={makeReel([transitionPhotoA, transitionPhotoB], [])} theme={makeTheme()} />,
    );
    const nodes = getAllByTestId('brand-transition');
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((n) => n.getAttribute('data-teeth') === '9')).toBe(true);
  });

  it('AXIS media-source override — a bare photo source resolves through the WHOLESALE override, not core\'s bare-photo rule', () => {
    const { getByTestId } = render(<LayeredReelComposition reel={makeReel()} theme={makeTheme()} />);
    expect(getByTestId('core-img').dataset.src).toBe('stock/dawn.jpg');
  });

  it('AXIS media-source override — WITHOUT the registration, core leaves a bare photo source unprefixed', () => {
    const bare: CompositionTheme = { ...makeTheme(), resolveMediaSource: undefined };
    const { getByTestId } = render(<LayeredReelComposition reel={makeReel()} theme={bare} />);
    expect(getByTestId('core-img').dataset.src).toBe('dawn.jpg');
  });
});

// ---------------------------------------------------------------------------
// FIX ROUND 1, IMPORTANT 1 — the SHIPPED example, not a parallel private copy.
//
// Everything above defines its OWN theme with parallel registrations
// ('clip-mark'/'media-mark'/'conformance-wipe') and never imports
// `examples/layered-minimal/src/conformance-theme.tsx` — so the file the
// brief calls "the real deliverable" was covered by `tsc` structurally and by
// NOTHING behaviourally: editing `ConformanceCard` to read the wrong prop, or
// `GhostEchoEffect` to read the wrong config key, left every gate green.
//
// This block imports the REAL `conformanceTheme` (see the import near the top
// of this file) and asserts its OWN `data-conformance-*` markers (the ones
// already on every renderer in that file) through the REAL
// `LayeredReelComposition`, so a change to the shipped example itself — not a
// parallel copy of it — is what goes red.

function makeRealReel(video: VideoItem[], overlays: OverlayItem[] = []): LayeredReel {
  return {
    version: 'layered-1',
    meta: { topic: 'real-conformance-theme', totalDurationMs: 6000 },
    tracks: {
      video,
      audio: [],
      music: { baseVolumeDb: -8 },
      overlays,
      brand: [{ id: 'b-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 6000, props: { text: 'v6.2' } }],
    },
  };
}

describe('Task 6.2 fix round 1 — the SHIPPED conformance-theme.tsx, not a private copy', () => {
  const realPhoto: VideoItem = {
    id: 'v-photo',
    kind: 'photo',
    startMs: 0,
    endMs: 3000,
    source: 'dawn.jpg', // bare — resolved only by the theme's OWN resolveMediaSource
    effects: [{ type: 'glitch-frame' }, { type: 'ken-burns', fromScale: 1.0, toScale: 1.2 }, { type: 'ghost-echo' }],
  };
  const realCard: VideoItem = { id: 'v-card', kind: 'card', startMs: 3000, endMs: 6000, cardKind: 'claim-plate', cardProps: { lines: ['a', 'b'] } };
  const realBadge: OverlayItem = {
    id: 'o-badge',
    startMs: 400,
    endMs: 2800,
    content: { kind: 'badge', label: 'BRAND' },
    anchorVideoId: 'v-photo',
  };

  it('video axis — ConformanceCard (not GenericCard) renders for the shipped theme, reading its OWN cardProps', () => {
    const { container } = render(
      <LayeredReelComposition reel={makeRealReel([realPhoto, realCard])} theme={conformanceTheme} />,
    );
    const rendered = container.querySelector('[data-conformance-card]');
    expect(rendered).not.toBeNull();
    // Reads `item.cardProps.lines` (joined with ' / ') — a prop-name typo in
    // the shipped renderer (e.g. `.copy` instead of `.lines`) renders the
    // marker with NO text, which this catches and a bare presence check
    // would not.
    expect(rendered!.textContent).toBe('a / b');
    expect(container.querySelector('[data-card-bg]')).toBeNull();
  });

  it('overlay axis — ConformanceBadge (non-text, anchored) renders for the shipped theme', () => {
    const { container } = render(
      <LayeredReelComposition reel={makeRealReel([realPhoto, realCard], [realBadge])} theme={conformanceTheme} />,
    );
    expect(container.querySelector('[data-conformance-badge]')?.textContent).toBe('BRAND');
  });

  it("effect axis, BOTH scopes — GlitchFrameEffect (clip) and GhostEchoEffect (media) render for the shipped theme", () => {
    const { container } = render(
      <LayeredReelComposition reel={makeRealReel([realPhoto, realCard])} theme={conformanceTheme} />,
    );
    const clipWrap = container.querySelector('[data-conformance-glitch-frame]');
    expect(clipWrap).not.toBeNull();
    expect(clipWrap!.querySelector('[data-testid="core-img"]')).not.toBeNull();
    const echo = container.querySelector('[data-conformance-ghost-echo]') as HTMLElement | null;
    expect(echo).not.toBeNull();
    // The shipped theme's OWN config (`offsetPx: 24`, deliberately different
    // from GhostEchoEffect's `?? 18` fallback default) reached the renderer —
    // reading `config.offset` instead (Minor 4's failure scenario) would fall
    // through to the default and render `18px`, not `24px`.
    expect(echo!.style.transform).toContain('translateX(24px)');
  });

  it('brand-layer axis — ConformanceSticker (not GenericDisclaimer) renders for the shipped theme', () => {
    const { container } = render(
      <LayeredReelComposition reel={makeRealReel([realPhoto, realCard])} theme={conformanceTheme} />,
    );
    expect(container.querySelector('[data-conformance-sticker]')?.textContent).toBe('v6.2');
  });

  it('transition axis — ShardCut renders for the shipped theme, carrying its authored teeth', () => {
    const trA: VideoItem = { id: 'v-tr-a', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', transitionOut: { kind: 'shard-cut', frames: 18, teeth: 9 } };
    const trB: VideoItem = { id: 'v-tr-b', kind: 'photo', startMs: 2000, endMs: 4000, source: 'b.jpg' };
    const { container } = render(<LayeredReelComposition reel={makeRealReel([trA, trB])} theme={conformanceTheme} />);
    const nodes = container.querySelectorAll('[data-conformance-shard-cut]');
    expect(nodes.length).toBeGreaterThan(0);
    // Each side actually clips (the zigzag reveal) — a renderer that ignored
    // `teeth`/progress and rendered a plain pass-through div would leave this
    // empty.
    nodes.forEach((n) => expect((n as HTMLElement).style.clipPath).not.toBe(''));
  });

  it('media-source override axis — a bare photo source resolves through the shipped theme\'s OWN prefix', () => {
    const { getAllByTestId } = render(
      <LayeredReelComposition reel={makeRealReel([realPhoto, realCard])} theme={conformanceTheme} />,
    );
    // conformance-theme.tsx's own override: 'photo' + no slash → `photos/${raw}`.
    // getAllByTestId (not getByTestId): GhostEchoEffect re-mounts `children`
    // (the media element) a second time to build its visible ghost — see
    // Minor 7 — so the resolved src legitimately appears twice.
    for (const img of getAllByTestId('core-img')) {
      expect(img.dataset.src).toBe('photos/dawn.jpg');
    }
  });
});

describe('Task 6.2 — the two NEGATIVE pins (the contract\'s actual semantics)', () => {
  it('a CONFIG-ONLY registration does NOT mask the core generic (video axis, kind: outro)', () => {
    const outro: VideoItem = { id: 'v-outro', kind: 'outro', startMs: 0, endMs: 1000, props: { video: 'brand/outro.mp4' } };
    const theme: CompositionTheme = {
      ...makeTheme(),
      // No `renderer` — config only. Registration.renderer is optional:
      // "absent = routing-only" (registry.ts) — core's GenericOutro must
      // still run underneath it.
      video: { ...makeTheme().video, outro: { config: { note: 'brand tuning only, no renderer' } } },
    };
    const { getByTestId, queryByTestId } = render(<LayeredReelComposition reel={makeReel([outro], [])} theme={theme} />);
    // GenericOutro rendered (the mocked OffthreadVideo/core-video testid) —
    // the config-only registration did not delete it.
    expect(getByTestId('core-video')).not.toBeNull();
    expect(queryByTestId('brand-card')).toBeNull(); // sanity: no unrelated brand marker leaked in
  });

  it('an UNKNOWN effect type is silently SKIPPED — never thrown, the rest of the item renders unaffected', () => {
    const withUnknown: VideoItem = { ...photo, effects: [{ type: 'clip-mark' }, { type: 'totally-unrecognised-type' }] };
    let getByTestId!: (id: string) => HTMLElement;
    let queryByTestId!: (id: string) => HTMLElement | null;
    expect(() => {
      ({ getByTestId, queryByTestId } = render(<LayeredReelComposition reel={makeReel([withUnknown, card])} theme={makeTheme()} />));
    }).not.toThrow();
    // The KNOWN effect on the same item still applied...
    expect(getByTestId('brand-clip-effect')).not.toBeNull();
    // ...and the unknown one contributed no marker of its own (there is none
    // registered for it — nothing to render, and nothing threw getting there).
    expect(queryByTestId('unrecognised-type-marker')).toBeNull();
  });
});
