# Phase 3 — Close the Extension Contract: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "a new brand only themes" true by giving every extension point a
declared registry with a core generic beneath it, so a brand *registers* a
renderer instead of *writing* one.

**Architecture:** Phase 1 subtracted drift surfaces; Phase 2 moved mechanisms
into core. What is left brand-side is everything a brand must **register**:
overlays, effects, segment generators, the brand layer, captions, media paths.
Several of those have no contract at all today — `card`/`outro`/`multi-clip`
resolve to `null` unless a brand supplies a renderer, and there is no effect
registry whatsoever. Phase 3 adds one open-keyed registry per axis, each with a
core generic as the **fallback beneath** the brand's registration, plus the
editor plumbing that makes a brand-registered kind editable without touching
core UI.

**Tech Stack:** TypeScript, React, Remotion 4.0.425/4.0.498, zod 3.22.3 (exact —
see `docs/zod-version.md`), Vitest + jsdom, Python 3 (`video_toolkit/`).

---

## Global Constraints

Copied verbatim from the session brief and `docs/superpowers/HANDOFF.md`. Every
task's requirements implicitly include this section.

- **Phase 3 is core-only.** Both brand repos (`~/Workspace/progpce/video-toolkit`,
  `~/Workspace/roost/video-toolkit`) are migrated and green. **Do not edit them.**
  Migrations are *written* into `docs/superpowers/phase3-migrations.md` as
  paste-ready items, never applied. Reading them is fine and encouraged.
- **Never edit a `defaultProps` literal in a project.** The literal in
  `src/Root.tsx` is the source of truth for that project's cut.
- **Commits:** repo style, **never** `Co-Authored-By`. Signing is broken
  (1Password) — use `--no-gpg-sign` immediately, it is not a blocker.
- **zod is pinned to exactly `3.22.3`.** Do not change any `zod` or `remotion`
  version. Read `docs/zod-version.md` before touching either.

### The four gates — hold them, do not regress them

| Gate | Command | Baseline |
|---|---|---|
| Editor tests | `cd lib/editor && npx vitest run` | **58 files / 669 tests** — 2 are `it.fails` known-defect pins, so "669/669 passed" is **not** full green |
| Editor types | `cd lib/editor && npx tsc --noEmit` | **4** pre-existing errors — do not add |
| Render/transition types | `cd examples/layered-minimal && npm run typecheck` | **0** errors + coverage guard |
| Brand leak | `grep -riE 'lime\|teal\|roost\|progresivn\|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'` | exactly **2** known hits (`lib/theming/segment/SegmentMedia.tsx:18`, `lib/transitions/presentations/burn.tsx:8` — both comments) |

**`npx tsc --noEmit | grep -c 'error TS'` returns 0 when tsc *crashes*.** Always
check the exit code separately.

### Verified capabilities — do NOT design around an unverified limit

Each carries the command that demonstrates it. This mistake has been made three
times in this programme and each time it narrowed a decision wrongly.

- Core **can** unit-test a `remotion`-importing module: `vi.mock('remotion', …)`.
  Five test files already do.
- Core **can** type-check its render surface:
  `cd examples/layered-minimal && npm run typecheck`.
- Core **can render**:
  `cd examples/layered-minimal && npx remotion still src/index.ts MinimalReel out/x.png --frame=45`
  → exit 0, a real PNG. (`out/` is gitignored; delete probes after checking.)

**Do not write "core cannot X" without the command you ran.** If you have not run
it, write "unverified", not "cannot".

### The parity discipline — this is the phase that moves pixels

Phases 1–2 could hold "rendering an existing baked literal must not change"
almost for free. Registries and generic renderers cannot.

**The governing rule for Phase 3, and the reason it is safe:**

> Every core generic is added **strictly beneath** the existing resolution order.
> `resolveXRenderer(theme, kind)` returns `theme.<registry>[kind] ?? CORE_GENERIC[kind]`.
> A brand that registers a kind today keeps winning, byte for byte. A kind that
> resolved to `undefined`/`null` today gains a fallback where nothing rendered.

Consequences, which every task must honour:

1. **Core-side, parity is required and provable.** Adding a fallback must not
   change what an existing registration renders. Prove it with the still-render
   procedure below whenever a task touches a code path `examples/layered-minimal`
   exercises.
2. **Pixel movement is deferred to adoption**, i.e. to a brand migration, i.e.
   out of Phase 3's scope. Each item written into
   `docs/superpowers/phase3-migrations.md` MUST be graded either
   **parity-preserving** (adopting the generic renders identically — say how you
   know) or **deliberate look change** (say what changes and why it is acceptable).
   A migration item with no grade is an incomplete item.
3. **A parity claim needs a render, not a test.** This was asserted through
   Phases 1–2 and was *false* — `applyBrandEndpoint`'s dropped default changed
   every PP caption and no test caught it.

**The still-render parity procedure** (proven in Phase 2.5):

```bash
cd examples/layered-minimal
for f in 0 30 45 90 120; do
  npx remotion still src/index.ts MinimalReel "out/f$f.png" --frame=$f
done
shasum -a 256 out/f*.png
```

Byte-deterministic. **Caveat: roughly 1 render in 20 flakes on a video-decode-heavy
frame.** A mismatch is not a finding until it has been re-rendered and reproduced.
Two mismatches occurred in Phase 2.5; one was real, one was noise.

### Bare-specifier resolution breaks when core code moves — check BOTH toolchains

Phase 2 moved the editor host into `lib/editor/host/`. Files there import
`remotion`, `@remotion/player`, `react` by bare specifier, and every resolver that
walks up `node_modules` from the *importing* file then fails — it climbs to the
brand repo root and stops. This bit **tsc** (~160 phantom errors per brand
directory, fixed with `paths`) and **Vite** (the editor silently never mounted,
fixed with a `resolveId` hook, `cb51d4d`) **independently**.

Phase 3 moves more code into core. **Assume it recurs. Check tsc AND Vite, not
just the one that complains.** A Vite failure is silent: `#root` stays empty, no
console error, and the only evidence is one line in the dev-server log.

### Corrections to `docs/superpowers/HANDOFF.md` established by this plan's survey

The handoff's seam list was written from the plan, not from the brand repos. A
read-only survey of both brand repos found three claims wrong. **These are
corrected here and must be corrected in HANDOFF.md by Task 12.**

1. **Seam 4 — "extend `GenericWatermark` with the PNG-as-alpha-mask tint
   technique".** The handoff does not say whose technique it is. It is
   **roost's**, at `templates/roost-reels/src/overlays/Watermark.tsx:26-45`, and
   it is **absent from PP entirely** (PP uses a plain `<Img>` with `opacity`).
   The technique is real and worth generalising; the attribution matters because
   PP's migration item is "adopt a new capability", not "switch to core's copy of
   what you already do".
2. **Seam 5 — "parameterized by `theme.tokens.caption`, which already exists
   brand-side".** **`theme.tokens.caption` does not exist.** There is no `tokens`
   object anywhere in either brand repo or in `lib/theming`. What exists is three
   *disagreeing* sources: `CaptionStrip.tsx`'s module constants (lines 13–20,
   146–152, authoritative because they are what renders), a `caption` block in
   `campaign-reels/src/config/theme.ts:36-45` that **nothing imports**, and a
   richer `reels.caption` block in `brands/progresivni-pardubice/brand.json` that
   **no TS/TSX code reads**. They disagree on `bottomPct` (0.28 vs 0.20) and on
   `color`. Task 5 must therefore **design** the token contract, not wire an
   existing one, and must state which of the three it takes as truth.
3. **Seam 2 — "`frameOffsetSec` at four call sites".** It is **computed** in four
   renderers (`video-item-renderers.tsx:129,163,203,236`) and **applied at eight
   sites** (`trimIn` at 136,171; `titleOverlaySpec` at 143,184,228,248;
   `boundTranscript` at 155,195). The correction matters because a migration that
   removes four sites leaves four behind.

Two further facts the seam list omits, both load-bearing:

4. **The two brands' media-path rules genuinely conflict.** PP's
   `resolveAudioSource` tests an **explicit prefix list**
   (`raw.startsWith('recordings/') || raw.startsWith('broll/')`); roost's
   `resolveVideoSource` tests **any slash** (`raw.includes('/')`). Roost's data is
   full `media/…` paths. **Adopting PP's rule would break every roost photo and
   broll item.** Task 6 must take roost's rule (the superset) and prove PP is
   unaffected. Roost's file carries an explicit `UPSTREAM-PENDING` banner asking
   core for exactly this.
5. **PP's 11 campaign projects carry vendored pre-refactor copies** of the whole
   assembly — each `projects/*/src/LayeredCampaignReel.tsx` has its own inline
   `extractEffects` and 9 `@brand-lib` imports. The composition-theme extraction
   was never synced down. Any migration needs a `sync_template` story for those 11
   (+5 web-program-intro projects), which is why Task 8 exists.

---

## File Structure

### New files in core

| File | Responsibility |
|---|---|
| `lib/theming/registry.ts` | The one generic registry primitive: `resolveRegistered(registry, kind, generics)` + the `Registration<P>` shape (`renderer`, `config`, `params`, `routing?`). Every axis is an instance of it. |
| `lib/theming/effects/index.ts` | `resolveEffectRenderer`, `CORE_EFFECTS`, the `EffectRenderProps` contract. |
| `lib/theming/effects/primitives.tsx` | Core generic effects: `grain`, `scanlines`, `vignette`, `grade`, `transform`. |
| `lib/theming/effects/ken-burns.ts` | `ken-burns` math extracted verbatim from `SegmentMedia.tsx:31-74`, re-registered as a core effect. **Byte-identical output is the acceptance criterion.** |
| `lib/theming/generic/GenericOutro.tsx` | Asset outro: `props: { video?, audio? }`. |
| `lib/theming/generic/GenericMultiClip.tsx` | The four layouts (`split-h`, `split-v`, `pip`, `quad`), geometry from theme tokens. |
| `lib/theming/generic/GenericCard.tsx` | Card shell + `PatternBg`-equivalent; `cardKind` dispatch open to registration. |
| `lib/theming/generic/GenericCaptions.tsx` | Caption renderer parameterized by `CaptionTokens`. Both modes (`pop-focus`, `highlight`). |
| `lib/theming/generic/GenericDisclaimer.tsx` | The `disclaimer` brand-layer kind. |
| `lib/theming/brand-track.ts` | `defaultRenderBrandTrack(items, theme)` + the brand-layer registry. |
| `lib/theming/media-source.ts` | `resolveMediaSource(raw, role)` — the single rule, shared by renderers and the editor timeline. |
| `lib/theming/tokens.ts` | `ThemeTokens` — `caption`, `multiClip`, `card`, `watermark`. The typed home the brands never had. |
| `docs/superpowers/phase3-migrations.md` | Paste-ready brand migrations, each graded parity-preserving / deliberate look change. |
| `docs/superpowers/phase3-extension-contract.md` | The contract itself, as reference documentation. |

