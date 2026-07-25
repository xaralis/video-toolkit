# Video Container Contract + Isolated Audio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `clip`/`broll`/`multi-clip` solo kinds that share one video-container contract, delete the obsolete `audioMode` from the layered model, isolate all sound on the audio track (bound to a clip only via `AudioItem.followsVideoId`), and derive multi-clip audio to bound audio items like broll.

**Architecture:** The layered `VideoItemSchema` becomes a `z.discriminatedUnion('kind', …)` over a shared `VideoContainerBase` (the contract). `deriveLayered` stops emitting `audioMode` and translates old multi-clip `first`/`mix`/`silent` into audio-track items. The pilot composition renders the audio track itself (top-level `<Audio>` per item), drives video segments muted, and derives captions from the bound audio item.

**Tech Stack:** TypeScript, Zod, Vitest, Remotion (pilot composition).

## Global Constraints

- Editor/model visible strings stay English.
- No `Co-Authored-By` in commits.
- `audioMode` is removed from the **layered** model only. The **old** segment schemas (`base-types.ts`, `segment-base-schemas.ts`, the template `schema.ts`, the old `Inspector.tsx`) keep `audioMode` — derivation reads it. Do not touch the old segment model.
- Per-source `zoom` on multi-clip must survive (already fixed; keep it).
- `AudioItem` id convention: `${seg.id}-audio` (single) / `${seg.id}-audio-${i}` (per-source). Bound items set `followsVideoId: seg.id`.
- Core suite + `tsc` green at each task boundary (branch latitude allows transient breakage mid-task, but each task ends green).

---

### Task 1: Layered schema — discriminated-union contract + remove `audioMode`

**Files:**
- Modify: `lib/reel-config-base/layered-schema.ts`
- Modify: `lib/reel-config-base/derive-layered.ts` (drop the three `audioMode` spreads in `buildVideoItem` so it compiles against the union)
- Modify (only if `tsc` requires narrowing): `lib/editor/app/timeline/layered-adapter.ts`, `lib/editor/app/LayeredInspector.tsx`
- Test: `lib/editor/src/layered-schema.test.ts`

**Interfaces:**
- Produces: `VideoItemSchema` = discriminated union over `kind`; `VideoItem` type is now a union with kind-specific fields. Shared base fields: `id, startMs, endMs, focalX, focalY, crop, grade, effects, musicBoostDb, transitionOut`. Per kind: clip/broll → `source, sourceInMs, sourceOutMs` (broll also `aiGenerated?`); multi-clip → `layout, sources`; card → `cardKind, cardProps?, pattern?`; outro → none. **No `audioMode` anywhere.**

- [ ] **Step 1: Write the failing schema tests**

Add to `lib/editor/src/layered-schema.test.ts`:

