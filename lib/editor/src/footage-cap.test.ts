import { describe, it, expect } from 'vitest';
import { footageCapsById } from './timeline/footage-cap';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

const clip = (id: string, source: string, sourceOutMs: number) =>
  ({ id, kind: 'clip', source, startMs: 0, endMs: 1000, sourceInMs: 0, sourceOutMs }) as unknown as
    LayeredReel['tracks']['video'][number];

const reelOf = (...video: LayeredReel['tracks']['video']): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 't', totalDurationMs: 1000 },
    tracks: { video, audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
  }) as LayeredReel;

const url = (i: { kind: string; source?: string }) => i.source;

describe('footageCapsById', () => {
  it('takes the decoded file duration when it is all there is', () => {
    const reel = reelOf(clip('v1', 'a.mp4', 4000));
    expect(footageCapsById(reel, null, { 'a.mp4': 9000 }, url)).toEqual({ v1: 9000 });
  });

  // The real case this rule exists for: seg-002 in pp-program-bydleni holds its
  // last frame past the file end (file 10.042s, authored 10.3s). Capping at the
  // decoded duration alone would make that clip un-restorable once trimmed.
  it('keeps an AUTHORED out-point that runs past the file as the ceiling', () => {
    const reel = reelOf(clip('v1', 'a.mp4', 8000));
    const saved = reelOf(clip('v1', 'a.mp4', 10300));
    expect(footageCapsById(reel, saved, { 'a.mp4': 10042 }, url)).toEqual({ v1: 10300 });
  });

  // A clip added THIS session has no decoded duration and is not in the saved
  // reel, so its length is genuinely unknown and it must NOT be clamped. The
  // timeline used to substitute the item's current out-point here — but that is
  // where the out-point sits, not how long the file is. On a clip sped up to
  // 200% it is half the real footage, and using it as a ceiling makes resetting
  // the speed impossible: the restore wants source the guess denies exists.
  it('leaves a clip with no decoded duration and no saved out-point UNCAPPED', () => {
    const reel = reelOf(clip('v1', 'new.mp4', 5000));
    expect(footageCapsById(reel, null, {}, url)).toEqual({});
  });

  it('does not let a sped-up clip’s own out-point become its ceiling', () => {
    // 2x speed: 1500ms of source over a 3000ms slot. The file is 8000ms.
    const reel = reelOf(clip('v1', 'a.mp4', 1500));
    expect(footageCapsById(reel, null, { 'a.mp4': 8000 }, url)).toEqual({ v1: 8000 });
  });

  it('omits an item with no reading at all rather than capping it at zero', () => {
    // Absence is `slipVideoItem`'s contract for "length unknown, do not clamp";
    // a 0 would read as "no footage at all" and pin every edit.
    const reel = reelOf(clip('v1', 'x.mp4', 0));
    expect(footageCapsById(reel, null, {}, url)).toEqual({});
  });

  it('ignores kinds that have no single footage source', () => {
    const card = { id: 'c1', kind: 'card', startMs: 0, endMs: 1000 } as unknown as
      LayeredReel['tracks']['video'][number];
    expect(footageCapsById(reelOf(card), null, {}, url)).toEqual({});
  });

  it('is one reading for every caller — the timeline and the inspector cannot disagree', () => {
    // Both used to derive this themselves and diverged in BOTH directions: the
    // inspector stopped at the decoded duration where the timeline allowed the
    // authored one, and left an unmeasured clip uncapped where the timeline
    // capped it. This test exists to make a second derivation obvious.
    const reel = reelOf(clip('v1', 'a.mp4', 8000), clip('v2', 'new.mp4', 5000));
    const saved = reelOf(clip('v1', 'a.mp4', 10300));
    const caps = footageCapsById(reel, saved, { 'a.mp4': 10042 }, url);
    expect(caps).toEqual({ v1: 10300 });
  });
});
