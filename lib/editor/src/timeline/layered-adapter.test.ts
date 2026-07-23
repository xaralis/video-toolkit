import { describe, it, expect } from 'vitest';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { layeredToTimeline, applyTimelineChange, parseActionId, deleteItem, splitItem, duplicateItem } from './layered-adapter';

// Small schema-valid LayeredReel fixture: one item per track.
const REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Fixture', totalDurationMs: 5000 },
  tracks: {
    video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 }],
    audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'audio/a.mp3', sourceInMs: 0 }],
    music: { baseVolumeDb: -8 },
    overlays: [{ id: 'seg-1-ov', startMs: 0, endMs: 3000, content: { kind: 'title', text: 'Hello' } }],
    brand: [{ id: 'wm', kind: 'watermark', startMs: 0, endMs: 5000 }],
  },
};

describe('layeredToTimeline', () => {
  it('maps tracks to rows in NLE order overlays/video/transitions/audio/music/brand, music as one block', () => {
    const { editorData } = layeredToTimeline(REEL, 30);
    expect(editorData.map((r) => r.id)).toEqual(['overlays', 'video', 'transitions', 'audio', 'music', 'brand']);
    const musicRow = editorData.find((r) => r.id === 'music')!;
    expect(musicRow.actions).toHaveLength(1);
    expect(musicRow.actions[0]).toMatchObject({ id: 'music:base', start: 0, end: 5, effectId: 'music' });
  });

  it('maps the video item to an action with id/start/end/effectId derived from the item', () => {
    const { editorData } = layeredToTimeline(REEL, 30);
    const videoRow = editorData.find((r) => r.id === 'video')!;
    expect(videoRow.actions).toHaveLength(1);
    expect(videoRow.actions[0]).toMatchObject({
      id: 'video:v1',
      start: 0,
      end: 3,
      effectId: 'video-clip',
    });
  });
});

describe('layeredToTimeline — transitions lane', () => {
  const fps = 30;

  it('derives a centered at-cut transition action for a clip with transitionOut', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000, transitionOut: { kind: 'dissolve', frames: 12 } },
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        ],
      },
    };
    const rows = layeredToTimeline(reel, fps).editorData;
    const t = rows.find((r) => r.id === 'transitions')!.actions;
    expect(t).toHaveLength(1);
    const halfMs = Math.round((6 / 30) * 1000); // 200
    // start/end are in SECONDS like every other lane (music end: 5, video end: 3)
    expect(t[0]).toMatchObject({ id: 'transition:A', start: (5000 - halfMs) / 1000, end: (5000 + halfMs) / 1000, effectId: 'dissolve' });
  });

  it('no transition action for a cut / absent transitionOut', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        ],
      },
    };
    expect(layeredToTimeline(reel, fps).editorData.find((r) => r.id === 'transitions')!.actions).toHaveLength(0);
  });

  it('a dissolve into the outro still yields a transition action', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 8000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000, transitionOut: { kind: 'dissolve', frames: 12 } },
          { id: 'outro', kind: 'outro', startMs: 5000, endMs: 8000 },
        ],
      },
    };
    expect(layeredToTimeline(reel, fps).editorData.find((r) => r.id === 'transitions')!.actions).toHaveLength(1);
  });

  it('a transitionOut on the LAST item yields a closing transition action (fade to coal)', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000, transitionOut: { kind: 'dissolve', frames: 12 } },
        ],
      },
    };
    const rows = layeredToTimeline(reel, fps).editorData;
    const t = rows.find((r) => r.id === 'transitions')!.actions;
    expect(t).toHaveLength(1);
    const halfMs = Math.round((6 / 30) * 1000); // 200
    expect(t[0]).toMatchObject({ id: 'transition:B', start: (9000 - halfMs) / 1000, end: (9000 + halfMs) / 1000, effectId: 'dissolve' });
  });

  it('a transitionIn on the FIRST item yields an opening transition action anchored at start 0', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000, transitionIn: { kind: 'dissolve', frames: 12 } },
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        ],
      },
    };
    const rows = layeredToTimeline(reel, fps).editorData;
    const t = rows.find((r) => r.id === 'transitions')!.actions;
    expect(t).toHaveLength(1);
    const halfMs = Math.round((6 / 30) * 1000); // 200
    expect(t[0]).toMatchObject({ id: 'transition-in:A', start: 0, end: (halfMs * 2) / 1000, effectId: 'dissolve' });
  });

  it('no opening action for a cut / absent transitionIn on the first item', () => {
    const rows = layeredToTimeline(REEL, fps).editorData;
    const t = rows.find((r) => r.id === 'transitions')!.actions;
    expect(t.filter((a) => a.id.startsWith('transition-in:'))).toHaveLength(0);
  });

  it('a first item can have both an opening transitionIn and an outgoing transitionOut', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          {
            id: 'A',
            kind: 'clip',
            startMs: 0,
            endMs: 5000,
            source: 'a.mp4',
            sourceInMs: 0,
            sourceOutMs: 5000,
            transitionIn: { kind: 'dissolve', frames: 12 },
            transitionOut: { kind: 'whip-pan', frames: 6 },
          },
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        ],
      },
    };
    const rows = layeredToTimeline(reel, fps).editorData;
    const t = rows.find((r) => r.id === 'transitions')!.actions;
    expect(t.map((a) => a.id)).toEqual(['transition-in:A', 'transition:A']);
  });
});

