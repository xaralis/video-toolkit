# Layered Model — Schema + Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Define the new track-native `LayeredReel` schema and a pure `deriveLayered(oldConfig)` function that reshapes an existing segment-centric `ReelConfig` into it — the foundation of the layered-timeline redesign and the migration engine.

**Architecture:** Both live in core `lib/reel-config-base/` (reusable by composition + editor); tested from `lib/editor/` via the `@video-toolkit/lib` alias (which resolves to core `lib/`). This plan produces NO UI and NO composition changes — just the data model + the pure derivation, fully unit-tested against the real pilot shape. Composition-render + pilot-validation is the **next** plan.

**Tech Stack:** TypeScript + Zod (already used by the current schema). Vitest via `lib/editor`.

## Global Constraints

- **Times are absolute milliseconds** on the reel timeline (`startMs`/`endMs` per item) — the new model's defining property vs. the old segment-relative timing.
- **Derivation reshapes existing numbers** (no new authored data): overlay absolute time = video-item start + `appearAt`; per-clip `musicBoostDb` from the +6 broll / +10 outro rule; audio items from `audioMode`/`audioSource`/`audioStartSec`; chevron/brand timing seeded from brand rules.
- **Parity bar is "close, acceptable drift"**, not 1:1 (per the spec) — but the derivation must be *faithful to the numbers* (durations/positions computed exactly from the source config; only render fidelity is allowed to drift, in the later composition plan).
- **30 fps** reel assumption (frames = seconds × 30) — but the layered model stores **milliseconds**, not frames, so it's fps-agnostic at the data layer.
- Duration of a segment in ms comes from the existing `segmentDurationFrames(seg, fps, outroFrames)` (`@video-toolkit/lib/reel-config-base/duration`) → `ms = frames / fps * 1000`. Reuse it; do not re-derive duration math.
- Node 20+ for tests (`cd lib/editor && npx vitest run`; shell default node may be stale v10 → prepend newest `~/.nvm/versions/node/v20*/bin`). Commit signing disabled.
- **Branch latitude:** on the feature branch, temporary breakage is OK; validate at plan completion, not every commit.

---

### Task 1: `LayeredReel` schema

**Files:**
- Create: `lib/reel-config-base/layered-schema.ts`
- Test: `lib/editor/src/layered-schema.test.ts`

**Interfaces (produces):** Zod schemas + inferred types for the layered model. Exact shape:

```ts
// lib/reel-config-base/layered-schema.ts
import { z } from 'zod';
import { OverlaySchema } from ... // NOTE: overlay CONTENT variants (title/quote-pull/stat-callout/source-tag)
// live in the TEMPLATE's schema.ts, not core. To keep core generic, the layered schema stores overlay
// content as a permissive record and lets the template/derivation supply the concrete union. Define:
const OverlayContent = z.record(z.string(), z.unknown()); // { kind, text?, number?, placement?, ... }

const Ms = z.number().min(0);

// Every track item shares a time span.
const TimeSpan = { startMs: Ms, endMs: Ms };

export const VideoItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['clip', 'broll', 'multi-clip', 'card', 'outro']),
  ...TimeSpan,
  source: z.string().optional(),            // absent for outro; multi-clip uses sources[]
  sources: z.array(z.object({ source: z.string(), sourceInMs: Ms, sourceOutMs: Ms, label: z.string().optional(), zoom: z.number().optional() })).optional(),
  sourceInMs: Ms.optional(),                // trim window into the source (clip/broll)
  sourceOutMs: Ms.optional(),
  layout: z.enum(['split-h', 'split-v', 'pip', 'quad']).optional(), // multi-clip
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  crop: z.record(z.string(), z.unknown()).optional(),
  grade: z.record(z.string(), z.unknown()).optional(),
  aiGenerated: z.boolean().optional(),      // broll
  cardKind: z.string().optional(),          // card
  cardProps: z.record(z.string(), z.unknown()).optional(),
  pattern: z.string().optional(),
  musicBoostDb: z.number().optional(),      // this item's contribution to the music envelope while on screen
  transitionOut: z.record(z.string(), z.unknown()).optional(), // the existing Transition union, stored permissively
});

export const AudioItemSchema = z.object({
  id: z.string(),
  ...TimeSpan,
  source: z.string(),        // the audio source file
  sourceInMs: Ms,            // in-point into the audio source (slippable)
  volumeDb: z.number().optional(),
  mute: z.boolean().optional(),
  followsVideoId: z.string().optional(), // the video item this bed was derived from (for alignment; editing may detach)
});

export const OverlayItemSchema = z.object({
  id: z.string(),
  ...TimeSpan,
  content: OverlayContent,   // { kind: 'title'|'quote-pull'|'stat-callout'|'source-tag'|'chevron', ...fields }
  position: z.string().optional(),
  anchorVideoId: z.string().optional(), // the clip it was aligned to at /cut (for reference; freely movable)
});

export const BrandLayerItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['watermark', 'disclaimer']),
  ...TimeSpan,
  props: z.record(z.string(), z.unknown()).optional(),
});

export const MusicLayerSchema = z.object({
  source: z.string().optional(),
  baseVolumeDb: z.number().default(-8),
});

export const LayeredReelSchema = z.object({
  version: z.literal('layered-1'),
  meta: z.object({ topic: z.string(), totalDurationMs: Ms }),
  tracks: z.object({
    video: z.array(VideoItemSchema),
    audio: z.array(AudioItemSchema),
    music: MusicLayerSchema,
    overlays: z.array(OverlayItemSchema),
    brand: z.array(BrandLayerItemSchema),
  }),
});
export type LayeredReel = z.infer<typeof LayeredReelSchema>;
export type VideoItem = z.infer<typeof VideoItemSchema>;
export type AudioItem = z.infer<typeof AudioItemSchema>;
export type OverlayItem = z.infer<typeof OverlayItemSchema>;
export type BrandLayerItem = z.infer<typeof BrandLayerItemSchema>;
```

