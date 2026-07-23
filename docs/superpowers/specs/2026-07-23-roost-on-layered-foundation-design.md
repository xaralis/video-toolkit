# Roost on the Layered Foundation — Design

**Status:** approved design, pre-plan
**Date:** 2026-07-23
**Depends on:** the layered-timeline model (`2026-07-22-*`), the campaign-reels
layered renderer (`LayeredCampaignReel`), and photo-segment support (core
`4b01540`).

## Goal

Bring the roost-reels **beat-montage** template onto the **same `LayeredReel`
foundation** that campaign-reels already uses, so roost gets the multi-track
editor, absolute-ms timeline, and shared render primitives — instead of its
bespoke `RoostReel` beat-driven composition. Beats become a **cutting guide
only**: they are consumed at derivation time (beat → absolute ms) and do **not**
survive as structure; they persist solely as **ruler guide markers** for manual
alignment in the editor.

Per the owner's direction, the montage support lands in **core** (shared,
brand-agnostic), not isolated in the roost template — "it's not that different."

## Background — the two models

**Campaign-reels (already layered):** a segment *cut* config
(`{topic, chevron, audio, segments:[clip|broll|multi-clip|card|photo|outro]}`
with `trimIn/trimOut/audioMode`) is compiled by `deriveLayered` into a
`LayeredReel` (absolute-ms items across `video/audio/music/overlays/brand`
tracks) and rendered by `LayeredCampaignReel`.

**Roost-reels (bespoke, NOT layered):** a *beat-montage* config
(`{fps, width, height, track, bpm, vintage, segments:[photo|video], kicks,
teaser, outro, watermark}`) where each segment is placed on musical beats
(`beatStart`/`beatCount`), and `RoostReel` renders it directly with roost's own
components (`BeatMontage`→`MontageClip`/`KenBurnsPhoto`, `TeaserOverlay`,
`Outro`/`LogoReveal`, `Watermark`, `VintageOverlay`, `PaperBackground`). Reel
length is derived from the outro's end.

`deriveLayered` cannot consume the roost config — the segment shapes share no
fields. The mapping needs its own derivation + a roost renderer, both built on
the shared model.

## The mapping (roost config → LayeredReel)

Beat→ms conversion (one constant): `fpb = round(fps·60 / bpm)`, then for a
segment `startMs = round(beatStart·fpb / fps · 1000)`,
`endMs = round((beatStart + beatCount)·fpb / fps · 1000)`.

| Roost concept | → LayeredReel | Notes |
|---|---|---|
| `segment {type:'photo', kenBurns, displayMode}` | `video[] · kind:'photo'` | `kenBurns:{direction}` → `effects:[{type:'ken-burns', direction}]` (permissive effect); `displayMode` → item `props.displayMode` |
| `segment {type:'video', inPointSec, displayMode}` | `video[] · kind:'broll'` (muted) | `inPointSec`→`sourceInMs`; `sourceOutMs = sourceInMs + span`; roost has no voice track → always muted; `displayMode` → `props.displayMode` |
| `transition: cut\|fade` | item `transitionIn`/`transitionOut` | `fade`→`{kind:'fade', frames:6}`; `cut`→omit |
| `track` (music wav) | `tracks.music.source` | last-second fade handled in the renderer |
| `teaser {lines, reveal, fontSize, appearAtSec}` | `overlays[] · content:{kind:'teaser', lines, reveal, fontSize}` | `OverlayContent` is already `z.record` — no schema change; span = `appearAtSec` → `teaserDurationInFrames` |
| `outro {style, variant, transition, logoDelaySec, beatStart}` | `video[] · kind:'outro'` + `props` | reel length derived from the outro's end → `meta.totalDurationMs` (same rule as campaign) |
| `watermark {asset, corner, variant}` | `brand[] · kind:'watermark'` + `props` | spans `[0, transitionStart]` (hides before the outro) |
| `vintage: film\|vhs` (config-level) | **per footage item** `effects:[{type:'vintage', mode}]` | a generic clip effect (like ken-burns), individually adjustable per clip; the roost cut stamps it on **all** footage items by default (see below) — no new schema field |
| `kicks` (onset seconds) | `meta.guidesMs` **and** outro `props.kickFrames` | ruler guides + heartbeat-logo pulse; **non-structural** |

## Architecture

Five parts, four in **core** (shared) and one in the **roost template**:

### 1. Core schema — two generic, optional additions

`lib/reel-config-base/layered-schema.ts`. Both optional, so campaign-reels is
byte-unaffected and any brand can use them:

