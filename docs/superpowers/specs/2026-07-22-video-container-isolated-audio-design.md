# Video Container Contract + Isolated Audio — Design

**Date:** 2026-07-22
**Branch:** `feat/reel-editor-skeleton`
**Status:** approved (design), pending plan

## Goal

Correct the layered reel model so that (1) `clip` / `broll` / `multi-clip`
stay as distinct kinds but satisfy one shared **video-container contract**,
and (2) **audio is fully isolated on the audio track** — the `audioMode` flag
on video items is removed, and the only coupling back to a clip is the
existing optional `AudioItem.followsVideoId` binding. As a direct consequence,
**multi-clip audio works the same way as broll** (via audio-track items),
which it does not today.

## Motivation

The old segment model fused video and audio into one segment, so `audioMode`
was the glue that told the renderer how a segment's sound related to
narration:

- **broll** `audioMode ∈ { silent, extend-previous, inherit-from-clip }`
  (+ `audioSource`, `audioStartSec`) — about *inheriting narration*.
- **multi-clip** `audioMode ∈ { first, mix, silent }` — about *which source's
  audio plays*.

These are two different, incompatible enums bolted onto one field. Worse, the
current derivation emits **no audio item at all for multi-clip** — so a
multi-clip's `first`/`mix` audio is silently dropped in the layered model
(parity holds for pp-05 only because its single multi-clip is `silent`).

The layered model already has a **separate audio track** of independent
`AudioItem`s, and it already carries an optional `followsVideoId` link. So the
audio behaviour is already expressible *without* `audioMode`: it is simply
"which audio items exist, where they sit, and whether they are bound to a
clip". `audioMode` is therefore obsolete — a redundant, per-kind-divergent
coupling that the track model supersedes.

The user's framing (verbatim intent): *broll is essentially a container —
inside can be a cutaway, a multi-clip, or an AI visualization*; *audioMode is
obsolete because we already have a separate audio track*; *audio should work
in isolation, we just need to be able to bind it to a clip in some
situations*; and the kinds should share *an interface they must satisfy but
otherwise stay solo*.

## The target model

### 1. Video-container contract (kinds stay solo)

`clip` / `broll` / `multi-clip` / `card` / `outro` remain distinct
discriminated kinds. They share one **contract** — a common base every kind
extends — expressed as a Zod discriminated union over a shared base object,
`VideoContainerBase`:

```ts
// shared contract — every video track item satisfies this
const VideoContainerBase = z.object({
  id: z.string(),
  ...TimeSpan,                       // startMs, endMs
  focalX, focalY, crop, grade,       // framing (all optional)
  effects: z.array(EffectSchema).optional(),   // ken-burns, blend, ai-gen, …
  musicBoostDb: z.number().optional(),         // this item's music-envelope contribution
  transitionOut: z.record(...).optional(),
  // NB: NO audio fields. The contract forbids audioMode/audioSource/etc.
});

const ClipItem      = VideoContainerBase.extend({ kind: z.literal('clip'),  source, sourceInMs, sourceOutMs });
const BrollItem     = VideoContainerBase.extend({ kind: z.literal('broll'), source, sourceInMs, sourceOutMs, aiGenerated: z.boolean().optional() });
const MultiClipItem = VideoContainerBase.extend({ kind: z.literal('multi-clip'), layout, sources: z.array(SubSource) });
const CardItem      = VideoContainerBase.extend({ kind: z.literal('card'),  cardKind, cardProps, pattern });
const OutroItem     = VideoContainerBase.extend({ kind: z.literal('outro') });

export const VideoItemSchema = z.discriminatedUnion('kind', [
  ClipItem, BrollItem, MultiClipItem, CardItem, OutroItem,
]);
```

`SubSource` = `{ source, sourceInMs, sourceOutMs, label?, zoom? }` (already in
the schema). This replaces today's single permissive `VideoItemSchema` where
every field is optional and `kind` is a bare enum. The contract is now
type-enforced per kind ("solo") while the shared base is the interface they
all satisfy.

