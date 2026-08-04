import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LayeredTimeline, colorFor, blockColor, timelineLabel, audioUrl, videoUrl, slipDeltaMs, boundaryDiagnostics, zoomFactorFor, followScrollLeft, zoomAnchorScrollLeft, accumulateZoom, TIMELINE_START_LEFT, type PendingZoom } from './LayeredTimeline';
import { sourceColors } from './editor-meta';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const reel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: { video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
            audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
};

describe('LayeredTimeline beat guides', () => {
  it('renders one guide tick per guidesMs entry at startLeft + ms/1000*scaleWidth px', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} guidesMs={[0, 1000]} />,
    );
    const ticks = container.querySelectorAll('[data-guide-tick]');
    expect(ticks).toHaveLength(2);
    expect((ticks[1] as HTMLElement).style.left).toBe('92px'); // 12 + 1000/1000*80
  });

  it('renders no ticks when guidesMs is absent', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} />,
    );
    expect(container.querySelectorAll('[data-guide-tick]')).toHaveLength(0);
  });
});


// ---------------------------------------------------------------------------
// Task 6: colour-coding and labelling lanes by kind is a core MECHANISM; the
// kind NAMES are a brand's. Core colours/labels the kinds its own schema
// defines (video/audio/music/brand), and derives the rest — overridable by the
// host through EditorMeta. Asserted on the pure helpers: xzdarcy virtualizes
// its rows, so in jsdom (zero measured height) no action block ever mounts.
// ---------------------------------------------------------------------------

const overlayReel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [], audio: [], music: { baseVolumeDb: -8 }, brand: [],
    overlays: [
      { id: 'ov1', startMs: 0, endMs: 1000, content: { kind: 'stat-callout', text: 'A' } },
      { id: 'ov2', startMs: 1000, endMs: 2000, content: { kind: 'chevron', text: 'B' } },
    ],
  },
};

const overlayAction = (id: string) => ({ id: `overlays:${id}`, start: 0, end: 1, effectId: 'overlay-x' });

describe('LayeredTimeline overlay labels', () => {
  it('humanizes an unknown overlay kind instead of knowing brand names', () => {
    expect(timelineLabel(overlayAction('ov1'), overlayReel, 30)).toBe('Stat callout: A');
    expect(timelineLabel(overlayAction('ov2'), overlayReel, 30)).toBe('Chevron: B');
  });

  it('uses the brand label when the host declares one', () => {
    const meta = { overlayLabels: { 'stat-callout': 'Stat' } };
    expect(timelineLabel(overlayAction('ov1'), overlayReel, 30, meta)).toBe('Stat: A');
    // Undeclared → still humanized, never blank.
    expect(timelineLabel(overlayAction('ov2'), overlayReel, 30, meta)).toBe('Chevron: B');
  });
});

