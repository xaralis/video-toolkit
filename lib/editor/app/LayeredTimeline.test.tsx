import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LayeredTimeline, colorFor, timelineLabel, audioUrl, videoUrl, slipDeltaMs, boundaryDiagnostics, zoomFactorFor, followScrollLeft } from './LayeredTimeline';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

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
    expect(colorFor('video-clip')).toBe('#2c6777');
    expect(colorFor('audio')).toBe('#304769');
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