**Key change to the contract: `audioMode` is deleted from every video item.**

### 2. Audio is isolated, with an optional bind to a clip

All sound lives on the **audio track** as `AudioItem`s. The `AudioItem` schema
is unchanged — it already models everything needed:

```ts
AudioItem = { id, startMs, endMs, source, sourceInMs, volumeDb?, mute?, followsVideoId? }
```

- Span is `startMs..endMs`; `sourceInMs` is the slippable in-point (no
  `sourceOutMs` — duration is the span). Unchanged.
- **`followsVideoId` is the bind.** Set → the audio item is tied to a clip
  (moves with it in the editor, is the caption source, is kept aligned by
  derivation). Absent → a free-floating audio item (music bed, SFX, VO not
  tied to a specific clip). This is the "bind it to a clip in some situations"
  hook — it already exists; we make it the *sole* coupling mechanism.

The video track renders **muted** (pixels only). Nothing on a video item
describes sound anymore.

### 3. `audioMode` is consumed once, at derivation

`deriveLayered` (old → layered) is the only place old `audioMode` is read. It
translates it into audio-track items + `musicBoostDb`, then the flag is gone:

| old segment audio         | → layered audio-track result                                             |
|---------------------------|--------------------------------------------------------------------------|
| clip `voice`              | `AudioItem(source, sourceInMs=trimIn, followsVideoId=seg.id)`             |
| clip `silent`             | none                                                                      |
| broll `inherit-from-clip` | `AudioItem(audioSource, sourceInMs=audioStartSec, followsVideoId=seg.id)` |
| broll `extend-previous`   | extend the previous `AudioItem.endMs` to cover this item's span          |
| broll `silent`            | none                                                                      |
| **multi-clip `first`**    | **`AudioItem(sources[0].source, sourceInMs=sources[0].trimIn, followsVideoId=seg.id)`** |
| **multi-clip `mix`**      | **one `AudioItem` per source** (`id: ${seg.id}-audio-${i}`), each bound   |
| **multi-clip `silent`**   | none                                                                      |
| any `silent` / no source  | no phantom item                                                          |

`musicBoostDb` is still computed at derivation from the old type + audioMode
(`musicBoostDbFor`) and baked onto the item — no runtime `audioMode` needed.
The `-audio` id convention and `followsVideoId` binding are unchanged for
clip/broll (already implemented); multi-clip `first`/`mix` are the new rows.

The clip/broll rows already work; **only the three multi-clip rows are new
behaviour** (today multi-clip emits nothing).

### 4. Composition (`LayeredCampaignReel`)

- **Video track:** each container renders muted — single `<OffthreadVideo>`
  (clip/broll) or a layout of muted `<OffthreadVideo>`s (multi-clip). The
  brand segment components (`ClipSegment`/`BrollSegment`/`MultiClipSegment`,
  which live in the brand repo, not core) are driven into their existing
  muted path (they already mute on `audioMode: 'silent'`), so no audio comes
  from the video track. Their own internal `<Audio>` (broll inherit path) is
  no longer used.
- **Audio track (new):** the composition renders `reel.tracks.audio` itself —
  each `AudioItem` as `<Sequence from={msToFrames(startMs)} durationInFrames={span}><Audio src startFrom={sourceInMs} volume={…} /></Sequence>`.
  This is the single source of all narration/inherited/mixed sound.
- **Music:** unchanged (top-level `<Audio>` with the derived envelope).
- **Captions:** derived from the **bound audio item** (`followsVideoId`) +
  transcript window, not from `audioMode`. A clip/broll with a bound audio
  item gets captions from that item's source; no bound item → no captions.
  Multi-clip keeps today's behaviour (no captions).

This is the behavioural heart of the change — the audio rendering path moves
from segment-internal (reconstructed via `audioMode`) to top-level
track-driven — so **pilot render audio parity must be verified** (the
pp-namesti-republiky reel uses voice + inherit-from-clip + extend-previous).

### 5. Editor

