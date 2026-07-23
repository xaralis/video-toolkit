import { describe, it, expect } from 'vitest';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { layeredToTimeline, applyTimelineChange, parseActionId, deleteItem, splitItem, duplicateItem, clipFootageCapMs, resizeBoundsMs } from './layered-adapter';

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

describe('clipFootageCapMs — clip vs broll policy', () => {
  const item = (kind: 'clip' | 'broll' | 'multi-clip'): VideoItem =>
    kind === 'multi-clip'
      ? { id: 'A', kind, startMs: 0, endMs: 3000, layout: 'split-h', sources: [] }
      : { id: 'A', kind, startMs: 0, endMs: 3000, source: 's.mp4', sourceInMs: 0, sourceOutMs: 3000 };

  it('caps a clip at its decoded footage duration', () => {
    expect(clipFootageCapMs(item('clip'), 8042)).toBe(8042);
  });
  it('caps a video-backed broll at its decoded footage too (finite, like a clip)', () => {
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
  const clip = (over: Partial<{ startMs: number; sourceInMs: number }> = {}): VideoItem => ({
    id: 'A', kind: 'clip', startMs: over.startMs ?? 5000, endMs: 10000, source: 's.mp4',
    sourceInMs: over.sourceInMs ?? 0, sourceOutMs: 5000,
  });

  it('left bound is the source head (start - sourceIn)', () => {
    const b = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 1200 }), 20000, undefined);
    expect(b!.minStartMs).toBe(3800); // 5000 - 1200 → can reveal 1200ms of earlier footage
  });

  it('right bound is the footage end when no next clip', () => {
    const b = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 0 }), 8000, undefined);
    expect(b!.maxEndMs).toBe(13000); // 5000 + (8000 - 0)
  });

  it('a CLIP right bound is the NEARER of footage end and the next clip start', () => {
    const nearNext = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 0 }), 8000, 11000);
    expect(nearNext!.maxEndMs).toBe(11000); // next clip wall is closer than footage end (13000)
    const nearFootage = resizeBoundsMs(clip({ startMs: 5000, sourceInMs: 0 }), 8000, 20000);
    expect(nearFootage!.maxEndMs).toBe(13000); // footage end is closer than the far next clip
  });

  const broll = (over: Partial<{ startMs: number; sourceInMs: number }> = {}): VideoItem => ({
    id: 'A', kind: 'broll', startMs: over.startMs ?? 5367, endMs: 15667, source: 'br.mp4',
    sourceInMs: over.sourceInMs ?? 0, sourceOutMs: 10300,
  });

  it('a BROLL extends up to the next clip even past its footage (holds last frame)', () => {
    // seg-002 drift: real file 10042 (footage end 15409) but next clip at 15667.
    // The broll holds its last frame, so it can restore back to butt the neighbour.
    const b = resizeBoundsMs(broll(), 10042, 15667);
    expect(b!.maxEndMs).toBe(15667); // next clip, NOT the shorter footage end (15409)
  });

  it('the LAST broll (no next clip) is bounded by its own footage end', () => {
    const b = resizeBoundsMs(broll(), 10042, undefined);
    expect(b!.maxEndMs).toBe(15409); // 5367 + 10042 — nothing to hold up to
  });

  it('has no right bound when footage is unknown and there is no next clip', () => {
    const b = resizeBoundsMs(broll(), undefined, undefined);
    expect(b!.maxEndMs).toBeUndefined(); // still/generated broll extends freely
  });

  it('returns null for kinds without a single trim source', () => {
    const multi: VideoItem = { id: 'A', kind: 'multi-clip', startMs: 0, endMs: 3000, layout: 'split-h', sources: [] };
    expect(resizeBoundsMs(multi, 8000, undefined)).toBeNull();
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

  // ---- Right edge: a video-backed broll is capped just like a clip ---------
  it('clamps a BROLL right-edge extend to its footage (finite, like a clip)', () => {
    // A video-backed broll has a finite file; extending past it into dead space
    // is not allowed. Only a still/generated broll (0 duration) stays uncapped.
    const reel = videoReel('broll', { sourceOutMs: 6000, endMs: 11367 });
    const changed = dragEdge(reel, 5.367, 20); // yank right; only 8042ms exists
    const A = applyTimelineChange(reel, changed, { footageMsById: { A: 8042 } }).tracks.video[0];
    expect(A.kind === 'broll' && A.sourceOutMs).toBe(8042);
    expect(A.endMs).toBe(5367 + 8042);
  });

  it('honestly caps a BROLL whose config sourceOutMs overshoots the real file', () => {
    // The seg-002 drift: config claims 10300ms but the file is 10042ms. Trimming
    // then extending back cannot restore footage that does not exist — it caps at
    // the real file end (self-healing the 258ms of phantom the config authored).
    const reel = videoReel('broll'); // endMs 15667, sourceOutMs 10300, file 10042
    const shortened = applyTimelineChange(reel, dragEdge(reel, 5.367, 13), { footageMsById: { A: 10042 } }).tracks.video[0];
    expect(shortened.endMs).toBe(13000);
    const restored = applyTimelineChange(
      { ...reel, tracks: { ...reel.tracks, video: [shortened] } },
      dragEdge(reel, 5.367, 15.667), // try to pull back to the authored length
      { footageMsById: { A: 10042 } },
    ).tracks.video[0];
    expect(restored.endMs).toBe(5367 + 10042); // capped at the real file end (15409), not 15667
    expect(restored.kind === 'broll' && restored.sourceOutMs).toBe(10042);
  });

  it('leaves a still/generated BROLL (unknown duration) uncapped', () => {
    const reel = videoReel('broll', { sourceOutMs: 6000, endMs: 11367 });
    const changed = dragEdge(reel, 5.367, 20);
    const A = applyTimelineChange(reel, changed, { footageMsById: {} }).tracks.video[0]; // no cap known
    expect(A.kind === 'broll' && A.sourceOutMs).toBe(20000 - 5367); // extends freely
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