describe('applyTimelineChange', () => {
  it('maps a moved action back to startMs/endMs on the matching item, leaves other tracks unchanged, and does not mutate the original reel', () => {
    const { editorData } = layeredToTimeline(REEL, 30);
    const changed = editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => (a.id === 'video:v1' ? { ...a, start: 1, end: 4 } : a)) }
        : row,
    );

    const result = applyTimelineChange(REEL, changed);

    expect(result.tracks.video[0]).toMatchObject({ startMs: 1000, endMs: 4000 });
    expect(result.tracks.audio).toEqual(REEL.tracks.audio);
    expect(result.tracks.overlays).toEqual(REEL.tracks.overlays);
    expect(result.tracks.brand).toEqual(REEL.tracks.brand);

    // Original reel is unmutated.
    expect(REEL.tracks.video[0].startMs).toBe(0);
    expect(REEL.tracks.video[0].endMs).toBe(3000);
  });

  it('ripple: extending a clip END shifts everything after it to the right (butted)', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        ],
      },
    };
    const { editorData } = layeredToTimeline(reel, 30);
    // Extend A's end from 5s to 6s.
    const changed = editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => (a.id === 'video:A' ? { ...a, start: 0, end: 6 } : a)) }
        : row,
    );
    const result = applyTimelineChange(reel, changed, { ripple: true });
    expect(result.tracks.video.find((v) => v.id === 'A')!.endMs).toBe(6000);
    // B shifted right by the +1000ms delta.
    expect(result.tracks.video.find((v) => v.id === 'B')).toMatchObject({ startMs: 6000, endMs: 10000 });
    expect(result.meta.totalDurationMs).toBe(10000);
  });

  it('resizing a clip left reveals earlier footage but cannot pass the source start (sourceInMs >= 0)', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 5000 },
      tracks: {
        ...REEL.tracks,
        video: [{ id: 'A', kind: 'clip', startMs: 2000, endMs: 5000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 4000 }],
      },
    };
    const { editorData } = layeredToTimeline(reel, 30);
    // The clip carries a minStart = where sourceInMs would hit 0 (2000-1000 = 1s).
    expect(editorData.find((r) => r.id === 'video')!.actions[0].minStart).toBe(1);
    // Drag A's start way left (to 0.5s) — only 1000ms of footage exists before it.
    const changed = editorData.map((row) =>
      row.id === 'video' ? { ...row, actions: row.actions.map((a) => ({ ...a, start: 0.5, end: 5 })) } : row,
    );
    const A = applyTimelineChange(reel, changed).tracks.video[0];
    expect(A.kind === 'clip' && A.sourceInMs).toBe(0); // clamped at the source start
    expect(A.startMs).toBe(1000); // start could only extend 1000ms left
  });

  it('trims the previous clip when the next clip is dragged left over it (no dangling overlap)', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'Fixture', totalDurationMs: 9000 },
      tracks: {
        ...REEL.tracks,
        video: [
          { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
          // B has 2s of footage before its in-point, so its left handle CAN
          // extend 1s left (over A); the source trim moves with it.
          { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 2000, sourceOutMs: 6000 },
        ],
      },
    };
    const { editorData } = layeredToTimeline(reel, 30);
    // B's start dragged left from 5s to 4s (overlapping A which ends at 5s).
    const changed = editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => (a.id === 'video:B' ? { ...a, start: 4, end: 9 } : a)) }
        : row,
    );
    const result = applyTimelineChange(reel, changed);
    expect(result.tracks.video.find((v) => v.id === 'B')!.startMs).toBe(4000);
    // A is trimmed to butt against B — it really ends earlier, no overlap.
    expect(result.tracks.video.find((v) => v.id === 'A')!.endMs).toBe(4000);
  });
});