- `VideoContainerBase.props?: Record<string, unknown>` — a per-item brand
  render-hint bag (roost: `displayMode` on photo/broll, and the outro's
  `style`/`variant`/`transition`/`logoDelaySec`/`kickFrames`). Generic escape
  hatch, mirrors `BrandLayerItemSchema.props`.
- `meta.guidesMs?: number[]` — **guide-only**, non-structural ruler markers.

`OverlayContent` (`z.record`) and `EffectSchema` (`{type}.passthrough()`) are
already permissive — `teaser` overlays, direction-based ken-burns, **and the
`vintage` effect** need no schema change.

**Vintage is a per-clip effect, not a reel-wide treatment.** Each footage item
(photo / broll) carries its own `effects:[{type:'vintage', mode:'film'|'vhs'}]`,
so it is individually adjustable in the editor's effects inspector — the same
generic-clip-effect model as ken-burns (simplification lives in brand
defaults/rules, never special-case fields). Outro and teaser keep their own look
(matching roost's current `film` scoping; the brief `vhs` scanline nuance over
teaser/outro is dropped as an acceptable close-parity simplification). This
removes the reel-wide `meta.treatment` field entirely.

**Applying vintage to all footage by default is a BRAND INSTRUCTION, not a
core-command change.** The core `/cut` command (`commands/cut.md`) is **not**
modified — it already reads `brands/<brand>/BRAND-RULES.md`. The "stamp the
brand's vintage effect on every footage item unless the user says otherwise"
rule is added to roost's brand rules (`brands/roost/BRAND-RULES.md` in the roost
repo, created/extended), which core `/cut` consumes for free. So the
authoring-time default lives in Claude's brand instructions; the one-time
migration derivation (`deriveMontageLayered`) applies the same default to the
existing `roost-reel-01` config by stamping `cfg.vintage` onto every footage
item's `effects`.

### 2. Core montage derivation

`lib/reel-config-base/derive-montage.ts` (new): `deriveMontageLayered(cfg)` →
`LayeredReel`, implementing the mapping table. A sibling to `deriveLayered`
(different input shape, same output), kept in core so the beat→ms compiler is
shared foundation, not brand code. Pure, node-safe (no `remotion` import),
covered by unit tests mirroring `derive-layered.test.ts`.

`deriveMontageLayered(cfg, opts)` takes an `opts` carrying the outro-timing
constants so core does not hardcode roost's render timing:
`opts = { fps, transitionFrames, logoRevealFrames, logoHoldFrames }` (defaulted
to roost's current values 15 / 48 / 60; `fps` from `cfg`). Reel-length rule
(ported from `RoostReel.reelDurationInFrames`, expressed in ms):
`contentEnd = last segment end`; `outroEnter = min(contentEnd,
outro.beatStart·msPerBeat)`; `transitionStart = max(0, outroEnter −
transitionMs)`; `totalMs = transitionStart + logoDelayMs + logoRevealMs +
logoHoldMs`. The outro `video` item spans `[transitionStart, totalMs]`;
`meta.totalDurationMs = totalMs` (last item end, by construction). These same
constants live once and are shared by the renderer, so composition duration and
internal timing never drift (the invariant `RoostReel` documents today).

### 3. Core render primitives — extract the at-the-cut transition engine

`LayeredCampaignReel` already carries a brand-agnostic **at-the-cut transition
engine** (`presentationFor`, `TransitionLayer`, `AtCutTransition`, and the
`videoNodes` handle-borrowing assembly). Extract it into
`lib/render/at-cut-transitions.tsx` (new core module) so both renderers share
one implementation. `LayeredCampaignReel` is refactored to import it (proving
parity on the 13 migrated campaign projects via render smoke); `LayeredRoostReel`
imports the same. `computeMusicEnvelope` already lives in core and is reused as-is.

This is the concrete meaning of "extend core to support this" — the shared
timeline/transition machinery becomes core, and each brand renderer is a thin
adapter that maps `VideoItem.kind` → its own brand segment component.

### 4. Core editor — ruler beat-guides

`lib/editor/app/LayeredTimeline.tsx`: a new optional prop
`guidesMs?: number[]`. When present, the timeline draws thin vertical tick lines
at `startLeft + ms/1000·scaleWidth` px across the ruler/track area (an absolutely
positioned, `pointer-events:none` overlay synced to horizontal scroll + zoom).
Brand-agnostic; campaign can pass `undefined`. The roost editor host passes
`reel.meta.guidesMs`.

### 5. Roost template — the thin renderer + host

`templates/roost-reels/src/LayeredRoostReel.tsx` (new): consumes a `LayeredReel`,
maps each `VideoItem` kind to a roost brand component —
- `photo` → `KenBurnsPhoto` wrapped by `displayMode` (full-bleed | `PaperBackground` paper-frame),
- `broll` → `MontageClip`/`OffthreadVideo` (muted, `startFrom` from `sourceInMs`), same `displayMode` wrap,
- `outro` → roost `Outro` (params from item `props`; `kickFrames` from `props`),
— and expands each footage item's `{type:'vintage', mode}` effect into its
grade + grain (and, for `vhs`, a scanline overlay) **scoped to that clip's
Sequence**, so vintage is genuinely per-clip. It also renders the music track
(with fade), the `teaser` overlay, and the `watermark` brand item, and delegates
video-track assembly + transitions to the core at-cut engine.

Roost only uses `cut`/`fade`, so the engine's `presentationFor` returns
`fade()` or null — no new transition kinds.

Plus the roost `.editor/` host (clone of campaign's, pointing at
`LayeredRoostReel`, passing `guidesMs`), a `Root.tsx` registering
`LayeredRoostReel` with the derived reel literal, `package.json`/`remotion.config`
wiring, and the migration of `roost-reel-01`. Roost's `toolkit/` submodule
(pinned old at `5c1ce84`) is bumped to current core first.

### 6. Roost brand rules — vintage-by-default (brand repo, not core)

`brands/roost/BRAND-RULES.md` (in the roost repo) gains the agreed instruction:
when cutting a roost reel, apply the brand's `vintage` effect (`film` or `vhs`
per the brand) to **every** footage item unless the user says otherwise. Core
`/cut` already loads brand rules, so this needs **no core-command change**. This
is the ongoing authoring default; the migration derivation encodes the same
default once for `roost-reel-01`.