- [ ] **Step 1: Write the failing test** — `lib/editor/src/layered-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

describe('LayeredReelSchema', () => {
  it('accepts a minimal valid layered reel', () => {
    const reel = {
      version: 'layered-1',
      meta: { topic: 'X', totalDurationMs: 5000 },
      tracks: {
        video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 400, sourceOutMs: 3400 }],
        audio: [{ id: 'a1', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 400 }],
        music: { source: 'audio/bg.mp3', baseVolumeDb: -6 },
        overlays: [{ id: 'o1', startMs: 0, endMs: 3000, content: { kind: 'title', text: 'Hi' } }],
        brand: [{ id: 'b1', kind: 'watermark', startMs: 0, endMs: 5000 }],
      },
    };
    expect(LayeredReelSchema.parse(reel)).toBeTruthy();
  });

  it('rejects a negative startMs', () => {
    expect(() => LayeredReelSchema.parse({
      version: 'layered-1', meta: { topic: 'X', totalDurationMs: 1 },
      tracks: { video: [{ id: 'v', kind: 'clip', startMs: -1, endMs: 1 }], audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [] },
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run → fails** (`cd lib/editor && npx vitest run src/layered-schema.test.ts`; cannot resolve module).
- [ ] **Step 3: Implement `layered-schema.ts`** exactly as the Interfaces block above.
- [ ] **Step 4: Run → passes**; then full `lib/editor` suite + `npx tsc --noEmit` in `lib/editor`.
- [ ] **Step 5: Commit** `feat(layered): LayeredReel Zod schema (track-native, absolute ms)` (commit `lib/reel-config-base/layered-schema.ts` + the test).

---

### Task 2: `deriveLayered(oldConfig)` — segment-centric → layered

**Files:**
- Create: `lib/reel-config-base/derive-layered.ts`
- Test: `lib/editor/src/derive-layered.test.ts`

**Interfaces:**
- Consumes: `LayeredReel`/item types (Task 1); `segmentDurationFrames`/`totalDurationFrames` from `@video-toolkit/lib/reel-config-base/duration`.
- Produces: `deriveLayered(config: OldReelConfig, opts: { fps: number; outroFrames: number; chevronDurationMs?: number }): LayeredReel` where `OldReelConfig` is the current `{ topic, chevron, audio?, segments[] }` shape (import its type permissively — accept a structural type, don't couple to the template's Zod).

**Derivation rules (implement exactly):**
- Walk `segments` accumulating `startMs` (`cursorMs`, starts at 0). For each segment: `durMs = round(segmentDurationFrames(seg, fps, outroFrames) / fps * 1000)`; item `startMs = cursorMs`, `endMs = cursorMs + durMs`; then `cursorMs += durMs`. **Transitions overlap** — for MVP derivation, do NOT subtract transition overlap from the cursor (keep sequential; the "close parity" bar tolerates this; note it in a code comment).
- **video item** per segment: map `kind` from `type`; `sourceInMs = round(trimIn*1000)`, `sourceOutMs = round(trimOut*1000)` for clip/broll; `source`, `focalX/Y`, `crop`, `grade`, `aiGenerated`, `layout`+`sources` (multi-clip: each sub `sourceInMs/OutMs` from its trimIn/Out), `cardKind`/`cardProps`/`pattern` (card), `transitionOut` (as-is). `musicBoostDb`: **broll → +6, outro → +10, else 0** (the rule).
- **audio item** per clip/broll from `audioMode`:
  - `voice` (clip default) → an audio item over the same span, `source = seg.source`, `sourceInMs = sourceInMs of the video`, `volumeDb: 0`.
  - `silent` → no audio item.
  - `inherit-from-clip` (broll) → audio item `source = audioSource`, `sourceInMs = round(audioStartSec*1000)`, span = the broll's span.
  - `extend-previous` (broll) → EXTEND the previous audio item's `endMs` to cover this broll's span (do not add a new item); if there is no previous audio item, treat as silent.
- **overlays**: for each clip's `overlays[]` and each broll/multi-clip `overlay`, emit an `OverlayItem`: `startMs = videoItem.startMs + appearAt`, `endMs = startMs + durationMs`, `content = { kind, ...overlay-specific fields }`, `position = overlay.placement ?? overlay.position`, `anchorVideoId = videoItem.id`.
- **chevron**: emit an OverlayItem `content = { kind: 'chevron', text: config.chevron }`, `startMs = 0`, `endMs = opts.chevronDurationMs ?? 3000` (default; the composition plan will reconcile with `ChevronMarker`'s actual window). Only if `config.chevron` is non-empty.
- **brand layers**: emit `{ id:'brand-watermark', kind:'watermark', startMs:0, endMs: totalMs }` and `{ id:'brand-disclaimer', kind:'disclaimer', startMs:0, endMs: totalMs }` (full-span; rule-seeded).
- **music**: `{ source: config.audio?.music, baseVolumeDb: config.audio?.musicVolumeDb ?? -8 }`.
- **meta**: `{ topic: config.topic, totalDurationMs: totalMs }` where `totalMs = round(totalDurationFrames(segments, fps, outroFrames)/fps*1000)`.
- IDs: video items keep `seg.id`; audio items `\`${seg.id}-audio\``; overlay items `\`${seg.id}-ov-${i}\`` (or `-ov` for single); deterministic (no random).
- The result MUST satisfy `LayeredReelSchema.parse`.

