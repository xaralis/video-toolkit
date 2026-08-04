import { describe, it, expect } from 'vitest';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { deriveSpeed } from '@video-toolkit/lib/reel-config-base/speed';
import { layeredToTimeline, applyTimelineChange, parseActionId, deleteItem, splitItem, duplicateItem, clipFootageCapMs, resizeBoundsMs, laneOfRow, slipVideoItem, isSlippable, setItemSpeed } from './layered-adapter';

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
  it('maps tracks to rows in NLE order overlays/transitions/video/audio/music/brand, music as one block', () => {
    const { editorData } = layeredToTimeline(REEL, 30);
    expect(editorData.map((r) => r.id)).toEqual(['overlays', 'transitions', 'video', 'audio', 'music', 'brand']);
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

  it('packs overlapping overlays / audio into sub-rows so nothing hides', () => {
    const reel: LayeredReel = {
      ...REEL,
      meta: { topic: 'x', totalDurationMs: 10000 },
      tracks: {
        ...REEL.tracks,
        overlays: [
          { id: 'o1', startMs: 0, endMs: 4000, content: { kind: 'title', text: 'A' } },
          { id: 'o2', startMs: 2000, endMs: 6000, content: { kind: 'chevron', text: 'B' } }, // overlaps o1
          { id: 'o3', startMs: 6000, endMs: 8000, content: { kind: 'title', text: 'C' } }, // fits back on row 0
        ],
        audio: [
          { id: 'a1', startMs: 0, endMs: 5000, source: 'x.mp3', sourceInMs: 0 },
          { id: 'a2', startMs: 3000, endMs: 8000, source: 'y.mp3', sourceInMs: 0 }, // overlaps a1
        ],
      },
    };
    const { editorData } = layeredToTimeline(reel, 30);
    const ids = editorData.map((r) => r.id);
    expect(ids).toEqual(['overlays', 'overlays#1', 'transitions', 'video', 'audio', 'audio#1', 'music', 'brand']);
    // o1 and o3 (non-overlapping) share row 0; o2 goes to the sub-row.
    expect(editorData.find((r) => r.id === 'overlays')!.actions.map((a) => a.id)).toEqual(['overlays:o1', 'overlays:o3']);
    expect(editorData.find((r) => r.id === 'overlays#1')!.actions.map((a) => a.id)).toEqual(['overlays:o2']);
    expect(editorData.find((r) => r.id === 'audio#1')!.actions.map((a) => a.id)).toEqual(['audio:a2']);
  });

  it('laneOfRow strips the sub-row suffix', () => {
    expect(laneOfRow('overlays')).toBe('overlays');
    expect(laneOfRow('overlays#2')).toBe('overlays');
    expect(laneOfRow('audio#1')).toBe('audio');
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
            transitionOut: { kind: 'whip-pan', frames: 6, direction: 'left' },
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
    // The total is DERIVED from the furthest track end (4000 now). The brand
    // span is no longer re-pinned here — that heuristic ("anything sitting
    // exactly at the old total") is deleted; `withDerivedBrandSpan`
    // (content-end.ts) owns the brand span now and is applied by the editor
    // host on every change, not by applyTimelineChange/withTotalDuration.
    expect(result.meta.totalDurationMs).toBe(4000);
    expect(result.tracks.brand[0]).toMatchObject({ startMs: 0, endMs: 5000 });

    // Original reel is unmutated.
    expect(REEL.tracks.video[0].startMs).toBe(0);
    expect(REEL.tracks.video[0].endMs).toBe(3000);
    expect(REEL.tracks.brand[0].endMs).toBe(5000);
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

// OVERWRITE: the same NLE rule as the "dragged left over the previous clip" case
// above, made symmetric. It used to run one way only, and the very same rule
// SNAPPED a rightward trim back to the next clip's start — so extending a clip
// over its neighbour was impossible from that side however the drag was bounded.
describe('applyTimelineChange — a trim overwrites the neighbour it runs into', () => {
  // A ends at 5s, B runs 5s–9s. Both have footage to spare in both directions.
  const pair = (): LayeredReel => ({
    ...REEL,
    meta: { topic: 'Fixture', totalDurationMs: 9000 },
    tracks: {
      ...REEL.tracks,
      audio: [],
      video: [
        { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 2000, sourceOutMs: 6000 },
      ],
    },
  });
  // Drag one action's edges; every other action stays where it was.
  const drag = (reel: LayeredReel, id: string, start: number, end: number) => {
    const { editorData } = layeredToTimeline(reel, 30);
    return editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => (a.id === `video:${id}` ? { ...a, start, end } : a)) }
        : row,
    );
  };

  it("extends A's end over B's head and trims B, instead of snapping A back", () => {
    const reel = pair();
    const result = applyTimelineChange(reel, drag(reel, 'A', 0, 6), { footageMsById: { A: 20000, B: 20000 } });
    const A = result.tracks.video.find((v) => v.id === 'A')!;
    const B = result.tracks.video.find((v) => v.id === 'B')!;
    expect(A.endMs).toBe(6000); // the drag stands
    expect(B.startMs).toBe(6000); // B yields its first second
    expect(B.kind === 'clip' && B.sourceInMs).toBe(3000); // trim-linked: 2000 + 1000
    expect(B.endMs).toBe(9000); // B's out-point is untouched
  });

  it('removes a neighbour that is covered whole', () => {
    const reel = pair();
    // A dragged out to 10s — past B's end at 9s.
    const result = applyTimelineChange(reel, drag(reel, 'A', 0, 10), { footageMsById: { A: 20000, B: 20000 } });
    expect(result.tracks.video.map((v) => v.id)).toEqual(['A']);
    expect(result.tracks.video[0].endMs).toBe(10000);
  });

  it('removes a neighbour left shorter than the minimum rather than stranding a sliver', () => {
    const reel = pair();
    // A dragged to 8.95s: B would be left with 50ms, under MIN_CLIP_MS.
    const result = applyTimelineChange(reel, drag(reel, 'A', 0, 8.95), { footageMsById: { A: 20000, B: 20000 } });
    expect(result.tracks.video.map((v) => v.id)).toEqual(['A']);
  });

  it('takes a consumed clip’s linked audio bed with it', () => {
    const base = pair();
    const reel: LayeredReel = {
      ...base,
      tracks: {
        ...base.tracks,
        audio: [
          { id: 'a-A', startMs: 0, endMs: 5000, source: 'audio/a.mp3', sourceInMs: 0, followsVideoId: 'A' },
          { id: 'a-B', startMs: 5000, endMs: 9000, source: 'audio/b.mp3', sourceInMs: 0, followsVideoId: 'B' },
        ],
      },
    };
    const result = applyTimelineChange(reel, drag(reel, 'A', 0, 10), { footageMsById: { A: 20000, B: 20000 } });
    expect(result.tracks.video.map((v) => v.id)).toEqual(['A']);
    // B's bed goes with B — an overwritten clip cannot leave its voice behind.
    expect(result.tracks.audio.map((a) => a.id)).toEqual(['a-A']);
    // And the survivor is re-derived from ITS OWN original, not from the bed
    // that happened to sit at its index before the removal.
    expect(result.tracks.audio[0]).toMatchObject({ startMs: 0, endMs: 10000 });
  });

  it('leaves an overlap that the user did not just create alone', () => {
    const base = pair();
    // A and B already overlap by 1s before this edit.
    const A: VideoItem = { id: 'A', kind: 'clip', startMs: 0, endMs: 6000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 6000 };
    const reel: LayeredReel = { ...base, tracks: { ...base.tracks, video: [A, base.tracks.video[1]] } };
    // Drag B's END (not its head) — the pre-existing head overlap must survive.
    const result = applyTimelineChange(reel, drag(reel, 'B', 5, 8), { footageMsById: { A: 20000, B: 20000 } });
    expect(result.tracks.video.find((v) => v.id === 'A')!.endMs).toBe(6000);
    expect(result.tracks.video.find((v) => v.id === 'B')!.startMs).toBe(5000);
  });
});

describe('music end-trim + derived total duration', () => {
  const MREEL: LayeredReel = {
    ...REEL,
    tracks: { ...REEL.tracks, music: { source: 'audio/bg.mp3', baseVolumeDb: -8 } },
  };

  it('layeredToTimeline spans the music block to its explicit endMs when set', () => {
    const reel: LayeredReel = { ...MREEL, tracks: { ...MREEL.tracks, music: { ...MREEL.tracks.music, endMs: 2000 } } };
    const { editorData } = layeredToTimeline(reel, 30);
    expect(editorData.find((r) => r.id === 'music')!.actions[0]).toMatchObject({ start: 0, end: 2 });
  });

  it('maps a music end-trim to tracks.music.endMs and recomputes the total', () => {
    const { editorData } = layeredToTimeline(MREEL, 30);
    const changed = editorData.map((row) =>
      row.id === 'music' ? { ...row, actions: row.actions.map((a) => ({ ...a, end: 4 })) } : row,
    );
    const result = applyTimelineChange(MREEL, changed);
    expect(result.tracks.music.endMs).toBe(4000);
    // content ends at 3000; the music bed now reaches furthest → total 4000.
    // The brand span is no longer re-pinned by withTotalDuration — it stays at
    // its authored value; `withDerivedBrandSpan` (content-end.ts) is what owns
    // the brand span now, applied by the editor host, not by applyTimelineChange.
    expect(result.meta.totalDurationMs).toBe(4000);
    expect(result.tracks.brand[0].endMs).toBe(5000);
  });

  it('caps the music end-trim at the decoded source duration', () => {
    const { editorData } = layeredToTimeline(MREEL, 30);
    const changed = editorData.map((row) =>
      row.id === 'music' ? { ...row, actions: row.actions.map((a) => ({ ...a, end: 20 })) } : row,
    );
    const result = applyTimelineChange(MREEL, changed, { musicMaxMs: 8000 });
    expect(result.tracks.music.endMs).toBe(8000);
    expect(result.meta.totalDurationMs).toBe(8000);
  });

  it('a music bed trimmed shorter than the content does not shrink the total below the content end', () => {
    const { editorData } = layeredToTimeline(MREEL, 30);
    const changed = editorData.map((row) =>
      row.id === 'music' ? { ...row, actions: row.actions.map((a) => ({ ...a, end: 1 })) } : row,
    );
    const result = applyTimelineChange(MREEL, changed);
    expect(result.tracks.music.endMs).toBe(1000);
    expect(result.meta.totalDurationMs).toBe(3000); // video/audio/overlays end
  });

  it('ignores a music left-edge drag (the bed is pinned at 0)', () => {
    const { editorData } = layeredToTimeline(MREEL, 30);
    const changed = editorData.map((row) =>
      row.id === 'music' ? { ...row, actions: row.actions.map((a) => ({ ...a, start: 1 })) } : row,
    );
    const result = applyTimelineChange(MREEL, changed);
    expect(result.tracks.music.endMs).toBeUndefined();
  });

  it('shortening the content recomputes the total downward (max reached by any track)', () => {
    // v1 end trimmed from 3s to 2s; audio/overlays still end at 3s → total 3000.
    const { editorData } = layeredToTimeline(MREEL, 30);
    const changed = editorData.map((row) =>
      row.id === 'video' ? { ...row, actions: row.actions.map((a) => ({ ...a, end: 2 })) } : row,
    );
    const result = applyTimelineChange(MREEL, changed);
    expect(result.meta.totalDurationMs).toBe(3000);
    // Brand span is untouched by withTotalDuration; stays at its authored value.
    expect(result.tracks.brand[0].endMs).toBe(5000);
  });
});

describe('applyTimelineChange — snap to beats', () => {
  const clip = (startMs: number, endMs: number): VideoItem => ({
    id: 'A', kind: 'clip', startMs, endMs, source: 'a.mp4', sourceInMs: 0, sourceOutMs: endMs - startMs,
  });
  const reelWith = (v: VideoItem): LayeredReel => ({
    ...REEL,
    meta: { topic: 'x', totalDurationMs: 8000 },
    tracks: { ...REEL.tracks, video: [v], audio: [], overlays: [], brand: [] },
  });
  const dragVideo = (reel: LayeredReel, id: string, startS: number, endS: number) => {
    const { editorData } = layeredToTimeline(reel, 30);
    return editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => (a.id === `video:${id}` ? { ...a, start: startS, end: endS } : a)) }
        : row,
    );
  };

  it('snaps a MOVE to the nearest beat and preserves span', () => {
    const reel = reelWith(clip(0, 3000)); // span 3000
    const rows = dragVideo(reel, 'A', 0.9, 3.9); // move +900 → raw 900..3900
    const A = applyTimelineChange(reel, rows, { snapMs: [1000], snapThresholdMs: 200 }).tracks.video[0];
    expect(A).toMatchObject({ startMs: 1000, endMs: 4000 }); // start 900→1000, span kept
  });

  it('snaps a right-edge TRIM to the nearest beat', () => {
    const reel = reelWith(clip(0, 3000));
    const rows = dragVideo(reel, 'A', 0, 4.9); // right trim → raw end 4900
    const A = applyTimelineChange(reel, rows, { snapMs: [5000], snapThresholdMs: 200 }).tracks.video[0];
    expect(A.startMs).toBe(0);
    expect(A.endMs).toBe(5000);
  });

  it('does not snap when the nearest beat is beyond the threshold', () => {
    const reel = reelWith(clip(0, 3000));
    const rows = dragVideo(reel, 'A', 0, 4.5); // raw end 4500, beat 5000 is 500 away
    const A = applyTimelineChange(reel, rows, { snapMs: [5000], snapThresholdMs: 200 }).tracks.video[0];
    expect(A.endMs).toBe(4500);
  });

  it('does not snap when no snapMs is provided (unchanged behavior)', () => {
    const reel = reelWith(clip(0, 3000));
    const rows = dragVideo(reel, 'A', 0.9, 3.9);
    const A = applyTimelineChange(reel, rows).tracks.video[0];
    expect(A).toMatchObject({ startMs: 900, endMs: 3900 });
  });
});