## Data flow

```
roost ReelConfig (Root.tsx defaultProps, one-time)
   └─ deriveMontageLayered(cfg)  [core]  → LayeredReel literal → Root.tsx
LayeredReel (authored source of truth)
   ├─ LayeredRoostReel  [roost] → at-cut engine [core] + roost brand components → frames
   └─ editor host → LayeredTimeline(guidesMs=meta.guidesMs) [core] + LayeredInspector [core]
```

After migration the `LayeredReel` is the source of truth; the roost config +
beats are gone from structure (git preserves the original). `meta.guidesMs`
carries the beat grid forward as an editing aid only.

## Testing

- **Derivation (core, unit):** `deriveMontageLayered` over a real `roost-reel-01`
  fixture — beat→ms correctness, photo/video→item kinds, teaser overlay span,
  outro placement + `totalDurationMs === last item end`, watermark hides at
  `transitionStart`, `guidesMs` populated from `kicks`, and a `vintage` effect
  stamped on **every** footage item when `cfg.vintage` is set (none when it is
  null). `LayeredReelSchema.parse` must pass.
- **Transition-engine extraction (core):** existing campaign render smokes must
  still pass (parity) after the refactor — render-verify ≥2 campaign projects.
- **Roost render smoke:** migrate `roost-reel-01`, render a photo frame, a
  paper-frame frame, a video frame, and an outro frame; visually confirm
  KenBurns, teaser, watermark, outro logo, and (if set) vintage.
- **Editor guides:** `guidesMs` ticks render at correct px for a known
  bpm/scaleWidth; absent prop → no overlay (campaign unaffected).

## Scope / decomposition

Three phases, buildable and verifiable in order (a plan may split them):

- **Phase A — core foundation (no renderer change):** schema fields +
  `deriveMontageLayered` + ruler guides. Roost can already derive a valid
  `LayeredReel` and open it in the editor with beat guides.
- **Phase B — shared renderer:** extract the at-cut engine to core, re-express
  `LayeredCampaignReel` on it, prove campaign parity.
- **Phase C — roost renderer + integration:** `LayeredRoostReel`, roost
  `.editor` host + `Root.tsx`, submodule bump, migrate + render-verify
  `roost-reel-01`.

## Non-goals

- **No change to the core `/cut` command** (or any core command). Roost's
  vintage-by-default authoring behavior is a brand-rules instruction
  (`brands/roost/BRAND-RULES.md`) that core `/cut` already consumes.
- No new transition kinds, overlay kinds, or effects beyond what roost already
  uses (`cut`/`fade`, `teaser`, direction ken-burns, `vintage`).
- No change to campaign-reels behavior — the schema additions are optional and
  the engine extraction is parity-verified, not a redesign.
- The roost config → LayeredReel migration is one-way (git is the undo), same as
  campaign; the beat-montage authoring format is not preserved as a live model.
- `dip-to-paper` transition (roost schema's future enum value) stays
  unimplemented, as it is today.
