# Task 3 report — One source of truth for transitions

Commit: `25ecaf4` (branch `refactor/phase1-subtract`, on top of `176d8e9`). Signed OK.

## What was unified, and how

`lib/reel-config-base/transition-schema.ts` is now the single source, following the
`lib/theming/placement.ts` precedent. It holds ONE ordered `CATALOG` of entries shaped
`{ schema, label, defaults? }`. Everything else is derived from it:

| Derived thing | How |
|---|---|
| `TransitionSchema` | `z.discriminatedUnion('kind', CATALOG.map(e => e.schema))` |
| `Transition` / `TransitionKind` | `z.infer` of that union (`base-types.ts` re-exports, no longer redefines) |
| `TRANSITION_CATALOG` → editor's `TRANSITION_KINDS` | `CATALOG.map(e => ({ kind: kindOf(e), label: e.label }))` |
| `kindNeedsFrames(kind)` | `'frames' in entry.schema.shape` |
| `subOptionsFor(kind)` | read structurally off `entry.schema.shape` |
| `defaultTransition(kind)` | `entry.defaults` + first-enum-option for required fields |
| `presentationFor` | `Record<TransitionKind, Renderer<K>>` — compiler-enforced |

The `kind` string is never restated: it is read back off each member's own
`z.literal` (`kindOf`), so a catalog entry cannot disagree with its schema.

**Preserving `z.infer` precision was the one real design constraint.** A plain
`CatalogEntry[]` annotation widens every member to `ZodObject<ZodRawShape>` and
collapses `Transition` to `{ [k: string]: any }`, silently gutting the types the
templates rely on. The fix is a tuple-preserving identity helper declared with a rest
parameter (`function catalog<T extends CatalogEntry[]>(...entries: T): T`), plus a
homomorphic mapped type `SchemasOf<T> = { [K in keyof T]: T[K]['schema'] }` to hand
zod the non-empty tuple its signature wants. Verified with a throwaway probe file:
`Extract<Transition, {kind:'burn'}>['mask']` resolves, and `TransitionKind = 'swoosh'`
is rejected.

The four old definitions:

1. **`TransitionSchema` (zod)** — became the catalog. Union member *order* changed to
   the editor's curated order (unions are order-insensitive; the dropdown order is
   therefore unchanged).
2. **`lib/editor/app/transitions.ts` `TRANSITION_KINDS`** — the "deliberately NOT
   importing the zod schema" header is gone along with the reason it gave. That reason
   was already void: `LayeredInspector.tsx` imports `layered-schema`, `total-duration`
   and `music-envelope` from `reel-config-base` today. The file is now a re-export plus
   the genuinely editor-only bits (`DURATION_PRESETS`, `framesToSeconds`,
   `presetForFrames`): 182 lines → ~60.
3. **`presentationFor` switch** — replaced by `PRESENTATIONS: { [K in TransitionKind]:
   Renderer<K> }`. Its old `default: return null` arm was the drift-swallower: a kind
   the catalog had but the renderer didn't just played as a hard cut, silently. Each
   arm now receives its own narrowed union member, which also removed ten `as` casts
   (`t.color as 'lime'|'teal'|'coal'|undefined`, etc.).
4. **`transition-record.ts`** — the comment said it "mirrors transitions.ts". It no
   longer mirrors anything: `TransitionRecord = Exclude<Transition, {kind:'cut'}>`. The
   `getTransitionRecord` *parameter* stays deliberately loose, because a hand-edited
   `Root.tsx` literal is not schema-validated and this gate is the last check before
   the renderer.

## What happened to the editor metadata

Nothing was lost; some of it stopped being hand-maintained.

- **Labels** ride on the catalog entry (`label: 'Fade to black'`). All 14 preserved
  verbatim — the existing label assertions in `transitions.test.ts` pass untouched.
- **Duration presets** (`short`/`medium`/`long` = 8/15/30) stayed in
  `lib/editor/app/transitions.ts`. They are a UI affordance with no meaning to the
  schema or the renderer, so they are correctly editor-local.
- **Sub-options are now DERIVED, not declared.** `subOptionsFor` reads each kind's own
  zod shape: `ZodEnum` → a dropdown whose options are literally the schema's enum
  values; `ZodNumber` → a numeric field; anything else skipped. `kind` and `frames` are
  excluded (the picker renders those itself). Prop and value labels come from a
  `humanize()` helper plus a 4-entry override table for the gradient corner codes
  (`tl-br` → "Top-left → bottom-right"), which is all that survives as hand-written
  presentation text.