describe('clipFootageCapMs — clip vs broll policy', () => {
  const item = (kind: 'clip' | 'broll' | 'multi-clip'): VideoItem =>
    kind === 'multi-clip'
      ? { id: 'A', kind, startMs: 0, endMs: 3000, layout: 'split-h', sources: [] }
      : { id: 'A', kind, startMs: 0, endMs: 3000, source: 's.mp4', sourceInMs: 0, sourceOutMs: 3000 };

  it('caps a clip at its decoded footage duration', () => {
    expect(clipFootageCapMs(item('clip'), 8042)).toBe(8042);
  });
  it('caps a broll at its decoded footage too (a video-backed broll is finite, like a clip)', () => {
    expect(clipFootageCapMs(item('broll'), 8042)).toBe(8042);
  });
  it('returns undefined when the footage duration is unknown (0 / undefined)', () => {
    // A still-image / generated broll decodes to 0 → naturally uncapped.
    expect(clipFootageCapMs(item('clip'), 0)).toBeUndefined();
    expect(clipFootageCapMs(item('broll'), 0)).toBeUndefined();
    expect(clipFootageCapMs(item('clip'), undefined)).toBeUndefined();
  });
  it('never caps a multi-clip (no single trim source)', () => {
    expect(clipFootageCapMs(item('multi-clip'), 8042)).toBeUndefined();
  });
});

