import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LayeredTimeline, colorFor, timelineLabel, audioUrl, videoUrl, slipDeltaMs, boundaryDiagnostics } from './LayeredTimeline';
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
    expect(colorFor('video-clip')).toBe('#3b6ea5');
    expect(colorFor('audio')).toBe('#2a8f8f');
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