describe('LayeredTimeline lane colours', () => {
  it('keeps a fixed colour for the kinds core\'s own schema defines', () => {
    expect(colorFor('video-clip')).toBe('#ac37ae');
    expect(colorFor('audio')).toBe('#37ae87');
    expect(colorFor('brand-watermark')).toBe('#4a4c54');
  });

  it('derives a deterministic, distinct colour for kinds core does not define', () => {
    const a = colorFor('overlay-stat-callout');
    const b = colorFor('overlay-chevron');
    expect(a).toBe(colorFor('overlay-stat-callout'));
    expect(a).not.toBe(b);
    // ...and it is a real colour, not the old all-unknowns-are-grey fallback.
    expect(a).toMatch(/^hsl\(/);
  });

  it('honours a host-declared lane colour over both', () => {
    const meta = { laneColors: { 'overlay-stat-callout': '#123456', 'video-clip': '#654321' } };
    expect(colorFor('overlay-stat-callout', meta)).toBe('#123456');
    expect(colorFor('video-clip', meta)).toBe('#654321');
  });
});

// ---------------------------------------------------------------------------
// Colour-by-source-file (blockColor's precedence): a video block's colour now
// tracks its SOURCE FILE for clip/broll/photo, so two blocks cutting the same
// take share a colour and a different take is visibly different. The kinds
// with no single source (multi-clip) or no media at all (card, outro) keep
// their fixed CORE_LANE_COLOR entry, as does a linked audio bed's PARTNER
// video item when that item is itself one of those kinds, and an unlinked bed
// / the music lane always do (they have no clip to mirror).
// ---------------------------------------------------------------------------

describe('LayeredTimeline blockColor', () => {
  const videoClip = (id: string, source: string, startMs: number, endMs: number): VideoItem => ({
    id, kind: 'clip', startMs, endMs, source, sourceInMs: 0, sourceOutMs: endMs - startMs,
  });
  const videoAction = (id: string) => ({ id: `video:${id}`, start: 0, end: 1, effectId: 'video-clip' });
  const audioAction = (id: string) => ({ id: `audio:${id}`, start: 0, end: 1, effectId: 'audio' });
  const musicAction = () => ({ id: 'music:m', start: 0, end: 1, effectId: 'music' });

  function reelWith(video: VideoItem[], audio: LayeredReel['tracks']['audio'] = []): LayeredReel {
    return {
      version: 'layered-1',
      meta: { topic: 't', totalDurationMs: 10000 },
      tracks: { video, audio, music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
    };
  }

  it('colours two clips off the SAME source identically, and a different source differently', () => {
    const r = reelWith([
      videoClip('v1', 'TH-01.mp4', 0, 1000),
      videoClip('v2', 'TH-01.mp4', 1000, 2000),
      videoClip('v3', 'TH-02.mp4', 2000, 3000),
    ]);
    const map = sourceColors(r);
    const c1 = blockColor(videoAction('v1'), r, undefined, map);
    const c2 = blockColor(videoAction('v2'), r, undefined, map);
    const c3 = blockColor(videoAction('v3'), r, undefined, map);
    expect(c1).toBe(c2);
    expect(c1).not.toBe(c3);
  });

  it('keeps the fixed CORE_LANE_COLOR entry for multi-clip, card, and outro', () => {
    const multiClip: VideoItem = {
      id: 'v1', kind: 'multi-clip', startMs: 0, endMs: 1000, layout: 'split-h',
      sources: [{ source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000 }, { source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000 }],
    };
    const card: VideoItem = { id: 'v2', kind: 'card', startMs: 1000, endMs: 2000, cardKind: 'stat' };
    const outro: VideoItem = { id: 'v3', kind: 'outro', startMs: 2000, endMs: 3000 };
    const r = reelWith([multiClip, card, outro]);
    const map = sourceColors(r);
    expect(blockColor({ id: 'video:v1', start: 0, end: 1, effectId: 'video-multi-clip' }, r, undefined, map)).toBe(
      colorFor('video-multi-clip'),
    );
    expect(blockColor({ id: 'video:v2', start: 0, end: 1, effectId: 'video-card' }, r, undefined, map)).toBe(colorFor('video-card'));
    expect(blockColor({ id: 'video:v3', start: 0, end: 1, effectId: 'video-outro' }, r, undefined, map)).toBe(colorFor('video-outro'));
  });

  it('gives a LINKED audio bed its clip\'s colour — now the clip\'s SOURCE colour, not its kind colour', () => {
    const r = reelWith(
      [videoClip('v1', 'TH-01.mp4', 0, 1000), videoClip('v2', 'TH-02.mp4', 1000, 2000)],
      [{ id: 'a1', startMs: 0, endMs: 1000, source: 'TH-01.wav', sourceInMs: 0, followsVideoId: 'v1' }],
    );
    const map = sourceColors(r);
    const clipColor = blockColor(videoAction('v1'), r, undefined, map);
    const bedColor = blockColor(audioAction('a1'), r, undefined, map);
    expect(bedColor).toBe(clipColor);
    // And that colour really is the SOURCE colour, not the flat video-clip fallback.
    expect(bedColor).toBe(map['TH-01.mp4']);
  });

  it('keeps an UNLINKED bed and the music lane on their fixed kind colour', () => {
    const r = reelWith(
      [videoClip('v1', 'TH-01.mp4', 0, 1000)],
      [{ id: 'a1', startMs: 0, endMs: 1000, source: 'ambience.wav', sourceInMs: 0 }],
    );
    const map = sourceColors(r);
    expect(blockColor(audioAction('a1'), r, undefined, map)).toBe(colorFor('audio'));
    expect(blockColor(musicAction(), r, undefined, map)).toBe(colorFor('music'));
  });

  it('still lets a host-declared laneColors override win over the derived source colour', () => {
    const r = reelWith([videoClip('v1', 'TH-01.mp4', 0, 1000)]);
    const map = sourceColors(r);
    const meta = { laneColors: { 'video-clip': '#654321' } };
    expect(blockColor(videoAction('v1'), r, meta, map)).toBe('#654321');
  });
});

describe('LayeredTimeline legend', () => {
  it('keeps a swatch only for the kinds that still have a fixed colour, and notes the source-file tinting', () => {
    render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} />,
    );
    const note = screen.getByText('Clip/broll/photo blocks are tinted by source file');
    // The note's own parent is the one-line legend bar itself.
    const legend = note.parentElement!;
    expect(within(legend).getByText('Multi')).toBeInTheDocument();
    expect(within(legend).getByText('Card')).toBeInTheDocument();
    expect(within(legend).getByText('Outro')).toBeInTheDocument();
    expect(within(legend).getByText('Audio')).toBeInTheDocument();
    expect(within(legend).getByText('Music')).toBeInTheDocument();
    // No "Clip"/"Broll"/"Photo" swatch — those kinds are source-coloured now,
    // and a fixed swatch for them would be a lie.
    expect(within(legend).queryByText('Clip')).toBeNull();
    expect(within(legend).queryByText('Broll')).toBeNull();
    expect(within(legend).queryByText('Photo')).toBeNull();
  });

  it('stays exactly one line — the load-bearing layout classes are untouched', () => {
    render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} />,
    );
    const legend = screen.getByText('Clip/broll/photo blocks are tinted by source file').parentElement!;
    for (const cls of ['ed:flex-none', 'ed:h-5', 'ed:border-t', 'ed:whitespace-nowrap', 'ed:overflow-hidden']) {
      expect(legend.className, legend.className).toContain(cls);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 3 Task 6: the timeline's media URLs. These two helpers were the THIRD
// hardcoded copy of the media-path convention (after PP's resolveAudioSource
// and roost's resolveVideoSource) and the one nobody was testing. They now run
// core's ONE rule (lib/theming/media-source.ts) and only differ from the
// renderers in serving `/…` dev-server URLs instead of staticFile paths.
// ---------------------------------------------------------------------------

describe('LayeredTimeline media URLs', () => {
  it('prefixes a PP-shaped bare filename by role', () => {
    expect(audioUrl('vo-01.mp3')).toBe('/recordings/vo-01.mp3');
    expect(videoUrl({ kind: 'clip', source: 'seg02.MP4' })).toBe('/recordings/seg02.MP4');
    // broll's folder differs from clip's — the role, not just "prefix", matters.
    expect(videoUrl({ kind: 'broll', source: 'street.mp4' })).toBe('/broll/street.mp4');
  });

  it('serves a roost-shaped media/… source as-is', () => {
    expect(videoUrl({ kind: 'clip', source: 'media/VIDEO-2026.mp4' })).toBe('/media/VIDEO-2026.mp4');
    expect(videoUrl({ kind: 'broll', source: 'media/VIDEO-2026.mp4' })).toBe('/media/VIDEO-2026.mp4');
    expect(audioUrl('audio/boj.wav')).toBe('/audio/boj.wav');
  });

  it('leaves an already-prefixed source alone (idempotent, as the renderers do)', () => {
    expect(videoUrl({ kind: 'clip', source: 'recordings/seg02.MP4' })).toBe('/recordings/seg02.MP4');
    expect(videoUrl({ kind: 'broll', source: 'broll/street.mp4' })).toBe('/broll/street.mp4');
  });

  it('returns null for kinds with no decodable single source', () => {
    expect(videoUrl({ kind: 'photo', source: 'a.jpg' })).toBeNull();
    expect(videoUrl({ kind: 'card' })).toBeNull();
    expect(videoUrl({ kind: 'clip' })).toBeNull();
  });
});

// The sign is the whole point: dragging RIGHT pulls the film right inside its
// window, so EARLIER footage slides into view and sourceInMs DECREASES. Premiere
// and Resolve both work this way, and the inverted sign is the natural mistake.
describe('slipDeltaMs', () => {
  it('turns a rightward drag into a negative delta (reveals earlier footage)', () => {
    expect(slipDeltaMs(80, 80)).toBe(-1000);
  });

  it('turns a leftward drag into a positive delta (reveals later footage)', () => {
    expect(slipDeltaMs(-40, 80)).toBe(500);
  });

  it('scales with the zoom — the same pixels mean less time when zoomed in', () => {
    expect(slipDeltaMs(80, 160)).toBe(-500);
  });

  it('is zero for no movement', () => {
    expect(slipDeltaMs(0, 80)).toBe(0);
  });
});

describe('the playhead-follow scroll container', () => {
  // followScrollLeft is pure and well covered below, but it is fed by a DOM
  // lookup, and a lookup that matches NOTHING disables the feature in complete
  // silence — which is exactly the bug being fixed. jsdom cannot lay the
  // timeline out, but it can prove the selector still resolves.
  it('resolves inside the edit area, not the ruler, which also has one', () => {
    const { container } = render(
      <LayeredTimeline reel={reel} onChange={() => {}} selectedId={null} onSelect={() => {}}
        playerRef={{ current: null }} fps={30} scaleWidth={80} />,
    );
    expect(container.querySelector('.timeline-editor-edit-area .ReactVirtualized__Grid')).not.toBeNull();
    // The ruler's grid comes FIRST in document order — an unscoped selector
    // would silently measure it instead.
    expect(container.querySelector('.ReactVirtualized__Grid'))
      .not.toBe(container.querySelector('.timeline-editor-edit-area .ReactVirtualized__Grid'));
  });
});

describe('zoomFactorFor — wheel/pinch sensitivity', () => {
  it('scales with how far the wheel moved, not just its direction', () => {
    // The defect this replaced: a flat factor per EVENT, so a trackpad pinch
    // firing 40 tiny events zoomed as hard as 40 mouse notches.
    const small = zoomFactorFor(-4);
    const big = zoomFactorFor(-40);
    expect(small).toBeGreaterThan(1);
    expect(big).toBeGreaterThan(small);
    expect(small).toBeLessThan(1.02); // a pinch event is a fraction of a percent
  });

  it('gives a mouse notch a brisk step, below the per-event cap', () => {
    const notch = zoomFactorFor(-100); // one detent in pixel mode
    expect(notch).toBeGreaterThan(1.25);
    expect(notch).toBeLessThan(1.4);
    // The cap exists for pathological devices, not for ordinary wheels: if it
    // bound here it would be the sensitivity setting, and tuning ZOOM_PER_PX
    // would stop having any effect.
    expect(notch).toBeLessThan(zoomFactorFor(-100000));
  });

  it('zooms out for downward travel, in for upward, symmetrically', () => {
    expect(zoomFactorFor(100)).toBeLessThan(1);
    expect(zoomFactorFor(100) * zoomFactorFor(-100)).toBeCloseTo(1, 10);
  });

  it('caps a single event however violent the device', () => {
    expect(zoomFactorFor(-100000)).toBe(1.5);
    expect(zoomFactorFor(100000)).toBeCloseTo(1 / 1.5, 10);
  });

  it('puts line- and page-mode wheels on the same scale as pixel mode', () => {
    expect(zoomFactorFor(-1, 1)).toBeCloseTo(zoomFactorFor(-16, 0), 10); // 1 line = 16px
    expect(zoomFactorFor(-1, 2)).toBeCloseTo(zoomFactorFor(-400, 0), 10); // 1 page = 400px
  });

  it('is a no-op for no travel', () => {
    expect(zoomFactorFor(0)).toBe(1);
  });
});

describe('followScrollLeft — keeping the playhead in view', () => {
  const view = (scrollLeft: number) => ({ scrollLeft, clientWidth: 1000, scrollWidth: 5000 });

  it('does not scroll while the playhead is comfortably inside the viewport', () => {
    expect(followScrollLeft(500, view(0))).toBeNull();
  });

  it('pages forward when the playhead runs off the right edge', () => {
    // Lands near the LEFT (10% in) so playback gets most of a screen before the
    // next page, rather than re-scrolling every frame at the edge.
    expect(followScrollLeft(1200, view(0))).toBe(1100);
  });

  it('scrolls back when the playhead is behind the viewport', () => {
    // A quarter in, so what was just scrubbed past stays visible.
    expect(followScrollLeft(1500, view(2000))).toBe(1250);
  });

  it('treats the margin as the trigger, not the viewport edge itself', () => {
    expect(followScrollLeft(970, view(0))).toBe(870); // inside the frame, but within 36px of it
    expect(followScrollLeft(960, view(0))).toBeNull();
  });

  it('never scrolls past the content end — which is what stops it re-firing there', () => {
    // Playhead at the very end: the target saturates at scrollWidth-clientWidth.
    expect(followScrollLeft(4990, view(4000))).toBeNull();
    expect(followScrollLeft(4990, view(3000))).toBe(4000);
  });

  it('never scrolls to a negative offset', () => {
    expect(followScrollLeft(12, view(500))).toBe(0); // jump to start
  });

  it('does nothing when the viewport has not been laid out yet', () => {
    expect(followScrollLeft(500, { scrollLeft: 0, clientWidth: 0, scrollWidth: 0 })).toBeNull();
  });
});

describe('zoomAnchorScrollLeft', () => {
  const view = { scrollLeft: 400, scrollWidth: 4000, clientWidth: 800 };

  // The whole contract: what was under the pointer stays under the pointer.
  it('keeps the content under the anchor fixed', () => {
    for (const factor of [1.25, 2, 0.8, 0.5]) {
      for (const anchorX of [100, 400, 700]) {
        // (factor 0.5, anchor 700) asks for scrollLeft -144 to hold the anchor
        // exactly — impossible, since the reel start can't scroll further
        // left. That clamp is real and intentional (pinned on its own by
        // "never returns a negative scroll position" below); it is not a
        // bug in the formula, so this one combination is excluded from the
        // "no clamp fires" invariant rather than weakened for every case.
        if (factor === 0.5 && anchorX === 700) continue;
        const next = zoomAnchorScrollLeft(anchorX, view, factor);
        const before = view.scrollLeft + anchorX - TIMELINE_START_LEFT;
        const after = next + anchorX - TIMELINE_START_LEFT;
        expect(after / before, `factor ${factor} anchor ${anchorX}`).toBeCloseTo(factor, 4);
      }
    }
  });

  it('never returns a negative scroll position', () => {
    expect(zoomAnchorScrollLeft(700, { scrollLeft: 0, scrollWidth: 4000, clientWidth: 800 }, 0.25)).toBeGreaterThanOrEqual(0);
  });

  it('never scrolls past the new maximum', () => {
    const factor = 2;
    const next = zoomAnchorScrollLeft(700, view, factor);
    expect(next).toBeLessThanOrEqual(view.scrollWidth * factor - view.clientWidth);
  });

  it('is a no-op at factor 1', () => {
    expect(zoomAnchorScrollLeft(400, view, 1)).toBe(view.scrollLeft);
  });

  it('does not divide by zero on an unmeasured viewport', () => {
    expect(Number.isFinite(zoomAnchorScrollLeft(0, { scrollLeft: 0, scrollWidth: 0, clientWidth: 0 }, 2))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// accumulateZoom — the fix for the "items drift while zooming, settle only
// once you stop" bug. A continuous trackpad pinch fires several wheel events
// before React commits a single render, so several pendingZoom CAPTURES can
// land before the scaleWidth-keyed layout effect ever runs to consume one.
// The pre-fix code (both the wheel handler and zoomAtCenter) simply
// OVERWROTE `pendingZoom.current` on every event — `{ anchorX, factor:
// achieved, view }` — so only the LAST event's single-step factor survived,
// even though scaleWidth had by then moved by the PRODUCT of all of them.
// These tests pin the correct behaviour (accumulateZoom) against that exact
// overwrite semantics, reproduced verbatim from the pre-fix source (see git
// history of LayeredTimeline.tsx) rather than assumed.
// ---------------------------------------------------------------------------
describe('accumulateZoom — folding multiple pre-commit zoom captures', () => {
  const view0 = { scrollLeft: 400, scrollWidth: 4000, clientWidth: 800 };

  /** The PRE-FIX capture logic, byte-for-byte: every event replaces the
   *  pending capture outright. Used only to prove the old behaviour was
   *  wrong — not imported from production code, since it no longer exists
   *  there. */
  const overwrite = (
    _prev: PendingZoom | null,
    anchorX: number,
    achieved: number,
    view: PendingZoom['view'],
  ): PendingZoom => ({ anchorX, factor: achieved, view });

  it('multiplies factors together and keeps the FIRST capture\'s anchor/view', () => {
    let pending: PendingZoom | null = null;
    pending = accumulateZoom(pending, 300, 1.05, view0);
    pending = accumulateZoom(pending, 320, 1.05, { ...view0, scrollLeft: 410 });
    pending = accumulateZoom(pending, 340, 1.05, { ...view0, scrollLeft: 420 });

    expect(pending.anchorX).toBe(300);
    expect(pending.view).toEqual(view0);
    expect(pending.factor).toBeCloseTo(1.05 ** 3, 10);
  });

  it('starts a fresh capture once pendingZoom is null again (consumed, or gesture just began)', () => {
    const first = accumulateZoom(null, 300, 1.1, view0);
    expect(first).toEqual({ anchorX: 300, factor: 1.1, view: view0 });
  });

  it('reproduces the real sequence — several wheel-event captures before one effect run — and proves the pre-fix overwrite lands the WRONG scroll target while the fix lands the correct one', () => {
    const events: Array<{ anchorX: number; achieved: number; view: PendingZoom['view'] }> = [
      { anchorX: 300, achieved: 1.05, view: view0 },
      { anchorX: 320, achieved: 1.05, view: { ...view0, scrollLeft: 410 } },
      { anchorX: 340, achieved: 1.05, view: { ...view0, scrollLeft: 420 } },
    ];
    const combinedFactor = events.reduce((acc, e) => acc * e.achieved, 1);

    // Ground truth: what a single zoom by the COMBINED factor, anchored at the
    // gesture's true start (the first event's anchor/pre-gesture view), lands
    // on — this is what the layout effect must produce once it finally runs.
    const groundTruth = zoomAnchorScrollLeft(events[0].anchorX, events[0].view, combinedFactor);

    // Pre-fix: each event overwrites pendingZoom; only the LAST one survives
    // to be consumed by the effect.
    let stale: PendingZoom | null = null;
    for (const e of events) stale = overwrite(stale, e.anchorX, e.achieved, e.view);
    const wrongTarget = zoomAnchorScrollLeft(stale!.anchorX, stale!.view, stale!.factor);

    // Post-fix: accumulateZoom across the identical sequence lands on exactly
    // the anchor/view/factor a single combined-factor zoom would use — that's
    // already proven by construction in the "multiplies factors together"
    // test above, so re-deriving a `rightTarget` via `zoomAnchorScrollLeft`
    // here would call it with bit-identical arguments to `groundTruth` and
    // assert a tautology. Assert the real, non-obvious claim instead: the
    // fixed capture's own fields equal the gesture's true start/product.
    let fixed: PendingZoom | null = null;
    for (const e of events) fixed = accumulateZoom(fixed, e.anchorX, e.achieved, e.view);
    expect(fixed!.anchorX).toBe(events[0].anchorX);
    expect(fixed!.view).toEqual(events[0].view);
    expect(fixed!.factor).toBeCloseTo(combinedFactor, 10);

    expect(wrongTarget).not.toBe(groundTruth);
  });
});

// ---------------------------------------------------------------------------
// Task 5: boundaryDiagnostics reads the SAME predicate the renderer's check
// reads (handle-room.ts's boundaryState/starvationMessage), so the editor and
// the render can never disagree about a starved boundary. Pinned on the pure
// producer — jsdom mounts no xzdarcy action block (this file's own beat-guide
// tests are the only DOM-rendered cases; a virtualized row never appears).
// ---------------------------------------------------------------------------

const starvedReel = (secondSourceInMs: number): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 10000 },
  tracks: {
    video: [
      {
        id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4',
        sourceInMs: 0, sourceOutMs: 5000,
        transitionOut: { kind: 'gradient-wipe', frames: 20 },
      },
      {
        id: 'v2', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4',
        sourceInMs: secondSourceInMs, sourceOutMs: secondSourceInMs + 5000,
      },
    ],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
});

describe('boundaryDiagnostics', () => {
  it('produces one entry per starved boundary, targeting its transition block', () => {
    const reel = starvedReel(0);
    const d = boundaryDiagnostics(reel, { 'b.mp4': 10000, 'a.mp4': 10000 }, 30);
    expect(d).toHaveLength(1);
    expect(d[0].targetId).toBe('transition:v1');
    expect(d[0].severity).toBe('error');
    expect(d[0].message).toContain('Needs 10 frames before the cut');
  });

  it('is empty when every boundary has room', () => {
    const reel = starvedReel(2000);
    expect(boundaryDiagnostics(reel, { 'a.mp4': 10000, 'b.mp4': 10000 }, 30)).toEqual([]);
  });
});