describe('resizeBoundsMs — real-time drag bounds', () => {
  // sourceOutMs defaults to sourceInMs + (endMs - startMs) — i.e. 1x BY
  // CONSTRUCTION, unless a case explicitly overrides it (the drifted-broll
  // case below does exactly that). Before this, sourceOutMs was pinned at a
  // literal 5000 regardless of the other overrides, so overriding sourceInMs
  // alone silently produced a non-1x item — an accidental artifact from
  // before playback speed existed, not a deliberate fixture. See the Task 2
  // report for how this was found (a real, non-snapped 0.76x on the
  // 'left bound' case) and the plan owner's ruling to fix the data.
  const clip = (
    over: Partial<{ startMs: number; endMs: number; sourceInMs: number; sourceOutMs: number }> = {},
  ): VideoItem => {
    const startMs = over.startMs ?? 5000;
    const endMs = over.endMs ?? 10000;
    const sourceInMs = over.sourceInMs ?? 0;
    return {
      id: 'A', kind: 'clip', startMs, endMs, source: 's.mp4',
      sourceInMs, sourceOutMs: over.sourceOutMs ?? sourceInMs + (endMs - startMs),
    };
  };

  it('left bound is the source head (start - sourceIn)', () => {
    const b = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 1200 }), 20000);
    expect(b!.minStartMs).toBe(3800); // 5000 - 1200 → can reveal 1200ms of earlier footage
  });

  it('right bound is the footage end', () => {
    const b = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 0 }), 8000);
    expect(b!.maxEndMs).toBe(13000); // 5000 + (8000 - 0)
  });

  const broll = (over: Partial<{ startMs: number; sourceInMs: number }> = {}): VideoItem => ({
    id: 'A', kind: 'broll', startMs: over.startMs ?? 5367, endMs: 15667, source: 'br.mp4',
    sourceInMs: over.sourceInMs ?? 0, sourceOutMs: 10300,
  });

  it('a BROLL is footage-bounded like a clip (its real file end)', () => {
    // seg-002 drift: config sourceOutMs 10300 but the real file is 10042 (ffprobe).
    // The max is the real footage end (15409), NOT the drifted config.
    const b = resizeBoundsMs(broll(), 10042);
    expect(b!.maxEndMs).toBe(15409); // 5367 + 10042 — the real file end
  });

  it('a still/generated broll (no decoded duration) has no right bound', () => {
    const b = resizeBoundsMs(broll(), undefined);
    expect(b!.maxEndMs).toBeUndefined(); // still/generated broll extends freely
  });

  it('returns null for kinds without a single trim source', () => {
    const multi: VideoItem = { id: 'A', kind: 'multi-clip', startMs: 0, endMs: 3000, layout: 'split-h', sources: [] };
    expect(resizeBoundsMs(multi, 8000)).toBeNull();
  });

  // The asymmetry this replaced: the right handle stopped at the next clip's
  // start while the left handle was never stopped by the previous clip's end.
  // Both directions now yield to the media alone, so a deliberate overlap is
  // reachable from either side.
  it('neither bound is set by a neighbour — the right edge may cross the next clip', () => {
    // Next clip starts at 11000, well before this clip's footage end (13000).
    const b = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 0 }), 8000);
    expect(b!.maxEndMs).toBe(13000); // the file, not the neighbour
    expect(b!.minStartMs).toBe(5000); // the file head, not a previous clip's end
  });
});

describe('resizeBoundsMs honours playback speed', () => {
  // 4s of source over 8s of timeline = 0.5x; the file holds 10s.
  const slowed = {
    id: 'v1', kind: 'broll', startMs: 0, endMs: 8000, sourceInMs: 0, sourceOutMs: 4000,
  } as unknown as VideoItem;

  it('lets a slowed clip reach ALL of its footage, not half of it', () => {
    // 10s of source at 0.5x is 20s of timeline. Stopping at 10000 refuses
    // footage the file really has — the reported "won't let me drag further".
    expect(resizeBoundsMs(slowed, 10000)).toEqual({ minStartMs: 0, maxEndMs: 20000 });
  });

  it('scales the left bound by speed too', () => {
    // NOTE: endMs stays 8000 (not the brief's literal 12000) so the clip stays
    // at 0.5x — with endMs also moved to 12000 the timeline span (8000) no
    // longer matches the halved source span (2000), which is a real 0.25x
    // clip, not the 0.5x one the inline comment computes against. Filed as a
    // deviation in the task report.
    const trimmed = { ...slowed, startMs: 4000, endMs: 8000, sourceInMs: 2000 } as VideoItem;
    // 2000ms of source head at 0.5x = 4000ms of timeline: 4000 - 4000 = 0.
    expect(resizeBoundsMs(trimmed, 10000)!.minStartMs).toBe(0);
  });

  it('leaves a 1x clip’s bounds exactly where they were', () => {
    const plain = { ...slowed, endMs: 4000 } as VideoItem; // spans in lockstep
    expect(resizeBoundsMs(plain, 10000)).toEqual({ minStartMs: 0, maxEndMs: 10000 });
  });

  it('still reports no right bound at all when the footage length is unknown', () => {
    expect(resizeBoundsMs(slowed, undefined)!.maxEndMs).toBeUndefined();
  });
});

describe('applyTimelineChange — a trim preserves playback speed', () => {
  const FOOTAGE = 10000;
  // 4s of source over 8s of timeline = 0.5x.
  const slowed: VideoItem = {
    id: 'v1', kind: 'broll', startMs: 0, endMs: 8000, source: 'br.mp4', sourceInMs: 0, sourceOutMs: 4000,
  };
  // Scoped to this describe on purpose — the file has other `clip`/`reelWith`
  // helpers with different (1x-by-construction) contracts.
  const reelWith = (v: VideoItem): LayeredReel => ({
    ...REEL,
    meta: { topic: 'Fixture', totalDurationMs: 30000 },
    tracks: { ...REEL.tracks, video: [v], audio: [], overlays: [], brand: [] },
  });
  const trim = (item: VideoItem, startMs: number, endMs: number) => {
    const reel = reelWith(item);
    const { editorData } = layeredToTimeline(reel, 30);
    const rows = editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => ({ ...a, start: startMs / 1000, end: endMs / 1000 })) }
        : row,
    );
    return applyTimelineChange(reel, rows, { footageMsById: { v1: FOOTAGE } }).tracks.video[0];
  };
  const trimRight = (item: VideoItem, endMs: number) => trim(item, item.startMs, endMs);

  it('grows the clip when the right edge is dragged outward', () => {
    // The bug: this returned endMs 5000 — SHORTER than the 8000 it started at.
    const after = trimRight(slowed, 10000);
    expect(after.endMs).toBe(10000);
  });

  it('consumes source in proportion to speed, not 1:1', () => {
    // +2000ms of timeline at 0.5x costs 1000ms of source.
    const after = trimRight(slowed, 10000);
    expect(after.kind === 'broll' && after.sourceOutMs).toBe(5000);
  });

  it('leaves the speed exactly where the author set it', () => {
    expect(deriveSpeed(trimRight(slowed, 10000) as typeof slowed)).toBe(0.5);
  });

  it('stops at the end of the footage, in timeline ms', () => {
    // All 10s of source at 0.5x = 20s of timeline; asking for more gets 20000.
    const after = trimRight(slowed, 30000) as typeof slowed;
    expect(after.sourceOutMs).toBe(FOOTAGE);
    expect(after.endMs).toBe(20000);
    expect(deriveSpeed(after)).toBe(0.5);
  });

  it('clamps to the footage even when that leaves a clip under MIN_CLIP_MS', () => {
    // A file too short to hold a minimum-length clip: 40ms of source at 0.5x is
    // 80ms of timeline, under the 100ms floor. The footage cap is applied LAST
    // and wins — a visibly-too-short clip beats an out-point past the end of
    // the file (frames that do not exist).
    const reel = reelWith(slowed);
    const { editorData } = layeredToTimeline(reel, 30);
    const rows = editorData.map((row) =>
      row.id === 'video' ? { ...row, actions: row.actions.map((a) => ({ ...a, start: 0, end: 30 })) } : row,
    );
    const after = applyTimelineChange(reel, rows, { footageMsById: { v1: 40 } }).tracks.video[0] as typeof slowed;
    expect(after.sourceOutMs).toBe(40); // NOT 50 — never past the end of the file
    expect(after.endMs).toBe(80);
  });

  it('floors a headroom-clamped left extend at a real 0, never -0', () => {
    // 1000ms of source over 2900ms of timeline — a speed with no exact binary
    // representation, so the round-trip through it lands at -1.1e-13 and
    // Math.round gives -0. `toBe` is Object.is, and Object.is(-0, 0) is false.
    const odd: VideoItem = { ...slowed, startMs: 5000, endMs: 7900, sourceInMs: 1000, sourceOutMs: 2000 };
    const after = trim(odd, 2100, 7900) as typeof slowed; // exactly the headroom
    expect(after.startMs).toBe(2100);
    expect(after.sourceInMs).toBe(0);
    expect(Object.is(after.sourceInMs, -0)).toBe(false);
  });

  it('preserves speed on a LEFT trim too', () => {
    const start: VideoItem = { ...slowed, startMs: 8000, endMs: 16000, sourceInMs: 2000, sourceOutMs: 6000 };
    const after = trim(start, 4000, 16000) as typeof slowed;
    expect(after.startMs).toBe(4000);
    // 4000ms of timeline at 0.5x costs 2000ms of source: in-point reaches 0.
    expect(after.sourceInMs).toBe(0);
    expect(deriveSpeed(after)).toBe(0.5);
  });
});

