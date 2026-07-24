# Layered Composition + Pilot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete sub-spec 1 by (a) making the layered model faithfully carry the pilot's motion/blend/audio numbers, and (b) rendering `pp-namesti-republiky` from the derived `LayeredReel` at "close" parity via a rewritten composition **assembly** — then edit-validating it.

**Architecture:** The exploration (`.superpowers/sdd/composition-tree-map.md` — READ IT FIRST) established that all segment/overlay **render bodies live in `@brand-lib`** and core `lib/`, and the OLD composition's only reel-specific code is the **timeline assembly** in `templates/campaign-reels/src/CampaignReel.tsx`. So the port **rewrites only the assembly** (a new `LayeredCampaignReel`) and **reuses every existing render body**. Tasks T1–T2 are pure-core TDD (extend schema + derivation to stop dropping data); T3–T5 build the assembly and render/edit-validate the pilot in the brand repo.

**Tech Stack:** TypeScript + Zod (core `lib/reel-config-base`); React + Remotion + `@remotion/transitions` (template). Vitest via `lib/editor` for core; Remotion Studio/CLI render for the composition. Node 20 (`~/.nvm/versions/node/v20.18.1/bin`).

## Global Constraints

- **Absolute milliseconds** at the data layer; **30 fps / outroFrames 180** at render (`frames = round(ms/1000*fps)`, `ms = round(frames/fps*1000)`).
- **Reuse, don't rebuild render bodies.** Reuse `@brand-lib/segments/{Clip,Broll,MultiClip}Segment`, `@brand-lib/segments/GradeDefs`, `@brand-lib/overlays/*`, template `segments/{Card,Outro}Segment` + `segments/plates/*`, `overlays/ChevronMarker`, `layers/PersistentOverlay`, and core `crop`/`focal`/`grade`/`duration`/`transcripts`/`transitions`. Rewrite **only** the assembly. Drop the dead stub `layers/PerSegmentOverlay.tsx`.
- **"Close, acceptable drift"** parity bar (per spec) — NOT pixel-perfect. Faithful to the numbers; render fidelity may drift.
- Core code in `core/lib/`; tests from `lib/editor` (`cd lib/editor && npx vitest run`; prepend Node 20 to PATH). Composition/pilot work in `video-toolkit/` (template + `projects/pp-namesti-republiky`). After a core commit the template consumes, re-sync the submodule per the handoff (don't commit the pointer).
- Commit signing disabled (leave it). Branch latitude: temporary breakage OK on `feat/reel-editor-skeleton`; validate at plan completion.

## Design decisions (resolved along "cleanest architecture"; see map's parity register)

- **D1 — Carry motion/blend as GENERIC CLIP EFFECTS (real-editor model), not special-case fields.** Every pilot broll uses `kenBurns`; two use `blend`/`blendTo` crossfades — dropping them is a brand-quality regression, not "close" drift. But per the standing design principle (a real-NLE model; simplification comes only from brand defaults/presets/rules — "Ken Burns is just an effect on a clip, nothing more"), these are **not** bespoke fields. `VideoItemSchema` gains a generic `effects?: Effect[]` list; the derivation maps `kenBurns` → `{ type: 'ken-burns', … }` and `blendTo`/`blend` → `{ type: 'blend', to, … }` effect entries. Brand presets/rules supply the effect defaults later (not in this plan). `audioMode` is a per-clip audio property (kept as a simple field, not an effect). Do NOT retro-rework Plan 1's landed intrinsic fields (source/trim/focal/grade) into effects — apply the principle to the new work only.
- **D2 — `audioMode` lives on the video item.** The three segment types have different `audioMode` enums (clip voice|silent, broll inherit|extend|silent, multi-clip first|mix|silent). Store it permissively (`z.string()`) on `VideoItem` so the video render body can mute/unmute exactly as today; the audio TRACK still carries clip/broll beds separately (from Plan 1). Multi-clip audio stays inside the video render body (no separate audio-track items). Per-sub `zoom` stays unrendered (old ignores it too).
- **D3 — Overlays render their full span (independent track).** The spec makes overlays independent/freely-movable. seg-007's overlay is authored to outlive its clip by ~1.4s; the OLD render clips it at the segment boundary, the layered render shows it. This is an **intentional behavior change** consistent with the redesign, not drift to suppress.
- **D4 — Brand marks span content, not the reel.** Watermark/disclaimer are hidden during the outro today (`contentFrames`). The derivation seeds brand items to `[0, contentEndMs]` where `contentEndMs = lastNonOutroItem.endMs − its transitionOut overlap` (T2), refining Plan 1's full-span placeholder.
- **D5 — Assembly is a HYBRID.** The video track → reconstruct a `<TransitionSeries>` (adjacency preserved by item order + each item's `transitionOut`), reusing the existing transition machinery and keeping close cut-timing parity. Overlays + brand → absolute `<Sequence from={round(startMs/1000*fps)}>` siblings. Music + clip/broll beds + outro audio → absolute `<Audio>`/derived-volume. (T3.)
- **D6 — Defer fine audio + frame-exact transitions to sub-spec 3.** The music outro-tail fade + "silent after outro" + exact `extend-previous` semantics + transition-overlap frame-exactness are "close" now and belong to the audio sub-spec. Get them close; note them.

---

### Task 1: Carry motion/blend as generic clip effects + audioMode (schema + derivation)

**Files:**
- Modify: `lib/reel-config-base/layered-schema.ts` (add `EffectSchema`; extend `VideoItemSchema`)
- Modify: `lib/reel-config-base/derive-layered.ts` (build the `effects` list in `buildVideoItem`)
- Test: `lib/editor/src/layered-schema.test.ts`, `lib/editor/src/derive-layered.test.ts`, `lib/editor/src/derive-layered.pilot.test.ts`

**Interfaces (produces):** a generic `Effect` type + `VideoItem` gains optional `effects: Effect[]` and `audioMode: string`. Ken Burns and blend are **effect entries**, not named fields (real-editor model; brand presets supply defaults later). Exact Zod:

```ts
// A generic clip effect: a typed tag + arbitrary params. Ken Burns, blend, colour, etc.
// are effects. Kept permissive (a `type` discriminant + passthrough params) so core stays
// generic and new effect kinds — or brand-preset params — need no schema change. This is
// the real-NLE "clip carries a stack of effects" model; simplification lives in brand presets.
export const EffectSchema = z.object({ type: z.string() }).passthrough();
export type Effect = z.infer<typeof EffectSchema>;

// added inside VideoItemSchema, before transitionOut:
  effects: z.array(EffectSchema).optional(),
  // per-clip audio setting (clip voice|silent · broll inherit-from-clip|extend-previous|silent · multi-clip first|mix|silent)
  audioMode: z.string().optional(),
```

Also add `EffectSchema`/`Effect` to the file's exports (they already export the other item schemas/types).

Derivation (`buildVideoItem`): build an `effects` array from the source segment, pushing an entry only when its source data is present, and assign `effects` only when non-empty:
- broll `seg.kenBurns` → `effects.push({ type: 'ken-burns', ...seg.kenBurns })`
- broll `seg.blendTo` → `effects.push({ type: 'blend', to: seg.blendTo, ...(seg.blend ?? {}) })`
- `audioMode` — carry `seg.audioMode` for **all** types (clip/broll/multi-clip) via the existing `...(x !== undefined ? { x } : {})` idiom.
`sources` (multi-clip) and `layout` are already carried by Plan 1 — verify, don't duplicate. Do NOT convert focal/crop/grade to effects here (out of scope; principle applies to new work).

- [ ] **Step 1: Failing schema test** — in `layered-schema.test.ts`, extend the minimal-valid-reel fixture's first video item with `effects: [{ type: 'ken-burns', fromX: 0.35, toX: 0.62, fromScale: 1.05, toScale: 1.12 }, { type: 'blend', to: 'b2.mp4', direction: 'tl-br', startPct: 14, endPct: 38, softness: 45 }]` and `audioMode: 'inherit-from-clip'`; assert `LayeredReelSchema.parse(reel)` still succeeds AND that an effect **without** a `type` (`{ fromX: 0.5 }`) throws. Run → fails (fields stripped / no rejection yet).
- [ ] **Step 2: Implement** `EffectSchema` + the two `VideoItemSchema` additions + exports. Run schema test → passes.
- [ ] **Step 3: Failing derivation test** — in `derive-layered.test.ts`, add to the `OLD` fixture's broll (`seg-002`): `kenBurns: { fromX: 0.35, toX: 0.62 }`, `blendTo: 'b2.mp4'`, `blend: { direction: 'tl-br', startPct: 10, endPct: 40 }`. Add a test asserting the derived `v2.effects` contains a `ken-burns` effect (`find(e => e.type === 'ken-burns')`) with `fromX === 0.35`, and a `blend` effect with `to === 'b2.mp4'` and `direction === 'tl-br'`, and that `v2.audioMode === 'inherit-from-clip'`. Run → fails.
- [ ] **Step 4: Implement** the `buildVideoItem` effects-list construction + `audioMode` passthrough. Run → passes.
- [ ] **Step 5: Pilot smoke** — in `derive-layered.pilot.test.ts`, assert the derived pilot preserves motion: broll `seg-002` has an effect with `type === 'ken-burns'`; `seg-004` has an effect with `type === 'blend'` and `to === 'br_vizualizace_zelen_vic.mp4'`. Run → passes (real project's motion survives derivation as effects).
- [ ] **Step 6: Full suite + tsc** — `cd lib/editor && npx vitest run` all green; `npx tsc --noEmit` clean.
- [ ] **Step 7: Commit** `feat(layered): clip effects list (ken-burns/blend) + audioMode on VideoItem`.

---

### Task 2: Brand layers span content, not the reel (derivation)

**Files:**
- Modify: `lib/reel-config-base/derive-layered.ts` (brand-item span)
- Test: `lib/editor/src/derive-layered.test.ts`, `lib/editor/src/derive-layered.pilot.test.ts`

**Interfaces:** brand items change from `[0, totalMs]` to `[0, contentEndMs]`, where
`contentEndMs = lastNonOutroItem.endMs − overlapMs`, and
`overlapMs = lastNonOutroItem.transitionOut ? round(transitionOut.frames / fps * 1000) : 0`.
If there is no non-outro item, `contentEndMs = totalMs`. (`fps` is `opts.fps`; `transitionOut` is the permissive record already stored — read `.frames` defensively.)

- [ ] **Step 1: Failing test** — in `derive-layered.test.ts`, make the `OLD` fixture's last clip (before the outro) carry `transitionOut: { kind: 'dissolve', frames: 12 }`. Add a test: the two brand items' `endMs` equals `(last non-outro item endMs) − round(12/30*1000)` (i.e. `− 400`), and is **strictly less than** `meta.totalDurationMs` (the outro is excluded). Run → fails (brand still full-span).
- [ ] **Step 2: Implement** — compute `contentEndMs` as above; emit `brand-watermark`/`brand-disclaimer` with `endMs: contentEndMs`. Keep `startMs: 0`. Run → passes. (Update the Plan-1 brand test that asserted `every(b.endMs === totalDurationMs)` to the new content-end expectation — this is a deliberate, D4-driven change, not a weakening.)
- [ ] **Step 3: Pilot smoke** — in `derive-layered.pilot.test.ts`, assert both brand items end at `< layered.meta.totalDurationMs` (brand hidden during outro) and `> 0`. Run → passes.
- [ ] **Step 4: Full suite + tsc** — all green; tsc clean.
- [ ] **Step 5: Commit** `feat(layered): brand layers span content-end (hide during outro), not full reel`.

> After T2, re-sync the `video-toolkit/toolkit` submodule to the new core HEAD (per handoff) so T3+ see the updated schema/derivation. Don't commit the pointer.

---

### Task 3: `LayeredCampaignReel` assembly (hybrid; reuse all render bodies)

**Files (in `video-toolkit`):**
- Create: `templates/campaign-reels/src/LayeredCampaignReel.tsx` (the new assembly)
- Reference (reuse, do not modify): `@brand-lib/segments/{Clip,Broll,MultiClip}Segment`, template `segments/{Card,Outro}Segment`, `@brand-lib/overlays/*`, `overlays/ChevronMarker`, `layers/PersistentOverlay`, core `transitions/*`, `reel-config-base/duration`.
- Delete: `templates/campaign-reels/src/layers/PerSegmentOverlay.tsx` (dead stub)

**Interfaces:**
- Consumes: `LayeredReel` (`@video-toolkit/lib/reel-config-base/layered-schema`) as its single prop `reel`.
- Produces: a Remotion component rendering the four tracks. `startMs → from = Math.round(startMs / 1000 * fps)`, `durMs → durationInFrames = Math.round((endMs − startMs) / 1000 * fps)`.

**Approach (authored at execution against the exact BL prop shapes — read each reused component's props first; the map lists their files/lines):**

1. **Video track → `<TransitionSeries>`.** Iterate `reel.tracks.video` in order. Each item → `<TransitionSeries.Sequence durationInFrames={round((endMs−startMs)/1000*fps)}>` wrapping the matching render body, reconstructed from the item's fields:
   - `clip` → `ClipSegment` (source/trim*/focal/crop/grade/audioMode). `trimBefore = round(sourceInMs/1000*fps)`, `trimAfter = round(sourceOutMs/1000*fps)`.
   - `broll` → `BrollSegment` (+ `aiGenerated`). The reused `BrollSegment` body still takes `kenBurns`/`blend`/`blendTo` **props**, so the assembly MAPS the generic `effects[]` back to them: `kenBurns = effects.find(e => e.type === 'ken-burns')` (drop the `type` key), and `blend`/`blendTo` from `effects.find(e => e.type === 'blend')` (`blendTo = eff.to`, `blend = { direction, startPct, endPct, softness }`). This keeps the render body untouched while the model stays effect-generic.
   - `multi-clip` → `MultiClipSegment` (`layout`/`sources`/`audioMode`).
   - `card` → template `CardSegment`; `outro` → template `OutroSegment`.
   Between adjacent items, if the earlier item's `transitionOut` (permissive record) exists and `kind !== 'cut'`, insert a `<TransitionSeries.Transition>` built exactly like the old `renderTransition()` (map fields → `{ presentation, timing: linearTiming({ durationInFrames: frames }) }`). Reuse the old CampaignReel's `renderTransition`/`renderSegment` logic verbatim where possible — they already read a segment-shaped object; adapt to read a `VideoItem`.
2. **Overlays → absolute siblings.** For each `reel.tracks.overlays` item (except `content.kind === 'chevron'`), render its BL overlay body inside `<Sequence from={round(startMs/1000*fps)} durationInFrames={round((endMs−startMs)/1000*fps)}>`. The overlay body reads `content` (kind + fields) + `position`. Because these are top-level Sequences (not nested in a segment), D3 holds — seg-007's overlay renders its full span.
3. **Chevron → reel-level singleton.** Render `<ChevronMarker label={chevronOverlay.content.text} />` as a sibling (its own internal 90-frame clock), matching today.
4. **Brand → absolute Sequences.** For each `reel.tracks.brand` item render `<PersistentOverlay/>` (watermark/disclaimer) inside `<Sequence from={0} durationInFrames={round(endMs/1000*fps)}>` — endMs already excludes the outro (D4/T2).
5. **Audio.** Music: one `<Audio src={staticFile(reel.tracks.music.source)} volume={f => musicVolumeAt(f)}>` where `musicVolumeAt` re-derives the envelope from base (`reel.tracks.music.baseVolumeDb`) + each video item's `musicBoostDb` over its span + outro rules (D6: outro +10, last-1s fade, silence after outro end — port from the old `musicVolumeAt`/`classifyFrame`, driven by the video track's item spans). Clip/broll beds: for each `reel.tracks.audio` item, an `<Audio src={staticFile(...)} startFrom={round(sourceInMs/1000*fps)} volume=...>` positioned by its span (or rely on the clip/broll render body's own audio as today — pick one path and keep it consistent; document). Outro audio comes from `OutroSegment` as today.

- [ ] **Step 1:** Read the exact props of each reused body (ClipSegment/BrollSegment/MultiClipSegment/CardSegment/OutroSegment/the overlay components/ChevronMarker/PersistentOverlay) and the old `CampaignReel.tsx` `renderSegment`/`renderTransition`/`musicVolumeAt`. Note the precise prop names.
- [ ] **Step 2:** Build `LayeredCampaignReel.tsx` per the approach. Delete the dead `PerSegmentOverlay.tsx`.
- [ ] **Step 3:** Add a Remotion `<Composition id="LayeredCampaignReel" component={LayeredCampaignReel} …>` (in the pilot's `Root.tsx`, alongside the old one — keep both during transition) whose `defaultProps` is `deriveLayered(<the old defaultProps>, { fps, outroFrames })` computed in `calculateMetadata`/a builder, with `durationInFrames = round(reel.meta.totalDurationMs/1000*fps)`.
- [ ] **Step 4:** `npm run studio` (or a headless still/preview render) — the new composition mounts and plays without errors. Fix mount/prop errors until it renders.
- [ ] **Step 5: Commit** (in `video-toolkit`) `feat(reel): LayeredCampaignReel — render from LayeredReel (hybrid assembly, reuse bodies)`.

> This task has no unit test (it's a Remotion composition). Its gate is Step 4 (mounts + renders) and Task 5 (visual close-parity). The reviewer verifies the reuse map is honored (no render body reimplemented) and the per-track ms→frame mapping is correct.

---

### Task 4: Render the pilot from the derived model

**Files (in `video-toolkit/projects/pp-namesti-republiky`):** its `Root.tsx` (add the layered composition), any thin wiring.

- [ ] **Step 1:** Ensure the pilot has the layered composition wired (T3 Step 3 applied to the pilot's own `Root.tsx`), deriving from its real `defaultProps`.
- [ ] **Step 2:** Render: `npm run render` targeting `LayeredCampaignReel` (or a preview/half-scale). Produce `out/reel-layered.mp4`.
- [ ] **Step 3:** Render the OLD `CampaignReel` too (`out/reel-old.mp4`) for side-by-side.
- [ ] **Step 4: Commit** (video-toolkit) the wiring `chore(pilot): wire LayeredCampaignReel for pp-namesti-republiky`. (Do not commit `out/` — it's R2-synced.)

---

### Task 5: Close-parity + edit validation (pilot round-trip)

- [ ] **Step 1: Visual close-parity.** Compare `reel-layered.mp4` vs `reel-old.mp4` on the parity register (map §risk): video cuts & durations, Ken Burns motion present on brolls, seg-004/006 crossfades present, overlays (incl. seg-007's intended overspill — expected to now render, per D3), chevron once at start, brand marks hidden during outro (D4), music boost on broll/outro. Record diffs; anything beyond "close, acceptable drift" is a finding to fix in T3.
- [ ] **Step 2: Edit-validate.** Open the pilot in the reel editor (`npm run editor`) over the layered model and confirm the existing editor surfaces (timeline/inspector/save) don't crash on the layered props. (Deep multi-track editing is sub-spec 2 — here only confirm the model loads/edits at the smoke level.)
- [ ] **Step 3:** Write a short parity report to `.superpowers/sdd/pilot-parity-report.md` (what matches, what drifts, what's deferred to sub-specs 2/3). This report is sub-spec 1's acceptance artifact.
- [ ] **Step 4: Commit** any T3 fixes; update the progress ledger: sub-spec 1 complete when the pilot round-trips acceptably.

---

## Self-Review

- **Spec coverage (sub-spec 1 back half):** composition renders from the layered model (T3), derivation carries all pilot numbers incl. motion/blend (T1) and content-end brand span (T2), pilot rendered from the derived model (T4) and render+edit-validated at "close" parity (T5). `/cut` emitting the layered model directly is **out of scope** here (spec lists it under sub-spec 1 but it depends on the layered render existing; fold into a follow-up once T5 passes — noted, not silently dropped).
- **Placeholder scan:** T1/T2 carry complete code. T3–T5 are integration/render tasks with a concrete approach + exact reuse map + ms→frame formulas; their "code" is authored at execution against the live BL prop shapes (unavoidable for a composition port — the reused bodies' signatures live in the brand repo). The reviewer gate for T3 is "mounts + renders + honors reuse map".
- **Type consistency:** effect param names inside the entries (`fromX`/`toScale`/`direction`/`startPct`/…) match the source schemas (`segment-base-schemas.ts:164`, template `schema.ts:212`) so the T3 mapping back to `BrollSegment` props is lossless; `EffectSchema`/`Effect`/`effects` named consistently across schema/derivation/render; `contentEndMs`/`overlapMs` consistent; `startMs→from`, `sourceInMs→trimBefore` mapping identical across T3/T4.

## Notes for the executor
- Read `.superpowers/sdd/composition-tree-map.md` first — it has every file:line anchor T3 needs.
- T1–T2 are pure-core TDD (like Plan 1); T3–T5 are brand-repo/Remotion and need the render environment + a human eye on "close parity" (T5 Step 1). Checkpoint there.
