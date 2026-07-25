# Task 5 — Evict brand constants from core (schema and derivation) — REPORT

Branch `refactor/phase1-subtract`, on top of `c1a8bd2`.

## What was removed, and what replaced it

### 1. `wipe.color` — PP's palette enum in the shared schema

**Was** (`lib/reel-config-base/transition-schema.ts`):

```ts
color: z.enum(['lime', 'teal', 'coal']).describe('Wipe sweep colour.'),
…
defaults: { color: 'teal' },
```

Every brand that vendored core inherited three of Progresivní Pardubice's colour
names as the only legal values for a wipe.

**Now**: an optional **brand accent-slot KEY**, resolved against the brand's own
palette at render time.

- New exported `AccentKey` in `transition-schema.ts` — a single shared
  `z.string()` instance. To zod it is just a string (core cannot enumerate a
  vocabulary the brand owns); it is a *named singleton* because
  `subOptionForField` recognises an accent field **by identity**, which is what
  distinguishes "a palette key" from burn's `mask` — also a string, and one that
  must stay uncontrolled.
- `SubOption.kind` gained `'accent'` — the one control kind that carries **no**
  `options`: core doesn't know the brand's slots, so the editor fills the
  dropdown from the `accentSlots` it was handed.
- `lib/editor/app/LayeredInspector.tsx` — `TransitionFields` now takes
  `accentSlots` (both call sites pass the inspector's existing prop) and renders
  an `accent` sub-option as a `SelectField` over `slots.map(s => s.key)` labelled
  with each slot's own label. With no palette in scope the control is omitted
  rather than shown empty.
- `lib/render/at-cut-transitions.tsx` — the `Dims` context gained an optional
  `palette`; the `wipe` renderer does
  `resolveAccentColor(dims.palette ?? [], t.color ?? null) ?? undefined`.
- `lib/render/video-track.tsx` — `buildVideoNodes` opts gained an optional
  `palette`, forwarded into `presentationFor`.
- `lib/render/layered-composition.tsx` — passes `palette: theme.accentSlots`.
- `lib/transitions/presentations/wipe.tsx` — `WipeProps.color` went from the
  three-value enum plus a `COLOR_MAP` of PP hexes (`#c6f432` / `#2ad4c5` /
  `#0a0a0a`) to a plain CSS colour string, with a neutral `#0a0a0a` fallback.

No layering cycle was introduced: `lib/theming` already imports from
`lib/reel-config-base` and not the reverse, and the new import is in
`lib/render`, which imports `lib/theming` already.

**The catalog default was dropped, not replaced.** Keys are brand-defined, so
core has no honest seed. `defaultTransition('wipe')` is now
`{ kind: 'wipe', frames: 15, direction: 'left' }`; the accent control renders
"—" for unset, which reads correctly as "the presentation's neutral sweep".

*Render safety:* verified no project's `Root.tsx` literal uses `kind: 'wipe'` at
all, so no existing render changes. `wipe` still carries a required `direction`,
so `FramesOnlyTransition` is unaffected.

### 2. `derive-montage.ts` — `topic: 'Roost reel'`

**Was**: `meta: { topic: 'Roost reel', … }` — one brand's name hardcoded in the
shared compiler.
**Now**: `MontageConfig.topic?: string`, falling back to the exported
`DEFAULT_TOPIC = 'Reel'`.

### 3. `derive-montage.ts` — roost's `TeaserOverlay` timing constants

**Was**: module constants `LINE_STAGGER_SEC = 0.35`, `TEASER_HOLD_SEC = 4.5`,
`TEASER_FADE_SEC = 0.6`, commented as "mirrored from roost's
TeaserOverlay.teaserDurationInFrames" — core duplicating a brand component's
internals, a drift neither side could see.

**Now**: `MontageOpts.teaserLineStaggerSec` / `teaserHoldSec` / `teaserFadeSec`,
defaulting to the exported neutral `TEASER_TIMING` (the same numbers). The
values themselves carry no brand meaning — they are simply a reasonable
short-form reveal; what was brand-specific was core *asserting* them.
`teaserFrames()` now takes the timing as an argument.

### 4. Brand names in comments/prose

Neutralised in `lib/reel-config-base/{derive-montage,layered-schema}.ts` and
`lib/render/{README.md,at-cut-transitions.tsx,layered-composition.tsx,video-track.tsx}`
("roost multi-clip" → "a kind this brand didn't register", "campaign and roost
consume one copy" → "every brand consumes one copy", the `pp-05` CampaignReel
reference → a description of the schema member, etc.).

### 5. Brand palette names in core's own test fixtures

`transition-record.test.ts` (`'lime'`), `transition-overrides.test.ts`
(`'teal'`/`'coal'`) and `derive-montage.test.ts` (`variant: 'sand-brown'`) used
brand values as arbitrary fixture strings. Swapped for neutral ones. Outside the
acceptance grep's scope, but it was PP/roost identity sitting in core.

## Acceptance grep

```
$ grep -riE 'lime|teal|coal|roost|progresivn|sand-brown' lib/reel-config-base lib/render
lib/reel-config-base/transition-schema.ts:  // NAME NOTE: `fade-coal` is a leftover from one brand's colour vocabulary
lib/reel-config-base/transition-schema.ts:  // ("coal" was its near-black). Behaviourally it is brand-neutral — it is a
lib/reel-config-base/transition-schema.ts:  { schema: z.object({ kind: z.literal('fade-coal'), frames: TransitionFrames }), label: 'Fade to black' },
lib/render/at-cut-transitions.tsx:  'fade-coal': () => fade() as AnyPresentation,
```

Everything remaining is the `fade-coal` kind name and the note explaining it.

### What could not be removed, and why: `fade-coal`

**Yes, the name is brand-derived** — "coal" was one brand's word for its
near-black; nothing in a neutral vocabulary would call it that. It stands anyway:

- Behaviourally it is *already* brand-neutral. The renderer is a plain `fade()`,
  and what shows through is whatever `theme.background` is, per brand. Its editor
  label already reads **"Fade to black"**, so no user ever sees "coal".
- It is a *kind name*, i.e. part of the persisted config vocabulary. Renaming it
  invalidates every baked `Root.tsx` literal that uses it — a **render-affecting**
  migration across brand repos, which this task's constraint puts out of scope.

A `NAME NOTE` comment now sits on the catalog entry recording this, so nobody has
to re-derive the reasoning. **Recommendation: leave it, or fold the rename into a
phase that already rewrites every project literal** (it would want an alias in
`getTransitionRecord` for a release).

## Brand migrations forced

### A. `pp-05-zastupitelsky-klub` — hand-written transition-union mirror (REQUIRED)

`progpce/video-toolkit/projects/pp-05-zastupitelsky-klub/src/config/types.ts:18`
keeps a hand-written mirror of the transition union. Its wipe member no longer
matches core's:

```ts
// before
  | { kind: 'wipe'; frames: number; color: 'lime' | 'teal' | 'coal'; direction: 'left' | 'right' };

// after
  | { kind: 'wipe'; frames: number; color?: string; direction: 'left' | 'right' };
```

Compile-time only — that project's literal uses no `wipe`, so nothing renders
differently. (The real fix for this file is to stop mirroring the union and
import `Transition` from core; out of scope here.)

### B. roost — `deriveMontageLayered` now emits `topic: 'Reel'` (OPTIONAL)

`roost/video-toolkit/projects/roost-reel-01/.migrate/migrate-reel.mts:27` calls
`deriveMontageLayered(cfg)`. It is a **one-off, already-run** migration script and
the derived literal is long since baked into `Root.tsx`, so nothing changes today.
If it is ever re-run and the old `meta.topic` is wanted:

```ts
// before
const reel = deriveMontageLayered(cfg);

// after
const reel = deriveMontageLayered({ ...cfg, topic: 'Roost reel' });
```

`meta.topic` is display metadata only; it feeds no render.

### C. roost — teaser timing (NO ACTION NEEDED)

`roost/…/src/overlays/TextOverlay.tsx` uses `LINE_STAGGER_SEC = 0.35`,
`FADE_SEC = 0.6` and a literal `4.5` — **exactly** core's new `TEASER_TIMING`
defaults, so derived teaser spans are byte-identical. Roost may now optionally
make the coupling explicit rather than accidental:

```ts
deriveMontageLayered(cfg, {
  teaserLineStaggerSec: LINE_STAGGER_SEC,
  teaserHoldSec: 4.5,
  teaserFadeSec: FADE_SEC,
});
```

### D. Any brand calling `buildVideoNodes` directly (OPTIONAL, recommended)

`roost/video-toolkit/projects/roost-reel-01/src/LayeredRoostReel.tsx:125` calls
`buildVideoNodes` without a theme. The new `palette` opt is optional, so it still
compiles and renders identically — but a `wipe` in that reel would get the neutral
sweep instead of a brand colour:

```ts
// before
const videoNodes = buildVideoNodes(withBurnLook(reel.tracks.video), {
  width, height, fps,
});

// after
const videoNodes = buildVideoNodes(withBurnLook(reel.tracks.video), {
  width, height, fps, palette: theme.accentSlots,
});
```

Brands rendering via `LayeredReelComposition` get this for free.

### E. Any brand calling the `wipe()` presentation directly (compile-time)

`WipeProps.color` is now `string` (a CSS colour) rather than the enum. A caller
passing `color: 'lime'` still compiles but paints the literal CSS keyword `lime`
instead of `#c6f432`. No such caller was found in either brand repo.

## Tests

Work was done test-first: the wipe sub-option / default assertions, the schema's
acceptance of arbitrary brand keys, the `AccentKey`→`accent` mapping, and the
`meta.topic` + teaser-timing cases were written against the old behaviour and
driven to green.

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run

 Test Files  45 passed (45)
      Tests  449 passed (449)
   Duration  4.17s
```

Baseline was 45 files / 442 tests → **+7 tests, same file count, no regressions**.

New/changed tests:
- `lib/editor/app/transitions.test.ts` — wipe surfaces an `accent` colour picker
  with no schema options plus a direction enum; `defaultTransition('wipe')`
  carries no colour key; `subOptionForField(AccentKey)` → `accent` while a
  look-alike plain `z.string()` stays uncontrolled.
- `lib/editor/src/layered-schema-transitions.test.ts` — wipe accepts any brand
  accent key, or none; a bad *enum* value on the same member is still rejected.
- `lib/editor/src/derive-montage.test.ts` — `meta.topic` from config, neutral
  fallback (explicitly asserted not to match `/roost/i`); teaser span at the
  default timing, under per-brand overrides, and with `reveal: 'all'` dropping
  the stagger.

```
$ cd lib/editor && npx tsc --noEmit -p .
34 errors
```

Unchanged from the 34-error baseline (re-verified against a stashed tree). None
reference a file this task touched; the two `LayeredInspector` hits are the
pre-existing `content.hide` errors present at baseline.

---

## Review follow-ups (post-merge quality pass)

Four findings from code review of the above, all closed.

### Finding 1 (Important) — `AccentKey` identity check broken by `.describe()`

`lib/reel-config-base/transition-schema.ts`: `subOptionForField` used to test
`t === AccentKey`. Zod's `.describe()` clones into a brand-new instance
(`new This({...this._def, description})`, confirmed in
`node_modules/zod/lib/types.js:301-307`), so `AccentKey.describe('x')` is never
`=== AccentKey`. `.optional()`/`.default()` don't reclone — they wrap the
original as `_def.innerType` — which is why the every existing catalog field
(`AccentKey.optional().describe(…)`) happened to keep working, and why the
reverse, equally natural order (`AccentKey.describe(…).optional()`) silently
produced **no control and no error**.

Fix: a module-local `ACCENT_SCHEMAS` `WeakSet<z.ZodTypeAny>` plus a
`markAsAccentKey` helper that (a) adds the instance to the set and (b) patches
that instance's own `describe` method so every clone it subsequently produces —
in any chain, any order, any depth — gets added too. `subOptionForField` now
checks `ACCENT_SCHEMAS.has(t)` instead of `t === AccentKey`.

Regression test added — `lib/editor/app/transitions.test.ts`, `subOptionForField`
describe block, `'still maps to an accent picker when .describe() comes before
.optional()'`:
```ts
it('still maps to an accent picker when .describe() comes before .optional()', () => {
  const field = AccentKey.describe('A differently-worded description').optional();
  expect(subOptionForField('color', field)?.kind).toBe('accent');
});
```
Verified failing first (stashed the schema fix, ran only this test):
```
$ git stash push -- lib/reel-config-base/transition-schema.ts
$ cd lib/editor && npx vitest run app/transitions.test.ts
 × subOptionForField > still maps to an accent picker when .describe() comes before .optional()
   → expected undefined to be 'accent'
 Test Files  1 failed (1)   Tests  1 failed | 59 passed (60)
$ git stash pop
$ npx vitest run app/transitions.test.ts
 Test Files  1 passed (1)   Tests  60 passed (60)
```

A first version of the fix (typed `describe` reassignment via `T['describe']`)
introduced a NEW `tsc` error (`TS2322`); re-cast through
`unknown as z.ZodTypeAny['describe']` to keep the baseline at 34 errors — see
Verification below.

### Finding 2 (Minor) — neutral fallback was still PP's colour

`lib/transitions/presentations/wipe.tsx`: `DEFAULT_COLOR` was `'#0a0a0a'`,
verbatim the deleted brand map's `coal` entry. Changed to `'#000'` (plain
black, no provenance beyond "black") and reworded the comment above it.