describe('applyTimelineChange — trim edges (clip footage cap, broll free)', () => {
  const videoReel = (
    kind: 'clip' | 'broll',
    over: Partial<{ sourceInMs: number; sourceOutMs: number; startMs: number; endMs: number }> = {},
  ): LayeredReel => ({
    ...REEL,
    meta: { topic: 'Fixture', totalDurationMs: 20000 },
    tracks: {
      ...REEL.tracks,
      overlays: [],
      audio: [],
      brand: [],
      video: [
        {
          id: 'A',
          kind,
          startMs: over.startMs ?? 5367,
          endMs: over.endMs ?? 15667,
          source: kind === 'broll' ? 'br.mp4' : 'clip.mp4',
          sourceInMs: over.sourceInMs ?? 0,
          sourceOutMs: over.sourceOutMs ?? 10300,
        },
      ],
    },
  });

  const dragEdge = (reel: LayeredReel, startSec: number, endSec: number) => {
    const { editorData } = layeredToTimeline(reel, 30);
    return editorData.map((row) =>
      row.id === 'video'
        ? { ...row, actions: row.actions.map((a) => ({ ...a, start: startSec, end: endSec })) }
        : row,
    );
  };

  // ---- Right edge: clip is footage-capped ---------------------------------
  it('clamps a CLIP right-edge extend to the real footage duration', () => {
    const reel = videoReel('clip', { sourceOutMs: 6000, endMs: 11367 }); // uses 6s
    const changed = dragEdge(reel, 5.367, 30); // yank right; only 8042ms exists
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 8042 } }).tracks.video[0];
    expect(A.kind === 'clip' && A.sourceOutMs).toBe(8042);
    expect(A.endMs).toBe(5367 + 8042);
  });

  it('honors a CLIP right-edge extend that stays within footage', () => {
    const reel = videoReel('clip', { sourceOutMs: 6000, endMs: 11367 });
    const changed = dragEdge(reel, 5.367, 13.367); // +2s → out-point 8000, footage 8042
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 8042 } }).tracks.video[0];
    expect(A.kind === 'clip' && A.sourceOutMs).toBe(8000);
    expect(A.endMs).toBe(13367);
  });

  it('self-heals a CLIP whose config sourceOutMs overshoots the footage', () => {
    const reel = videoReel('clip'); // sourceOutMs 10300, endMs 15667
    const changed = dragEdge(reel, 5.367, 15.567); // nudge left by 100ms
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 10042 } }).tracks.video[0];
    expect(A.kind === 'clip' && A.sourceOutMs).toBe(10042);
    expect(A.endMs).toBe(5367 + 10042); // snapped to real footage end
  });

  // ---- Right edge: a video-backed broll is capped at footage, like a clip ---
  it('clamps a BROLL right-edge extend to its real footage (config sourceOutMs drift is ignored)', () => {
    // seg-002: config 10300ms but the file is 10042ms (ffprobe). The component
    // puts the broll in footageMsById at its decoded duration, so the commit caps
    // it there — the phantom 258ms is not reachable, on trim OR extend.
    const reel = videoReel('broll'); // endMs 15667, sourceOutMs 10300
    const changed = dragEdge(reel, 5.367, 20); // yank right far
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 10042 } }).tracks.video[0];
    expect(A.kind === 'broll' && A.sourceOutMs).toBe(10042); // capped at the real file end
    expect(A.endMs).toBe(5367 + 10042); // 15409
  });

  it('self-heals a drifted BROLL on the first trim and cannot be pulled back past footage', () => {
    const reel = videoReel('broll'); // endMs 15667, sourceOutMs 10300, file 10042
    const shortened = applyTimelineChange(reel, dragEdge(reel, 5.367, 13), { footageMsById: { A: 10042 } }).tracks.video[0];
    expect(shortened.endMs).toBe(13000);
    const restored = applyTimelineChange(
      { ...reel, tracks: { ...reel.tracks, video: [shortened] } },
      dragEdge(reel, 5.367, 15.667), // try to pull back to the drifted authored length
      { footageMsById: { A: 10042 } },
    ).tracks.video[0];
    expect(restored.endMs).toBe(5367 + 10042); // capped at the real footage end (15409), not 15667
    expect(restored.kind === 'broll' && restored.sourceOutMs).toBe(10042);
  });

  it('leaves a still/generated BROLL (no decoded duration) uncapped on commit', () => {
    const reel = videoReel('broll', { sourceOutMs: 6000, endMs: 11367 });
    const changed = dragEdge(reel, 5.367, 20);
    const A = applyTimelineChange(reel, changed, { footageMsById: {} }).tracks.video[0]; // no cap known
    expect(A.kind === 'broll' && A.sourceOutMs).toBe(20000 - 5367); // extends freely (a still)
  });

  // ---- Left edge: trim-in works; extend-left clamped at the source start ----
  it('trims a BROLL in from the left (in-point advances with the start)', () => {
    const reel = videoReel('broll'); // startMs 5367, sourceInMs 0
    const changed = dragEdge(reel, 7, 15.667); // pull the left edge in to 7s
    const A = applyTimelineChange(reel, changed, { footageMsById: {} }).tracks.video[0];
    expect(A.startMs).toBe(7000);
    expect(A.kind === 'broll' && A.sourceInMs).toBe(7000 - 5367); // in-point moved by the same amount
  });

  it('cannot extend a left edge past the source start (sourceInMs stays >= 0)', () => {
    const reel = videoReel('broll', { startMs: 5367, sourceInMs: 0 });
    const changed = dragEdge(reel, 2, 15.667); // try to pull the start way left
    const A = applyTimelineChange(reel, changed, { footageMsById: {} }).tracks.video[0];
    expect(A.startMs).toBe(5367); // unchanged — nothing before the in-point
    expect(A.kind === 'broll' && A.sourceInMs).toBe(0);
  });

  // ---- At full footage: neither edge extends (regardless of side) ----------
  it('a clip at full footage cannot extend from the RIGHT', () => {
    // sourceIn 0, sourceOut == footage → whole file used.
    const reel = videoReel('clip', { startMs: 2000, endMs: 7000, sourceInMs: 0, sourceOutMs: 5000 });
    const changed = dragEdge(reel, 2, 30); // yank the right edge far out
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 5000 } }).tracks.video[0];
    expect(A.endMs).toBe(7000); // no change — already at the footage end
    expect(A.kind === 'clip' && A.sourceOutMs).toBe(5000);
  });

  it('a clip at full footage cannot extend from the LEFT', () => {
    const reel = videoReel('clip', { startMs: 2000, endMs: 7000, sourceInMs: 0, sourceOutMs: 5000 });
    const changed = dragEdge(reel, 0, 7); // yank the left edge to time 0
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 5000 } }).tracks.video[0];
    expect(A.startMs).toBe(2000); // no change — nothing before the source start
    expect(A.kind === 'clip' && A.sourceInMs).toBe(0);
  });
});