describe('deleteItem', () => {
  const reel: LayeredReel = {
    ...REEL,
    meta: { topic: 'x', totalDurationMs: 9000 },
    tracks: {
      ...REEL.tracks,
      video: [
        { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
      ],
      audio: [{ id: 'A-audio', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, followsVideoId: 'A' }],
    },
  };
  it('removes the clip + its bound audio, leaving a gap (ripple off)', () => {
    const r = deleteItem(reel, 'video:A');
    expect(r.tracks.video.map((v) => v.id)).toEqual(['B']);
    expect(r.tracks.audio).toHaveLength(0);
    expect(r.tracks.video[0].startMs).toBe(5000); // B unchanged → gap left
  });
  it('ripple closes the gap after the removed clip', () => {
    const r = deleteItem(reel, 'video:A', { ripple: true });
    expect(r.tracks.video[0]).toMatchObject({ id: 'B', startMs: 0, endMs: 4000 });
    expect(r.meta.totalDurationMs).toBe(4000);
  });
  it('deleting a transition marker clears the clip transition (→ cut)', () => {
    const reelT: LayeredReel = {
      ...reel,
      tracks: { ...reel.tracks, video: [{ ...reel.tracks.video[0], transitionOut: { kind: 'dissolve', frames: 12 } }, reel.tracks.video[1]] },
    };
    const r = deleteItem(reelT, 'transition:A');
    expect((r.tracks.video[0].transitionOut as { kind?: string }).kind).toBe('cut');
  });
});

describe('splitItem', () => {
  const reel: LayeredReel = {
    ...REEL,
    meta: { topic: 'x', totalDurationMs: 6000 },
    tracks: {
      ...REEL.tracks,
      video: [{ id: 'A', kind: 'clip', startMs: 0, endMs: 6000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 7000 }],
      audio: [{ id: 'A-audio', startMs: 0, endMs: 6000, source: 'a.mp4', sourceInMs: 1000, followsVideoId: 'A' }],
    },
  };
  it('splits a clip at the playhead into two butted pieces, each with its own trim', () => {
    const r = splitItem(reel, 'video:A', 60, 30); // frame 60 @ 30fps = 2000ms
    const [l, right] = r.tracks.video;
    expect(l).toMatchObject({ id: 'A', startMs: 0, endMs: 2000 });
    expect(l.kind === 'clip' && l.sourceOutMs).toBe(3000); // 1000 + 2000
    expect(right).toMatchObject({ id: 'A-b', startMs: 2000, endMs: 6000 });
    expect(right.kind === 'clip' && right.sourceInMs).toBe(3000);
    // bound audio split too
    expect(r.tracks.audio.map((a) => a.id)).toEqual(['A-audio', 'A-audio-b']);
    expect(r.tracks.audio[1]).toMatchObject({ startMs: 2000, sourceInMs: 3000, followsVideoId: 'A-b' });
  });
  it('is a no-op when the playhead is outside the clip', () => {
    expect(splitItem(reel, 'video:A', 300, 30).tracks.video).toHaveLength(1); // frame 300 = 10s, past the clip
  });
});

describe('duplicateItem', () => {
  const reel: LayeredReel = {
    ...REEL,
    meta: { topic: 'x', totalDurationMs: 9000 },
    tracks: {
      ...REEL.tracks,
      video: [
        { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
      ],
      audio: [{ id: 'A-audio', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, followsVideoId: 'A' }],
    },
  };
  it('inserts a copy after the clip (+ bound audio), shifting the rest right', () => {
    const r = duplicateItem(reel, 'video:A');
    expect(r.tracks.video.map((v) => v.id)).toEqual(['A', 'A-copy', 'B']);
    expect(r.tracks.video[1]).toMatchObject({ startMs: 5000, endMs: 10000 });
    expect(r.tracks.video[2]).toMatchObject({ id: 'B', startMs: 10000, endMs: 14000 }); // shifted right
    expect(r.tracks.audio.map((a) => a.id)).toEqual(['A-audio', 'A-audio-copy']);
    expect(r.tracks.audio[1]).toMatchObject({ startMs: 5000, followsVideoId: 'A-copy' });
    expect(r.meta.totalDurationMs).toBe(14000);
  });
});

describe('parseActionId', () => {
  it('splits a lane:id action id into its parts', () => {
    expect(parseActionId('overlays:seg-1-ov')).toEqual({ lane: 'overlays', id: 'seg-1-ov' });
  });

  it('recognizes a closing transition: action id, edge out', () => {
    expect(parseActionId('transition:A')).toEqual({ lane: 'transitions', id: 'A', edge: 'out' });
  });

  it('recognizes an opening transition-in: action id, edge in', () => {
    expect(parseActionId('transition-in:A')).toEqual({ lane: 'transitions', id: 'A', edge: 'in' });
  });
});
