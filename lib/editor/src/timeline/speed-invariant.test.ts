import { describe, it, expect } from 'vitest';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { deriveSpeed } from '@video-toolkit/lib/reel-config-base/speed';
import { layeredToTimeline, applyTimelineChange, splitItem, slipVideoItem } from './layered-adapter';

// THE invariant this whole change exists to hold: a clip's playback speed is
// the ratio of its two spans, the AUTHOR sets it, and no edge edit is a speed
// edit. Stated once here, as a table over every operation that touches an
// edge or a source window, so a sixth such site added later fails a test that
// already exists rather than needing one written for it.
//
// `setItemSpeed` is deliberately ABSENT: it is the one operation allowed to
// change the speed. Adding it here would be asserting the opposite of its job.

const FOOTAGE = 20000;

// 8 SECONDS of timeline, on purpose. `deriveSpeed` snaps to exactly 1x when
// the two spans disagree by less than half a frame (SPEED_SNAP_MS, 16.67ms),
// so a short fixture makes a genuinely authored ratio read as 1x and the
// whole table passes for the wrong reason. At 0.5x/2x these spans differ by
// 4000/8000ms — three orders of magnitude outside the snap window.
const at = (speed: number): VideoItem => ({
  id: 'v1',
  kind: 'broll',
  startMs: 4000,
  endMs: 12000,
  source: 'br.mp4',
  sourceInMs: 2000,
  sourceOutMs: 2000 + 8000 * speed,
});

const reelWith = (v: VideoItem): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 'Fixture', totalDurationMs: 30000 },
  tracks: { video: [v], audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
});

const footage = { footageMsById: { v1: FOOTAGE } };

// A real trim goes through `applyTimelineChange` (there is no `resizeItem`
// export) — same idiom the sibling trim tests use: build the editor rows the
// timeline would emit, move one item's edges, commit.
const trim = (v: VideoItem, startMs: number, endMs: number): VideoItem[] => {
  const reel = reelWith(v);
  const { editorData } = layeredToTimeline(reel, 30);
  const rows = editorData.map((row) =>
    row.id === 'video'
      ? { ...row, actions: row.actions.map((a) => ({ ...a, start: startMs / 1000, end: endMs / 1000 })) }
      : row,
  );
  return applyTimelineChange(reel, rows, footage).tracks.video;
};

const spans = (v: VideoItem) => v as VideoItem & { sourceInMs: number; sourceOutMs: number };

const OPERATIONS: Array<{ name: string; apply: (v: VideoItem) => VideoItem[] }> = [
  {
    name: 'trim the right edge outward',
    apply: (v) => trim(v, v.startMs, v.endMs + 3000),
  },
  {
    name: 'trim the right edge inward',
    apply: (v) => trim(v, v.startMs, v.endMs - 3000),
  },
  {
    name: 'trim the left edge outward',
    apply: (v) => trim(v, v.startMs - 1000, v.endMs),
  },
  {
    name: 'trim the left edge inward',
    apply: (v) => trim(v, v.startMs + 1000, v.endMs),
  },
  {
    name: 'trim past the end of the footage',
    apply: (v) => trim(v, v.startMs, v.endMs + 999999),
  },
  {
    // Timeline midpoint of the 4000..12000ms item is 8000ms = frame 240 at 30fps.
    name: 'split at the midpoint',
    apply: (v) => splitItem(reelWith(v), 'video:v1', 240, 30).reel.tracks.video,
  },
  {
    // `footageMsById` is a POSITIONAL bare record here, not an options object.
    name: 'slip the media forward',
    apply: (v) => slipVideoItem(reelWith(v), 'v1', 500, { v1: FOOTAGE }).tracks.video,
  },
  {
    name: 'slip the media backward',
    apply: (v) => slipVideoItem(reelWith(v), 'v1', -500, { v1: FOOTAGE }).tracks.video,
  },
];

describe.each([0.5, 1, 2])('at %sx speed', (speed) => {
  it.each(OPERATIONS.map((o) => [o.name, o] as const))('%s preserves the speed', (_name, op) => {
    const before = at(speed);
    const after = op.apply(before);
    expect(after.length).toBeGreaterThan(0);
    for (const item of after) {
      expect(deriveSpeed(spans(item))).toBeCloseTo(speed, 5);
    }
  });
});

// Guards the table above against passing VACUOUSLY: an operation that returned
// its input unchanged would preserve the speed trivially and prove nothing at
// all. If one of these ever goes red, the fixture stopped exercising that
// operation (a split frame outside the clip, a slip clamped to zero) — fix the
// fixture, never delete the case.
//
// Run at EVERY speed, not just one, because the clamps that could silently
// neuter a case are themselves speed-dependent: `headroomTimelineMs` is
// `sourceInMs / speed`, so the head shrinks as the clip speeds up and the
// left-outward drag has the least room at 2x (1000ms of head for a 1000ms
// drag). Checking non-vacuity at a single speed would leave exactly the
// tightest case unwatched.
describe.each([0.5, 1, 2])('at %sx speed, the operations actually did something', (speed) => {
  it.each(OPERATIONS.map((o) => [o.name, o] as const))('%s changes the item', (_name, op) => {
    const before = spans(at(speed));
    const after = op.apply(before);
    const changed = after.some((x) => {
      const s = spans(x);
      return (
        s.startMs !== before.startMs ||
        s.endMs !== before.endMs ||
        s.sourceInMs !== before.sourceInMs ||
        s.sourceOutMs !== before.sourceOutMs
      );
    });
    expect(changed).toBe(true);
  });
});