### Modified in core

| File | Change |
|---|---|
| `lib/theming/types.ts` | `OverlayKind` widened to `string`; `overlays`/`overlayItems` unified; `effects`, `brandLayer`, `tokens`, `resolveMediaSource` added to `CompositionTheme`. |
| `lib/theming/brand-theme.ts` | Re-expressed on `resolveRegistered`; generics table extended with `card`/`outro`/`multi-clip`. |
| `lib/render/layered-composition.tsx` | `TEXT_KINDS`/`TrackTextOverlay` bridge collapsed into the unified registry; brand track via `defaultRenderBrandTrack`. |
| `lib/theming/segment/SegmentMedia.tsx` | `ken-burns` hardcode replaced by the effect registry; `staticFile` call routed through `resolveMediaSource`. |
| `lib/editor/app/LayeredTimeline.tsx:25-32` | `audioUrl`/`videoUrl` replaced by `resolveMediaSource`. |
| `lib/editor/app/editor-meta.ts` | `EditorMeta` derived from theme registrations rather than declared twice. |
| `lib/editor/app/LayeredInspector.tsx` | Controls rendered from a registration's `params`. |
| `video_toolkit/sync_template.py:136,141` | Mirror the full vendored surface, not only `src`. |
| `examples/layered-minimal/**` | Exercises every new generic; the parity + typecheck gate. |

---

## Task Sequence and Dependencies

```
1 (registry primitive + overlay unification)  ← everything depends on this
├── 2 (effects)          ── needs 1
├── 3 (card/outro/multi) ── needs 1
├── 4 (brand track)      ── needs 1
├── 5 (captions)         ── needs 1, tokens from 3
└── 6 (media paths)      ── independent of 1, but touches SegmentMedia like 2
7 (inspector)            ── needs 1,2,3 (reads their `params`)
8 (sync_template)        ── fully independent, Python only
9 (TransitionGallery)    ── fully independent
10 (at-cut visual pass)  ── independent; consumes the still procedure
11 (WPI + brand-lib migration docs) ── needs 1-6 to describe what to adopt
12 (HANDOFF + docs update)          ── last
```

Tasks **8, 9, 10** are independent of the registry work and of each other. They
may be dispatched in parallel with 1–6.

---

## Task 1: The registry primitive, and one overlay registry

**Why first:** two live overlay registries exist today and every other seam copies
whichever one it happened to be written against. Collapsing them defines the
`Registration` shape that Tasks 2–5 instantiate.

**Files:**
- Create: `lib/theming/registry.ts`
- Create: `lib/editor/src/registry.test.ts`
- Modify: `lib/theming/types.ts` (`OverlayKind`, `OverlayRegistration`, `OverlayItemRegistration`, `BrandTheme`, `CompositionTheme`)
- Modify: `lib/theming/brand-theme.ts`
- Modify: `lib/render/layered-composition.tsx:18,36,79` (the `TEXT_KINDS` / `TrackTextOverlay` bridge)
- Modify: `lib/theming/index.ts` (exports)
- Test: `lib/editor/src/overlay-registry.test.tsx`

**Interfaces:**

- Produces:

```ts
// lib/theming/registry.ts
export interface Registration<P> {
  /** The renderer for this kind. Absent = routing-only (the owning body draws it). */
  renderer?: React.FC<P>;
  /** Opaque brand config, threaded to the renderer as `config`. */
  config?: unknown;
  /** Declared editable fields — what makes a brand kind editable without core UI. */
  params?: readonly ParamField[];
}

export type Registry<P> = Record<string, Registration<P>>;

/** THE resolution order for every axis: brand registration wins, core generic
 *  beneath. Returns undefined only when neither has the kind. */
export function resolveRegistered<P>(
  registry: Registry<P> | undefined,
  kind: string,
  generics: Record<string, React.FC<P>>,
): React.FC<P> | undefined;

export function registrationConfig<P>(
  registry: Registry<P> | undefined,
  kind: string,
): unknown;
```

`ParamField` is imported from `lib/editor/app/editor-meta.ts`'s existing
definition — **do not redeclare it**; Task 7 moves it to a shared home. For now
`registry.ts` declares a structurally identical local `ParamField` and Task 7
collapses them. Record this as a known temporary duplicate in the commit message.

- Produces (the unified overlay contract, replacing both existing ones):

```ts
// lib/theming/types.ts
/** Overlay kinds are OPEN. Core knows routing modes, never kind names. */
export type OverlayKind = string;

export interface OverlayItemRegistration extends Registration<OverlayRenderProps> {
  routing?: OverlayRouting;          // 'track' (default) | 'anchored'
  /** Item-level escape hatch: full control over the node, bypassing
   *  OverlayRenderProps. Wins over `renderer` when both are present. */
  render?: (item: OverlayItem) => React.ReactNode;
}

export interface BrandTheme {
  accentSlots: readonly AccentSlot[];
  /** ONE open-keyed overlay registry. Absent kind → core generic (text) → null. */
  overlays?: Record<string, OverlayItemRegistration>;
  video?: Record<string, VideoRegistration>;
}
```

**Back-compat is the whole risk here.** Both brands register
`overlays: { text: { renderer: … } }` against `BrandTheme.overlays`, and PP
additionally registers six kinds against `CompositionTheme.overlayItems`. After
this task **both call shapes must keep working**, because Phase 3 does not touch
brand repos. The merge rule, in `layered-composition.tsx`:

```ts
// overlayItems (composition tier) overrides overlays (brand tier) per kind.
const overlayRegistry = { ...theme.overlays, ...theme.overlayItems };
```

`CompositionTheme.overlayItems` stays declared, marked `@deprecated` in its
doc comment, and Task 11 writes the migration that collapses it.

- [ ] **Step 1: Write the failing test for `resolveRegistered`**

```ts
// lib/editor/src/registry.test.ts
import { describe, it, expect } from 'vitest';
import { resolveRegistered, registrationConfig } from '@video-toolkit/lib/theming/registry';

const Generic = () => null;
const Brand = () => null;

describe('resolveRegistered', () => {
  it('prefers a brand registration over the core generic', () => {
    expect(resolveRegistered({ text: { renderer: Brand } }, 'text', { text: Generic })).toBe(Brand);
  });

  it('falls back to the core generic when the brand did not register the kind', () => {
    expect(resolveRegistered({}, 'text', { text: Generic })).toBe(Generic);
  });

  it('falls back to the core generic when the registry is absent entirely', () => {
    expect(resolveRegistered(undefined, 'text', { text: Generic })).toBe(Generic);
  });

  it('returns undefined when neither brand nor core has the kind', () => {
    expect(resolveRegistered({}, 'chevron', { text: Generic })).toBeUndefined();
  });

  it('treats a routing-only registration (no renderer) as not resolving a renderer', () => {
    expect(resolveRegistered({ title: { routing: 'anchored' } }, 'title', {})).toBeUndefined();
  });

  it('does NOT let a routing-only registration mask the core generic', () => {
    // A brand that registers routing for a kind core can draw still gets core's drawing.
    expect(resolveRegistered({ text: { routing: 'track' } }, 'text', { text: Generic })).toBe(Generic);
  });

  it('reads the opaque config off the registration', () => {
    expect(registrationConfig({ text: { config: { strokeRatio: 0.2 } } }, 'text')).toEqual({ strokeRatio: 0.2 });
  });
});
```

The last-but-one case is the subtle one: roost registers `text` **with** a
renderer, PP registers `title` with routing and **no** renderer expecting nothing
to draw. Both must hold.

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd lib/editor && npx vitest run src/registry.test.ts`
Expected: FAIL — `Cannot find module '@video-toolkit/lib/theming/registry'`.

- [ ] **Step 3: Implement `lib/theming/registry.ts`**

```ts
// lib/theming/registry.ts — the ONE resolution rule every extension axis uses.
// Brand registration wins; the core generic sits beneath it. A registration
// with no `renderer` contributes routing/config/params only and does NOT mask
// the generic — that is what lets a brand re-route a kind core can still draw.
import type React from 'react';

export interface ParamField {
  prop: string;
  label?: string;
  options?: readonly string[];
  type?: 'number' | 'string' | 'boolean';
}

export interface Registration<P> {
  renderer?: React.FC<P>;
  config?: unknown;
  params?: readonly ParamField[];
}

export type Registry<P> = Record<string, Registration<P>>;

export function resolveRegistered<P>(
  registry: Registry<P> | undefined,
  kind: string,
  generics: Record<string, React.FC<P>>,
): React.FC<P> | undefined {
  return registry?.[kind]?.renderer ?? generics[kind];
}

export function registrationConfig<P>(registry: Registry<P> | undefined, kind: string): unknown {
  return registry?.[kind]?.config;
}

export function registrationParams<P>(
  registry: Registry<P> | undefined,
  kind: string,
): readonly ParamField[] | undefined {
  return registry?.[kind]?.params;
}
```

- [ ] **Step 4: Run and confirm green**

Run: `cd lib/editor && npx vitest run src/registry.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verify by mutation**

Change `registry?.[kind]?.renderer ?? generics[kind]` to
`generics[kind] ?? registry?.[kind]?.renderer` and confirm the first test fails.
Revert. A test suite that does not fail when the rule inverts is not testing the rule.

- [ ] **Step 6: Commit**

```bash
git add lib/theming/registry.ts lib/editor/src/registry.test.ts
git commit --no-gpg-sign -m "feat(theming): one resolution rule for every extension axis"
```

- [ ] **Step 7: Write the failing test for the unified overlay registry**

```ts
// lib/editor/src/overlay-registry.test.tsx
import { describe, it, expect, vi } from 'vitest';
vi.mock('remotion', async () => await import('./__mocks__/remotion'));
import { render } from '@testing-library/react';
import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
// … a minimal LayeredReel with one 'text' overlay and one 'chevron' overlay
```