describe('applyTimelineChange — audio trim (in/out-point, like a clip)', () => {
  const audioReel = (over: Partial<{ sourceInMs: number; sourceOutMs: number }> = {}): LayeredReel => ({
    ...REEL,
    meta: { topic: 'Fixture', totalDurationMs: 20000 },
    tracks: {
      ...REEL.tracks,
      video: [],
      overlays: [],
      brand: [],
      audio: [{ id: 'A', startMs: 5000, endMs: 10000, source: 'audio/a.mp3', sourceInMs: over.sourceInMs ?? 2000, ...(over.sourceOutMs !== undefined ? { sourceOutMs: over.sourceOutMs } : {}) }],
    },
  });
  const dragEdge = (reel: LayeredReel, startSec: number, endSec: number) => {
    const { editorData } = layeredToTimeline(reel, 30);
    return editorData.map((row) =>
      row.id === 'audio' ? { ...row, actions: row.actions.map((a) => ({ ...a, start: startSec, end: endSec })) } : row,
    );
  };

  it('left edge moves the in-point (reveals earlier audio)', () => {
    const reel = audioReel({ sourceInMs: 2000 }); // start 5000, in 2000
    const A = applyTimelineChange(reel, dragEdge(reel, 4, 10)).tracks.audio[0];
    expect(A.startMs).toBe(4000);
    expect(A.sourceInMs).toBe(1000); // in-point pulled back 1000ms with the edge
  });

  it('left edge cannot pass the source start (sourceInMs stays >= 0)', () => {
    const reel = audioReel({ sourceInMs: 500 });
    const A = applyTimelineChange(reel, dragEdge(reel, 0, 10)).tracks.audio[0];
    expect(A.startMs).toBe(4500); // only 500ms of head existed
    expect(A.sourceInMs).toBe(0);
  });

  it('right edge extends the out-point (sourceOutMs), defaulting from the span', () => {
    const reel = audioReel({ sourceInMs: 2000 }); // no sourceOutMs → span-derived 7000
    const A = applyTimelineChange(reel, dragEdge(reel, 5, 12)).tracks.audio[0]; // +2s
    expect(A.endMs).toBe(12000);
    expect(A.sourceOutMs).toBe(9000); // 2000 + (12000 - 5000)
  });

  it('honours an existing sourceOutMs when trimming the right edge', () => {
    const reel = audioReel({ sourceInMs: 2000, sourceOutMs: 7000 });
    const A = applyTimelineChange(reel, dragEdge(reel, 5, 8)).tracks.audio[0]; // shorten to 3s span
    expect(A.endMs).toBe(8000);
    expect(A.sourceOutMs).toBe(5000); // 2000 + (8000 - 5000)
  });
});

describe('applyTimelineChange — linked audio (bed follows its video)', () => {
  // Two clips, each with a bound audio bed at the same span.
  const linkedReel = (): LayeredReel => ({
    ...REEL,
    meta: { topic: 'Fixture', totalDurationMs: 20000 },
    tracks: {
      ...REEL.tracks,
      overlays: [],
      brand: [],
      video: [
        { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 6000 },
        { id: 'B', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 5000 },
      ],
      audio: [
        { id: 'a-A', startMs: 0, endMs: 5000, source: 'a.mp3', sourceInMs: 400, followsVideoId: 'A' },
        { id: 'a-B', startMs: 5000, endMs: 10000, source: 'b.mp3', sourceInMs: 0, followsVideoId: 'B' },
      ],
    },
  });
  const dragVideo = (reel: LayeredReel, id: string, startSec: number, endSec: number, opts = {}) => {
    const { editorData } = layeredToTimeline(reel, 30);
    const changed = editorData.map((row) =>
      row.id === 'video' ? { ...row, actions: row.actions.map((a) => (a.id === `video:${id}` ? { ...a, start: startSec, end: endSec } : a)) } : row,
    );
    return applyTimelineChange(reel, changed, opts);
  };

  it('trimming a clip’s right edge trims its bound audio bed the same way', () => {
    const r = dragVideo(linkedReel(), 'A', 0, 3); // shorten A to 3s
    const vA = r.tracks.video.find((v) => v.id === 'A')!;
    const aA = r.tracks.audio.find((a) => a.id === 'a-A')!;
    expect(vA.endMs).toBe(3000);
    expect(aA.endMs).toBe(3000); // bed followed the trim
    expect(aA.sourceOutMs).toBe(400 + 3000); // out-point rode along (was span 5000 → now 3000)
  });

  it('moving a clip shifts its bound audio bed by the same delta', () => {
    const r = dragVideo(linkedReel(), 'B', 7, 12); // move B +2s (both edges)
    const vB = r.tracks.video.find((v) => v.id === 'B')!;
    const aB = r.tracks.audio.find((a) => a.id === 'a-B')!;
    expect(vB.startMs).toBe(7000);
    expect(aB.startMs).toBe(7000); // bed moved with the clip
    expect(aB.endMs).toBe(12000);
    expect(aB.sourceInMs).toBe(0); // a move leaves the trim untouched
  });

  it('in ripple mode, trimming a clip trims its bed AND shifts the following beds with their clips', () => {
    const r = dragVideo(linkedReel(), 'A', 0, 3, { ripple: true }); // shorten A by 2s, ripple
    const aA = r.tracks.audio.find((a) => a.id === 'a-A')!;
    const aB = r.tracks.audio.find((a) => a.id === 'a-B')!;
    const vB = r.tracks.video.find((v) => v.id === 'B')!;
    expect(aA.endMs).toBe(3000); // A's bed trimmed with A
    expect(vB.startMs).toBe(3000); // B rippled left by 2s
    expect(aB.startMs).toBe(3000); // B's bed rippled with B
    expect(aB.endMs).toBe(8000);
  });

  it('an UNBOUND bed (followsVideoId cleared) is not moved by its former clip', () => {
    const reel = linkedReel();
    reel.tracks.audio[0] = { ...reel.tracks.audio[0], followsVideoId: undefined }; // unlink a-A
    const r = dragVideo(reel, 'A', 0, 3);
    const aA = r.tracks.audio.find((a) => a.id === 'a-A')!;
    expect(aA.endMs).toBe(5000); // stayed put — independent
  });
});