```ts
import { VideoItemSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

describe('VideoItemSchema — container contract', () => {
  const base = { id: 'x', startMs: 0, endMs: 1000 };
  it('parses each kind', () => {
    expect(() => VideoItemSchema.parse({ ...base, kind: 'clip', source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1000 })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'broll', source: 'b.mp4', sourceInMs: 0, sourceOutMs: 1000, aiGenerated: true })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'multi-clip', layout: 'split-h', sources: [{ source: 'a', sourceInMs: 0, sourceOutMs: 100, zoom: 3 }] })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'card', cardKind: 'claim-plate' })).not.toThrow();
    expect(() => VideoItemSchema.parse({ ...base, kind: 'outro' })).not.toThrow();
  });
  it('strips/rejects audioMode — it is not part of the contract', () => {
    const parsed = VideoItemSchema.parse({ ...base, kind: 'clip', source: 'a', sourceInMs: 0, sourceOutMs: 1, audioMode: 'voice' });
    expect('audioMode' in parsed).toBe(false); // unknown key stripped by zod
  });
  it('a clip cannot carry multi-clip-only fields (contract is per-kind)', () => {
    const parsed = VideoItemSchema.parse({ ...base, kind: 'clip', source: 'a', sourceInMs: 0, sourceOutMs: 1, layout: 'split-h' } as never);
    expect('layout' in parsed).toBe(false);
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd lib/editor && npx vitest run src/layered-schema.test.ts`
Expected: FAIL (today's flat schema keeps `audioMode` and any field).

- [ ] **Step 3: Rebuild `VideoItemSchema` as a discriminated union**

In `lib/reel-config-base/layered-schema.ts`, replace the current `VideoItemSchema` object with:

```ts
const SubSource = z.object({
  source: z.string(),
  sourceInMs: Ms,
  sourceOutMs: Ms,
  label: z.string().optional(),
  zoom: z.number().optional(),
});

// Shared video-container contract — every video track item satisfies this.
// NB: NO audio fields. Sound lives on the audio track (see AudioItemSchema);
// the only link back to a clip is AudioItem.followsVideoId.
const VideoContainerBase = {
  id: z.string(),
  ...TimeSpan,
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  crop: z.record(z.string(), z.unknown()).optional(),
  grade: z.record(z.string(), z.unknown()).optional(),
  effects: z.array(EffectSchema).optional(),
  musicBoostDb: z.number().optional(),
  transitionOut: z.record(z.string(), z.unknown()).optional(),
};

export const VideoItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...VideoContainerBase, kind: z.literal('clip'), source: z.string(), sourceInMs: Ms, sourceOutMs: Ms }),
  z.object({ ...VideoContainerBase, kind: z.literal('broll'), source: z.string(), sourceInMs: Ms, sourceOutMs: Ms, aiGenerated: z.boolean().optional() }),
  z.object({ ...VideoContainerBase, kind: z.literal('multi-clip'), layout: z.enum(['split-h', 'split-v', 'pip', 'quad']), sources: z.array(SubSource) }),
  z.object({ ...VideoContainerBase, kind: z.literal('card'), cardKind: z.string(), cardProps: z.record(z.string(), z.unknown()).optional(), pattern: z.string().optional() }),
  z.object({ ...VideoContainerBase, kind: z.literal('outro') }),
]);
```

Keep `export type VideoItem = z.infer<typeof VideoItemSchema>;` (now a union).

- [ ] **Step 4: Drop `audioMode` emission in `buildVideoItem`**

In `lib/reel-config-base/derive-layered.ts`, remove the three
`...(seg.audioMode !== undefined ? { audioMode: seg.audioMode } : {})` spreads
(clip, broll, multi-clip branches). Also make multi-clip always set `layout`
and `sources` (they are required on the union; the old multi-clip schema
requires them): change `...(seg.layout !== undefined ? { layout } : {})` →
`layout: (seg.layout ?? 'split-h') as VideoItem['layout' & keyof VideoItem]`
is unnecessary — simply `layout: seg.layout as 'split-h' | 'split-v' | 'pip' | 'quad'`
and `sources: (seg.sources ?? []).map(…)` (keep the existing `.map` incl. the
`zoom` passthrough).

- [ ] **Step 5: Restore `tsc` — narrow kind-specific field access**

Run: `cd lib/editor && npx tsc --noEmit`
Fix every error by narrowing on `item.kind` before accessing kind-specific
fields (`source`/`sources`/`layout`/`cardKind`) in `layered-adapter.ts` and
`LayeredInspector.tsx`. Do not add `audioMode` anywhere. Do not weaken types
with `as any`; use `if (item.kind === 'multi-clip')` narrowing.

- [ ] **Step 6: Run tests + tsc — verify green**

Run: `cd lib/editor && npx vitest run && npx tsc --noEmit`
Expected: all pass, tsc clean.

- [ ] **Step 7: Commit**

```bash
git add lib/reel-config-base/layered-schema.ts lib/reel-config-base/derive-layered.ts lib/editor
git commit -m "feat(layered-schema): video-container contract as a discriminated union; remove audioMode"
```

---

### Task 2: Derivation — isolate multi-clip audio onto the audio track

**Files:**
- Modify: `lib/reel-config-base/derive-layered.ts` (audio loop)
- Test: `lib/editor/src/derive-layered.test.ts`

**Interfaces:**
- Consumes: the audio loop's `startMs`, `endMs`, `seg` (see `for (const seg of config.segments)` around line 222), `msFromSec`, `audioItems`.
- Produces: multi-clip `first` → one bound `AudioItem` (`${seg.id}-audio`); `mix` → one bound `AudioItem` per source (`${seg.id}-audio-${i}`); `silent`/unset → none.

- [ ] **Step 1: Write failing tests**

In `lib/editor/src/derive-layered.test.ts`, add fixtures beside `MULTI` and tests inside the `multi-clip segments` describe. Fix the misleading comment on the existing silent test (it is correct *for silent*, not a general rule):

```ts
const MULTI_FIRST = {
  topic: 'Multi-clip first',
  segments: [
    { id: 'seg-mf', type: 'multi-clip', layout: 'split-h', durationMs: 3000, audioMode: 'first',
      sources: [ { source: 'a.MP4', trimIn: 2, trimOut: 5 }, { source: 'b.MP4', trimIn: 0, trimOut: 3 } ] },
    { id: 'seg-z', type: 'outro' },
  ],
};
const MULTI_MIX = {
  topic: 'Multi-clip mix',
  segments: [
    { id: 'seg-mm', type: 'multi-clip', layout: 'quad', durationMs: 3000, audioMode: 'mix',
      sources: [ { source: 'a.MP4', trimIn: 1, trimOut: 4 }, { source: 'b.MP4', trimIn: 0, trimOut: 3 } ] },
    { id: 'seg-z', type: 'outro' },
  ],
};
```

```ts
it("multi-clip 'first' → one audio item bound to the clip (sources[0])", () => {
  const r = deriveLayered(MULTI_FIRST, OPTS);
  expect(r.tracks.audio).toHaveLength(1);
  expect(r.tracks.audio[0]).toMatchObject({
    id: 'seg-mf-audio', source: 'a.MP4', sourceInMs: 2000, startMs: 0, endMs: 3000, followsVideoId: 'seg-mf',
  });
});
it("multi-clip 'mix' → one audio item per source, all bound to the clip", () => {
  const r = deriveLayered(MULTI_MIX, OPTS);
  expect(r.tracks.audio).toHaveLength(2);
  expect(r.tracks.audio.map((a) => a.id)).toEqual(['seg-mm-audio-0', 'seg-mm-audio-1']);
  expect(r.tracks.audio.every((a) => a.followsVideoId === 'seg-mm')).toBe(true);
  expect(r.tracks.audio[1]).toMatchObject({ source: 'b.MP4', sourceInMs: 0 });
});
```

Update the existing silent test's comment from "multi-clip never emits an audio item" to "a **silent** multi-clip emits no audio item (first/mix do — see below)".

- [ ] **Step 2: Run — verify the two new tests fail**

Run: `cd lib/editor && npx vitest run src/derive-layered.test.ts -t "multi-clip"`
Expected: the `first` and `mix` tests FAIL (no audio emitted today); silent test still passes.

- [ ] **Step 3: Add the multi-clip audio branch**

In `lib/reel-config-base/derive-layered.ts`, after the broll audio branch (the block ending `// 'silent' → no audio item` around line 269), add:

```ts
    } else if (seg.type === 'multi-clip' && seg.sources && seg.sources.length > 0) {
      // Multi-clip audio behaves like broll: sound goes to the audio track,
      // bound to the clip. 'first' → sources[0] only; 'mix' → every source;
      // 'silent'/unset → none.
      if (seg.audioMode === 'first') {
        const s = seg.sources[0];
        audioItems.push({
          id: `${seg.id}-audio`, startMs, endMs,
          source: s.source, sourceInMs: msFromSec(s.trimIn), volumeDb: 0, followsVideoId: seg.id,
        });
      } else if (seg.audioMode === 'mix') {
        seg.sources.forEach((s, i) => {
          audioItems.push({
            id: `${seg.id}-audio-${i}`, startMs, endMs,
            source: s.source, sourceInMs: msFromSec(s.trimIn), volumeDb: 0, followsVideoId: seg.id,
          });
        });
      }
    }
```

- [ ] **Step 4: Run tests + tsc — verify green**

Run: `cd lib/editor && npx vitest run src/derive-layered.test.ts && npx tsc --noEmit`
Expected: all multi-clip tests pass; clip/broll rows unchanged; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add lib/reel-config-base/derive-layered.ts lib/editor/src/derive-layered.test.ts
git commit -m "feat(derive-layered): isolate multi-clip audio onto the audio track (first/mix → bound items)"
```

---

### Task 3: Pilot composition — render the audio track; mute video; captions from bound audio

**Files:**
- Modify: `../video-toolkit/projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx`
  (path relative to core; the pilot lives in the sibling brand repo)

**Interfaces:**
- Consumes: `VideoItem` union + `AudioItem` (Task 1), `findAudioItem(reel, id)` (already in the file), `msToFrames` (already defined for the video Sequences), `loadTranscriptSync`, `transcriptWindow`, `staticFile`, `<Audio>`, `<Sequence>`.

- [ ] **Step 1: Read the current file** to confirm `msToFrames`, `findAudioItem`, the `renderVideoItem` switch, the `clipTranscript`/`brollTranscript` helpers, and where music renders (`reel.tracks.music.source && <Audio …>`).

- [ ] **Step 2: Replace the two caption helpers with one bound-audio helper**

Delete `clipTranscript` and `brollTranscript`. Add:

```tsx
// Captions derive from the AUDIO ITEM bound to this video item
// (followsVideoId), not from any per-item audioMode (which no longer exists).
// No bound audio item → no captions.
function boundTranscript(
  item: VideoItem,
  reel: LayeredReel,
): { words: Array<{ start: number; end: number; word: string }> } | undefined {
  const audioItem = findAudioItem(reel, item.id);
  if (!audioItem) return undefined;
  const t = loadTranscriptSync(audioItem.source);
  if (!t) return undefined;
  const startSec = audioItem.sourceInMs / 1000;
  const durationSec = (item.endMs - item.startMs) / 1000;
  const words = transcriptWindow(t, startSec, startSec + durationSec);
  return words.length > 0 ? { words } : undefined;
}
```

- [ ] **Step 3: In `renderVideoItem`, mute every segment and stop passing audio props**

For the `clip`, `broll`, and `multi-clip` cases: set the brand segment object's
own `audioMode` to `'silent'` (this drives the existing muted path in the brand
`ClipSegment`/`BrollSegment`/`MultiClipSegment`), and for broll **remove**
`audioSource`/`audioStartSec` (its internal `<Audio>` must not fire — the top-level
audio track drives sound now). Pass `transcript={boundTranscript(item, reel)}`
for clip and broll (multi-clip keeps no transcript). Remove the now-unused
`item.audioMode` reads. Example (clip):

```tsx
    case 'clip': {
      const titleOverlay = findTitleOverlay(reel, item.id);
      const segment = {
        id: item.id, type: 'clip' as const,
        source: item.source ?? '',
        trimIn: (item.sourceInMs ?? 0) / 1000,
        trimOut: (item.sourceOutMs ?? 0) / 1000,
        audioMode: 'silent' as const, // muted — audio comes from the audio track
        focalX: item.focalX, focalY: item.focalY,
        crop: item.crop as Crop | undefined, grade: item.grade as Grade | undefined,
        overlays: titleOverlay ? [titleOverlaySpec(titleOverlay, item)] : undefined,
      };
      return <ClipSegment segment={segment} chevron={chevron} transcript={boundTranscript(item, reel)} />;
    }
```

Apply the analogous change to `broll` (drop `audioSource`/`audioStartSec`,
`audioMode: 'silent'`, `transcript={boundTranscript(item, reel)}`) and
`multi-clip` (`audioMode: 'silent'`). Narrow on `item.kind` as needed for the
union types.

- [ ] **Step 4: Render the audio track at top level**

Near where music renders in the main component, add (define `dbToLinear` once if not present):

```tsx
const dbToLinear = (db: number) => Math.pow(10, db / 20);
```

```tsx
{reel.tracks.audio.map((a) => {
  const from = msToFrames(a.startMs);
  const durationInFrames = Math.max(1, msToFrames(a.endMs) - from);
  return (
    <Sequence key={a.id} from={from} durationInFrames={durationInFrames}>
      <Audio
        src={staticFile(a.source)}
        startFrom={msToFrames(a.sourceInMs)}
        volume={a.mute ? 0 : dbToLinear(a.volumeDb ?? 0)}
      />
    </Sequence>
  );
})}
```

- [ ] **Step 5: Typecheck the pilot**

Run: `cd ../video-toolkit/projects/pp-namesti-republiky && npx tsc --noEmit`
Expected: clean. Fix union-narrowing errors; do not reference `audioMode` on layered items.

- [ ] **Step 6: Commit** (in the brand repo working tree)

```bash
git -C ../video-toolkit add projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx
git -C ../video-toolkit commit -m "feat(pilot): render audio track top-level; mute video; captions from bound audio"
```

---

### Task 4: Pilot render-parity verification

**Files:** none (verification only). Produces a go/no-go on the audio isolation.

- [ ] **Step 1: Render the pilot**

Run (from the pilot dir): `npm run render` (or the project's render script). If footage isn't synced locally, run `/toolkit:sync pull pp-namesti-republiky` first.

- [ ] **Step 2: Verify audio**

Confirm the rendered reel's audio is correct end-to-end: the voice clip narration plays, the inherit-from-clip broll continues the prior narration, and extend-previous still covers its span. Compare against the pre-change render (or the last known-good in R2/`out/`).

- [ ] **Step 3: Spot-check video frames**

Video pixels should be unchanged (the video track only lost its now-unused native audio). A few sampled frames should match the prior render.

- [ ] **Step 4: Record the result** in `.superpowers/sdd/progress.md` (audio parity PASS/FAIL + notes). If FAIL, capture the exact symptom for a fix task; do not mark the sub-spec complete.

---

## Self-Review

- **Spec coverage:** schema contract (Task 1), audioMode removal (Task 1), multi-clip audio isolation (Task 2), composition top-level audio + muted video + bound-audio captions (Task 3), parity gate (Task 4). All spec sections covered.
- **Types:** `VideoItem` is a union after Task 1; Tasks 2–3 narrow on `kind`. `AudioItem` unchanged (`followsVideoId`, `volumeDb`, `mute`, `sourceInMs`, span via start/end).
- **No placeholders:** every code step carries real code; Task 4 is verification with concrete checks.
- **Deferred (not in this plan):** real transitions in absolute mode; audio-follows-clip in the timeline UI; client-project flips.