Assertions, each independently mutation-checked:
1. A brand registering `overlays: { text: { renderer: Brand } }` (roost's shape)
   still renders `Brand` for a `text` item.
2. A brand registering `overlayItems: { chevron: { render: fn } }` (PP's shape)
   still calls `fn` for a `chevron` item.
3. `overlayItems` overrides `overlays` for the same kind.
4. An unregistered kind with no core generic renders nothing (no throw).
5. `quote-pull` still routes to the text adapter (the legacy alias must survive).
6. `routing: 'anchored'` + `anchorVideoId` still diverts the item off the track.

- [ ] **Step 8: Run, confirm the new assertions fail, implement, re-run**

Implement the `{ ...theme.overlays, ...theme.overlayItems }` merge in
`layered-composition.tsx` and collapse `TEXT_KINDS`/`TrackTextOverlay` into a
core generic entry `{ text: TrackTextOverlay, 'quote-pull': TrackTextOverlay }`.
Expected after implementation: PASS.

- [ ] **Step 9: Run the full gate set**

```bash
cd lib/editor && npx vitest run && npx tsc --noEmit
cd ../../examples/layered-minimal && npm run typecheck
```

Expected: **≥669 tests** green, tsc **4**, typecheck **0**.

- [ ] **Step 10: Prove render parity with stills**

Run the still-render procedure from Global Constraints **before** and **after**
this task's changes (stash to get the "before"). All five hashes must match.
If one differs, **re-render it twice** before calling it a finding.

- [ ] **Step 11: Commit**

```bash
git add -A lib/theming lib/render lib/editor/src
git commit --no-gpg-sign -m "refactor(theming): collapse the two overlay registries into one open-keyed registry

Both brand call shapes keep working: BrandTheme.overlays and
CompositionTheme.overlayItems merge, the latter winning per kind.
overlayItems is now deprecated; the collapse is a Phase 3 migration item.
Still-render parity verified on examples/layered-minimal, 5 frames."
```

---

## Task 2: The effect registry and core generic effect primitives

**Why:** `resolveEffectRenderer` does not exist. `SegmentMedia` understands
exactly one effect, `ken-burns` (`lib/theming/segment/SegmentMedia.tsx:21,32`).
Everything else is an ad-hoc brand pipeline: roost's `vintage` is `HtmlInCanvas` +
`@remotion/effects` + CSS filters; PP's `blend` is a gradient-masked second
`<OffthreadVideo>`. PP's `video-item-renderers.tsx` (270 LOC) exists **purely** to
reverse `effects[]` back into legacy prop bags.

**Files:**
- Create: `lib/theming/effects/index.ts`, `lib/theming/effects/primitives.tsx`, `lib/theming/effects/ken-burns.ts`
- Modify: `lib/theming/segment/SegmentMedia.tsx:21-74` (the `ken-burns` hardcode)
- Modify: `lib/theming/types.ts` (`CompositionTheme.effects`)
- Test: `lib/editor/src/effects-registry.test.tsx`, `lib/editor/src/ken-burns-parity.test.ts`

**Interfaces:**
- Consumes: `resolveRegistered`, `Registration<P>` from Task 1.
- Produces:

```ts
// lib/theming/effects/index.ts
/** An effect is a WRAPPER: it receives the media node and returns a decorated
 *  node. That is the shape both brands' effects already have — roost's
 *  vintageWrap(mode, media) and PP's blend layer both wrap. */
export interface EffectRenderProps {
  /** The effect entry off the item's `effects[]`, minus nothing — `type` included. */
  effect: Effect;
  /** The item the effect is attached to (for startMs-derived beat phase etc.). */
  item: VideoItem;
  /** Extra frames borrowed at each edge for cross-item transitions. */
  handles: { inHalf: number; outHalf: number };
  config?: unknown;
  children: React.ReactNode;
}

export type EffectRenderer = React.FC<EffectRenderProps>;

export function resolveEffectRenderer(
  theme: BrandTheme,
  type: string,
): EffectRenderer | undefined;

/** Applies every effect on an item, in array order, innermost-first. */
export function applyEffects(
  theme: BrandTheme,
  item: VideoItem,
  handles: { inHalf: number; outHalf: number },
  media: React.ReactNode,
): React.ReactNode;
```

**Core generic primitives** (`primitives.tsx`), each brand-neutral, each
parameterized entirely by its own effect entry — **no brand colours**, the
brand-leak gate must stay at 2:

| type | params | what it does |
|---|---|---|
| `grain` | `amount`, `seed?`, `tileSize?` | Frame-seeded noise tile at `mixBlendMode: 'overlay'`. Deterministic from `frame` when `seed` is absent. |
| `scanlines` | `spacingPx`, `opacity`, `blend?` | Repeating-gradient scanlines. |
| `vignette` | `strength`, `radiusPct?` | Radial-gradient vignette. |
| `grade` | delegates to the existing `lib/reel-config-base/grade.ts` (`gradeFilter`, `gradeNeedsWb`, `gradeWbMatrixValues`) | The grade already on `VideoContainerBase`, expressible as an effect. |
| `transform` | `scale?`, `translateXPct?`, `translateYPct?`, `rotateDeg?` | Static CSS transform. |
| `ken-burns` | existing shape, unchanged | **Extracted verbatim.** See below. |

- [ ] **Step 1: Write the `ken-burns` parity test FIRST, before moving any code**

This is the highest-risk extraction in the task: `ken-burns` renders today, in
both brands, so moving it *can* move pixels. Pin the current math before touching
it.

```ts
// lib/editor/src/ken-burns-parity.test.ts
import { describe, it, expect } from 'vitest';
import { kenBurnsStyle } from '@video-toolkit/lib/theming/effects/ken-burns';

// The two shapes SegmentMedia supports today, per its own comment at :21-30:
//  - roost's `direction` shorthand (was KenBurnsPhoto.tsx)
//  - campaign's explicit from/to fields (was BrollSegment/PhotoSegment)
describe('ken-burns math is preserved exactly', () => {
  it('direction:in — scale ramps 1.08 → 1.20, no translate', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'in' }, 0, 100, undefined, undefined))
      .toEqual({ transform: 'scale(1.08) translate(0px, 0px)' });
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'in' }, 100, 100, undefined, undefined))
      .toEqual({ transform: 'scale(1.2000000000000002) translate(0px, 0px)' });
  });

  it('direction:left — scale ramps 1.08 → 1.14 and translates to -60px', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'left' }, 100, 100, undefined, undefined))
      .toEqual({ transform: 'scale(1.1400000000000001) translate(-60px, 0px)' });
  });

  it('direction:up — translates y to -60px', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'up' }, 100, 100, undefined, undefined))
      .toEqual({ transform: 'scale(1.1400000000000001) translate(0px, -60px)' });
  });
});
```

**The exact float literals matter.** Do not round them, do not use `toBeCloseTo`
— the point is byte-identical output. Derive the expected values by *running the
current code*, not by computing them by hand:

```bash
cd lib/editor && npx vitest run src/ken-burns-parity.test.ts
```

Read the actual values out of the failure output and paste them in. Then add the
explicit from/to cases the same way, covering: both endpoints omitted (falls back
to the item's `focalX`/`focalY`), one endpoint omitted, both present, and the
`objectPosition`/`transformOrigin` fields that only the from/to branch emits.

- [ ] **Step 2: Run against the CURRENT `SegmentMedia`, before extraction**

Temporarily import the function from `SegmentMedia.tsx` (export it if it is
module-private) to confirm the expectations describe today's behaviour.
Expected: PASS. **This is the baseline. If it does not pass, the expectations are
wrong, not the code.**

- [ ] **Step 3: Extract to `lib/theming/effects/ken-burns.ts` and re-point the test**

Move `KenBurnsEffect`, `findKenBurns`, `kenBurnsStyle` verbatim — no
simplification, no reformatting of the math, no "while I'm here". Re-export from
`SegmentMedia.tsx` so its existing import keeps working.

- [ ] **Step 4: Re-run the parity test**

Expected: PASS with the identical literals. Any change in a float is a defect.

- [ ] **Step 5: Commit the extraction alone**

```bash
git add lib/theming/effects/ken-burns.ts lib/theming/segment/SegmentMedia.tsx lib/editor/src/ken-burns-parity.test.ts
git commit --no-gpg-sign -m "refactor(effects): extract ken-burns math verbatim, pinned by a parity test"
```

- [ ] **Step 6: Write the failing test for the effect registry**

Cases: a brand-registered effect type wins; an unregistered type with a core
generic resolves to the generic; an unregistered type with no generic is
**silently skipped, not thrown** (today unknown types are silently ignored by
PP's `extractEffects` — preserve that, a config with a typo'd effect must still
render); `applyEffects` composes multiple effects in array order, innermost-first;
an item with no `effects` returns the media node **identically** (referential
equality — no wrapper allocation).

- [ ] **Step 7: Implement, run, confirm green**

- [ ] **Step 8: Write tests for each of the five core primitives**

One test file per primitive is overkill; one file with a `describe` per primitive
is right. Each asserts the produced style object, not a snapshot — a snapshot
would pass through a wrong value.

- [ ] **Step 9: Implement the primitives**

**Brand-leak discipline:** no `#c6f432`, no `#2f0c02`, no `sepia(0.22)…`. Every
colour and magnitude arrives from the effect entry. Roost's `FILM_FILTER` /
`VHS_FILTER` constants stay brand-side and become a `grade`+`grain`+`scanlines`
composition in the migration doc — graded **deliberate look change** unless a
still render proves otherwise, which Task 11 must state honestly rather than
assume.

- [ ] **Step 10: Wire `applyEffects` into `SegmentMedia`, replacing the hardcode**

- [ ] **Step 11: Run all four gates + still-render parity**

Expected: tests ≥669+new, tsc 4, typecheck 0, **brand-leak grep exactly 2**.
Stills: all five hashes unchanged.

- [ ] **Step 12: Commit**

```bash
git add -A lib/theming lib/editor/src
git commit --no-gpg-sign -m "feat(effects): effect registry + core generic grain/scanlines/vignette/grade/transform

ken-burns moves from SegmentMedia's hardcode into the registry with its math
pinned byte-identical. Unknown effect types are skipped, not thrown, matching
today's behaviour. Still-render parity verified, 5 frames."
```

---

## Task 3: Core generics for `outro`, `multi-clip` and `card`

**Why:** `VideoKind` covers all six kinds, but `layered-composition.tsx:56` does
`if (!Renderer) return null` — so a brand must register `card`/`outro`/`multi-clip`
or they vanish. That is the copy-paste channel the programme exists to close.

**What the two brands actually do** (surveyed, not assumed):

| kind | PP | roost |
|---|---|---|
| `outro` | **asset-based, 10 LOC** — `OffthreadVideo brand/outro.mp4` + `Audio brand/outro.mp3`. Ignores the item entirely. | **procedural over a PNG lockup**, 224 LOC across 4 files — 5 reveal styles incl. a beat-locked `heartbeat` envelope. |
| `multi-clip` | **135 LOC, all four layouts** (`split-h`, `split-v`, `pip`, else `quad`) | not registered, not implemented |
| `card` | 23 LOC; `cardKind` vocabulary is 4 names but **only `claim-plate` implemented** — the other three fall to `plate = null` | not registered, not implemented |

So: **PP's outro is the generic** (asset-based, trivially parameterizable), and
**roost's is the override** — which is precisely what the contract is for. PP's
multi-clip is the only implementation of that kind anywhere and generalises
cleanly once its brand literals (`#0a0a0a` borders, `#c6f432` pip border, lime
label) move to tokens.

**Files:**
- Create: `lib/theming/generic/GenericOutro.tsx`, `lib/theming/generic/GenericMultiClip.tsx`, `lib/theming/generic/GenericCard.tsx`, `lib/theming/tokens.ts`
- Modify: `lib/theming/brand-theme.ts` (generics table), `lib/theming/types.ts`
- Test: `lib/editor/src/generic-outro.test.tsx`, `generic-multiclip.test.tsx`, `generic-card.test.tsx`
- Modify: `examples/layered-minimal/src/Root.tsx` + `theme.tsx` — exercise all three

**Interfaces:**
- Consumes: `resolveRegistered` (Task 1), `applyEffects` (Task 2), `SegmentMedia`.
- Produces:

```ts
// lib/theming/tokens.ts — the typed home for look constants a generic needs.
// NOTE: no brand has a `tokens` object today (see Global Constraints correction
// #2). This is a NEW contract, not a lift of an existing one.
export interface MultiClipTokens {
  /** Divider between panes. */
  borderPx?: number;
  borderColor?: string;
  /** PIP inset box geometry, in composition px. */
  pip?: { width: number; height: number; right: number; bottom: number; borderPx?: number; borderColor?: string };
  /** Per-pane label typography. */
  label?: { fontFamily?: string; fontSize?: number; color?: string; top?: number; left?: number };
  quadGapPx?: number;
  background?: string;
}

export interface ThemeTokens {
  caption?: CaptionTokens;      // Task 5
  multiClip?: MultiClipTokens;
  card?: CardTokens;
  watermark?: WatermarkTokens;  // Task 4
}
```

Every token field is **optional with a documented neutral default**, so a theme
that declares no `tokens` still renders. That is the same discipline
`editor-meta.ts` already states in its module comment ("everything here is
optional and every consumer has a neutral core default").

- [ ] **Step 1: Write the failing test for `GenericOutro`**

```ts
// Renders an OffthreadVideo for props.video and an Audio for props.audio.
// Both optional: props {} renders nothing and does not throw.
// A source is routed through resolveMediaSource (Task 6) — until Task 6 lands,
// through staticFile, with an http passthrough.
```

Assert on the mocked `remotion` module's recorded calls, not a DOM snapshot.

- [ ] **Step 2: Run, confirm fail, implement `GenericOutro`, re-run green**

```tsx
export const GenericOutro: React.FC<VideoRenderProps> = ({ item }) => {
  const props = (item.props ?? {}) as { video?: string; audio?: string };
  return (
    <AbsoluteFill>
      {props.video && <OffthreadVideo src={resolveSrc(props.video)} muted />}
      {props.audio && <Audio src={resolveSrc(props.audio)} />}
    </AbsoluteFill>
  );
};
```

`muted` on the video plus a separate `<Audio>` mirrors PP exactly — PP's outro
video is muted and its audio is a separate file. **Do not "improve" this to an
unmuted video**; that would double-play for any brand whose outro mp4 carries
audio.

- [ ] **Step 3: Write the failing tests for `GenericMultiClip`**

One test per layout asserting the produced flex/grid geometry, plus: fewer
sources than the layout expects renders the available panes without throwing;
more sources than the layout uses ignores the extras; each pane gets a synthetic
`VideoItem` with a **0-based span** `[0, (sourceOutMs - sourceInMs))` and
`handles {0,0}` — sub-clips never participate in transitions.

- [ ] **Step 4: Implement `GenericMultiClip`**

Port PP's `brand-lib/segments/MultiClipSegment.tsx` structure, replacing every
literal with a token + neutral default. Carry forward PP's documented caveat as a
code comment: **sub-source trims are not extended into handle frames**, so a
transition on a multi-clip item shifts the Sequence without growing the sources.
PP marked this unverified; do not silently "fix" it here — that is a look change.

- [ ] **Step 5: Write the failing tests for `GenericCard`, implement**

`GenericCard` renders a background (pattern variants: `pixels`, `dots`, `grid`,
`diagonals`, `none` — pure CSS gradients, colours from tokens) plus a staggered
line stack. `cardKind` dispatch stays **open**: an unregistered `cardKind` renders
the background and nothing else rather than throwing, matching PP's current
`plate = null` behaviour for its three unimplemented kinds.

- [ ] **Step 6: Register all three in the generics table**

`lib/theming/brand-theme.ts`:

```ts
const GENERIC_VIDEO_RENDERERS: Record<string, VideoRenderer> = {
  clip: SegmentMedia, broll: SegmentMedia, photo: SegmentMedia,
  'multi-clip': GenericMultiClip, card: GenericCard, outro: GenericOutro,
};
```

**This is the one line that changes what an unregistered kind does.** Verify
explicitly that both brands still win: PP registers all six (so nothing changes
for PP), roost registers `clip`/`photo`/`broll`/`outro` (so roost's outro still
wins and roost gains generics for `card`/`multi-clip` it does not use).

- [ ] **Step 7: Widen the `resolveVideoRenderer` overloads**

With every kind now having a generic, the `FootageVideoKind`-vs-`VideoKind`
overload split in `brand-theme.ts:33-37` is obsolete. Collapse it to a single
signature returning `VideoRenderer | undefined` (undefined only for a kind
neither side has, now that kinds are open strings). Fix every call site tsc
reports. **Run `cd examples/layered-minimal && npm run typecheck` too** — the
overload is used from `lib/render`, which `lib/editor`'s tsc does not fully reach.

- [ ] **Step 8: Exercise all three in `examples/layered-minimal`**

Add a `card`, an `outro` and a `multi-clip` item to the example's reel literal
and its theme. **This is what makes the third gate cover the new code** — and it
extends the still-render parity surface for every later task.

- [ ] **Step 9: Run all four gates + render the example**

```bash
cd examples/layered-minimal && npm run typecheck && npx remotion still src/index.ts MinimalReel out/probe.png --frame=45
```

Expected: typecheck 0, still exits 0. **Eyeball the PNG** — this is new rendering
with no prior baseline, so a hash proves nothing; look at it. Delete probes after.

- [ ] **Step 10: Commit**

```bash
git add -A lib/theming examples/layered-minimal lib/editor/src
git commit --no-gpg-sign -m "feat(theming): core generics for outro, multi-clip and card

Every VideoKind now resolves. The asset-outro generalises PP's; roost's
procedural outro stays an override, which is what the contract is for.
examples/layered-minimal exercises all three, extending both the typecheck
gate and the still-render parity surface."
```

---

## Task 4: Brand-layer registry, `defaultRenderBrandTrack`, watermark tint, disclaimer

**Why:** `renderBrandTrack` is a hook, not a registry, so each brand writes its
own `…BrandTrack` of the same shape and **neither uses core's `GenericWatermark`**
(verified by grep in both repos). Three implementations of corner anchoring exist.

**What the two brands do:**

- PP: `CampaignBrandTrack` (~10 LOC) ignores per-item content entirely, computes
  `max(endMs)` and mounts **one** `PersistentOverlay` (40 LOC, **no props**,
  reads a module-level `theme`) drawing watermark + disclaimer together. Corner
  anchoring is a local 9-line switch that hardcodes a **square** `width/height`.
- roost: `RoostBrandTrack` (inline, ~17 LOC) renders **only** the watermark,
  spanning `[0, endMs)` regardless of the item's own `startMs`; any other kind is
  silently dropped. Corner anchoring is two hardcoded ternaries with **asymmetric
  margins (40 vertical / 36 horizontal)** that ignore `theme.watermark.marginPx`.
- Core's `GenericWatermark` (59 LOC) has the declarative `CORNER_EDGES` table, one
  `marginPx` for both axes, `height: 'auto'`, and an `assets[]`/`index` switcher
  neither brand has.

**The tint technique — corrected attribution.** It is roost's, at
`templates/roost-reels/src/overlays/Watermark.tsx:26-45`, and **absent from PP**.
It renders **no `<Img>` at all**: a solid-colour `<div>` with the PNG applied as a
CSS mask, so one asset renders in any brand colour:

```ts
const mask = `url(${staticFile(asset)})`;
// backgroundColor: color, WebkitMaskImage: mask, maskImage: mask,
// maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center'
```

**Files:**
- Create: `lib/theming/brand-track.ts`, `lib/theming/generic/GenericDisclaimer.tsx`
- Modify: `lib/theming/generic/GenericWatermark.tsx` (tint mode, asymmetric margins)
- Modify: `lib/render/layered-composition.tsx` (brand-track dispatch)
- Modify: `lib/theming/types.ts`, `lib/theming/tokens.ts`
- Test: `lib/editor/src/generic-watermark.test.tsx` (**exists — extend it**), `lib/editor/src/brand-track.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface WatermarkTokens {
  /** 'image' (default): an <Img>. 'tint': the PNG as an alpha mask over a
   *  solid colour, so one asset renders in any brand colour. */
  mode?: 'image' | 'tint';
  /** Required when mode is 'tint'; ignored otherwise. */
  color?: string;
  /** Per-axis margins. A single number sets both (back-compat with marginPx). */
  margin?: number | { vertical: number; horizontal: number };
}

/** The default brand track: one Sequence per item, dispatched by kind through
 *  the brand-layer registry. A brand overrides individual kinds by registering
 *  them; `renderBrandTrack` remains as the whole-track escape hatch. */
export function defaultRenderBrandTrack(
  items: BrandLayerItem[],
  theme: CompositionTheme,
  fps: number,
): React.ReactNode;
```

Dispatch order in `layered-composition.tsx`, preserving both brands:

```ts
{theme.renderBrandTrack
  ? theme.renderBrandTrack(reel.tracks.brand)          // PP + roost today
  : defaultRenderBrandTrack(reel.tracks.brand, theme, fps)}
```

- [ ] **Step 1: Extend `generic-watermark.test.tsx` with the tint mode**

New cases: `mode: 'tint'` emits **no `<Img>`** and a div whose `maskImage` and
`WebkitMaskImage` both carry the asset URL and whose `backgroundColor` is
`tokens.color`; `mode: 'tint'` with no `color` falls back to a documented neutral
and does not throw; `mode: 'image'` (and mode absent) produce **exactly today's
output** — assert the existing `<Img>` path is untouched.

- [ ] **Step 2: Add per-axis margins**

Cases: `margin: 40` sets both axes to 40 (identical to today's `marginPx: 40`);
`margin: { vertical: 40, horizontal: 36 }` reproduces roost's asymmetry; `marginPx`
still works and is documented as the back-compat alias.

- [ ] **Step 3: Run, confirm fail, implement, re-run green**

Keep `height: 'auto'` for `mode: 'image'`. **Do not adopt PP's square
`width/height`** — that is PP's local divergence, and a migration item, not core's
default. Record that decision in the migration doc as a **deliberate look change**
for PP: adopting `GenericWatermark` changes their watermark's aspect handling
unless their PNG is already square. **Task 11 must check whether it is** rather
than assuming.

- [ ] **Step 4: Write the failing test for `GenericDisclaimer` and implement**

A full-width text row at a token-driven vertical offset, token typography, no
background. Parameterized from `item.props.text`; renders `null` for empty text.

- [ ] **Step 5: Write the failing test for `defaultRenderBrandTrack` and implement**

Cases: one Sequence per item, each spanning the item's **own** `[startMs, endMs)`
— note this differs from **both** brands, which span `[0, max(endMs))`; a kind
with no registration and no generic is skipped, not thrown; a registered kind
wins over the generic; an empty items array returns null.

**Call out the span difference explicitly in the migration doc.** Neither brand's
current behaviour is wrong — PP's single-overlay mount and roost's `[0, endMs)`
are deliberate — but adopting the default changes when a brand item appears if it
does not start at 0. Grade both migration items accordingly.

- [ ] **Step 6: Run all four gates + still-render parity**

The example's brand track goes through `defaultRenderBrandTrack` (it has no
`renderBrandTrack`), so **stills will legitimately change if the example declares
brand items**. If they do, that is new coverage, not a regression: eyeball the
PNG and re-baseline. Say so in the commit message.

- [ ] **Step 7: Commit**

```bash
git add -A lib/theming lib/render lib/editor/src
git commit --no-gpg-sign -m "feat(theming): brand-layer registry, default brand track, watermark tint + disclaimer

GenericWatermark gains roost's PNG-as-alpha-mask tint mode (one asset, any
brand colour) and per-axis margins. renderBrandTrack stays as the whole-track
escape hatch, so both brands are unaffected."
```

---

## Task 5: `GenericCaptions` and the caption token contract

**Why:** captions are entirely brand-side. `brand-lib/overlays/CaptionStrip.tsx`
(293 LOC) admits in-file that it is hardcoded to one brand. Core exposes
`lib/transcripts/transcript-window.ts` but no caption renderer.

**⚠️ The handoff is wrong about this seam.** It says "parameterized by
`theme.tokens.caption`, which already exists brand-side". **It does not exist.**
There is no `tokens` object anywhere in either brand repo or in `lib/theming`.
There are three *disagreeing* sources:

| source | status | notes |
|---|---|---|
| `CaptionStrip.tsx` module constants (lines 13–20, 146–152) | **authoritative** — this is what renders | `BOTTOM_PCT 0.20`, `LIFT_BOTTOM_PCT 0.42`, `STROKE_WIDTH_PX 4`, `CAPTION_MODE 'pop-focus'` |
| `campaign-reels/src/config/theme.ts:36-45` `caption` block | **dead** — nothing imports it | says `bottomPct: 0.28`, `color: '#c6f432'` |
| `brands/progresivni-pardubice/brand.json` → `reels.caption` | **dead** — no TS/TSX reads it | richest of the three; has `mode`, `activeColor`, `background`, `verticalPosition` |

**Decision, recorded here so the implementer does not have to make it:** take the
**module constants as truth** (they are what renders), name the fields using
`brand.json`'s vocabulary (it is the richest and is where Phase 6 is heading), and
record the two dead sources as migration cleanup items. Do **not** silently adopt
`theme.ts`'s `0.28` — that would move PP's captions 8% of frame height.

**Files:**
- Create: `lib/theming/generic/GenericCaptions.tsx`
- Modify: `lib/theming/tokens.ts` (`CaptionTokens`)
- Test: `lib/editor/src/generic-captions.test.tsx`

**Interfaces:**

```ts
export interface CaptionTokens {
  mode?: 'pop-focus' | 'highlight';        // default 'pop-focus'
  fontFamily?: string; fontSize?: number; fontWeight?: number;
  color?: string;            // inactive word
  activeColor?: string;      // active word
  background?: string;       // the pop-focus pill
  strokeColor?: string; strokeWidthPx?: number;   // default 4 → 80 stacked shadows
  maxWidthPct?: number; maxChars?: number;        // default 28
  bottomPct?: number;        // default 0.20  — NOT theme.ts's 0.28
  liftBottomPct?: number;    // default 0.42
  gapBreakMs?: number;       // default 350 — line break on inter-word gap
  lastLineGraceMs?: number;  // default 600
  maxWordsPerChunk?: number; // default 4
}

export const GenericCaptions: React.FC<{
  words: TranscriptWord[];
  lines?: CaptionLine[];       // explicit override, skips linesFromWords
  liftWindows?: Array<{ startMs: number; endMs: number }>;
  tokens?: CaptionTokens;
}>;
```

- [ ] **Step 1: Write failing tests for `linesFromWords` (pure, no React)**

Extract the line-grouping as a pure function first — it is the part with real
logic and it needs no `remotion` mock. Cases: greedy grouping breaks on a
`> gapBreakMs` inter-word gap; breaks when the candidate exceeds `maxChars`; the
**last** line's `endMs` **and its last word's `endMs`** both get
`lastLineGraceMs` added (PP adds it to both — assert both, they are separate
mutations); an empty word list returns no lines; a single word returns one line.

- [ ] **Step 2: Run, confirm fail, implement, re-run green**

- [ ] **Step 3: Write failing tests for `activeAmount` (pure)**

The ±30 ms linear ramp exists so the colour switch does not blink at ms→frame
rounding boundaries. Cases: 0 before the ramp, 1 in the middle, 0 after, and the
two ramp midpoints at 0.5. **Assert the ramp, not just the plateau** — a
mutation removing the ramp must fail.

- [ ] **Step 4: Write failing tests for chunking**

PP's rule deliberately avoids 1-word micro-chunks: `n=5 → [3,2]`, `7 → [4,3]`,
`9 → [3,3,3]`. Assert those three exactly, plus `n=1 → [1]` and `n=4 → [4]`.

- [ ] **Step 5: Implement chunking and the two render modes**

`pop-focus` (PP's live mode): the active chunk renders as a `nowrap` pill in
`tokens.background`, the active word flips `color` → `activeColor`. `highlight`
(PP's dead branch — port it, it is the one a second brand would want): whole line
centred, inactive words at 0.55 opacity, active word scaled 1.08.

`stroke(px, color)` generates an `(2px+1)² − 1` offset text-shadow list — at the
default `strokeWidthPx: 4` that is **80 stacked shadows per span**. Port it as
found; note the cost in a comment. It is a real render-time expense and a future
optimization target, not this task's problem.

- [ ] **Step 6: Run all four gates**

`GenericCaptions` is not yet wired into any composition (nothing routes captions
in core), so **stills cannot change**. Confirm they do not — an unchanged hash
here is a meaningful negative result.

- [ ] **Step 7: Commit**

```bash
git add -A lib/theming lib/editor/src
git commit --no-gpg-sign -m "feat(theming): GenericCaptions parameterized by CaptionTokens

The handoff said theme.tokens.caption already existed brand-side; it does not.
Three disagreeing sources exist (live module constants, a dead theme.ts block,
a dead brand.json block). This takes the live constants as truth and names the
fields with brand.json's vocabulary; the two dead blocks are migration cleanup."
```

---

## Task 6: `resolveMediaSource` — one rule, shared by renderers and the editor

**Why:** media paths are hardcoded in three places, and **core's own editor
hardcodes the convention a third time** at `lib/editor/app/LayeredTimeline.tsx:25-32`.
Roost's `resolve-video-source.ts` carries an explicit `UPSTREAM-PENDING` banner
asking core for exactly this.

**⚠️ The two brands' rules genuinely conflict — this is the pixel-risk task.**

| | rule | data |
|---|---|---|
| PP `resolveAudioSource` (`composition-theme.tsx:35-37`) | explicit prefix list: `raw.startsWith('recordings/') \|\| raw.startsWith('broll/')` | bare filenames |
| roost `resolveVideoSource` (`src/lib/resolve-video-source.ts:25`) | **any slash**: `raw.startsWith('http') \|\| raw.includes('/')` | full `media/…` paths |

**Adopting PP's rule breaks every roost photo and broll item** (`media/VIDEO-….mp4`
does not start with `recordings/` or `broll/`, so it would be prefixed again into
`recordings/media/VIDEO-….mp4`). **Take roost's rule.** Then prove PP is
unaffected: PP's sources are bare filenames containing no slash, so `includes('/')`
is false and they get prefixed exactly as today. That proof is a test, below.

**Three constraints, all documented in roost's file header — honour all three:**

1. **Resolve at render time only.** The bare name must stay bare on the stored
   item, because `loadTranscriptSync` derives `recordings/<source>.transcript.json`
   from it. **A resolver that writes back into the item breaks captions.**
2. Core's `SegmentMedia` passes `item.source` to `staticFile()` verbatim, so
   *someone* must prefix. Both brands currently hand a **shallow-cloned** item to
   `SegmentMedia`.
3. `photo` deliberately gets **no** prefix in both brands (PP:
   `video-item-renderers.tsx:253` passes it unprefixed; roost's rule returns
   `media/…` untouched). Preserve that.

**Files:**
- Create: `lib/theming/media-source.ts`
- Modify: `lib/theming/segment/SegmentMedia.tsx` (`resolveSrc`)
- Modify: `lib/editor/app/LayeredTimeline.tsx:25-32`
- Modify: `lib/theming/types.ts` (`CompositionTheme.resolveMediaSource`)
- Test: `lib/editor/src/media-source.test.ts`, extend `LayeredTimeline.test.tsx`

**Interfaces:**

```ts
export type MediaRole = 'clip' | 'broll' | 'photo' | 'audio' | 'music' | 'brand';

/** The ONE rule. Returns a public-relative path; the caller applies staticFile.
 *  - absolute (http/https) → unchanged
 *  - contains a slash       → unchanged  (roost's media/… paths)
 *  - bare filename          → the role's folder prefix
 *  - role with no folder    → unchanged  (photo, brand)
 * NEVER write the result back onto the item: loadTranscriptSync derives the
 * sidecar path from the BARE source. Resolve at render time only. */
export function resolveMediaSource(raw: string, role: MediaRole): string;

export const ROLE_FOLDERS: Partial<Record<MediaRole, string>> = {
  clip: 'recordings/', broll: 'broll/', audio: 'recordings/',
  // photo, music, brand: no folder — their sources are already public-relative
};
```

`CompositionTheme.resolveMediaSource?: (raw: string, role: MediaRole) => string`
overrides it wholesale. `resolveAudioSource` stays declared and **wins when
present** (PP registers one), marked `@deprecated`.

- [ ] **Step 1: Write the failing test, including both brands' real data**

```ts
describe('resolveMediaSource', () => {
  it('leaves an http source alone', () => {
    expect(resolveMediaSource('https://cdn/x.mp4', 'clip')).toBe('https://cdn/x.mp4');
  });

  // roost's actual data — the case PP's prefix-list rule would corrupt
  it('leaves any path containing a slash alone (roost media/… convention)', () => {
    expect(resolveMediaSource('media/VIDEO-2026.mp4', 'broll')).toBe('media/VIDEO-2026.mp4');
    expect(resolveMediaSource('media/PHOTO-2026.jpg', 'photo')).toBe('media/PHOTO-2026.jpg');
  });

  // PP's actual data — bare filenames, must prefix exactly as today
  it('prefixes a bare filename by role (PP convention)', () => {
    expect(resolveMediaSource('IMG_4821.MOV', 'clip')).toBe('recordings/IMG_4821.MOV');
    expect(resolveMediaSource('street.mp4', 'broll')).toBe('broll/street.mp4');
    expect(resolveMediaSource('vo-01.mp3', 'audio')).toBe('recordings/vo-01.mp3');
  });

  it('never prefixes a photo — both brands leave photo sources bare', () => {
    expect(resolveMediaSource('skyline.jpg', 'photo')).toBe('skyline.jpg');
  });

  it('leaves an already-prefixed PP source alone (idempotent)', () => {
    expect(resolveMediaSource('recordings/IMG_4821.MOV', 'clip')).toBe('recordings/IMG_4821.MOV');
    expect(resolveMediaSource('broll/street.mp4', 'broll')).toBe('broll/street.mp4');
  });
});
```

The idempotence case is what proves PP's `resolveAudioSource` and this rule agree
on PP's data — the whole reason roost's rule is safe to adopt.

- [ ] **Step 2: Run, confirm fail, implement, re-run green**

- [ ] **Step 3: Verify by mutation**

Change `includes('/')` to PP's `startsWith('recordings/') || startsWith('broll/')`
and confirm the roost-data test fails. This is the exact regression the task
exists to prevent; if it does not fail, the test is not testing it.

- [ ] **Step 4: Route `SegmentMedia`'s `resolveSrc` through it**

`SegmentMedia` knows `item.kind`, which maps directly onto `MediaRole`. **Both
brands currently prefix before calling `SegmentMedia`**, handing it an
already-prefixed source — the idempotence case is what keeps them working
unchanged. Assert that explicitly with a test using PP's shallow-cloned shape.

- [ ] **Step 5: Replace `LayeredTimeline.tsx:25-32`'s `audioUrl`/`videoUrl`**

The timeline serves URLs (`/recordings/x.mp4`), not `staticFile` paths, so it
prefixes the resolved value with `/`. Extend `LayeredTimeline.test.tsx` to cover
a roost-shaped `media/…` source and a PP-shaped bare filename — the timeline is
the third duplicate of this convention and the one nobody was testing.

- [ ] **Step 6: Run all four gates + still-render parity**

**Parity is required and is the point of this task.** All five hashes must match.
A mismatch here is a real finding — re-render twice to rule out the known flake,
then investigate rather than re-baselining.

- [ ] **Step 7: Check BOTH toolchains**

Per Global Constraints: `lib/theming/media-source.ts` is imported by
`lib/editor/app/LayeredTimeline.tsx`, which the brand's Vite dev server loads
from **outside the project tree**. Confirm `createEditorViteConfig`'s `resolveId`
pre-plugin covers it — it re-resolves `remotion`, `remotion/*` and `@remotion/*`,
and `media-source.ts` imports none of those, so it should be fine. **Verify by
reading `lib/editor/host/editor-plugin` rather than assuming**, and add a test if
the import graph gained a bare specifier.

- [ ] **Step 8: Commit**

```bash
git add -A lib/theming lib/editor
git commit --no-gpg-sign -m "feat(theming): resolveMediaSource — one rule for renderers and the timeline

The two brands' rules conflicted: PP tested an explicit prefix list, roost
tested any slash. Adopting PP's would have re-prefixed every roost media/…
source. Core takes roost's (the superset) and a test pins that PP's bare
filenames resolve identically. Closes roost's UPSTREAM-PENDING banner and the
third duplicate of the convention in LayeredTimeline."
```

---

## Task 7: Registration-driven inspector

**Why:** a brand's own registered kind must be editable without touching core UI.
The mechanism **already exists** — `lib/editor/app/editor-meta.ts` defines
`ParamField`, `EffectDefinition` and `videoProps`, and `LayeredInspector.tsx:548-557`
renders declared fields. What is missing is that `EditorMeta` is a **separate
carrier**: a brand declares its effects and props **twice**, once in the theme and
once in `EditorMeta`, with nothing keeping them in sync.

**Files:**
- Modify: `lib/editor/app/editor-meta.ts` (derive from theme)
- Modify: `lib/editor/app/LayeredInspector.tsx`
- Modify: `lib/theming/registry.ts` (move `ParamField` to the shared home; Task 1's temporary duplicate)
- Test: `lib/editor/src/editor-meta.test.ts` (**exists — extend**), `lib/editor/src/registration-params.test.tsx`

**Interfaces:**

```ts
/** Derives the editor vocabulary from the theme's registrations, so a brand
 *  declares each kind ONCE. An explicit EditorMeta still wins per field —
 *  the host may override anything the theme implies. */
export function editorMetaFromTheme(
  theme: CompositionTheme,
  explicit?: EditorMeta,
): EditorMeta;
```

- [ ] **Step 1: Collapse the duplicate `ParamField`**

Task 1 left a structurally identical `ParamField` in `registry.ts` and
`editor-meta.ts`. Make `editor-meta.ts` re-export the one from `registry.ts`.
`lib/theming` must not import from `lib/editor` (the dependency runs one way), so
`registry.ts` is the correct home. Run `cd lib/editor && npx tsc --noEmit` —
expected **4**.

- [ ] **Step 2: Write the failing test for `editorMetaFromTheme`**

Cases: a theme registering `video: { outro: { params: [{prop:'style', options:[…]}] } }`
produces `videoProps.outro` with those fields; a theme registering
`effects: { vintage: { params: […] } }` adds a `vintage` entry to the effect
catalog **on top of** the core catalog; an explicit `EditorMeta.videoProps.outro`
**overrides** the theme-derived one for that kind while leaving other kinds
theme-derived; a theme with no `params` anywhere produces the neutral core
default (the current behaviour — assert it is unchanged); `laneColors` and
`overlayLabels` have no theme source and pass through from `explicit` untouched.

- [ ] **Step 3: Run, confirm fail, implement, re-run green**

- [ ] **Step 4: Render overlay-registration params in the inspector**

`LayeredInspector.tsx:618-640` currently types overlay content by **value
presence** (`content.reveal !== undefined && …`). Add a declared-fields path:
when the overlay's kind has `params`, render those controls; keep the
value-presence path as the fallback for undeclared content, so a brand that
declares nothing sees exactly today's inspector.

**Assert the fallback explicitly.** The failure mode `editor-meta.ts`'s own
comment warns about is a field with no declared `type` and no current value
falling back to a text input and writing a **string** into what the renderer
expects to be a number.

- [ ] **Step 5: Run all four gates**

Editor-only change — **stills cannot move.** Confirm they do not.

- [ ] **Step 6: Commit**

```bash
git add -A lib/editor lib/theming
git commit --no-gpg-sign -m "feat(editor): derive the inspector vocabulary from theme registrations

A brand declared its effects and props twice — once in the theme, once in
EditorMeta — with nothing keeping them in sync. One declaration now serves
both render and edit; an explicit EditorMeta still wins per field."
```

---

## Task 8: `sync_template.py` carries the full vendored surface

**Independent of Tasks 1–7. May run in parallel.**

**Why:** `video_toolkit/sync_template.py:136,141` mirrors only
`templates/<t>/src → projects/<p>/src`. Phase 2.5 showed the cost: **8 of 11 PP
project editors cannot start at all** because the vendored `package.json` never
inherited the template's editor devDependencies (`ERR_MODULE_NOT_FOUND` before
Vite loads the config), and every one of the ~90 files that migration rewrote was
a hand-edit for exactly this reason. The next `.editor/` change hits **14
directories** by hand.

**Files:**
- Modify: `video_toolkit/sync_template.py:136-141`
- Test: `video_toolkit/tests/test_sync_template.py` (create if absent — check first)

**The surface to mirror**, beyond `src`:

| path | rule |
|---|---|
| `.editor/` | full mirror (45 PP / 41 roost lines across 3 files) |
| `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` | full mirror |
| `package.json` | **merge, never overwrite** — see below |

**`package.json` is the subtle one and the reason this is a whole task.** A
project's `package.json` carries project-specific fields (`name`, and possibly a
tuned `scripts` entry) that must survive, while `devDependencies` and the
`editor` script must come from the template. Overwriting it would rename every
project. The rule: **merge `dependencies`, `devDependencies` and any script the
project does not already define; never touch `name`, `version`, or an existing
script.** Report every merged key so the operator sees what changed.

- [ ] **Step 1: Check whether a test file exists**

```bash
ls video_toolkit/tests/ 2>/dev/null; grep -rn "sync_template" video_toolkit/tests/ 2>/dev/null
```

If there is no test harness for `video_toolkit`, create
`video_toolkit/tests/test_sync_template.py` using `tmp_path` fixtures — no
network, no real projects.

- [ ] **Step 2: Write the failing test for the extended mirror**

Build a fake template and project under `tmp_path`; assert `.editor/`,
`remotion.config.ts`, `vitest.config.ts` and `tsconfig.json` are copied; assert
`--dry-run` copies nothing and still reports; assert the existing `src` behaviour
(`skipped`/`preserved`/`removed`) is unchanged.

- [ ] **Step 3: Write the failing test for the `package.json` merge**

Cases: project `name` survives; a template `devDependency` the project lacks is
added; a devDependency the project **already has at a different version** is
**updated to the template's** (the template is the source of truth for the
toolchain) and reported; a script the project defines is **kept**; a script only
the template has is added; a project with no `package.json` gets the template's
with `name` preserved as the directory name.

- [ ] **Step 4: Run, confirm fail, implement, re-run green**

Run: `cd /Users/xaralis/Workspace/progpce/core && python3 -m pytest video_toolkit/tests/test_sync_template.py -v`

- [ ] **Step 5: Dry-run against a real brand repo, READ-ONLY**

```bash
cd ~/Workspace/roost/video-toolkit && python3 -m video_toolkit.sync_template --project roost-reel-01 --dry-run
```

**`--dry-run` only. Do not apply.** Confirm it reports the `.editor/` and config
files it would carry and does not report a `name` change. Phase 3 is core-only;
this is verification of the tool, not a migration.

- [ ] **Step 6: Commit**

```bash
git add video_toolkit/sync_template.py video_toolkit/tests/
git commit --no-gpg-sign -m "fix(sync-template): mirror the full vendored surface, not only src

.editor/, remotion.config.ts, vitest.config.ts and tsconfig.json are now
carried; package.json is merged (devDependencies and new scripts from the
template, name and existing scripts preserved). Phase 2.5 found 8 of 11 PP
project editors unable to start for exactly this gap."
```

---

## Task 9: Resolve the `TransitionGallery` fork

**Independent. May run in parallel.**

**Why:** `lib/transitions/TransitionGallery.tsx` and
`showcase/transitions/src/TransitionGallery.tsx` are a divergent fork and **only
the second one runs**. The lib copy has no runtime consumer anywhere in this repo
or either brand repo; it exists solely because
`examples/layered-minimal/tsconfig.json` lists it in `include` so the type-check
gate can reach it — **meaning the gate's "0 errors" claim covers a file nothing
renders.**

The showcase copy still carries the `presentation: ReturnType<typeof glitch>`
mis-typing that was fixed in the lib copy (`51150ad`), silently accepted only
because the showcase project has no type-check gate of its own.

**Decision: take option (b)** from the handoff's recommendation. The handoff calls
this "a decision for the user"; the argument for (b) is that the alternative
(delete the lib copy) knowingly *reduces* type coverage to resolve a duplication,
and the gate is meant to mean what it implies. **If the user disagrees, (a) is a
smaller change and this task reverses cleanly.**

**Files:**
- Modify: `lib/transitions/TransitionGallery.tsx` (port the showcase's real content)
- Modify: `showcase/transitions/src/Root.tsx` (import from lib)
- Delete: `showcase/transitions/src/TransitionGallery.tsx`

- [ ] **Step 1: Diff the two copies and inventory what each uniquely has**

```bash
diff -u lib/transitions/TransitionGallery.tsx showcase/transitions/src/TransitionGallery.tsx
```

Known from the handoff, **verify each**: showcase adds a `checkerboard` entry
(four variants), a `TRANSITION_NOTES` block, and a reworked layout (grid
background, corner markers, per-scene labels). Lib has the generic
`TransitionEntry`/`makeTransitionEntry` factory and the
`transitionMap`/`SingleTransitionPreview` programmatic API (README-documented).

- [ ] **Step 2: Port the showcase's unique content into the lib copy**

Keep the lib copy's factory + programmatic API and its **correct** typing. Add
`checkerboard`, `TRANSITION_NOTES` and the layout.

- [ ] **Step 3: Point the showcase at the lib copy and delete its own**

- [ ] **Step 4: Verify the showcase still renders**

```bash
cd showcase/transitions && npm run render
```

If the showcase project is not installed, say so explicitly rather than claiming
it passes — and fall back to `npx remotion still` on one frame. **Do not report
"verified" for a command you did not run.**

- [ ] **Step 5: Run the typecheck gate**

`cd examples/layered-minimal && npm run typecheck` — expected 0, and the coverage
guard must still list `TransitionGallery.tsx`. The gate now covers a file that
actually renders, which was the point.

- [ ] **Step 6: Commit**

```bash
git add -A lib/transitions showcase/transitions
git commit --no-gpg-sign -m "refactor(transitions): one TransitionGallery, type-checked and actually rendered

The lib copy had no runtime consumer and existed only to satisfy the typecheck
gate; the showcase copy had the real content and the mis-typing that was fixed
in lib. Merged into lib (factory + programmatic API + showcase's checkerboard,
notes and layout); the showcase now imports it."
```

---

## Task 10: At-cut visual confirmation of all 20 transition kinds

**Independent. May run in parallel.** This closes the programme's one remaining
**open risk**.

**Why:** 11 transition kinds have **no at-cut visual confirmation** — the six
newly wired in Phase 1 plus `wipe`, `glitch`, `whip-pan`, `zoom-through`,
`gradient-wipe`. Only `burn` is at-cut confirmed. At-cut composites differently
from `TransitionSeries` (handle-borrowed overlap, not a shrinking sequence), so a
presentation that looks right in `showcase/transitions` can still misbehave at a
cut. `at-cut-transitions.test.tsx` gives all 20 **wiring** coverage — resolution,
mounting, param delivery — which is the whole of what jsdom can settle. **A wiring
test cannot give appearance confirmation.**

**Acceptance criterion** (from the handoff, verbatim in intent): a reel literal in
`examples/layered-minimal` exercising each of the 20 catalog kinds at a cut, in
**both** directions (`transitionIn` and `transitionOut`), with stills rendered at
several progress points per kind/direction.

**Two kinds have a predicted outcome to check against** rather than a blind look —
these are the `it.fails` pins at `at-cut-transitions.test.tsx:289,307`:

- **`checkerboard` — predicted: renders as a hard cut in the EXITING direction.**
  Its cells are rendered empty on exit; the children are drawn once, whole, in the
  base layer beneath, and the cell divs carry no content and no background.
- **`pixelate` — predicted: an opaque black frame hiding the neighbouring clip for
  the whole shot.** It paints its root `AbsoluteFill` opaque black unconditionally,
  including at progress 0. Bounded under `TransitionSeries` (reads as a dip to
  black); **not** bounded at a cut, where the wrapper is mounted for the item's
  whole sequence and the neighbour sits beneath it in a sibling `Sequence`.

The other 18 have no prediction; the still is the first evidence either way.

**Files:**
- Create: `examples/layered-minimal/src/TransitionMatrix.tsx` + a composition registered in `src/index.ts`
- Create: `docs/superpowers/at-cut-transition-findings.md`
- Modify: `lib/editor/src/at-cut-transitions.test.tsx:289,307` (only if a defect is fixed)

- [ ] **Step 1: Build the matrix composition**

Derive the kind list from `TRANSITION_CATALOG` — **not a hardcoded list**, so a
kind added later is covered automatically, the same discipline
`at-cut-transitions.test.tsx` already uses. Two clips per kind per direction with
visually distinct content (a flat colour + a large numeral reads best at a glance;
avoid video, which is where the render flake lives).

- [ ] **Step 2: Render the stills**

Several progress points per kind/direction. 20 kinds × 2 directions × ~4 points
is ~160 stills; script it, and **render to a gitignored directory**.

```bash
cd examples/layered-minimal
# out/ is gitignored — confirm before writing 160 files into it
git check-ignore -v out/ && echo "gitignored, safe"
```

- [ ] **Step 3: Check the two predictions first**

They are the cheapest signal: a confirmed prediction validates the whole
apparatus before you eyeball 18 unknowns.

- [ ] **Step 4: Eyeball all 20 and record findings**

Write `docs/superpowers/at-cut-transition-findings.md`: one row per
kind × direction, with the verdict (correct / defective / ambiguous) and, for a
defect, what it does versus what the kind means to do.

**Do not fix a defect in this task.** What a transition renders is a **look
decision**, and none of these has ever had its at-cut appearance confirmed, so a
"fix" would be a guess. Record it and pin it as an `it.fails`, the same treatment
`checkerboard` and `pixelate` already have. If a defect is trivially and
unambiguously wrong (e.g. a presentation that renders literally nothing), say so
and flag it for the user rather than deciding alone.

- [ ] **Step 5: Convert any confirmed prediction into a normal test if fixed, else leave pinned**

If `checkerboard`/`pixelate` are confirmed defective and **not** fixed here, leave
the `it.fails` pins exactly as they are — they already flip to a normal `it` the
day someone addresses them, and the runner shouts if they start passing.

- [ ] **Step 6: Run all four gates, delete the probe PNGs, commit**

```bash
rm -rf examples/layered-minimal/out
git add -A examples/layered-minimal docs/superpowers
git commit --no-gpg-sign -m "test(transitions): at-cut visual confirmation for all 20 catalog kinds

Closes the programme's last open risk: 11 kinds had wiring coverage but no
at-cut appearance confirmation, and at-cut composites differently from
TransitionSeries. Findings recorded per kind/direction; defects are pinned,
not fixed — what a transition renders is a look decision."
```

---

## Task 11: Write the brand migrations (do NOT apply them)

**Why:** Phase 3 is core-only, and every generic core now ships is worthless until
a brand adopts it. This task produces the document that makes adoption mechanical
— and, per Phase 2.5's lesson, **treats itself as a hypothesis, not an inventory.**

> `docs/superpowers/phase2-migrations.md` was written by inspecting both brand
> repos carefully, and applying it still found **six miscounts and one outright
> false negative** ("PP needs nothing", which cost a rendering regression). Every
> one needed the code to actually run.

**Files:**
- Create: `docs/superpowers/phase3-migrations.md`
- Create: `docs/superpowers/phase3-extension-contract.md`

**Every item MUST carry:**

1. Exact file paths and line numbers **verified by opening the file**, not quoted
   from this plan.
2. The paste-ready replacement.
3. **A parity grade: parity-preserving or deliberate look change** — with the
   reason. An item with no grade is incomplete.
4. A verification command (`npx tsc --noEmit`, a still render, or both).

**Items to write, at minimum:**

| # | repo | item | expected grade |
|---|---|---|---|
| 1 | both | `overlayItems` → unified `overlays` | parity-preserving (merge semantics keep both shapes working) |
| 2 | PP | delete `video-item-renderers.tsx`'s `extractEffects`; register `blend` as an effect | **look change unless proven** — needs a still render |
| 3 | PP | the **8** `frameOffsetSec` application sites (not 4 — see Global Constraints correction #3) | parity-preserving if all 8 move together |
| 4 | roost | `vintage` → registered effect composing `grade`+`grain`+`scanlines` | **look change unless proven** — roost's `FILM_FILTER` uses `HtmlInCanvas` + `@remotion/effects`, structurally unlike CSS filters. A still render decides. |
| 5 | PP | `OutroSegment` → `GenericOutro` with `props: {video:'brand/outro.mp4', audio:'brand/outro.mp3'}` | parity-preserving (identical structure) |
| 6 | PP | `MultiClipSegment` → `GenericMultiClip` + tokens | parity-preserving **only if** every literal maps to a token — enumerate them |
| 7 | roost | `Watermark.tsx` → `GenericWatermark` `mode:'tint'` + asymmetric margins | parity-preserving if margins are carried as `{vertical:40, horizontal:36}` |
| 8 | PP | `PersistentOverlay` → `GenericWatermark` + `GenericDisclaimer` | **look change** — core keeps `height:'auto'`, PP hardcodes a square. **Check whether PP's watermark PNG is square**; if it is, this is parity-preserving. |
| 9 | PP | `CaptionStrip` → `GenericCaptions` + `CaptionTokens` | parity-preserving **only** with the live module constants (`bottomPct 0.20`), **not** `theme.ts`'s dead `0.28` |
| 10 | PP | delete the two dead caption config blocks (`theme.ts:36-45`, `brand.json` `reels.caption`) or wire one | cleanup |
| 11 | roost | delete `src/lib/resolve-video-source.ts` (+ its test); use core's `resolveMediaSource` | parity-preserving (core took roost's rule) |
| 12 | PP | `resolveAudioSource` → core default | parity-preserving (proven by the idempotence test in Task 6) |
| 13 | PP | dissolve `brand-lib/` — 11 files, 1613 LOC | per-file; most become theme registrations |
| 14 | PP | migrate `web-program-intro` onto `LayeredReelComposition` | **large, see below** |
| 15 | PP | sync the 11 vendored `projects/*/src/` copies via the fixed `sync_template` | mechanical, but 11 directories |

**On item 14, `web-program-intro`** — the handoff calls it "a pre-layered fossil".
It is more than that, and the plan must say so honestly: **WPI does not use the
layered schema at all.** `config/schema.ts` (62 LOC) is a different config shape —
a flat `discriminatedUnion('type', [Clip, Broll, MultiClip])`, **implicitly ordered
and seconds-based**, versus the layered model's absolute-ms tracks. It also has:

- a hand-rolled music-ducking system (60–111) that rebuilds its own frame timeline
  and classifies each frame `voice | broll-silent | none` — this maps onto core's
  `computeMusicEnvelope`, but **the mapping is not obviously lossless** and needs
  checking, not asserting;
- `TransitionSeries` **shrinking** adjacent sequences versus core's
  **handle-extension** at the cut (hence its hardcoded `{0,0}` handles) — this is
  a genuine timing difference, so the migration **will** change durations unless
  the literal is re-derived;
- 4 pre-existing `TS2322`s (a clip literal missing `audioMode`, which is
  `.optional().default('voice')` and so required in the inferred output type) —
  **pre-existing, not a bump regression**, settled by controlled experiment in
  Phase 2.5 (old core 15 errors → new core 11; the new core *reduced* them).

**Write item 14 as a scoped migration spec, not a paste-ready diff.** It is the
one item large enough to deserve its own plan, and pretending otherwise is how
`phase2-migrations.md` acquired its false negatives. Say plainly that it needs its
own planning session.

- [ ] **Step 1: For each item, open the real brand file and verify the claim**

Read-only. Both repos are green and must stay untouched. **When this plan and the
file disagree, the file wins** — and record the correction, the way Phase 2.5's
"six things the migration document got wrong" section does. That section is why
this instruction exists.

- [ ] **Step 2: Write `phase3-migrations.md` with all 15 items, each graded**

- [ ] **Step 3: Write `phase3-extension-contract.md`**

The contract as reference documentation: the one resolution rule, the six axes
(overlay, video, effect, brand-layer, caption tokens, media source), and a worked
example of registering a brand kind end-to-end — render **and** editor, since Task
7's whole point is that one declaration serves both.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers
git commit --no-gpg-sign -m "docs: Phase 3 brand migrations and the extension contract

15 paste-ready items, each graded parity-preserving or deliberate look change.
web-program-intro is scoped as needing its own plan: it does not use the
layered schema at all, and TransitionSeries' shrinking sequences versus core's
handle extension is a real timing difference, not a mechanical port."
```

---

## Task 12: Update `HANDOFF.md` and `CLAUDE.md`

**Last task. Do not run it early** — it records measured outcomes, and a figure
written before the work is a guess.

**Files:**
- Modify: `docs/superpowers/HANDOFF.md`
- Modify: `CLAUDE.md` (Quality Gates table, if gate numbers moved)

- [ ] **Step 1: Measure every gate fresh and record the actual numbers**

```bash
cd lib/editor && npx vitest run 2>&1 | tail -5
cd lib/editor && npx tsc --noEmit 2>&1 | grep -c 'error TS'; echo "exit: $?"
cd examples/layered-minimal && npm run typecheck
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*' | wc -l
```

**Check tsc's exit code separately** — `grep -c` returns 0 when tsc *crashes*.
This hit twice in Phase 2.5.

- [ ] **Step 2: Write the "Phase 3 outcome" section**

Derive commit/file/line counts from `git log` and `git diff --stat` against the
merge base, **not** from running totals accumulated during the work — that is how
Phase 2's counts drifted.

- [ ] **Step 3: Correct the three wrong seam descriptions**

Per Global Constraints. `HANDOFF.md`'s seam list still says the tint technique is
unattributed, that `theme.tokens.caption` exists, and that `frameOffsetSec` has
four call sites. Fix all three **in place**, so a future reader does not re-inherit
them — the same reason `fix/core-has-remotion` rewrote the false `remotion` premise
rather than appending a correction.

- [ ] **Step 4: Update the carried items**

Resolve or carry forward: `sync_template` (Task 8 — closed), `TransitionGallery`
(Task 9 — closed), the at-cut visual pass and the two `it.fails` (Task 10), the
WPI `TS2322`s (still open, still pre-existing), the 3 uninstalled PP projects
(still open), the 8 PP editors missing devDependencies (**Task 8 makes this
fixable, but fixing it is a brand-repo action — still open**), the two unmerged
brand branches.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/HANDOFF.md CLAUDE.md
git commit --no-gpg-sign -m "docs: record Phase 3 — the extension contract is closed

Also corrects three seam descriptions that were written from the plan rather
than from the brand repos: the alpha-mask tint is roost's (absent in PP),
theme.tokens.caption never existed, and frameOffsetSec has eight application
sites, not four."
```

---

## Self-Review

**Spec coverage.** All eight seams from `HANDOFF.md` map to tasks: seam 1 → Task 1,
seam 2 → Task 2, seam 3 → Task 3, seam 4 → Task 4, seam 5 → Task 5, seam 6 →
Task 6, seam 7 → Task 7, seam 8 → Task 11 (items 13–14; core-only means the
migration is *written*, and WPI is explicitly scoped as needing its own plan).
The four already-queued items map to Tasks 8, 9, 10 and 12. The zod guard is
already landed (`b02669c`) and needs no task.

**Known gaps, stated rather than hidden:**

- **Seam 8 is not *completed* by Phase 3**, only enabled and documented. Dissolving
  `brand-lib/` and migrating WPI are brand-repo edits, which the constraints
  forbid. This is a scope boundary, not an oversight — but it does mean Phase 3
  closes the contract without proving it end-to-end, exactly as Phase 2 did before
  Phase 2.5 validated it. **A Phase 3.5 will be needed, and it will find things.**
- **Task 10 records defects rather than fixing them.** Deliberate: what a
  transition renders is a look decision.
- Roost's `HtmlInCanvas` + `@remotion/effects` `vintage` pipeline may not be
  expressible as a composition of core's CSS-filter primitives. Task 2 ships the
  primitives; Task 11 grades the adoption honestly, and "not expressible, stays a
  brand effect" is an acceptable outcome — **that is what the registry is for.**

**Type consistency.** `Registration<P>`/`Registry<P>`/`resolveRegistered` (Task 1)
are used unchanged in Tasks 2, 3, 4, 7. `ParamField` is deliberately duplicated in
Task 1 and collapsed in Task 7 Step 1 — flagged in both places. `MediaRole` and
`resolveMediaSource` (Task 6) are referenced by Task 3's `GenericOutro`, which
lands first; Task 3 Step 1 says to use `staticFile` until Task 6 lands. `ThemeTokens`
is introduced in Task 3 and extended by Tasks 4 (`WatermarkTokens`) and 5
(`CaptionTokens`); all three are declared in `lib/theming/tokens.ts`.

**Placeholder scan.** No TBDs. Every code step carries real code or the exact
command that produces the values to paste (Task 2 Step 1's float literals are
deliberately derived by running, not hand-computed — hand-computing them is how a
parity test silently stops testing parity).