describe('applyTimelineChange — ripple move (drag a clip in ripple mode)', () => {
  const reel = (): LayeredReel => ({
    ...REEL,
    meta: { topic: 'x', totalDurationMs: 12000 },
    tracks: {
      ...REEL.tracks,
      overlays: [],
      brand: [],
      video: [
        { id: 'A', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        { id: 'B', kind: 'clip', startMs: 5000, endMs: 9000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 4000 },
        { id: 'C', kind: 'clip', startMs: 9000, endMs: 12000, source: 'c.mp4', sourceInMs: 0, sourceOutMs: 3000 },
      ],
      audio: [
        { id: 'a-A', startMs: 0, endMs: 5000, source: 'a.mp3', sourceInMs: 0, followsVideoId: 'A' },
        { id: 'a-B', startMs: 5000, endMs: 9000, source: 'b.mp3', sourceInMs: 0, followsVideoId: 'B' },
        { id: 'a-C', startMs: 9000, endMs: 12000, source: 'c.mp3', sourceInMs: 0, followsVideoId: 'C' },
      ],
    },
  });
  const moveVideo = (r: LayeredReel, id: string, startSec: number, endSec: number) => {
    const { editorData } = layeredToTimeline(r, 30);
    const changed = editorData.map((row) =>
      row.id === 'video' ? { ...row, actions: row.actions.map((a) => (a.id === `video:${id}` ? { ...a, start: startSec, end: endSec } : a)) } : row,
    );
    return applyTimelineChange(r, changed, { ripple: true });
  };

  it('carries everything after the dragged clip by the same delta', () => {
    const r = moveVideo(reel(), 'A', 2, 7);
    expect(r.tracks.video.map((v) => [v.startMs, v.endMs])).toEqual([[2000, 7000], [7000, 11000], [11000, 14000]]);
  });

  it('leaves the order alone — a drag moves, it does not re-slot', () => {
    const r = moveVideo(reel(), 'A', 6, 11); // past B's centre: once a reorder
    expect(r.tracks.video.map((v) => v.id)).toEqual(['A', 'B', 'C']);
  });

  it('linked beds ride along with their clip', () => {
    const r = moveVideo(reel(), 'A', 2, 7);
    expect(r.tracks.audio.map((a) => [a.startMs, a.endMs])).toEqual([[2000, 7000], [7000, 11000], [11000, 14000]]);
  });

  it('moves the LAST clip right — there is nothing behind it to block the drag', () => {
    const r = moveVideo(reel(), 'C', 11, 14);
    expect(r.tracks.video.map((v) => [v.startMs, v.endMs])).toEqual([[0, 5000], [5000, 9000], [11000, 14000]]);
  });

  // The everyday reason to drag left: free space opened mid-track and the whole
  // tail should come forward into it. One drag does it — no multi-select.
  it('closes a gap mid-track and pulls the tail forward with it', () => {
    const r = reel();
    const gapped = {
      ...r,
      tracks: {
        ...r.tracks,
        video: r.tracks.video.map((v) => (v.id === 'A' ? { ...v, endMs: 3000 } : v)), // A now ends 2s early
      },
    };
    const moved = moveVideo(gapped, 'B', 3, 7); // drag B back onto A's new end
    expect(moved.tracks.video.map((v) => [v.startMs, v.endMs])).toEqual([[0, 3000], [3000, 7000], [7000, 10000]]);
  });

  it('a leftward drag stops at the previous clip’s end rather than overlapping it', () => {
    const r = moveVideo(reel(), 'C', 2, 5); // C would land on top of A and B
    expect(r.tracks.video.map((v) => [v.startMs, v.endMs])).toEqual([[0, 5000], [5000, 9000], [9000, 12000]]);
  });

  // A track whose head sits at t > 0 (a gap opened by an earlier edit) must stay
  // recoverable: the first clip's floor is 0, not wherever the track happens to
  // begin, so dragging it left closes the gap and pulls the rest with it.
  const shifted = (byMs: number): LayeredReel => {
    const r = reel();
    const bump = <T extends { startMs: number; endMs: number }>(x: T): T => ({ ...x, startMs: x.startMs + byMs, endMs: x.endMs + byMs });
    return { ...r, tracks: { ...r.tracks, video: r.tracks.video.map(bump), audio: r.tracks.audio.map(bump) } };
  };

  it('dragging the first clip left closes a gap at the head', () => {
    const r = moveVideo(shifted(500), 'A', 0, 5);
    expect(r.tracks.video.map((v) => [v.startMs, v.endMs])).toEqual([[0, 5000], [5000, 9000], [9000, 12000]]);
  });

  it('linked beds ride along when the head gap closes', () => {
    const r = moveVideo(shifted(500), 'A', 0, 5);
    expect(r.tracks.audio.map((a) => a.startMs)).toEqual([0, 5000, 9000]);
  });

  it('never drags the head below 0', () => {
    const r = moveVideo(reel(), 'A', -2, 3);
    expect(r.tracks.video[0].startMs).toBe(0);
  });

  it('dragging the first clip right opens a head gap — and the rest follows', () => {
    const r = moveVideo(shifted(500), 'A', 1.5, 6.5);
    expect(r.tracks.video.map((v) => v.startMs)).toEqual([1500, 6500, 10500]);
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
    const { reel: r, selectedId } = splitItem(reel, 'video:A', 60, 30); // frame 60 @ 30fps = 2000ms
    const [l, right] = r.tracks.video;
    expect(l).toMatchObject({ id: 'A', startMs: 0, endMs: 2000 });
    expect(l.kind === 'clip' && l.sourceOutMs).toBe(3000); // 1000 + 2000
    expect(right).toMatchObject({ id: 'A-b', startMs: 2000, endMs: 6000 });
    expect(right.kind === 'clip' && right.sourceInMs).toBe(3000);
    // bound audio split too
    expect(r.tracks.audio.map((a) => a.id)).toEqual(['A-audio', 'A-audio-b']);
    expect(r.tracks.audio[1]).toMatchObject({ startMs: 2000, sourceInMs: 3000, followsVideoId: 'A-b' });
    // selection moves to the new (right-hand) piece — that's the one the
    // author is now working on.
    expect(selectedId).toBe('video:A-b');
  });
  it('is a no-op when the playhead is outside the clip, and leaves selection alone', () => {
    const { reel: r, selectedId } = splitItem(reel, 'video:A', 300, 30); // frame 300 = 10s, past the clip
    expect(r.tracks.video).toHaveLength(1);
    expect(selectedId).toBe('video:A');
  });

  // Regression: repeat-splitting the same clip without moving the playhead (or
  // re-selecting) previously reused the same deterministic `-b` suffix,
  // producing two video items — and two bound-audio items — sharing one id.
  it('splitting twice without moving selection gives the second right piece its own id', () => {
    const once = splitItem(reel, 'video:A', 60, 30); // → A, A-b
    // The author is still on 'video:A' (e.g. split fired from a stale
    // selection) — split it again at a later frame, inside the still-'A' left
    // piece (endMs 2000, so frame 30 = 1000ms is inside it).
    const twice = splitItem(once.reel, 'video:A', 30, 30);
    const ids = twice.reel.tracks.video.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    expect(ids).toEqual(['A', 'A-b-2', 'A-b']);
    expect(twice.selectedId).toBe('video:A-b-2');
    const audioIds = twice.reel.tracks.audio.map((a) => a.id);
    expect(new Set(audioIds).size).toBe(audioIds.length);
  });
});

describe('splitItem keeps speed on both halves', () => {
  // 4s of source over 8s of timeline = 0.5x, at 30fps. startMs is
  // deliberately non-zero: `sourceAtTimelineMs` subtracts startMs internally,
  // so a caller that mistakenly passed a clip-RELATIVE ms (`atMs - v.startMs`)
  // instead of the absolute timeline ms would agree with the correct call at
  // startMs 0 for every value of atMs — the two can only be told apart once
  // startMs is nonzero.
  const slowed = {
    id: 'v1', kind: 'broll', startMs: 1000, endMs: 9000, sourceInMs: 0, sourceOutMs: 4000,
  } as unknown as VideoItem;
  // Scoped to this describe on purpose — the file has other `clip`/`reelWith`
  // helpers with different (1x-by-construction) contracts.
  const reelWith = (v: VideoItem): LayeredReel => ({
    ...REEL,
    meta: { topic: 'Fixture', totalDurationMs: 30000 },
    tracks: { ...REEL.tracks, video: [v], audio: [], overlays: [], brand: [] },
  });

  it('cuts the SOURCE at the frame actually showing at the playhead', () => {
    // Playhead at absolute 5000ms = 4000ms into the clip (startMs 1000) =
    // half way = 2000ms of source at 0.5x, not 4000.
    const { reel } = splitItem(reelWith(slowed), 'video:v1', 150, 30); // frame 150 @30fps = 5000ms
    const [left, right] = reel.tracks.video as Extract<VideoItem, { kind: 'broll' }>[];
    expect(left.endMs).toBe(5000);
    expect(left.sourceOutMs).toBe(2000);
    expect(right.sourceInMs).toBe(2000);
  });

  it('leaves both halves at the parent’s speed', () => {
    const { reel } = splitItem(reelWith(slowed), 'video:v1', 150, 30);
    const [left, right] = reel.tracks.video as Extract<VideoItem, { kind: 'broll' }>[];
    expect(deriveSpeed(left)).toBe(0.5);
    expect(deriveSpeed(right)).toBe(0.5);
  });

  it('is the plain sum at 1x', () => {
    // Independent of `slowed`'s (now nonzero) startMs — this case is about
    // speed 1x, not about the startMs != 0 regression, so it keeps its own
    // startMs 0 fixture, unchanged from before that fixture moved.
    const plain = { ...slowed, startMs: 0, endMs: 4000 } as VideoItem; // spans in lockstep
    const { reel } = splitItem(reelWith(plain), 'video:v1', 60, 30); // 2000ms
    expect((reel.tracks.video[0] as Extract<VideoItem, { kind: 'broll' }>).sourceOutMs).toBe(2000);
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
    const { reel: r, selectedId } = duplicateItem(reel, 'video:A');
    expect(r.tracks.video.map((v) => v.id)).toEqual(['A', 'A-copy', 'B']);
    expect(r.tracks.video[1]).toMatchObject({ startMs: 5000, endMs: 10000 });
    expect(r.tracks.video[2]).toMatchObject({ id: 'B', startMs: 10000, endMs: 14000 }); // shifted right
    expect(r.tracks.audio.map((a) => a.id)).toEqual(['A-audio', 'A-audio-copy']);
    expect(r.tracks.audio[1]).toMatchObject({ startMs: 5000, followsVideoId: 'A-copy' });
    expect(r.meta.totalDurationMs).toBe(14000);
    // selection moves to the new copy — that's the one the author is now
    // working on.
    expect(selectedId).toBe('video:A-copy');
  });

  it('is a no-op for a non-video selection, and leaves selection alone', () => {
    const { reel: r, selectedId } = duplicateItem(reel, 'overlays:seg-1-ov');
    expect(r).toBe(reel);
    expect(selectedId).toBe('overlays:seg-1-ov');
  });

  // Regression: repeat-duplicating the same clip without moving selection
  // (e.g. two fast ⌘D presses) previously reused the same deterministic
  // `-copy` suffix, producing two video items — and two bound-audio items —
  // sharing one id. That reached the render (which keys by item.id) and let
  // `deleteItem` remove both copies at once instead of just one.
  it('duplicating twice without moving selection gives the second copy its own id', () => {
    const once = duplicateItem(reel, 'video:A');
    // The author is still on 'video:A' (stale selection) — duplicate again.
    const twice = duplicateItem(once.reel, 'video:A');
    const ids = twice.reel.tracks.video.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids
    expect(ids).toEqual(['A', 'A-copy-2', 'A-copy', 'B']);
    expect(twice.selectedId).toBe('video:A-copy-2');
    const audioIds = twice.reel.tracks.audio.map((a) => a.id);
    expect(new Set(audioIds).size).toBe(audioIds.length);
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

// A clip with 1s of unused head and 1s of unused tail inside a 10s file:
// window [1000,4000] on the timeline span [0,3000].
const SLIP_REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Slip', totalDurationMs: 3000 },
  tracks: {
    video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 1000, sourceOutMs: 4000 }],
    audio: [],
    music: { baseVolumeDb: -8 },
    overlays: [],
    brand: [],
  },
};
const CAPS = { v1: 10000 }; // decoded footage length

const vid = (reel: LayeredReel) => reel.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;

describe('slipVideoItem', () => {
  it('shifts the source window by the delta and leaves the timeline span untouched', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', 500, CAPS));
    expect(out.sourceInMs).toBe(1500);
    expect(out.sourceOutMs).toBe(4500);
    expect(out.startMs).toBe(0);
    expect(out.endMs).toBe(3000);
  });

  it('preserves span == sourceOut - sourceIn', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', -300, CAPS));
    expect(out.sourceOutMs - out.sourceInMs).toBe(out.endMs - out.startMs);
  });

  it('clamps left at -sourceInMs — nothing exists before the file start', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', -5000, CAPS));
    expect(out.sourceInMs).toBe(0);
    expect(out.sourceOutMs).toBe(3000);
  });

  it('clamps right at the footage end when the length is known', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', 9000, CAPS));
    expect(out.sourceOutMs).toBe(10000);
    expect(out.sourceInMs).toBe(7000);
  });

  it('applies no right bound when the footage length is unknown', () => {
    const out = vid(slipVideoItem(SLIP_REEL, 'v1', 9000, {}));
    expect(out.sourceOutMs).toBe(13000);
    expect(out.sourceInMs).toBe(10000);
  });

  it('gives a linked bed the same delta, on both source fields', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 2000, sourceOutMs: 5000, followsVideoId: 'v1' }],
      },
    };
    const out = slipVideoItem(reel, 'v1', 500, CAPS);
    expect(out.tracks.audio[0].sourceInMs).toBe(2500);
    expect(out.tracks.audio[0].sourceOutMs).toBe(5500);
  });

  // THE SYNC RULE. A bed with less headroom than the clip must limit the WHOLE
  // gesture: clamping each side separately would move picture and sound by
  // different amounts and desync them silently.
  it('limits the delta to the linked bed headroom so picture and sound never diverge', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 200, followsVideoId: 'v1' }],
      },
    };
    // The clip could go -1000; the bed only -200. Both must move -200.
    const out = slipVideoItem(reel, 'v1', -1000, CAPS);
    expect(vid(out).sourceInMs).toBe(800);
    expect(out.tracks.audio[0].sourceInMs).toBe(0);
  });

  // THE SPLIT this field exists for: a linked bed that does not slip with its
  // video (narration under b-roll) keeps its source window untouched while
  // the picture's still moves — this is the whole point of `slipsWithVideo`.
  it('leaves a non-slipping linked bed\'s source window untouched while the picture still slips', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'narration.mp3', sourceInMs: 2000, sourceOutMs: 5000, followsVideoId: 'v1', slipsWithVideo: false }],
      },
    };
    const out = slipVideoItem(reel, 'v1', 500, CAPS);
    expect(vid(out).sourceInMs).toBe(1500); // the picture still moves
    expect(out.tracks.audio[0].sourceInMs).toBe(2000); // the bed does not
    expect(out.tracks.audio[0].sourceOutMs).toBe(5000);
  });

  // The existing lockstep behaviour must not regress for a bed that IS
  // explicitly marked as slipping (the talking-head case).
  it('still moves an explicitly-slipping linked bed in lockstep with the picture', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 2000, sourceOutMs: 5000, followsVideoId: 'v1', slipsWithVideo: true }],
      },
    };
    const out = slipVideoItem(reel, 'v1', 500, CAPS);
    expect(out.tracks.audio[0].sourceInMs).toBe(2500);
    expect(out.tracks.audio[0].sourceOutMs).toBe(5500);
  });

  // A non-slipping bed's headroom must not cap how far the PICTURE can slip —
  // letting it would be a silent, hard-to-notice bug (see the comment above
  // slipVideoItem). Here the bed has almost no head (100ms) while the clip
  // has 1000ms; without the fix the whole gesture would be clamped to -100.
  it("a non-slipping bed's small sourceInMs does not cap the picture's slip", () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'narration.mp3', sourceInMs: 100, followsVideoId: 'v1', slipsWithVideo: false }],
      },
    };
    const out = slipVideoItem(reel, 'v1', -900, CAPS);
    expect(vid(out).sourceInMs).toBe(100); // clip clamped only by its OWN head (1000 - 900)
    expect(out.tracks.audio[0].sourceInMs).toBe(100); // bed untouched
  });

  it('leaves an unlinked bed alone', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: {
        ...SLIP_REEL.tracks,
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp3', sourceInMs: 2000 }],
      },
    };
    const out = slipVideoItem(reel, 'v1', 500, CAPS);
    expect(out.tracks.audio[0].sourceInMs).toBe(2000);
  });

  it('is a no-op for kinds with no single source window', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: { ...SLIP_REEL.tracks, video: [{ id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'a.jpg' }] },
    };
    expect(slipVideoItem(reel, 'p1', 500, {})).toBe(reel);
  });

  it('is a no-op for an unknown id', () => {
    expect(slipVideoItem(SLIP_REEL, 'nope', 500, CAPS)).toBe(SLIP_REEL);
  });

  // An authored sourceOutMs can overshoot the real file (drift). The right bound
  // is then BELOW the left one; slipping must refuse rather than move backwards.
  it('refuses to move when the bounds cross (authored out beyond the file)', () => {
    const reel: LayeredReel = {
      ...SLIP_REEL,
      tracks: { ...SLIP_REEL.tracks, video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 }] },
    };
    expect(slipVideoItem(reel, 'v1', 500, { v1: 2000 })).toBe(reel);
  });
});

