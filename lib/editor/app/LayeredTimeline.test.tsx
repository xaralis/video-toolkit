import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LayeredTimeline, colorFor, timelineLabel, audioUrl, videoUrl } from './LayeredTimeline';
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