- **Defaults**: required fields fall back to the schema enum's first option, which
  covers slide/flip/whip-pan (`direction: 'left'`) and zoom-through (`from: 'in'`) for
  free. Only two entries need explicit `defaults`: `wipe` (`color: 'teal'`, not the
  enum's first option `lime`) and `gradient-wipe` (both fields are schema-optional but
  the editor seeds them so the controls aren't blank). Both are commented with *why*.

**One intended behaviour change:** `subOptionsFor('burn')` used to return `[]` (burn
fell through the old switch's `default`). Structural derivation now surfaces
`edgeContrast` and `glowBand` as numeric controls. `mask` and `glowColor` are strings
and are skipped automatically — there is no free-text sub-option control, and both are
brand-supplied rather than hand-tuned. This is the drift the derivation was meant to
catch: the schema had those fields and the editor never offered them.

## Tightening `transitionIn`/`transitionOut`

`layered-schema.ts` `VideoContainerBase` now carries `TransitionSchema.optional()` on
both fields instead of `z.record(z.string(), z.unknown())`.

### All 17 vendored projects, parsed from `src/Root.tsx` `defaultProps` (never `reel.config.json`)

Audited with a throwaway ts-morph evaluator that statically evaluates the inlined
`defaultProps` object literal and runs the full `LayeredReelSchema` over `props.reel`.
Non-layered (web-program-intro) projects were walked for any `transitionIn`/
`transitionOut` literal anywhere in the tree and each validated individually.

| # | Project | Result | Transition literals found |
|---|---|---|---|
| 1 | `pp-05-zastupitelsky-klub` | PASS (layered) | none |
| 2 | `pp-cyklostezka-chrudimka` | PASS (layered) | none |
| 3 | `pp-druzstevni-parkovani` | PASS (layered) | none |
| 4 | `pp-mov-koalice` | PASS (layered) | `out:glitch`, `out:dissolve` |
| 5 | `pp-namesti-republiky` | PASS (layered) | `in:fade`, `out:dissolve`, `out:fade-coal` |
| 6 | `pp-paro-2026` | PASS (layered) | none |
| 7 | `pp-plovarna-napojeni` | PASS (layered) | none |
| 8 | `pp-program-bydleni` | PASS (web-program-intro) | 0 |
| 9 | `pp-program-klima` | PASS (web-program-intro) | 0 |
| 10 | `pp-program-klima-reel` | PASS (layered) | `out:dissolve` |
| 11 | `pp-program-mobilita` | PASS (web-program-intro) | 0 |
| 12 | `pp-program-mobilita-reel` | PASS (layered) | `out:dissolve` |
| 13 | `pp-program-obvody` | PASS (web-program-intro) | 0 |
| 14 | `pp-program-verejny-prostor` | PASS (web-program-intro) | 0 |
| 15 | `pp-rezidentni-parkovani` | PASS (layered) | none |
| 16 | `pp-ricni-sauna` | PASS (layered) | `out:dissolve` |
| 17 | `roost-reel-01` | PASS (layered) | `out:fade`, `out:cut`, `out:cut`, `out:gradient-wipe`, `out:burn` |

**17/17 pass. No failures, no migration needed, and the schema was not loosened for
anything.** The audit is non-vacuous: `roost-reel-01` exercises `fade`, `cut`,
`gradient-wipe` and `burn` through the full union exactly as the brief predicted,
including burn's optional `mask`/`glowColor`/`edgeContrast`/`glowBand` bag and
gradient-wipe's `direction`/`softness`. The audit file was deleted after the run.

Tightening did surface one defect **in the repo's own test data**, which is exactly
what it is for: `lib/editor/src/timeline/layered-adapter.test.ts` had a fixture
`transitionOut: { kind: 'whip-pan', frames: 6 }` with no `direction` — a shape the
schema has always required and the permissive record always accepted. Fixed in place.

Rendering an existing literal is unchanged: no layered project calls `.parse()` at
render time (they `import type` only, and no `<Composition schema=…>` is wired to
`LayeredReelSchema`), and `presentationFor`'s kind→presentation mapping is identical
arm-for-arm to the switch it replaced.

## Dead duplicates

- **`lib/transitions/presentations/clock-wipe.tsx` — deleted.** `presentationFor` uses
  `@remotion/transitions/clock-wipe`; the custom implementation (`startAngle`,
  `segments`, `counterclockwise`) was unreachable from the schema, the editor and the
  renderer. Removed from `lib/transitions/index.ts`, both `TransitionGallery.tsx`
  files, `lib/transitions/README.md`, root `README.md`, `docs/creating-templates.md`,
  `skills/remotion/SKILL.md`, `_internal/ROADMAP.md` and
  `_internal/toolkit-registry.json`. A note in `index.ts` records why there is no
  `clockWipe` export.
- **The custom `wipe` is NOT dead — the brief is wrong on this point.**
  `at-cut-transitions.tsx` imports it as `wipe as customWipe` and uses it for the
  `wipe` kind, deliberately: the schema's `wipe` member is colour + 2-way direction
  (`@remotion/transitions/wipe` is 4-way and colourless). It was kept, and the reason
  is now documented above the `PRESENTATIONS` map.

## Verification

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run
 Test Files  44 passed (44)
      Tests  410 passed (410)
```

Baseline was 43 files / 393 tests. The delta is entirely additive: one new file
(`lib/editor/src/layered-schema-transitions.test.ts`, 10 tests covering the tightened
field) and 7 new anti-drift tests in `transitions.test.ts`. No existing test was
weakened or deleted.

The 7 anti-drift tests are the guard rail: they read `TransitionSchema.options`
directly and assert that `TRANSITION_KINDS` equals the schema's kinds in the schema's
order; that `kindNeedsFrames` matches the presence of a `frames` field; that
`defaultTransition(kind)` **parses against `TransitionSchema`** for every kind; that no
sub-option names a field the kind's schema lacks; that every enum sub-option's values
equal the schema enum's; and that every required non-`frames` field surfaces as a
sub-option. Re-introducing a hand-maintained list fails these.

`npx tsc --noEmit`: 34 errors, byte-identical to the pre-change baseline (12
`SegmentMedia.tsx`, 6 `GenericTextOverlay.tsx`, 5 `GenericWatermark.tsx`, 3
`TextOverlay.tsx`, 2 `LayeredInspector.tsx`, 2 `theming/envelope.test.ts`, 1 each in
`derive-layered.test.ts`, `theming/types.ts`, `theming/placement.ts`,
`theming/envelope.ts`) — all pre-existing, all unrelated (missing `react`/`remotion`
types in the theming tree). Zero new errors.

## Does adding a kind now touch one place?

**One place, plus one compiler-enforced follow-up.**

1. Append an entry to `CATALOG` in `transition-schema.ts`. The zod union, `Transition`,
   `TransitionKind`, the editor dropdown entry, its sub-option controls (dropdowns for
   enums, numeric fields for numbers, both labelled automatically) and its
   `defaultTransition` all follow with no further edits.
2. `tsc` then **fails** on `PRESENTATIONS` in `lib/render/at-cut-transitions.tsx` until
   a renderer arm is added.

Step 2 cannot be folded into step 1 without breaking the pure/JSX split
(`lib/render/README.md`): the catalog lives in `reel-config-base`, which must stay
Remotion-free so it can be unit-tested in core. Making it a compile error rather than a
silent `default: return null` is the best available seam. This is the state Task 4
needs — its six kinds (`rgbSplit`, `zoomBlur`, `lightLeak`, `pixelate`, `checkerboard`,
`scanlineGlitch`) are six catalog entries and six render arms the compiler will demand.

## Concerns

- Only that `subOptionsFor('burn')` behaviour change (two new numeric controls in the
  editor). Intended and argued above, but it is a visible UI delta, so flagging it.
- The `catalog(...)` rest-param helper plus `SchemasOf<T>` mapped type is the least
  obvious code in the change. It is load-bearing (without it `Transition` degrades to
  `{[k: string]: any}` and the exhaustive `PRESENTATIONS` map stops meaning anything)
  and is commented as such at both sites.

---

# Review follow-ups (commit `c0f3c20`)

Three findings from the review of `25ecaf4`, plus the two minor items and the pinning
test the reviewer asked for. Core-only — neither brand repo was touched.

## Finding 1 (Important) — brands that spread a transition object

**Confirmed as a real migration.** With `transitionOut` typed `TransitionSchema`
instead of `z.record`, spreading a `Transition | undefined` yields `kind?:`
(*optional* — spreading a possibly-undefined value makes every property optional), and
an optional discriminant is not assignable to `VideoItem['transitionOut']`. I
reproduced roost's exact `withBurnLook` against core's own `VideoItem` in a scratch
file: the old shape errors with TS2322, the new one compiles clean.

Rendering is unaffected — nothing re-parses at render time — so this is a
**compile-time migration only**.

### The fix in core

`withTransitionOverrides(t, overrides)` in
`lib/reel-config-base/transition-schema.ts`. It preserves the discriminant and the
precise member type, and passes `undefined` straight through.

Two type-level details are load-bearing and commented at the site:

- The overrides type **distributes** over the union. `keyof` a union is only its
  *common* keys, so a non-distributive `Partial<Omit<Transition, 'kind'>>` collapses to
  `{}` and accepts literally any object. I verified this failure mode before fixing it:
  the first draft accepted `{ nope: 1 }`, `{ kind: 'cut' }` and `{ frames: 'ten' }`
  without complaint.
- `cut` maps to `never`, not `{}`. `Omit<CutMember, 'kind'>` is empty, and `{}` means
  "any non-null value" — one empty constituent re-opens the whole union. `never` drops
  out instead. After this, all four negative cases error and the positive ones don't.

`kind` cannot be overridden (it is `Omit`ted), so the discriminant survives by
construction.

### The exact roost migration (paste on the pin bump)

File: `roost/video-toolkit/projects/roost-reel-01/src/LayeredRoostReel.tsx`, the
`withBurnLook` helper (~line 105).

Add to the imports:

```ts
import { withTransitionOverrides } from '@video-toolkit/lib/reel-config-base/transition-schema';
```

Before:

```ts
function withBurnLook(items: VideoItem[]): VideoItem[] {
  return items.map((it) =>
    (it.transitionOut as { kind?: string } | undefined)?.kind === 'burn'
      ? { ...it, transitionOut: { ...it.transitionOut, mask: 'brand/burn-mask.png', glowColor: theme.colors.paper } }
      : it,
  );
}
```

After:

```ts
function withBurnLook(items: VideoItem[]): VideoItem[] {
  return items.map((it) =>
    it.transitionOut?.kind === 'burn'
      ? {
          ...it,
          transitionOut: withTransitionOverrides(it.transitionOut, {
            mask: 'brand/burn-mask.png',
            glowColor: theme.colors.paper,
          }),
        }
      : it,
  );
}
```

Note the second change on the guard line: the `as { kind?: string } | undefined` cast is
no longer needed either. `transitionOut` is now a real discriminated union, so
`it.transitionOut?.kind === 'burn'` both reads directly *and* narrows the value to the
burn member — which is what gives `withTransitionOverrides` its precise type there
(a typo'd or non-burn field is rejected, not silently merged).

**Documented durably** in the `MIGRATING A BRAND` block at the top of
`transition-schema.ts`, so the next brand hitting this finds it beside the helper
rather than in a report.

## Finding 2 (Important) — the `as Transition` cast in derive-montage

Removed. `MontageConfig.outro.transition` was typed `TransitionKind`, which admits
`slide`/`wipe`/`zoom-through`/`flip`/`whip-pan`/`gradient-wipe`-with-required-fields —
any of which, turned into `{ kind, frames }`, is missing a required field. The `as`
hid it.

Fixed by **narrowing the config field**, which is the stronger of the two options
offered: `defaultTransition` returns a `DraftTransition` (deliberately permissive, it
serves the mid-edit picker), so routing through it would have needed its own cast to
land in `transitionOut`. Narrowing makes the compiler do the checking.

New type `FramesOnlyTransitionKind` — the members fully specified by `{ kind, frames }`,
derived structurally rather than hand-listed:

- **Included:** `dissolve`, `fade`, `fade-coal`, `glitch`, `burn`, `clock-wipe`, `iris`,
  `gradient-wipe`. `burn` and `gradient-wipe` qualify because everything beyond
  `kind`/`frames` is *optional* on them.
- **Excluded:** `slide`, `flip`, `whip-pan`, `wipe`, `zoom-through` (all need a
  required `direction`/`color`/`from`), and `cut` (no `frames` at all —
  `{ kind: 'cut', frames }` is not a valid transition).

Verified with a scratch file asserting each excluded kind errors and each included one
does not. roost's config uses `"transition": "dissolve"` for the outro, so nothing in
use is affected; derivation output is byte-identical (`derive-montage.test.ts` green
unchanged).

## Finding 3 (Minor, needed by Task 4) — boolean sub-options

- `SubOption.kind` is now `'enum' | 'number' | 'boolean'`; `subOptionsFor` maps
  `z.ZodBoolean` (bare or `.optional()`) to a `boolean` sub-option.
- `LayeredInspector.tsx` gains a `CheckboxField` and the sub-option render is now an
  **explicit dispatch** rather than enum-or-else-number — so a future `SubOption.kind`
  with no control here renders nothing rather than a wrong-typed field.

Task 4 can add `pixelate`/`checkerboard`/`scanlineGlitch` with boolean options and get
working controls with no retrofit.

## Minor — `defaultTransition` seeding numbers with `0`

Made **min-aware** rather than commented as safe: a required `z.number().min(1)` now
seeds `1`, `z.number().min(4).max(64)` seeds `4`, and an unbounded number still seeds
`0`. This matters because `defaultTransition` is exactly what the picker hands the user
on a kind switch — the old behaviour would have handed them a value the schema rejects.
No current kind has a required bounded number, so behaviour for every existing kind is
unchanged (all the pre-existing `defaultTransition` assertions pass untouched).

## Minor — `TRANSITION_CATALOG.kind`

Typed `TransitionKind` instead of `string`. `kindNeedsFrames`, `subOptionsFor` and
`defaultTransition` still take `string`, deliberately — they accept draft/legacy input,
as their comments already say.

## The `subOptionsFor('burn')` pin

Not changed (intended delta), but now pinned explicitly as a recorded decision in
`lib/editor/app/transitions.test.ts`:

```ts
expect(subOptionsFor('burn').map((o) => o.prop)).toEqual(['edgeContrast', 'glowBand']);
expect(subOptionsFor('burn').map((o) => o.kind)).toEqual(['number', 'number']);
```

with a comment stating why `mask`/`glowColor` stay uncontrolled (brand-supplied
strings; no free-text sub-option control exists) and that the list changes only on
purpose.

## Testability seam

`subOptionForField(prop, field)` and `defaultValueForField(field)` were extracted from
the two loops and exported. Reason: the boolean rule and the lower-bound rule have **no
catalog kind behind them yet**, so without a per-field seam they would be untestable
until Task 4 lands — a rule nothing exercises is a rule that gets discovered broken.
Both are small, pure, and documented as to why they are exported. `subOptionsFor` and
`defaultTransition` are now thin wrappers over them, so the seam cannot drift from the
behaviour it describes.

## Covering tests

New file `lib/editor/src/transition-overrides.test.ts` (11 tests):

- returns `undefined` for `undefined`; preserves the discriminant; overrides only the
  named fields; does not mutate the input; the result still parses under
  `TransitionSchema`.
- **The roost case, end to end** — a local `withBurnLook` written in the migrated shape,
  asserting: `mask` + `glowColor` are added to an existing `burn` while `kind`/`frames`
  survive; the result parses as a `VideoItem`; burn's other optional knobs
  (`edgeContrast`, `glowBand`) are preserved when already set; and neither a
  non-burn transition nor an item without one is touched.

Added to `lib/editor/app/transitions.test.ts` (10 tests): the burn pin above, plus
`subOptionForField` (boolean bare + optional, number, enum, and string/record →
`null`) and `defaultValueForField` (min-aware bound incl. a round-trip
`safeParse` of its own seed, unbounded → 0, boolean → false, enum → first option,
string → no seed).

Type-level behaviour that `vitest` cannot see (esbuild strips types) was verified with
throwaway scratch files under `tsc`, then deleted: the old roost spread errors and the
new one does not; each excluded `FramesOnlyTransitionKind` errors; and
`withTransitionOverrides` rejects `{ nope: 1 }`, `{ kind: 'cut' }`, `{ frames: 'ten' }`
and `{ direction: 'left' }`-on-burn while accepting the valid calls.

## Verification

```
$ cd lib/editor && npx vitest run
 Test Files  45 passed (45)
      Tests  429 passed (429)
   Duration  5.04s

$ cd lib/editor && npx tsc --noEmit 2>&1 | grep -c "error TS"
34
```

Baseline was 44 files / 410 tests → **45 / 429** (+1 file, +19 tests), all passing.
`tsc` holds at the pre-existing **34**-error baseline; filtering out the known baseline
errors leaves nothing.

Constraint check: no baked literal changes meaning — the runtime `TransitionSchema`
union is untouched (the additions are type-level plus the two structural readers), and
derivation output is unchanged as well, so the render-frozen guarantee holds without
needing a re-parse sweep of the 17 vendored projects.

## Not done / notes

- **The inspector's boolean branch has no automated test.** It cannot be exercised
  through `subOptionsFor` until a catalog kind actually declares a boolean field, which
  is Task 4's first entry. The rule it depends on (`subOptionForField` → `'boolean'`)
  *is* tested; Task 4 should add the rendering assertion when it adds the kind.
- Brand repos were read for verification only and not modified. `roost/video-toolkit`
  has pre-existing uncommitted changes to `projects/roost-reel-01/src/Root.tsx` and an
  untracked `project.json` (mtime 15:51, before this session) — not mine, left alone.
