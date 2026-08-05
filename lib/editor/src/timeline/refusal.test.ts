import { describe, it, expect } from 'vitest';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { VideoItemSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { moveRefusal, splitRefusal, duplicateRefusal, deleteRefusal, isSplittableKind } from './refusal';
import { splitItem, duplicateItem, deleteItem, LANES, parseActionId } from './layered-adapter';

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

  // fps: 1000 gives 1ms-per-frame resolution, so these actually discriminate
  // the adapter's `+ 1` / `- 1` tolerance from a plain `<= startMs` /
  // `>= endMs` compare — the frame-30/90-at-30fps cases above land exactly
  // ON the boundary and pass under EITHER version, so they don't prove the
  // tolerance exists. v1 spans 1000-3000ms.
  it('refuses at startMs + 1 (still within the 1ms tolerance band)', () => {
    expect(splitRefusal(REEL, 'video:v1', 1001, 1000)).toBe('playhead-outside-clip');
  });

  it('allows at startMs + 2 (just past the tolerance band)', () => {
    expect(splitRefusal(REEL, 'video:v1', 1002, 1000)).toBeNull();
  });

  it('refuses at endMs - 1 (still within the 1ms tolerance band)', () => {
    expect(splitRefusal(REEL, 'video:v1', 2999, 1000)).toBe('playhead-outside-clip');
  });

  it('allows at endMs - 2 (just before the tolerance band)', () => {
    expect(splitRefusal(REEL, 'video:v1', 2998, 1000)).toBeNull();
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

// ---------------------------------------------------------------------------
// THE GUARANTEE BEHIND THE "NO SILENT REFUSAL" RULE.
//
// For each of splitItem/duplicateItem/deleteItem, this block asserts, over
// every selectable item the fixture reel actually contains: the command
// returns the reel UNCHANGED (by reference identity) if and only if the
// matching predicate above returns a non-null BlockReason. If a command grows
// a new early exit — or an existing one drifts — without its predicate
// agreeing, this is what turns that into a red test instead of a UI that
// quietly does nothing. Do not simplify this into a hand-picked sample: the
// whole point is that a new lane or item kind enters the matrix for free by
// existing in MATRIX_REEL, with no one having to remember to add a case.
//
// Two deliberate exclusions, both explained where they're applied below:
//  - reference identity (`toBe`), not deep equality — see the comment on
//    `expectAgreement`.
//  - only ids that actually exist in MATRIX_REEL's own tracks are used. A
//    selection whose id has gone stale (item already deleted, etc.) is a
//    real no-op path in all three commands, but it is not a "refusal" in the
//    BlockReason sense — there is nothing to tell the user beyond "there's
//    nothing there" — and refusal.ts's predicates correctly return null for
//    it (see the doc comments on splitRefusal/duplicateRefusal). Manufacturing
//    a missing id here would fail the equivalence test for a case the plan
//    explicitly scoped out, not for a real silent refusal.
describe('command/predicate equivalence — every selectable item in a realistic reel', () => {
  const FPS = 1000; // 1 frame == 1ms, so atFrame doubles as atMs with no rounding noise.

  // A reel that exercises every lane and, on the video track, every kind the
  // schema allows (clip/broll/multi-clip/card/photo/outro) — so a new kind
  // added to the schema without a matching split/duplicate/delete rule shows
  // up here automatically, not just in a hand-maintained list.
  const MATRIX_REEL: LayeredReel = {
    version: 'layered-1',
    meta: { topic: 'Matrix fixture', totalDurationMs: 14000 },
    tracks: {
      video: [
        // Non-cut transitionOut so the transitions-lane cases below exercise
        // a real field change, not a spread that happens to be deep-equal to
        // the input (see the `toBe`-not-`toEqual` note on `expectAgreement`).
        { id: 'clip-1', kind: 'clip', startMs: 0, endMs: 2000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 2000, transitionOut: { kind: 'dissolve', frames: 6 } },
        // transitionOut explicitly a cut (not merely absent) — this is what
        // actually exercises the toBe-not-toEqual trap: deleteItem's
        // transitions branch always rebuilds this field as `{kind: 'cut'}`,
        // so when it was ALREADY exactly that, the resulting reel is
        // deep-equal to the input despite being a genuinely new object. A
        // deep-equality assertion would misread that as "unchanged" and
        // disagree with deleteRefusal (which never refuses the transitions
        // lane); reference identity does not have this blind spot.
        { id: 'broll-1', kind: 'broll', startMs: 2000, endMs: 4000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 2000, transitionOut: { kind: 'cut' } },
        { id: 'multi-1', kind: 'multi-clip', startMs: 4000, endMs: 6000, layout: 'split-h', sources: [{ source: 'c.mp4', sourceInMs: 0, sourceOutMs: 2000 }] },
        { id: 'card-1', kind: 'card', cardKind: 'stat', startMs: 6000, endMs: 8000 },
        { id: 'photo-1', kind: 'photo', startMs: 8000, endMs: 10000, source: 'd.jpg' },
        { id: 'outro-1', kind: 'outro', startMs: 10000, endMs: 14000, transitionIn: { kind: 'wipe', frames: 6 } },
      ],
      audio: [
        { id: 'audio-linked', startMs: 0, endMs: 2000, source: 'a.mp3', sourceInMs: 0, followsVideoId: 'clip-1' },
        { id: 'audio-unlinked', startMs: 8000, endMs: 10000, source: 'e.mp3', sourceInMs: 0 },
      ],
      music: { baseVolumeDb: -8 },
      overlays: [
        { id: 'ov-1', startMs: 0, endMs: 2000, content: { kind: 'title', text: 'A' } },
        { id: 'ov-2', startMs: 4000, endMs: 6000, content: { kind: 'chevron', text: 'B' } },
      ],
      brand: [
        { id: 'wm', kind: 'watermark', startMs: 0, endMs: 14000 },
        { id: 'disclaimer', kind: 'disclaimer', startMs: 0, endMs: 14000 },
      ],
    },
  };

  interface ItemRef {
    selectedId: string;
    // Present for every item that has a timeline span, so a before/inside/after
    // playhead can be derived; absent only for the music singleton.
    startMs?: number;
    endMs?: number;
  }

  // Every selectable id MATRIX_REEL actually contains, built from its own
  // tracks — never hand-listed. `video` items also yield the two derived
  // transitions-lane selections (`transition:`/`transition-in:`) since those
  // are valid selections for any existing video item id regardless of
  // whether that item currently carries a transitionOut/In.
  function collectItemRefs(reel: LayeredReel): ItemRef[] {
    const refs: ItemRef[] = [];
    for (const v of reel.tracks.video) {
      refs.push({ selectedId: `video:${v.id}`, startMs: v.startMs, endMs: v.endMs });
      refs.push({ selectedId: `transition:${v.id}`, startMs: v.startMs, endMs: v.endMs });
      refs.push({ selectedId: `transition-in:${v.id}`, startMs: v.startMs, endMs: v.endMs });
    }
    for (const a of reel.tracks.audio) refs.push({ selectedId: `audio:${a.id}`, startMs: a.startMs, endMs: a.endMs });
    for (const o of reel.tracks.overlays) refs.push({ selectedId: `overlays:${o.id}`, startMs: o.startMs, endMs: o.endMs });
    for (const b of reel.tracks.brand) refs.push({ selectedId: `brand:${b.id}`, startMs: b.startMs, endMs: b.endMs });
    refs.push({ selectedId: 'music:base' }); // the singleton bed — no span
    return refs;
  }

  const REFS = collectItemRefs(MATRIX_REEL);

  // MAKES THE COMMENTS ABOVE TRUE, NOT JUST ASPIRATIONAL. Nothing about
  // MATRIX_REEL or collectItemRefs derives from the schema/LANES themselves
  // — both are hand-written — so without these two checks, a new video kind
  // or a new lane would silently NOT enter the matrix, which is exactly the
  // staleness this task exists to prevent. These fail the day someone adds a
  // kind/lane without updating the fixture, which is the whole point: the
  // fixture is required to be complete, not merely complete today.
  it('the fixture covers every video kind the schema allows (fails if a kind is added without updating MATRIX_REEL)', () => {
    const schemaKinds = new Set(VideoItemSchema.options.map((o) => (o.shape.kind as { value: string }).value));
    const fixtureKinds = new Set(MATRIX_REEL.tracks.video.map((v) => v.kind));
    expect(fixtureKinds).toEqual(schemaKinds);
  });

  it('the fixture covers every lane (fails if a lane is added without updating collectItemRefs)', () => {
    const fixtureLanes = new Set(REFS.map((r) => parseActionId(r.selectedId).lane));
    expect(fixtureLanes).toEqual(new Set(LANES));
  });

  // `layered-adapter.ts`'s splitItem throws if it ever resolves an item
  // `isSplittableKind` rejects after `splitRefusal` already allowed it (fix
  // round 1, Finding 2). There is no HONEST way to make that throw actually
  // fire through `splitItem`: splitItem calls `splitRefusal(reel,
  // selectedId, ...)` on the exact same `reel`/`selectedId` it then resolves
  // the item from, and `splitRefusal` computes its 'unsplittable-kind'
  // refusal by calling this SAME `isSplittableKind` — so the two can never
  // disagree by construction, and manufacturing disagreement (e.g.
  // monkey-patching one of them) would be testing a scenario that cannot
  // occur, not the throw. What CAN be tested honestly is the one guarantee
  // the throw's premise actually rests on: that `isSplittableKind` itself
  // correctly separates the six schema kinds. Pinning it directly, over
  // MATRIX_REEL's own one-item-per-kind fixture, is that proof.
  it('isSplittableKind accepts clip/broll and rejects every other schema kind', () => {
    for (const v of MATRIX_REEL.tracks.video) {
      expect(isSplittableKind(v), `kind ${v.kind}`).toBe(v.kind === 'clip' || v.kind === 'broll');
    }
  });

  // Reference identity, not deep equality. `deleteItem` on a
  // `transition:<id>` selection always returns `{...v, transitionOut: {kind:
  // 'cut'}}` for the matched item — a NEW object — even when the field was
  // already a cut, so its deep VALUE can coincidentally equal the input while
  // its IDENTITY correctly does not. `toEqual` would misread that
  // non-refusal as a false "unchanged", so every comparison here is `toBe`.
  function expectAgreement<T>(predicate: T | null, resultReel: LayeredReel, sourceReel: LayeredReel, label: string): void {
    if (predicate !== null) {
      expect(resultReel, `${label}: predicate refused (${String(predicate)}) but the reel changed`).toBe(sourceReel);
    } else {
      expect(resultReel, `${label}: predicate allowed it but the reel is unchanged (silent refusal)`).not.toBe(sourceReel);
    }
  }

  describe('splitItem ⟺ splitRefusal', () => {
    for (const ref of REFS) {
      // Only video-lane items carry a real inside/before/after distinction
      // for the split boundary check; every other lane refuses on `lane`
      // alone before the playhead is even consulted, so one frame per
      // non-video ref is enough to prove the predicate and command agree —
      // looping playhead positions there would just repeat the same case.
      const isVideo = ref.selectedId.startsWith('video:');
      const positions =
        ref.startMs === undefined
          ? [{ label: 'n/a', atMs: 0 }]
          : isVideo
            ? [
                { label: 'before', atMs: ref.startMs - 500 },
                { label: 'inside', atMs: Math.round((ref.startMs + ref.endMs!) / 2) },
                { label: 'after', atMs: ref.endMs! + 500 },
              ]
            : [{ label: 'n/a', atMs: ref.startMs }];

      for (const pos of positions) {
        it(`${ref.selectedId} @ ${pos.label} (${pos.atMs}ms)`, () => {
          const predicate = splitRefusal(MATRIX_REEL, ref.selectedId, pos.atMs, FPS);
          const { reel: result } = splitItem(MATRIX_REEL, ref.selectedId, pos.atMs, FPS);
          expectAgreement(predicate, result, MATRIX_REEL, `splitItem(${ref.selectedId}, ${pos.atMs}ms)`);
        });
      }
    }
  });

  describe('duplicateItem ⟺ duplicateRefusal', () => {
    for (const ref of REFS) {
      it(ref.selectedId, () => {
        const predicate = duplicateRefusal(MATRIX_REEL, ref.selectedId);
        const { reel: result } = duplicateItem(MATRIX_REEL, ref.selectedId);
        expectAgreement(predicate, result, MATRIX_REEL, `duplicateItem(${ref.selectedId})`);
      });
    }
  });

  describe('deleteItem ⟺ deleteRefusal', () => {
    for (const ref of REFS) {
      it(ref.selectedId, () => {
        const predicate = deleteRefusal(MATRIX_REEL, ref.selectedId);
        const result = deleteItem(MATRIX_REEL, ref.selectedId);
        expectAgreement(predicate, result, MATRIX_REEL, `deleteItem(${ref.selectedId})`);
      });
    }
  });
});
