import { describe, it, expect } from 'vitest';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { moveRefusal, splitRefusal, duplicateRefusal, deleteRefusal } from './refusal';

// Small schema-valid LayeredReel fixture — one item per track, mirroring the
// fixture in layered-adapter.test.ts (kept independent so this file doesn't
// couple to that one's shape evolving).
const REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Fixture', totalDurationMs: 5000 },
  tracks: {
    video: [{ id: 'v1', kind: 'clip', startMs: 1000, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 2000 }],
    audio: [{ id: 'a1', startMs: 1000, endMs: 3000, source: 'audio/a.mp3', sourceInMs: 0 }],
    music: { baseVolumeDb: -8 },
    overlays: [{ id: 'ov1', startMs: 0, endMs: 3000, content: { kind: 'title', text: 'Hello' } }],
    brand: [{ id: 'wm', kind: 'watermark', startMs: 0, endMs: 5000 }],
  },
};

describe('moveRefusal', () => {
  it('refuses a locked lane (brand)', () => {
    expect(moveRefusal({ lane: 'brand', actionId: 'brand:wm', linkedAudioIds: new Set() })).toBe('locked-lane');
  });

  it('refuses a locked lane (transitions)', () => {
    expect(moveRefusal({ lane: 'transitions', actionId: 'transition:v1', linkedAudioIds: new Set() })).toBe('locked-lane');
  });

  it('refuses the music bed, reusing timeline-start (its copy is already exactly right)', () => {
    expect(moveRefusal({ lane: 'music', actionId: 'music:base', linkedAudioIds: new Set() })).toBe('timeline-start');
  });

  it('refuses audio linked to a clip', () => {
    expect(moveRefusal({ lane: 'audio', actionId: 'audio:a1', linkedAudioIds: new Set(['audio:a1']) })).toBe('linked-audio');
  });

  it('allows a plain video move', () => {
    expect(moveRefusal({ lane: 'video', actionId: 'video:v1', linkedAudioIds: new Set() })).toBeNull();
  });

  it('allows an unlinked audio move', () => {
    expect(moveRefusal({ lane: 'audio', actionId: 'audio:a1', linkedAudioIds: new Set() })).toBeNull();
  });

  it('allows an overlay move', () => {
    expect(moveRefusal({ lane: 'overlays', actionId: 'overlays:ov1', linkedAudioIds: new Set() })).toBeNull();
  });
});

describe('splitRefusal', () => {
  it('refuses a selection not on the video lane', () => {
    expect(splitRefusal(REEL, 'overlays:ov1', 60, 30)).toBe('video-only');
  });

  it('refuses a kind that cannot be split (card)', () => {
    const reel: LayeredReel = {
      ...REEL,
      tracks: { ...REEL.tracks, video: [{ id: 'c1', kind: 'card', cardKind: 'stat', startMs: 1000, endMs: 3000 }] },
    };
    expect(splitRefusal(reel, 'video:c1', 60, 30)).toBe('unsplittable-kind');
  });

  it('refuses a playhead before the item', () => {
    // v1 spans 1000-3000ms; frame 20 @ 30fps = ~667ms, before the item.
    expect(splitRefusal(REEL, 'video:v1', 20, 30)).toBe('playhead-outside-clip');
  });

  it('refuses a playhead after the item', () => {
    // frame 120 @ 30fps = 4000ms, after the item's 3000ms end.
    expect(splitRefusal(REEL, 'video:v1', 120, 30)).toBe('playhead-outside-clip');
  });

  it('refuses a playhead exactly at the item start (the adapter tolerance is startMs + 1)', () => {
    // frame 30 @ 30fps = 1000ms === v.startMs.
    expect(splitRefusal(REEL, 'video:v1', 30, 30)).toBe('playhead-outside-clip');
  });

  it('refuses a playhead exactly at the item end (the adapter tolerance is endMs - 1)', () => {
    // frame 90 @ 30fps = 3000ms === v.endMs.
    expect(splitRefusal(REEL, 'video:v1', 90, 30)).toBe('playhead-outside-clip');
  });

  it('allows a legitimate mid-clip split', () => {
    // frame 60 @ 30fps = 2000ms, comfortably inside 1000-3000.
    expect(splitRefusal(REEL, 'video:v1', 60, 30)).toBeNull();
  });

  it('allows a broll split too (not just clip)', () => {
    const reel: LayeredReel = {
      ...REEL,
      tracks: { ...REEL.tracks, video: [{ id: 'b1', kind: 'broll', startMs: 1000, endMs: 3000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 2000 }] },
    };
    expect(splitRefusal(reel, 'video:b1', 60, 30)).toBeNull();
  });
});

describe('duplicateRefusal', () => {
  it('refuses a selection not on the video lane', () => {
    expect(duplicateRefusal(REEL, 'audio:a1')).toBe('video-only');
  });

  it('allows a video selection', () => {
    expect(duplicateRefusal(REEL, 'video:v1')).toBeNull();
  });
});

describe('deleteRefusal', () => {
  it('refuses the single music bed', () => {
    expect(deleteRefusal(REEL, 'music:base')).toBe('music-bed-undeletable');
  });

  it('allows deleting a video item', () => {
    expect(deleteRefusal(REEL, 'video:v1')).toBeNull();
  });

  it('allows deleting an overlay', () => {
    expect(deleteRefusal(REEL, 'overlays:ov1')).toBeNull();
  });

  it('allows deleting a transition (clears it, is not the music special-case)', () => {
    expect(deleteRefusal(REEL, 'transition:v1')).toBeNull();
  });
});