### Finding 3 (Minor) — test lost its point

`lib/editor/src/layered-schema-transitions.test.ts`, `'rejects a bad enum value
on a sub-option'`: previously asserted rejection twice (`wipe` with
`color: 'x', direction: 'sideways'`, then `slide` with `direction: 'sideways'`)
— since `color` is now free-form, the `wipe` case's rejection came from
`direction`, duplicating the `slide` assertion. Split into two tests: the
original enum-rejection test now only covers `slide`; a new
`'rejects a non-string value for wipe's color'` test asserts `wipe` still
rejects on `color`'s own type (`color: 42`) — free-form doesn't mean untyped.

### Finding 4 (Minor) — no render-path test for the accent control

`lib/editor/app/LayeredInspector.test.tsx`: added a `wipeReel` fixture
(`transitionOut: { kind: 'wipe', frames: 15, direction: 'left' }`) and a new
`describe('LayeredInspector accent sub-option (wipe color)')` block with two
tests — with `accentSlots` supplied, the `Color` label appears and each slot
renders as an `<option>` keyed by slot `key` with the slot `label` as its text;
with no `accentSlots` prop, the `Color` control is omitted entirely (not shown
empty).

## Verification

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run
 Test Files  45 passed (45)
      Tests  453 passed (453)
```
Baseline 45 files / 449 tests → +4 tests (Finding 1: +1, Finding 3: net +1,
Finding 4: +2), same file count, no regressions.

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && ./node_modules/.bin/tsc --noEmit
34 errors
```
Matches the 34-error baseline exactly; none reference a file this pass touched.

## Constraints honoured

- Core-only: no edits outside `/Users/xaralis/Workspace/progpce/core`; neither
  brand repo touched.
- No render-affecting change: no project literal uses `kind: 'wipe'`, so the
  `DEFAULT_COLOR` change and the `AccentKey` recognition fix are both
  render-safe (confirmed by grep across brand repos in the original task —
  unchanged for this follow-up pass).