- [ ] **Step 1: Write the failing test** — `lib/editor/src/derive-layered.test.ts`, using a fixture mirroring `pp-namesti-republiky`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveLayered } from '@video-toolkit/lib/reel-config-base/derive-layered';
import { LayeredReelSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';

const OLD = {
  topic: 'Lepší náměstí Republiky',
  chevron: 'NÁMĚSTÍ REPUBLIKY',
  audio: { music: 'audio/bg.mp3', musicVolumeDb: -6 },
  segments: [
    { id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 0.4, trimOut: 5.75, audioMode: 'voice',
      overlays: [{ kind: 'title', text: 'Ještě lepší {lime:náměstí Republiky}.', appearAt: 0, durationMs: 3000 }] },
    { id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 4, audioMode: 'inherit-from-clip',
      audioSource: 'a.mp4', audioStartSec: 5.75, aiGenerated: true },
    { id: 'seg-008', type: 'outro' },
  ],
};
const OPTS = { fps: 30, outroFrames: 180 };

describe('deriveLayered', () => {
  it('produces a schema-valid layered reel', () => {
    expect(() => LayeredReelSchema.parse(deriveLayered(OLD, OPTS))).not.toThrow();
  });
  it('lays video items sequentially with absolute ms and correct trim windows', () => {
    const r = deriveLayered(OLD, OPTS);
    const [v1, v2, outro] = r.tracks.video;
    // clip dur = round(5.75*30)-round(0.4*30)=173-12=161 frames → 161/30*1000 = 5366.67 → 5367ms
    expect(v1).toMatchObject({ id: 'seg-001', kind: 'clip', startMs: 0, sourceInMs: 400, sourceOutMs: 5750 });
    expect(v1.endMs).toBe(5367);
    expect(v2.startMs).toBe(5367);            // broll starts where clip ended
    expect(v2.musicBoostDb).toBe(6);          // broll boost
    expect(outro.musicBoostDb).toBe(10);      // outro boost
  });
  it('derives audio items: voice→own, inherit→audioSource+startSec, extend/silent handled', () => {
    const r = deriveLayered(OLD, OPTS);
    const clipAudio = r.tracks.audio.find((a) => a.id === 'seg-001-audio');
    const brollAudio = r.tracks.audio.find((a) => a.id === 'seg-002-audio');
    expect(clipAudio).toMatchObject({ source: 'a.mp4', sourceInMs: 400 });
    expect(brollAudio).toMatchObject({ source: 'a.mp4', sourceInMs: 5750 });
  });
  it('places overlays at absolute time = clip start + appearAt', () => {
    const r = deriveLayered(OLD, OPTS);
    const title = r.tracks.overlays.find((o) => o.content.kind === 'title');
    expect(title).toMatchObject({ startMs: 0, endMs: 3000 });
    expect(title.anchorVideoId).toBe('seg-001');
  });
  it('emits chevron + full-span brand layers + music base', () => {
    const r = deriveLayered(OLD, OPTS);
    expect(r.tracks.overlays.some((o) => o.content.kind === 'chevron')).toBe(true);
    expect(r.tracks.brand.map((b) => b.kind).sort()).toEqual(['disclaimer', 'watermark']);
    expect(r.tracks.brand.every((b) => b.endMs === r.meta.totalDurationMs)).toBe(true);
    expect(r.tracks.music).toMatchObject({ source: 'audio/bg.mp3', baseVolumeDb: -6 });
  });
});
```

- [ ] **Step 2: Run → fails** (`cd lib/editor && npx vitest run src/derive-layered.test.ts`; module missing).
- [ ] **Step 3: Implement `derive-layered.ts`** following the derivation rules above exactly. Keep it a single pure function + small private helpers; no I/O, no randomness.
- [ ] **Step 4: Run → passes**; fix the implementation (not the tests) until green. Then full `lib/editor` suite + `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat(layered): deriveLayered — segment-centric config → layered model`.

---

### Task 3: Derive the real pilot config (integration smoke)

**Files:**
- Test: `lib/editor/src/derive-layered.pilot.test.ts`

**Interfaces:** Consumes `deriveLayered` (Task 2). No new production code.

- [ ] **Step 1: Write the test** — load the REAL pilot config object. Since `pp-namesti-republiky`'s props live in its `Root.tsx` (brand repo, not importable from core), paste a **verbatim copy of its full `defaultProps` object** into the test file as a fixture constant (copy it from `video-toolkit/projects/pp-namesti-republiky/src/Root.tsx`), then:

```ts
it('derives the real pp-namesti-republiky config without throwing and covers every segment', () => {
  const layered = deriveLayered(PP_NAMESTI_DEFAULT_PROPS, { fps: 30, outroFrames: 180 });
  expect(() => LayeredReelSchema.parse(layered)).not.toThrow();
  expect(layered.tracks.video).toHaveLength(PP_NAMESTI_DEFAULT_PROPS.segments.length);
  // total = sum of item spans (sequential) equals meta.totalDurationMs
  const last = layered.tracks.video[layered.tracks.video.length - 1];
  expect(last.endMs).toBe(layered.meta.totalDurationMs);
  // every overlay sits within its anchor clip's span (absolute-time sanity)
  for (const ov of layered.tracks.overlays) {
    if (ov.content.kind === 'chevron') continue;
    const v = layered.tracks.video.find((x) => x.id === ov.anchorVideoId)!;
    expect(ov.startMs).toBeGreaterThanOrEqual(v.startMs);
    expect(ov.endMs).toBeLessThanOrEqual(v.endMs + 1);
  }
});
```

- [ ] **Step 2: Run → confirm PASS** (`cd lib/editor && npx vitest run src/derive-layered.pilot.test.ts`). If it throws or a sanity assertion fails, fix `derive-layered.ts` — this is the real-shape validation that de-risks the pilot render (next plan).
- [ ] **Step 3: Commit** `test(layered): derive real pp-namesti-republiky config (pilot smoke)`.

---

## Self-Review
- **Spec coverage (this slice):** layered schema (Task 1) + derivation reshaping existing numbers incl. overlay absolute times, per-clip musicBoost, audio items, chevron/brand seeding, music base (Task 2) + real-pilot smoke (Task 3). Composition-render + full pilot render/edit validation + `/cut` emission are the **next plan** (noted in the spec's decomposition).
- **Placeholder scan:** none — all code + exact commands present. The overlay `content` is intentionally a permissive record because the concrete overlay union lives in the template, not core (documented in Task 1).
- **Type consistency:** `deriveLayered` returns `LayeredReel`; item ids/fields match the schema; `musicBoostDb`, `sourceInMs`, `startMs`/`endMs` names identical across schema, derivation, and tests.

## Next plan (not this one)
**Layered composition + pilot** — port `CampaignReel` to render from `LayeredReel` (close parity), wire the template to derive-or-author layered props, render `pp-namesti-republiky` from the derived model and compare visually ("close"), and validate editing it in the multi-track editor. That plan requires reading the existing composition tree and is authored against it directly.