// The single decision "can this item be slipped?" — shared by beginSlip and the
// cursor hint in LayeredTimeline.tsx (whole-branch review: the two used to
// disagree, since the cursor only checked the lane, not the kind). Every video
// kind is covered so a seventh kind added later can't silently opt in/out on
// only one side.
describe('isSlippable', () => {
  const base = { startMs: 0, endMs: 3000 };
  it('is true for clip', () => {
    expect(isSlippable({ ...base, id: 'v1', kind: 'clip', source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 })).toBe(true);
  });
  it('is true for broll', () => {
    expect(isSlippable({ ...base, id: 'v1', kind: 'broll', source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 })).toBe(true);
  });
  it('is false for multi-clip', () => {
    expect(isSlippable({ ...base, id: 'v1', kind: 'multi-clip', layout: 'split-h', sources: [] })).toBe(false);
  });
  it('is false for card', () => {
    expect(isSlippable({ ...base, id: 'v1', kind: 'card', cardKind: 'stat' })).toBe(false);
  });
  it('is false for photo', () => {
    expect(isSlippable({ ...base, id: 'v1', kind: 'photo', source: 'a.jpg' })).toBe(false);
  });
  it('is false for outro', () => {
    expect(isSlippable({ ...base, id: 'v1', kind: 'outro' })).toBe(false);
  });
  it('is false for undefined (item not found)', () => {
    expect(isSlippable(undefined)).toBe(false);
  });
});