Mostly already done:
- The inspector already dropped the `audioMode` field.
- The audio track already renders with waveforms + a volume line.
- `followsVideoId` already drives nothing in the UI beyond derivation; the
  editor's absolute-placement model means a bound audio item and its clip are
  moved independently on their lanes today. Making the bound audio *follow* a
  moved clip in the editor is **out of scope here** (a later timeline-UX
  task) — this spec only removes `audioMode` and isolates the audio data +
  render path. The adapter/inspector must still compile against the new
  discriminated-union `VideoItem` type.

## Schema changes (concrete)

`lib/reel-config-base/layered-schema.ts`:
- Introduce `VideoContainerBase` and rebuild `VideoItemSchema` as a
  `z.discriminatedUnion('kind', [...])` of per-kind extensions.
- **Remove** `audioMode` from video items.
- Move per-kind-only fields onto their kind (e.g. `sources`/`layout` only on
  multi-clip; `source`/`sourceInMs`/`sourceOutMs` on clip/broll; `cardKind`
  etc. on card) instead of all-optional-on-one-object.
- `AudioItem`, `OverlayItem`, `BrandLayerItem`, `MusicLayer` unchanged.

Consumers that switch on `item.kind` (composition `renderVideoItem`, the
timeline adapter, the inspector) get stronger types; narrow before accessing
kind-specific fields.

## Derivation changes (concrete)

`lib/reel-config-base/derive-layered.ts`:
- Stop emitting `audioMode` onto the layered video item (drop the
  `...(seg.audioMode !== undefined ? { audioMode } : {})` spreads in
  `buildVideoItem`).
- Extend the audio loop to handle `multi-clip`: `first` → one bound
  `AudioItem`; `mix` → one bound `AudioItem` per source; `silent` → none.
- Keep `musicBoostDbFor` as-is (it already reads the old segment fields).

## Migration / parity strategy

- Same staged-derivation approach as sub-spec 1: old configs derive into the
  new model; the pilot (`pp-namesti-republiky`) is the parity yardstick.
- **Render-parity gate:** re-render the pilot and confirm the audio is
  unchanged (voice + inherit-from-clip + extend-previous all still sound
  correct) and the video frames remain matched. Byte-identical video frames
  are expected (video path only loses its now-unused audio); audio is the
  focused check.
- No client project is flipped in this spec (still deferred, per the rollout
  ledger). This spec makes the *model* correct; flips remain a separate,
  human-supervised step.

## Testing strategy

- Rework `lib/editor/src/derive-layered.test.ts`: the multi-clip block
  currently asserts *"multi-clip never emits an audio item"* — that encodes
  the **wrong** behaviour and must be rewritten. New assertions:
  - multi-clip `first` → exactly one bound `AudioItem` (source = sources[0],
    `followsVideoId` = seg id, span = video span, `sourceInMs` = trimIn).
  - multi-clip `mix` → one bound `AudioItem` per source, ids
    `${id}-audio-${i}`.
  - multi-clip `silent` → no audio item (this row stays).
  - no video item carries `audioMode` anymore.
- Keep the existing clip/broll audio derivation tests green (their rows are
  unchanged).
- `layered-schema.test.ts`: the discriminated union parses each kind; a video
  item with `audioMode` is either stripped or rejected (assert the field is
  gone from the type).
- Full core suite + `tsc` green.

## Out of scope / deferred

- **Real transitions in absolute placement** (crossfade/glitch/wipe) — still
  deferred (see memory `absolute-mode-real-transitions`).
- **Audio-follows-clip in the timeline UI** (a bound audio item moving when
  its clip is dragged) — later timeline-UX task; this spec only isolates the
  data + render path.
- **Client-project flips** — still human-supervised, separate from this spec.

## Risks

- The audio render path change (segment-internal → top-level track) is the
  main risk; mitigated by the pilot render-parity gate.
- The schema becomes a discriminated union; every `item.kind` consumer must
  narrow correctly. `tsc` is the backstop; the plan touches adapter +
  inspector + composition together.