// setItemSpeed — the Ripple toggle is the ONLY branch: on holds the source
// window and ripples the timeline-length delta to everything downstream
// (the same shift rule applyRipple uses); off holds the timeline and absorbs
// the change into the source window instead, touching nothing else at all.
const SPEED_REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Speed', totalDurationMs: 5000 },
  tracks: {
    video: [
      { id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 },
      { id: 'v2', kind: 'clip', startMs: 3000, endMs: 5000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 2000 },
    ],
    audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'narration.mp3', sourceInMs: 0, sourceOutMs: 3000, followsVideoId: 'v1' }],
    music: { baseVolumeDb: -8 },
    overlays: [],
    brand: [],
  },
};

describe('setItemSpeed — Ripple ON (hold the source window, change the timeline span)', () => {
  it('halving speed doubles the timeline span, holding sourceInMs/sourceOutMs', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 0.5, { ripple: true });
    const v1 = out.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;
    expect(v1.startMs).toBe(0);
    expect(v1.endMs).toBe(6000); // 3000 / 0.5
    expect(v1.sourceInMs).toBe(0);
    expect(v1.sourceOutMs).toBe(3000);
  });

  it('shifts the trailing clip by exactly the length delta', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 0.5, { ripple: true });
    const v2 = out.tracks.video[1];
    // delta = 6000 - 3000 = 3000.
    expect(v2.startMs).toBe(6000);
    expect(v2.endMs).toBe(8000);
  });

  it('does NOT time-stretch the linked audio bed — it stays exactly where it was, ending before the (now longer) picture', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 0.5, { ripple: true });
    const a1 = out.tracks.audio[0];
    expect(a1.startMs).toBe(0);
    expect(a1.endMs).toBe(3000);
    expect(a1.sourceInMs).toBe(0);
    expect(a1.sourceOutMs).toBe(3000);
    // The bed now ends well before its clip's new endMs (6000) — the stated,
    // deliberate consequence, not a bug.
    const v1 = out.tracks.video[0];
    expect(a1.endMs).toBeLessThan(v1.endMs);
  });

  it('speeding up shrinks the timeline span and pulls the trailing clip left', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 2, { ripple: true });
    const v1 = out.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;
    expect(v1.endMs).toBe(1500); // 3000 / 2
    expect(out.tracks.video[1].startMs).toBe(1500);
    expect(out.tracks.video[1].endMs).toBe(3500);
  });

  it('re-derives the total duration', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 0.5, { ripple: true });
    expect(out.meta.totalDurationMs).toBe(8000);
  });

  it('is a no-op at 1x (already-matching spans)', () => {
    expect(setItemSpeed(SPEED_REEL, 'v1', 1, { ripple: true })).toBe(SPEED_REEL);
  });

  it('is a no-op for a kind with no single source window', () => {
    const reel: LayeredReel = { ...SPEED_REEL, tracks: { ...SPEED_REEL.tracks, video: [{ id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'a.jpg' }] } };
    expect(setItemSpeed(reel, 'p1', 0.5, { ripple: true })).toBe(reel);
  });

  it('is a no-op for an unknown id', () => {
    expect(setItemSpeed(SPEED_REEL, 'nope', 0.5, { ripple: true })).toBe(SPEED_REEL);
  });
});

describe('setItemSpeed — Ripple OFF (hold the timeline span, absorb into the source window)', () => {
  it('halving speed halves the source span; the timeline (startMs/endMs) never moves', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 0.5, { ripple: false });
    const v1 = out.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;
    expect(v1.startMs).toBe(0);
    expect(v1.endMs).toBe(3000);
    expect(v1.sourceInMs).toBe(0);
    expect(v1.sourceOutMs).toBe(1500); // 3000 * 0.5
  });

  it('touches nothing else on the timeline — no gap, no overlap, no shift', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 0.5, { ripple: false });
    // Every item's startMs/endMs across the whole reel, unchanged.
    expect(out.tracks.video[1]).toEqual(SPEED_REEL.tracks.video[1]);
    expect(out.tracks.audio[0]).toEqual(SPEED_REEL.tracks.audio[0]);
  });

  it('does not time-stretch the linked audio bed either', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 2, { ripple: false });
    expect(out.tracks.audio[0]).toEqual(SPEED_REEL.tracks.audio[0]);
  });

  it('speeding up grows the source span (consumes more footage over the same span)', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 2, { ripple: false });
    const v1 = out.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;
    expect(v1.sourceOutMs).toBe(6000); // 3000 * 2
    expect(v1.startMs).toBe(0);
    expect(v1.endMs).toBe(3000);
  });

  it('clamps the achievable speed at the footage cap — sourceInMs never moves (the clip\'s first frame must not jump)', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 2, { ripple: false, footageMsById: { v1: 4000 } });
    const v1 = out.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>;
    expect(v1.sourceInMs).toBe(0);
    // Wanted sourceOutMs=6000 (2x), capped at the real file end (4000).
    expect(v1.sourceOutMs).toBe(4000);
  });

  it('applies no cap when the footage length is unknown', () => {
    const out = setItemSpeed(SPEED_REEL, 'v1', 2, { ripple: false });
    expect((out.tracks.video[0] as Extract<VideoItem, { kind: 'clip' }>).sourceOutMs).toBe(6000);
  });

  it('is a no-op at 1x', () => {
    expect(setItemSpeed(SPEED_REEL, 'v1', 1, { ripple: false })).toBe(SPEED_REEL);
  });

  it('is a no-op for an unknown id', () => {
    expect(setItemSpeed(SPEED_REEL, 'nope', 0.5, { ripple: false })).toBe(SPEED_REEL);
  });
});
