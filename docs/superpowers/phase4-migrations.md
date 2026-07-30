# Phase 4 — brand migration notes

Phase 4 is **core-only**. Nothing here has been applied to a brand repo; each
item says what a brand will need to do on the submodule pin bump that brings
these commits in, and is graded **parity-preserving** (restores or keeps
existing behaviour) or **deliberate look change**.

Brand repos, both read-only for this phase and both on `main` at core `9202e79`:

- PP: `/Users/xaralis/Workspace/progpce/video-toolkit`
- roost: `/Users/xaralis/Workspace/roost/video-toolkit`

---

## Task 1.0 — the transition schema opened to brand kinds

### 1.0-a `TransitionSchema.options` no longer enumerates kinds

**Grade: parity-preserving** (compile-time only).

`TransitionSchema` is now a two-branch `z.union`, so `.options` are the two
branches rather than the catalog's kinds. Anything enumerating kinds must read
`CoreTransitionSchema.options`.

**Neither brand repo does this today** (checked). No action expected.

### 1.0-b `withTransitionOverrides` regained its excess-property check

**Grade: parity-preserving** (it restores pre-Phase-4 behaviour).

roost's call site is the only real consumer. A misspelled override key there will
now fail to compile rather than silently no-op — which is what it did before
Phase 4 opened the union. If the brand wants to override a *brand* kind's own
params, that needs a brand-side typed helper; core cannot name those keys and so
cannot check them.

---

## Task 1.1 — one `ParamField` for both axes

### 1.1-a `SubOption.kind` is now `ParamField.type`

**Grade: parity-preserving** (compile-time only; rename, not a behaviour change).

The transition axis' `SubOption` and the effect axis' `ParamField` were two
incompatible parameter vocabularies. They are now one descriptor, defined in
`lib/reel-config-base/param-field.ts`. `SubOption` and `SubOptionChoice` survive
as **deprecated type aliases**, so an import of either still resolves — but the
field formerly spelled `kind` is spelled `type`, matching the effect axis and
freeing `kind` for what it means everywhere else in the transition schema.

**Who is affected:** anything reading `subOptionsFor(kind)[n].kind`. In core that
was `LayeredInspector` and two test files. **Neither brand repo calls
`subOptionsFor` or `subOptionForField`** (checked) — the editor is core's, and a
brand consumes it rather than re-implementing its dispatch. No action expected.

### 1.1-b `options` accepts both declaration styles

**Grade: parity-preserving.**

`ParamField.options` is `readonly (string | {value,label})[]`. Every existing
brand declaration is a bare string list and keeps working **unchanged**, with the
label still rendered raw (a bare string's label is the string itself —
deliberately not humanized, or every existing dropdown would silently relabel).
The spelled-out form is new capability, not a requirement. Normalise with
`paramChoices()` if you read an options list yourself.

### 1.1-c burn's `glowColor` is now `ColorHex`, not a bare `z.string()`

**Grade: parity-preserving.** Validation is byte-identical (`ColorHex` is a
marked `z.string()` and rejects exactly what a plain one rejects). The marking
exists so the *editor* gives the field a colour control; nothing about parsing,
rendering or the baked literals changes. All 13 transition literals across both
brand repos parse unchanged.

### 1.1-d new editor controls appear for fields that had none

**Grade: deliberate — but additive, and it moves zero pixels.**

A brand's inspector will show controls it did not show before:

- **`burn.mask`** — a text field. Previously invisible.
- **`burn.glowColor`** — a colour swatch + text field. Previously invisible.
- an **`accent`**-typed *declared* param (`EditorMeta.videoProps` / effect
  `params` / any registration's `params`) now renders as a brand-palette
  dropdown. Previously the declared-params path had no `accent`, so such a field
  fell through to a text box.
- **`percent`** and **`angle`** types are available to a brand's declarations.
  Neither converts the stored value — they change the control only (a bounded
  0–100 field, a whole-degree step).
- any numeric transition param now carries the **schema's own min/max** into the
  control (e.g. `light-leak.intensity` is bounded 0–1 in the UI), without anyone
  restating the range — **and a `step` derived from that range**. The bounds
  shipped without one at first, which made the control *less* usable, not more:
  `<input type=number>` defaults `step` to 1, so a 0–1 field spun only between
  0 and 1 and a typed `0.5` was rejected as a step mismatch. `numericStep`
  (`transition-schema.ts`, beside `numericBounds`) now emits
  `10 ** ceil(log10(span) - 2)` clamped to `[0.01, 1]` — 0.01 for
  `light-leak.intensity`, 1 for `pixelate.maxBlockSize` (8–200) — and 1 for any
  `.int()` field. An unbounded number still gets no step, so the control's own
  default applies.

Nothing is written into a config that was not written before, so no render
changes. Verified: `npm run pixel-gate:strict` in `examples/layered-minimal`.

### 1.1-e `Animatable` ships unused

**Grade: no action.** `Animatable<T>` / `sampleAnimatable` land as a mechanism
with no caller. `ken-burns` is deliberately NOT migrated onto it (Task 3.2
depends on `kenBurnsStyle` keeping its exact signature). Keyframe editing UI is
out of scope for Phase 4; the editor exposes constants only.

---

## Task 1.2 — `BrandTheme.transitions`, the sixth extension axis

### 1.2-a The registry is purely additive — nothing to do

**Grade: parity-preserving. No action.**

Transitions were the one extension axis with no theme surface: kinds resolved
through a module-private `PRESENTATIONS` table in `at-cut-transitions.tsx`, so
adding a look meant editing three core files. `BrandTheme` now carries an
optional `transitions?: TransitionRegistry`, resolved by the same
`resolveRegistered` the other five axes use — **brand wins, core's generic
beneath, and a config-only registration does not mask the generic**.

**Neither brand repo registers a transition today.** Verified: `grep -rn
'transitions:' templates projects brands --exclude-dir=node_modules
--exclude-dir=build` over both repos returns nothing. Every transition either
repo authors is a core catalog kind or `cut` — PP: `dissolve`, `fade`,
`fade-coal`, `glitch`, `whip-pan`, `wipe`, `zoom-through`, `cut`; roost:
`burn`, `gradient-wipe`, `fade`, `cut`. So the axis ships unused in both, and
the resolution order cannot change any of them.

> **One exception, added later:** `fade-coal` is **no longer a core catalog
> kind** — § 2.3-a removed it. PP's one authored use must be rewritten; until it
> is, that literal does not parse.

### 1.2-b What a brand WRITES to register one

```ts
// brands/<brand>/…/composition-theme.tsx
transitions: {
  'my-swipe': {
    render: ({ frames, width }) => ({ component: MySwipe, props: { frames, width } }),
    params: [{ prop: 'softness', type: 'number', min: 0, max: 1 }],
    config: { /* theme-level, read with transitionConfig(theme, kind) */ },
  },
}
```

`params` is the shared `ParamField` descriptor from Task 1.1 — the SAME one the
effect axis and `EditorMeta` use. Declaring the kind here is the whole
declaration: `editorMetaFromTheme` derives `EditorMeta.transitionProps` from the
registry, so the kind becomes selectable and editable without a second
hand-written copy (see 1.2b below).

### 1.2-c `fade-coal` stays in core's catalog — SUPERSEDED, see § 2.3-a

**Grade at the time: unchanged, but worth knowing.** `fade-coal` is one brand's
colour word frozen into core's public vocabulary — exactly what the axis exists
to prevent. It was NOT retired in Task 1.2: PP authors it, and retiring it is
brand-visible. The axis is what makes a *future* look a brand's own.

> **Superseded.** Task 2.3 shipped the generic replacement (`fade-to-color`,
> colour exposed as a parameter), and a follow-up **removed `fade-coal` from core
> entirely** — no alias, no shim. The brand-visible cost this entry declined to
> pay is now paid deliberately and is written up as a **required** migration in
> **§ 2.3-a**.

---

## Task 1.2b — the editor learned about brand kinds

### 1.2b-a "Transition out" no longer DESTROYS a brand transition

**Grade: deliberate — a bug fix, user-visible, and the reason this task exists.**

The video lane's "Transition out" section tested the authored kind against
`TRANSITION_CATALOG` and fell back to `{kind:'cut'}` otherwise. Once Task 1.2
let a brand register its own kinds, that fallback started firing on transitions
that **render perfectly**: the kind was DISPLAYED as "Cut", and the first touch
of any control in the section wrote the coercion back through `onChange`. Silent
data loss, the same class as the dropped `alignment` (1.4-e) and `enabled`
(1.5-a).

Now ANY authored kind is shown as itself; only a genuinely absent or kind-less
value reads as a cut.

**Affected projects: none today, all tomorrow.** Verified over both repos'
`templates/` and `projects/` (excluding `node_modules` and generated `build/`):
every authored `transitionIn`/`transitionOut` kind is a core catalog member or
`cut` (lists in 1.2-a), so the coercion never fired on a baked literal. It
would fire on the *first* kind either brand registers — which is why the fix
ships with the axis rather than after it.

### 1.2b-b The Kind picker gains the brand's registered kinds

**Grade: deliberate — additive; new entries appear in an existing dropdown.**

The picker ran off `TRANSITION_KINDS` alone, so a brand kind could render (Task
1.2) and still not be choosable. It is now `transitionKindChoices` = the core
catalog **∪** the keys of `theme.transitions`, core entries keeping their
catalog position and label, brand entries appended and labelled by
`humanizeKey` (a registration has no label field). A brand override of a core
kind does not duplicate the entry — it keeps the catalog's position and label.

`transitionKindLabel` is the one decider for a kind's display name, so the
picker's option text and the transitions-lane heading cannot disagree.

**Neither brand repo sees a changed dropdown until it registers a kind** — with
an empty registry the union is exactly the old catalog.

### 1.2b-c A brand kind's controls come from its registration

**Grade: purely additive. No action.**

`transitionParamsFor(kind, declared)` composes BOTH sources: core's structural
fields read off the catalog entry's zod shape (`subOptionsFor`, which returns
`[]` for a kind core does not have) plus the registration's declared `params`,
a declared field winning **by `prop`, in place**. So a brand overriding a core
kind may relabel or re-type one field without losing the rest, and a core kind
with nothing declared gets exactly the controls it always had.

The theme reaches the editor the way it already did, through
`editorMetaFromTheme` — no second mechanism, and an explicit `EditorMeta`
still wins per field.

---

## Task 1.3 — Two-input transition rendering

### 1.3-a Brand transition registrations keep working, unchanged

**Grade: parity-preserving. No action.**

`TransitionRenderer`'s return type WIDENED from `AnyPresentation | null` to
`ResolvedTransition | null` (`= AnyPresentation | TransitionNode | null`). That
direction is backwards-compatible: a registration written against Task 1.2 —
returning `{component, props}` — is still assignable, and core lifts it into the
two-input form with `fromRemotionPresentation`. Neither brand repo registers a
transition today; when one does, the 1.2 shape remains valid.

### 1.3-b `presentationFor`'s signature is unchanged by Task 1.3 — but `WebProgramIntro` was NOT safe

**Grade: CORRECTED — was "parity-preserving, no action", is actually a required
WPI fix (applied 2026-07-29).** The original claim conflated two different
things: `presentationFor`'s own signature (Task 1.3's business, genuinely
untouched) and whether the SIX call sites below still compile (not Task 1.3's
business at all — they broke from **Task 1.0**, one task earlier, and nobody
had run `tsc` against WPI with a Phase-4 pin to notice). "Cannot be discovered
by compiling", below, describes the *separate*, still-open Task 2.1 hazard —
this defect was the opposite: discoverable by compiling, the moment anyone
actually did.

**SIX call sites, not two.** `grep -rln presentationFor` over the PP repo's
`projects/` AND `templates/` (roost has none — its only mentions are comments in
`LayeredRoostReel.tsx`, which goes through `buildVideoNodes`):

| # | file |
|---|---|
| 1 | `projects/pp-program-verejny-prostor/src/WebProgramIntro.tsx` |
| 2 | `projects/pp-program-obvody/src/WebProgramIntro.tsx` |
| 3 | `projects/pp-program-bydleni/src/WebProgramIntro.tsx` |
| 4 | `projects/pp-program-mobilita/src/WebProgramIntro.tsx` |
| 5 | `projects/pp-program-klima/src/WebProgramIntro.tsx` |
| 6 | **`templates/web-program-intro/src/WebProgramIntro.tsx`** — the template, so every future project inherits it |

Each calls `presentationFor(t, {width, height, palette})` and feeds the result to
`TransitionSeries.Transition`. That accessor keeps its name, its signature and
its `{component, props}` return for every core kind, so all six are
untouched **by Task 1.3**. It returns `null` for a kind that resolves to a natively two-input
node — no core kind does yet.

**What actually broke, and why it's WPI's bug, not core's.** All six sites fed
`presentationFor` a raw `t: Transition` and hand-rolled the "is this a cut?"
gate with `if (t.kind === 'cut') return null;`, then read `t.frames`. That
compiled fine before Phase 4, when `Transition` was `CoreTransitionSchema`'s
closed discriminated union. **Task 1.0** (`062b4f2`) widened it to
`WithTiming<CoreTransition | BrandTransition>`
(`lib/reel-config-base/transition-schema.ts:649`) so a brand can register a
kind without editing core — and `BrandTransition`'s `kind` is `z.string()`, not
a literal. A plain union with one non-literal-`kind` member is not a
discriminated union any more, so `t.kind === 'cut'` stops narrowing anything,
and every site downstream that read `.frames` after the guard now sees the
full union, `cut` member included, which has no `frames`. Task 1.0's own report
named this exact hazard in the same commit and said so explicitly: *"Anything
in 1.1-1.6 that needs to narrow to a core member must say `CoreTransition`, not
`Transition`"* — and separately, that neither brand repo hit it *"today"*,
because WPI was out of scope for the check (it doesn't use the layered schema)
and nobody ran `tsc` against it with the new pin until this defect surfaced.
So: **core's widening was deliberate, reviewed, and documented at the time it
landed; WPI's code simply kept an assumption (`Transition` narrows like a
closed union) that the widening had already invalidated, and the break was
latent until the submodule pin was actually bumped.** `frames` was never
carried by `cut` even before Phase 4 (`cut` has no `frames` in the catalog); no
data was lost, only compile-time narrowing.

**Fix applied, in all six files** (2026-07-29): swapped the hand-rolled
`t.kind === 'cut'` guard for the existing shared gate,
`getTransitionRecord(seg.transitionOut)`
(`lib/render/transition-record.ts`, re-exported from
`lib/render/at-cut-transitions.tsx`) — the same helper `buildVideoNodes`
already uses for this. It returns `TransitionRecord | undefined`
(`= Exclude<Transition, {kind:'cut'}> | undefined`), which `Exclude` computes
structurally rather than by control-flow narrowing, so it isn't affected by
`BrandTransition`'s open `kind`. `renderTransition` now takes a
`TransitionRecord`, not a `Transition`. Type-level only — `getTransitionRecord`
additionally honours `enabled: false` and warns (dev-only) on an unrecognised
kind, neither of which any baked WPI literal uses today, so no render output
changed. Verified per-project with `npx tsc --noEmit`: the three `frames`/`cut`
errors are gone in all five projects and the template; the pre-existing,
unrelated `audioMode` `TS2322`s (`bydleni`: 1, `klima`: 9, `mobilita`: 7,
`obvody`/`verejny-prostor`: 0 — 17 total) are unchanged, A/B-confirmed against
the pre-Phase-4 pin (`9202e79`).

> ### ⚠ HAZARD FOR TASK 2.1 — silent degradation to hard cuts
>
> The moment Task 2.1 makes `checkerboard`, `pixelate`, `scanline-glitch` and
> `wipe` **native** two-input nodes, `presentationFor` starts returning `null`
> for those four kinds. All six call sites above then feed `null` to
> `TransitionSeries.Transition` and those transitions **silently become hard
> cuts**. There is no type error: the signature is unchanged and `null` is
> already a legal return.
>
> Task 2.1 must therefore migrate all six — not "the two projects" — as part of
> its own scope. The template (#6) is the one that matters most: leaving it
> stale reproduces the bug into every project created afterwards. The likely
> shape is a two-input-aware wrapper for the `TransitionSeries` path, or keeping
> a lifted one-sided form available for it; either way it is a decision Task 2.1
> owns, and it cannot be discovered by compiling.

### 1.3-c `AtCutTransition`'s props CHANGED — breaking, but unused by any brand

**Grade: deliberate; no brand action needed.**

`AtCutTransition` went from
`{inPresentation, inFrames, outPresentation, outFrames, seqDurationF, children}`
to `{node, from, to, frames, dims}`. Verified by grep: neither the PP repo nor
the roost repo mounts it directly — both go through `buildVideoNodes`, whose
signature is unchanged. A brand that had copied the old at-cut loop would have
to adopt `buildVideoNodes` rather than patch the props.

### 1.3-d `glitch` changes look at a cut and at a trailing edge

**Grade: DELIBERATE LOOK CHANGE — the only one in this task, and it is
unavoidable under the two-input model.**

`glitch` is the one core presentation that reads `useCurrentFrame()` for its own
purposes (`lib/transitions/presentations/glitch.tsx:45` → `flickerFrame`, which
seeds the `feTurbulence` tear pattern and the neon block layout). Under the old
one-sided model it was mounted inside the CLIP's `Sequence`, so its seed came
from how far into that clip the transition sat; the two halves of one cut
therefore ran on two different clocks and disagreed. Under the two-input model
there is ONE mount inside the BOUNDARY's `Sequence`, so the seed is
boundary-relative — the same authored transition now glitches identically
wherever it sits on the timeline.

Preserving both old clocks is impossible: one node call has one clock, and the
old model had two. Measured extent: 7 of 300 harness cells
(`glitch__cut__p025/p05/p075`, `glitch__exit__p025/p05/p075/p1`), re-baselined
at `--repeat=8`. The crossfade underneath is progress-driven and unchanged; only
the noise pattern moved. `glitch__enter__*` did not move, because at a leading
edge the boundary and the clip start on the same frame.

**One baked cut IS affected.** `projects/pp-mov-koalice/src/Root.tsx:76-79`
authors `transitionOut: { kind: 'glitch', frames: 18 }` on `seg-002`, at a real
contiguous cut (`seg-002` ends at 6467ms, `seg-003` starts there). That reel's
noise pattern at that one cut will change when it is next re-rendered; the
crossfade under it, the timing and every other cut are unaffected. Nothing needs
editing — this is the graded look change landing where it was always going to
land — but a re-render of `pp-mov-koalice` is not bit-identical to its last one.

roost authors no `glitch` (`grep -rl glitch` over its `projects/` and
`templates/` → nothing). No other PP project does either: the only other hit is
`projects/pp-05-zastupitelsky-klub/src/config/types.ts:15`, a *type* member, not
an authored transition.

**Method note, because the first pass got this wrong.** The original check was
`grep -rl glitch <repo>/projects | grep -v node_modules | grep -vE 'toolkit/'`,
and the last filter silently ate every hit — the repo path itself is
`…/video-toolkit/projects/…`, so `toolkit/` matches every line. It returned
nothing and was read as "no brand uses glitch". Any exclusion pattern applied to
a full path must be anchored (`--exclude-dir=node_modules`, or `grep -v
'/node_modules/'`), never a bare substring that can match the repo name.

---

## Task 1.4 — Transition alignment (Center / Start / End at Cut)

### 1.4-a Nothing to do — the field is additive and defaults to today's cut

**Grade: parity-preserving. No action.**

`alignment?: 'center' | 'start' | 'end'` is now carried by every transition,
core-catalog and brand-authored alike. Every baked literal in both brand repos
omits it, and omitting it is `center`, which reproduces the previous
`floor(frames/2)` / `ceil(frames/2)` split exactly — including which side of an
odd frame count gets the extra frame. Verified byte-for-byte by the transition
pixel harness (`examples/layered-minimal`, `npm run pixel-gate:strict`):
`300 accepted, 0 same-picture-different-bytes, 0 drifted, 0 missing`.

Grep over both repos' `templates/` and `projects/`, excluding `node_modules/`
**and generated `build/` output**: **zero** mentions of `TransitionSchema` or
`alignment` in authored source. (The bare grep is not zero — PP's
`projects/pp-program-klima/build/bundle.js` and its sourcemaps contain both, as
a bundled copy of core plus an SVG attribute list. Generated artefacts are not
authored config and nothing migrates them; they are rebuilt.) The one
brand-side `Transition` type
(`projects/pp-05-zastupitelsky-klub/src/config/types.ts`) is a project-local
hand-written union that imports nothing from core, so it is untouched.

### 1.4-b What a brand writes to USE it

One field, next to `frames`, on either edge of a cut:

```ts
// hold the outgoing clip to its last frame, then dissolve entirely inside the
// incoming one
{ ...clip, transitionOut: { kind: 'dissolve', frames: 12, alignment: 'start' } }

// finish the dissolve before the cut, so the incoming clip starts clean
{ ...clip, transitionOut: { kind: 'burn', frames: 20, alignment: 'end' } }
```

It works identically for a brand-registered kind
(`{ kind: 'my-brand-swipe', frames: 12, alignment: 'end' }`) — the field is
intersected onto the whole union, not added to core's catalog members, so both
schema branches carry it and both VALIDATE it (a nonsense value fails to parse
on a brand kind too, which `.passthrough()` alone would not have caught).

There is **no editor control** for it yet: `subOptionsFor` derives controls from
a kind's own member shape, and alignment deliberately is not there (it is a
sibling of `frames`, not a look parameter). A brand sets it in `defaultProps`.

### 1.4-c Alignment at a reel edge CLAMPS

**Grade: parity-preserving** (the clamp is the pre-existing edge behaviour).

The first item's own `transitionIn` and the last item's own `transitionOut` have
no neighbour to borrow from, so the handle is zero and the transition plays over
the item's own frames. `alignment` does not change that: `end` at the leading
edge does not reach before frame 0, and `start` at the trailing edge does not
reach past the reel. A reel edge is not a cut, so there is nothing to sit before
or after.

### 1.4-d The overlapping-boundary defect is STILL a diagnostic

**Grade: unchanged — Task 1.3's dev-only warning stands.**

Task 1.3 deferred the real fix to 1.4 on the expectation that re-timing the
windows for alignment would close it. It does not. A boundary window is `frames`
long whatever its alignment, so "the clip is shorter than its own in+out
transitions" survives every alignment — `center` reaches it as easily as `start`
does. The only real fix is to SHORTEN a transition to fit its clip, which
changes the progress curve of every affected boundary: a render-changing policy
decision that needs its own parity assessment, not a side effect of a field
whose acceptance criterion is byte-identical output.

What 1.4 did do is verify the diagnostic survives the re-timing — it is computed
from exactly the windows alignment moves — and pin that at all three alignments
(`lib/editor/src/transition-alignment-render.test.tsx`).

### 1.4-e Alignment survives the editor's Kind switch

**Grade: parity-preserving (bug fix inside Phase 4; no brand action).**

`defaultTransition(kind, {frames})` builds a FRESH transition and the inspector
writes it over the old one wholesale, so anything not explicitly threaded is
lost. `frames` was threaded; `alignment` was not, so flipping the Kind dropdown
silently dropped it — no control, no warning. Fixed in `defaultTransition`
(which now takes `{frames, alignment}` and carries a RECOGNISED alignment
through, dropping a stale value rather than propagating it) and at the one call
site in `LayeredInspector.tsx`. A kind's own LOOK params are still discarded on
a kind switch — they belonged to the old kind.

No brand is affected (none uses the field yet), but any brand that adopts
alignment before this commit lands would have lost it on the first editor
touch.

### 1.4-f CHECK DURING THE MIGRATION PASS: Remotion's zod sidebar

**Not a regression, but it needs one screenshot to confirm.**

`ClipSegmentBaseSchema` carries `TransitionSchema.optional()`, and live PP
projects hand that tree to `<Composition schema={…}>`. Remotion's zod-driven
Studio sidebar renders `z.discriminatedUnion` but not `z.union`, and does not
render `z.intersection` either — so Task 1.4 changed
`ZodUnion` → `ZodIntersection` on a schema that was ALREADY past what the
sidebar renders (Task 1.0 moved it from `z.discriminatedUnion` to `z.union`).
The fallback therefore predates this task and the transition sub-editor in
Studio's sidebar is expected to be unchanged.

**Action for whoever runs the brand-migration pass:** open one PP project in
Studio, look at the props sidebar for a clip segment, and record what the
transition field renders as. If it degrades the whole segment editor rather
than just that field, that is worth knowing before more schemas move to
non-discriminated shapes. Core's own reel editor is unaffected — it does not use
Remotion's sidebar.

### 1.4-g The transitions LANE now draws where the boundary actually renders

**Grade: parity-preserving (latent defect; no brand action).**

The editor's transitions lane drew every block as
`[cut - frames/2, cut + frames/2]`, unconditionally centred, while the renderer
split the window per `alignment`. Two answers to "where does this transition
sit", and the lane's was wrong off `center` — a `start`- or `end`-aligned
boundary rendered offset and was drawn centred, with nothing failing.

`transitionHandles(frames, alignment)` now lives in `transition-schema.ts` as
the one exported decider both sides read (the `isCut` / `isTransitionAlignment`
pattern), with `transitionAlignmentOf` carrying the defensive default. Nothing
renders differently — the renderer's arithmetic is unchanged, only its home.
No brand is affected: no editor control writes `alignment` and no baked literal
carries one (1.4-a).

---

## Task 1.5 — `enabled`, `config`, one `cut` constant

### 1.5-a `enabled` on effects and transitions — PARITY-PRESERVING (no action)

Both axes gained an optional per-node `enabled`. **Absent means enabled**, and
every baked `defaultProps` literal in both brand repos omits the field, so
nothing changes for either brand until someone opts in. Verified by the pixel
harness (`300 accepted … 0 drifted`) and the 5-frame `MinimalReel` still check —
frame 45 still hashes `7c1512ed…`.

What a brand GETS, for free, on the next submodule pin bump:

```ts
effects: [{ type: 'grain', enabled: false, opacity: 0.3 }]   // skipped, params kept
transitionOut: { kind: 'wipe', frames: 20, enabled: false }  // hard cut, params kept
```

A disabled transition also stops lending handle frames, so the two clips return
to their authored positions — the same layout as `{ kind: 'cut' }`, which is
what a disabled transition should look like.

**Type note, not a migration:** `Effect` gains an optional `enabled?: boolean`
and `Transition` gains it via `TransitionTimingSchema`. Both are optional
additions to types brands only ever read, so no brand code needs to change.

### 1.5-b `transitionConfig` — PURELY ADDITIVE (no action)

The transition axis now has the theme-level config accessor the other three had
(`transitionConfig(theme, kind)`, exported from `lib/theming`). Nothing existing
called anything else — the render path resolves config off the registry directly
and still does.

### 1.5-c `videoConfig` routed through `registrationConfig` — NO BEHAVIOUR CHANGE

It was the one accessor of four that restated `theme.video?.[kind]?.config`
inline. Routing it through the shared helper is a de-duplication only; a test
now pins all four axes answering identically for a registered config, a
config-less registration, and an absent registry. No brand is affected.

### 1.5-d `CUT_KIND` / `isCut` — INTERNAL (no action)

Seven independently written `kind === 'cut'` checks collapsed onto one exported
predicate. Brands author the string `'cut'` in their `defaultProps` exactly as
before; the constant is core's, not a required import.

---

## Task 1.6 — the accent/colour mark

### 1.6-a Accent/colour field marking — PARITY-PRESERVING (no action)

`AccentKey` and `ColorHex` no longer carry a `WeakSet` mark installed by a
patched `.describe()`. Which fields get an accent picker / a colour swatch is now
declared by NAME in `ACCENT_FIELDS` / `COLOR_FIELDS` (`transition-schema.ts`,
beside `PROP_LABELS`), read through `isAccentField` / `isColorField`.

Both constants stay exported and their **validation is byte-identical** (still a
plain `z.string()` with a description), so no baked `defaultProps` literal in
either brand repo changes meaning, and nothing re-parses differently. The
marked-field set is unchanged: `wipe.color` → accent, `burn.glowColor` → colour.
Pixel harness: `300 accepted … 0 drifted, 0 missing`.

What a brand GETS: the mark can no longer be lost. Under the old mechanism any
of `.min()`, `.nullable()`, `.readonly()`, `.catch()` or `.transform()` on such a
field silently removed its editor control — no error, no warning. That was a
latent trap for the next core kind to be authored, not a live defect in either
brand (neither declares a transition kind through core's catalog).

**One consequence worth knowing:** the vocabulary is a NAME list scoped to core's
own catalog fields (`subOptionForField` is reached only from `subOptionsFor`,
which returns `[]` for a brand kind), so a brand kind's own `color` parameter is
unaffected — it is typed by the brand's registration, as it always was. A future
CORE kind wanting an accent field must add its field name to `ACCENT_FIELDS`;
the completeness test in `lib/editor/src/accent-field-mark.test.ts` fails loudly
if the list and the catalog disagree.

---

## Task 2.1 — the four defective kinds became native two-input nodes

`wipe`, `checkerboard`, `pixelate` and `scanline-glitch` are no longer one-sided
`TransitionPresentation`s that core lifts with `fromRemotionPresentation`. Each
is now a `TransitionNode` — one component invoked ONCE per boundary with
`(from, to, progress)` — because all four defects were the same shape: a
two-input operation asked to draw itself one side at a time.

**Nothing to do in either brand repo.** Verified by grep over both, read-only:

```bash
# in each brand repo, exclusions ANCHORED (^toolkit/) — an unanchored
# `grep -vE 'toolkit/'` eats every path in a repo NAMED video-toolkit
grep -rn --include='*.ts' --include='*.tsx' -E "kind: *'(wipe|checkerboard|pixelate|scanline-glitch)'" . \
  | grep -v '/node_modules/' | grep -vE '^(\./)?toolkit/'
```

- **PP:** exactly **one** hit, `projects/pp-05-zastupitelsky-klub/src/config/types.ts:18`
  — a **type-union member**, not an authored transition. Same class as the `glitch`
  finding in 1.3-d. No reel authors any of the four.
- **roost:** **zero** hits.

So every grade below is a change to what these kinds WOULD render. The only reel
in this repo or either brand repo whose pixels actually move is core's own
`examples/layered-minimal`.

### 2.1-a `wipe` plays its two beats in SEQUENCE

**Grade: DELIBERATE LOOK CHANGE.**

`wipe` is a two-beat design — a coloured sheet sweeps IN over the outgoing clip,
then sweeps OUT to reveal the incoming one — and the beats are consecutive. The
one-sided model ran both over the SAME window with the entering half drawn on
top, so its sheet already sat at `translateX(0%)` at progress 0: the frame
flashed to the accent colour on the transition's first frame and the outgoing
clip's own half of the sweep was never seen.

What you see now, checkable against a still: at progress 0 the outgoing clip,
sheet entirely off-frame; the sheet sweeps across to full cover at the midpoint
(where the two clips swap, invisibly, behind it); then it continues off the
other side revealing the incoming clip. `direction: 'left'` means the sheet
travels leftwards throughout — in from the right, out to the left.

Measured on `examples/layered-minimal`'s `MinimalReel` (cut at 3000 ms, window
frames 80-100): frame 85 shows the outgoing dawn photo with the amber sheet over
the right half; frame 95 shows the sheet retreating over the left half with the
incoming dusk photo revealed. Golden cells changed: 12 of `wipe`'s 15
(`p1` in every mode is unchanged — the end state was always the incoming clip).

### 2.1-b `checkerboard` is ONE implementation — and is PIXEL-IDENTICAL

**Grade: parity-preserving.** This is the entry to read if you expected
otherwise: the brief for this task predicted a look change and the measurement
says there is none.

`checkerboard` used to branch on `presentationDirection` into two
implementations. The entering one clipped the incoming clip into each grid cell;
the exiting one drew the SAME cells **empty** — no content, no background — over
an untouched base layer. So a `checkerboard` used as a `transitionOut` had no
visible effect at all, and at a cut the grid was laid out twice.

There is one implementation now: the incoming clip clipped into cells, over an
intact outgoing clip. A cell exists only to carry the incoming clip, so at a
reel's trailing edge no cells are drawn rather than a grid of empty boxes.

**All 15 of its golden cells came through byte-identical** (`0 drifted`), because
everything removed was already invisible: the empty exiting cells painted
nothing, and the entering layer's `progress < 0.01` fill was already
`opacity: 0`. It leaves `knownDefective` because it is no longer defective, not
because its pixels moved.

### 2.1-c `pixelate` no longer paints an opaque black root

**Grade: DELIBERATE LOOK CHANGE.**

The root `AbsoluteFill` was painted opaque black unconditionally, at every
progress. At a cut that made the transition's FIRST frame full black: the
outgoing clip vanished instantly instead of dissolving, and the incoming one
then emerged from black. With two inputs the opaque root has no meaning at all —
the outgoing clip is an input, drawn beneath the incoming one, so there is
nothing to stand in for.

The mosaic, grid lines, glitch slices, RGB split, scanlines, vignette and noise
are untouched; the two crossfade curves are the same two the one-sided form
used, now applied to the two clips instead of to one clip twice. What you see:
progress 0 is the clean outgoing clip, and the pixelation builds over it rather
than over black. Golden cells changed: 12 of 15.

### 2.1-d `scanline-glitch` blends, and its RGB copies are finally visible

**Grade: DELIBERATE LOOK CHANGE.**

This kind never touched opacity and never even destructured
`presentationDirection`. Two consequences, both real:

1. At a cut it was not a dissolve — the incoming clip was painted opaquely from
   the transition's first frame, so the cut effectively landed half a window
   early.
2. Its two RGB-shifted, screen-blended copies were **invisible**: a third, fully
   opaque copy of the children sat on top of them. Only the scanline gradient
   ever showed.

Now the incoming clip crossfades in over the outgoing one, and the two jittered
RGB copies are ramped by the transition's own peak — visible mid-cut, absent at
both ends (which is also what keeps progress 0 showing a clean outgoing clip
rather than a hue-rotated wash of it). Golden cells changed: 12 of 15.

**A second, smaller cause in the same diff.** `xJitter` reads
`useCurrentFrame()`, which since Task 1.3 is BOUNDARY-relative. That clock was
irrelevant while the jitter was buried under the opaque layer; it is not now, so
part of the golden movement is the same frame-origin rebase `glitch` had in
1.3-d. **Unverified** — 1.3-d's proof (re-render the old hashes with a `+40`
frame offset) cannot be repeated here, because the compositing changed in the
same commit and there are no old pixels to reproduce.

### 2.1-e ⚠ `presentationFor` returns `null` for these four — and now SAYS SO

**Grade: DELIBERATE. Latent in both brand repos today; it will bite the first
WPI project that authors one of the four.**

This is the hazard 1.3-b flagged, now live. `presentationFor` has no one-sided
form to hand back for a two-input node, so it returns `null` — and every caller
feeds `null` to `TransitionSeries.Transition`, where it means "no transition":
a **hard cut**. There is no type error; the signature never changed and `null`
was always legal.

**What core did about it:** `presentationFor` now emits a dev `warnOnce`
(`lib/render/warn-once.ts`) naming the kind and saying the boundary will render
as a hard cut. There is deliberately **no compatibility shim** faking a one-sided
form for a two-input node — a wrong picture rendered silently is worse than a
visible degradation.

**The verified call-site list.** Re-measured for this task; the count is 6 in PP
and **0 in roost** (roost's two `presentationFor` mentions are *comments* in
`projects/roost-reel-01/src/LayeredRoostReel.tsx`, plus a stale worktree copy of
the same file — not calls):

| # | file |
|---|---|
| 1 | `projects/pp-program-bydleni/src/WebProgramIntro.tsx` |
| 2 | `projects/pp-program-klima/src/WebProgramIntro.tsx` |
| 3 | `projects/pp-program-mobilita/src/WebProgramIntro.tsx` |
| 4 | `projects/pp-program-obvody/src/WebProgramIntro.tsx` |
| 5 | `projects/pp-program-verejny-prostor/src/WebProgramIntro.tsx` |
| 6 | **`templates/web-program-intro/src/WebProgramIntro.tsx`** — the template, so every future project inherits it |

**And the part nobody had measured: none of those six authors a transition at
all.** `grep -rn 'transitionOut:'` over each project's and the template's `src/`
returns **0** in all six — every WPI boundary is already a hard cut today. So
**no brand pixel changes**, and the degradation is latent rather than active.

```bash
# reproduce, per directory
grep -rn "transitionOut:" --include='*.ts' --include='*.tsx' <dir>/src | grep -v node_modules | wc -l
```

**What a WPI project should do about it — a Phase 4.5 decision, recorded here,
not applied.** `web-program-intro` does not use the layered schema at all, so it
cannot be fixed by migrating its config; migrating it is explicitly out of Phase
4's scope. The options, in the order they should be considered:

1. **Do nothing yet.** Correct today: nothing is affected, and the warning will
   fire the moment it stops being true. This is the recommendation.
2. **Move the WPI render path off `TransitionSeries`** onto core's
   `buildVideoNodes` / `AtCutTransition`, which drive two-input nodes natively.
   This is the real fix and it subsumes the whole layered migration question —
   it should be scoped with that migration, not before it.
3. **Keep `TransitionSeries` and restrict WPI's kind vocabulary** to the 16 kinds
   that still have a one-sided form, enforced in the project's own schema so the
   restriction is a compile/parse error rather than a silent hard cut.

What is NOT an option: a shim that hands `TransitionSeries` a fabricated
one-sided form. `TransitionSeries` gives a presentation one clip at a time; the
missing input cannot be invented, and any shim would render a confidently wrong
picture.

### 2.1-f `TransitionGallery` dropped its `pixelate` and `checkerboard` entries

**Grade: DELIBERATE; core-internal, no brand action.**

`lib/transitions/TransitionGallery.tsx` is a `TransitionSeries` showcase, so it
can only drive the one-sided contract and structurally cannot show a two-input
node. Its `pixelate()` and `checkerboard(...)` entries were removed rather than
faked. (`wipe()` is still there — that entry is
`@remotion/transitions`' own wipe, unrelated to the toolkit's.) These four kinds
are demonstrated instead by the pixel harness in `examples/layered-minimal`,
which renders them the way a reel actually does: 3 reel scenarios × 5 progress
points each, `npm run pixel-gate`.

A brand that imported `pixelate`, `checkerboard`, `wipe` or `scanlineGlitch`
from `@video-toolkit/lib/transitions` and fed the result to a `TransitionSeries`
of its own will now get a **type error** (the factories return `TransitionNode`,
not `TransitionPresentation`) — a compile-time failure, not a silent one.
Verified: **neither brand repo imports any of the four** outside its `toolkit/`
submodule.

---

## Task 2.2 — the exiting no-ops, and the reel's two edges

### 2.2-a The measured list is EIGHT, not the plan's seven

The plan carried a Phase-3 list of seven "no-op when exiting" kinds. Re-derived
against the current tree (post-1.3, post-2.1) by mounting every catalog kind's
node with `to = null` at progress 0 / 0.5 / 1 and comparing the rendered HTML,
the list is:

| kind | trailing edge (`to === null`) before 2.2 |
|---|---|
| `fade` | NO-OP |
| `dissolve` | NO-OP |
| `fade-coal` | NO-OP |
| `burn` | NO-OP |
| `clock-wipe` | NO-OP |
| `iris` | NO-OP |
| `gradient-wipe` | NO-OP |
| **`checkerboard`** | **NO-OP** — Task 2.1 made it draw no grid there, deliberately deferring the look decision to this task |

The other twelve kinds animate at the trailing edge and were never in the
family. The LEADING edge (`from === null`) was a no-op for **no** kind: the
entering branch always had its input.

The common cause is one line, not eight bugs: every one of these has an EXITING
branch that is the identity function, so with nothing to draw on the entering
side the whole boundary was inert.

### 2.2-b The model's answer: a missing neighbour IS the composition background

**Grade: deliberate look change** — but see 2.2-d, which measures it to be
**zero pixels in every existing brand project today**.

`TransitionNodeProps` gained `background: string`, threaded
`CompositionTheme.background` → `LayeredReelComposition` → `buildVideoNodes` →
`AtCutTransition` → the node. `edgeInput(input, background)`
(`lib/transitions/edge-plate.tsx`) turns a null input into a full-frame plate of
that colour. It is used in exactly two places: `fromRemotionPresentation` (which
covers all 16 lifted one-sided kinds) and `checkerboard`.

**The colour is never chosen by core.** A literal `#000` here would be the exact
brand-leak class this programme exists to remove; a caller with no background in
scope gets `'transparent'`, which paints nothing and reproduces the pre-2.2
pixel. Both ends are mutation-pinned (see the task report).

`lib/render/video-track-layout.ts`'s long-standing comment "that's the reel's
trailing edge fade" is true for the first time.

### 2.2-c Six kinds OUTSIDE the eight also change at a reel edge

**Grade: deliberate look change.**

The lifter is generic, so every kind it lifts now composites the plate. For the
eight above that is the fix; for six others it is a genuine (and, we judge,
correct) change, because their branches do something to the picture they are
handed rather than just moving it:

`glitch`, `rgb-split`, `light-leak`, `whip-pan`, `zoom-through`, `zoom-blur`.

`flip` is lifted too and came through **byte-identical** — pure geometry over a
uniform plate reveals the same uniform colour, so not one of its 15 cells was
rewritten. **`slide` did NOT**: 4 of its cells (`slide__enter__p0`,
`slide__exit__p025/p05/p075`) were rewritten with a **new hash but an identical
8×8 fingerprint** — the harness's own `NEAR` / "same picture, different bytes"
case, and `whip-pan__exit__p1` is a fifth. Their PICTURE is unchanged; their
BYTES are not, so the goldens had to move and the record must say so. (An
earlier draft of this entry claimed `slide` was byte-identical. It was derived
from one `pixel-gate` console run, which reports `PIXEL DRIFT` and `NEAR` under
separate labels; the committed golden diff is the authority.)

`wipe`, `pixelate` and `scanline-glitch` are native nodes that were not touched.

**Measured against the committed golden diff (the authority — a single console
run under-reports, see above): 80 of the 300 cells were rewritten, none of them
sharing a hash with its predecessor — 62 in `exit` mode, 18 in `enter` mode, and
ZERO in `cut` mode.** Of the 80, **5** are same-picture-different-bytes (the four
`slide` cells plus `whip-pan__exit__p1`) and **75** carry a changed picture. No
mid-reel boundary changes for any kind. That is the containment guarantee worth
remembering: this task can only affect the first and last transition of a reel.

Re-derive rather than trust. The range is pinned to the commit that moved the
pixels (`591f5c8` = Task 2.1's last, `5290bf1` = Task 2.2's fix), so a later
re-seed of the bimodal list does not silently change the answer:

```bash
python3 - <<'EOF'
import json, subprocess, collections
load = lambda ref: json.loads(subprocess.check_output(
    ['git', 'show', ref + ':examples/layered-minimal/goldens/transition-matrix.json']))['frames']
old, new = load('591f5c8'), load('5290bf1')
changed = [k for k in new if old.get(k) != new[k]]
print(len(changed), dict(collections.Counter(k.split('__')[1] for k in changed)))
# → 80 {'exit': 62, 'enter': 18}
EOF
```

`examples/layered-minimal`'s five `MinimalReel` reference hashes are all
**unchanged** (its only transition is mid-reel).

### 2.2-d Affected brand projects — measured, and it is currently NONE

Two independent reasons, both verified by command rather than inferred.

**1. Almost no authored transition sits at a reel edge.** Parsing every
`projects/*/src/Root.tsx` and `templates/*/src/Root.tsx` in both repos for
`transitionOut` on the LAST video item and `transitionIn` on the FIRST:

| repo / project | edge | kind | grade |
|---|---|---|---|
| PP `pp-namesti-republiky` | leading (`seg-001`) | `fade` | **parity-preserving** — no `fade__enter` harness cell moved |
| PP `pp-namesti-republiky` | trailing (`seg-008`) | `fade-coal` | **deliberate look change** — 4 harness cells moved. *Superseded: that kind was later removed from core; this literal is now a required rewrite, see § 2.3-a.* |
| everything else | — | — | no edge transition at all |

Every other authored `transitionOut` in either repo (`dissolve` ×4, `glitch`,
`fade`, `gradient-wipe`, `burn`, `cut` ×2) sits between two clips — a `cut`-mode
boundary, where nothing moved. roost's last item (`outro`) authors no
`transitionOut`, so roost has no trailing edge at all.

**2. No project threads `background` yet, so even that one project is
unchanged.** Every project in both repos calls `buildVideoNodes` DIRECTLY from
its vendored `LayeredCampaignReel.tsx` / `LayeredRoostReel.tsx` (11 PP + 1
roost, verified), and none passes `background` — so `background` is
`'transparent'` and the plate paints nothing.

```bash
# in each brand repo
grep -rn --include='*.tsx' 'buildVideoNodes(' . | grep -v node_modules | grep -vE '^(\./)?toolkit/'
```

Only the TEMPLATES (`templates/campaign-reels`, `templates/roost-reels`) go
through `LayeredReelComposition`, which does thread it — so a project vendored
*after* this lands, or one that takes the change via `/toolkit:sync-template`,
gets the trailing-edge fade automatically.

**What a brand does to opt in:** add one line to its `buildVideoNodes` call,
naming the same colour its root `AbsoluteFill` already uses (campaign-reels:
`#0a0a0a`):

```tsx
const videoNodes = buildVideoNodes(videoTrack, {
  width, height, fps,
  palette: theme.accentSlots,
  background: theme.background,   // ← the reel's edges resolve to this
  renderItem: …,
});
```

Recommended, and the reason it is not urgent: the only visible consequence today
would be `pp-namesti-republiky` gaining a real fade-to-coal at its end, which is
what its author wrote `transitionOut: { kind: 'fade-coal' }` on the last item
intending to get.

> **Updated (§ 2.3-a), twice now.** `fade-coal` is REMOVED from core; that
> project's literal must be rewritten to `{ kind: 'fade-to-color', color:
> '#0a0a0a' }` — a **literal**, since the `color` widening (§ 2.3-a), not an
> accent slot. Once it is, the dip happens on its own, background or no
> background, so that end-of-reel beat no longer waits on threading
> `background`. What `background` still buys that project is the colour the dip
> *resolves into* afterwards.

### 2.2-e `presentationFor`'s blast radius did NOT widen

**Grade: no action.**

Task 2.1's warning covers the four kinds that became native nodes. Task 2.2 adds
**none** — all seven lifted kinds are still one-sided `TransitionPresentation`s,
so `presentationFor` still returns them, and `NODE_KINDS` is still pinned to
exactly `checkerboard`, `pixelate`, `scanline-glitch`, `wipe`. Re-measured: PP
still has exactly 6 `presentationFor` call sites (the five
`projects/*/src/WebProgramIntro.tsx` plus `templates/web-program-intro/`), roost
0.

> **Still correct, after a detour.** `fade-coal` briefly became a fifth node when
> it was made to dip; it has since been removed from core altogether, so
> `NODE_KINDS` is back to exactly those **four**. `fade-to-color` is a node
> **only when its colour resolves** — conditional arity, pinned directly rather
> than listed. The count of `presentationFor` call sites (6 in PP, 0 in roost) is
> unchanged and still correct, and none of the six authors a transition.

The consequence that IS worth writing down: those six drive `TransitionSeries`,
which has no concept of a reel edge and never passes a null input, so **they get
none of this**. A WPI reel cannot fade to background at its end until it moves
onto `buildVideoNodes` / `AtCutTransition` — the same Phase-4.5 decision 2.1-e
already recorded, now with one more reason on its side.

### 2.2-f `checkerboard`'s "no cells at a trailing edge" pin was REPLACED

**Grade: deliberate look change** (and see 2.2-d: nothing renders it today).

Task 2.1 answered "no incoming clip" with "draw no grid", and mutation-pinned
it. That pin is gone, replaced with `checkerboard never draws a cell with
nothing in it` — which is the property 2.1 actually cared about (the empty-cell
artefact) and is now structurally impossible, since no code path puts nothing
inside a cell. The grid is drawn at a trailing edge and its cells carry the
background plate.

---

## Task 2.3 — honest vocabulary, via parameters not renames

Core gained ONE kind, `fade-to-color`, and **REMOVED** the kind it replaced —
`fade-coal`, one brand's colour word frozen into core's public vocabulary. Core
now ships the mechanism; the brand supplies the colour. `fade`, `dissolve` and
every other kind are untouched.

### 2.3-a `fade-coal` is REMOVED FROM CORE — BREAKING, and MUST BE APPLIED

**Grade: BREAKING for any unmigrated literal, and a DELIBERATE LOOK CHANGE for
PP once migrated** (its trailing fade begins actually dipping, which it never
did). *(History: Task 2.3 first shipped `fade-coal` as a parity-preserving alias
with no colour; a 2026-07-29 correction made the alias dip through a hardcoded
`#000000`; the user then removed the kind outright — core has no business
holding a brand's colour word **or** picking a "neutral" black on a brand's
behalf. Both earlier states are superseded by this one.)*

**`fade-coal` no longer exists in core.** It is gone from `TRANSITION_CATALOG`,
from the zod schema, from the renderer, and from the pixel harness (315 → 300
cells). There is **no alias and no deprecation shim**: a baked
`{ kind: 'fade-coal' }` literal now **fails to parse**, loudly, at
`CoreTransitionSchema`. That is the intended behaviour — a hard parse error is
strictly better than the silent degradation this phase exists to remove.

**Core names no colour at all now.** `lib/render/at-cut-transitions.tsx` contains
no colour constant of any kind; `fade-to-color` with no resolvable `color`
renders the plain crossfade. PP's `coal` is a token in *its* theme
(`projects/pp-cyklostezka-chrudimka/src/config/theme.ts:7`,
`projects/pp-namesti-republiky/src/config/theme.ts:7`), and PP is where it stays.

**Consequence, and it is real:** a dip cannot be expressed as a one-sided
presentation, so a `fade-to-color` **with a resolved colour** is a native
two-input node; with no colour it stays one-sided. `presentationFor()` returns
`null` for the node form and warns HARD CUT. See § 2.3-d.

#### The rewrite — PP's CURRENT state, verified read-only, not the state below

> **Superseded twice, and re-verified against PP's actual files (not assumed) for
> the `color` literal-widening.** The original two-edit shape below (rewrite
> `fade-coal` → `fade-to-color`, THEN declare a `coal` accent slot just to give
> the new `color` parameter something to resolve) **is already applied in PP**.
> Read read-only at `/Users/xaralis/Workspace/progpce/video-toolkit`:
>
> - `projects/pp-namesti-republiky/src/Root.tsx:154-158` is already
>   `transitionOut: { kind: 'fade-to-color', frames: 30, color: 'coal' }` — the
>   kind rewrite (Edit 1 below) is DONE.
> - `projects/pp-namesti-republiky/src/config/theme.ts:5` already declares
>   `{ key: 'coal', label: 'Coal', color: '#0a0a0a' }` in `accentSlots` — the
>   slot declaration (Edit 2 below) is DONE too.
>
> So the two-edit migration this section originally described is **not** the
> remaining work. What IS remaining, now that `color` accepts a literal
> (`AccentOrColorHex`, this task): write the hex directly and remove the
> `coal` accent slot the old shape required, since PP's `coal` is a
> **background colour in PP's own model, not an accent**, and declaring it as
> one only to satisfy core's field type was misrepresenting the brand's own
> palette to work around a core limitation. (It also turned out to be broken
> in a second, independent way — see the diagnosis at
> `.superpowers/sdd/2026-07-26-phase4-node-contract/fade-to-color-edge-fix-report.md`:
> PP's vendored `LayeredCampaignReel.tsx:407` calls `buildVideoNodes` without
> `palette` at all, so `color: 'coal'` **never actually resolves at render
> time today**, regardless of what `accentSlots` declares — this project's
> trailing edge is CURRENTLY a plain crossfade, not the dip its author
> intended, exactly the silent failure this whole document chain traces.)

**Edit 1 — the literal** (`projects/pp-namesti-republiky/src/Root.tsx:154-158`,
PP's current state, verified above):

```diff
                 transitionOut: {
                   kind: 'fade-to-color',
                   frames: 30,
-                  color: 'coal',
+                  color: '#0a0a0a',
                 },
```

**Edit 2 — remove the now-pointless accent slot**
(`projects/pp-namesti-republiky/src/config/theme.ts:5`). Verified this is the
slot's ONLY use anywhere in the project (`grep -rn "key: 'coal'"` and
`grep -rn "'coal'"` across `projects/pp-namesti-republiky/src/`, both
read-only): the one authored reference is exactly the `color: 'coal'` Edit 1
just replaced.

```diff
   accentSlots: [
     { key: 'lime', label: 'Lime', color: '#c6f432' },
     { key: 'teal', label: 'Teal', color: '#2ad4c5' },
-    { key: 'coal', label: 'Coal', color: '#0a0a0a' },
   ],
```

**Leave `colors.coal` alone** (`theme.ts:8`, in a SEPARATE `colors` map, not
`accentSlots`) — out of scope for this migration regardless of whether anything
currently reads it (checked: no direct `.coal` reference found elsewhere in
`projects/pp-namesti-republiky/src/`, but that map is PP's own general-purpose
token table and this migration's job is only the `accentSlots` entry it made
redundant, not an audit of `colors`). Only `accentSlots`' `coal` ENTRY — a
duplicate declared solely to give the pre-widening `color` field an accent key
to resolve — is what Edit 2 removes.

Both edits land in the same commit. The look change this produces: PP's
trailing edge starts ACTUALLY dipping through `#0a0a0a` for the first time —
today, with `buildVideoNodes` called without `palette`, it renders as a plain
crossfade regardless of the accent slot's presence (see the note above), so
this is not a regression risk from removing the slot; it is the fix finally
taking effect, using a code path (`resolveAccentOrColor`'s literal branch) that
needs no `palette` at all and so cannot be starved by that same omission.

**One more hit, and it is NOT an authored transition:**
`projects/pp-05-zastupitelsky-klub/src/config/types.ts:14` is a hand-written
`Transition` type union that shadows core's — `| { kind: 'fade-coal'; frames: number }`.
Nothing in that project authors the kind, so removing the union member is
housekeeping, not a migration; it can be done in the same pass or left. roost has
**zero** hits of any sort outside its own `toolkit/` submodule.

**Affected projects — verified, not assumed** (both repos read-only, at PP
`5a9cc1e` / roost `c498f8c`, exclusions anchored):

```bash
grep -rnE --include='*.ts' --include='*.tsx' "['\"](fade|dissolve|fade-coal)['\"]" . \
  | grep -v '/node_modules/' | grep -vE '^(\./)?toolkit/' | grep -v '\.claude/worktrees/'
```

| kind | PP | roost |
|---|---|---|
| `fade-coal` | **1 authored** — `projects/pp-namesti-republiky/src/Root.tsx:155` (the last item's `transitionOut`, i.e. the reel's trailing edge) — plus **1 type-union member**, `projects/pp-05-zastupitelsky-klub/src/config/types.ts:14`, which is not an authored transition | **0** |
| `fade` | **1 authored** — `projects/pp-namesti-republiky/src/Root.tsx:37` (the first item's `transitionIn`) | **1 authored** — `projects/roost-reel-01/src/Root.tsx:46` |
| `dissolve` | **5 authored** — `pp-program-mobilita-reel:207`, `pp-program-klima-reel:229`, `pp-ricni-sauna:40`, `pp-namesti-republiky:144`, `pp-mov-koalice:103` — plus the same type-union member at `pp-05-zastupitelsky-klub/src/config/types.ts:13` | **0** |

roost's other `'fade'` hits are unrelated: they are `style`/`hide` string unions
in its outro and text overlays (`LogoReveal.tsx`, `TextOverlay.tsx`, and their
`templates/roost-reels/` originals), not transition kinds. Checked by reading
them, because a bare `grep 'fade'` is exactly how a false claim gets written
down.

### 2.3-b `fade` → `dissolve` — PARITY-PRESERVING, a SAFE RENAME (not applied)

**Grade: parity-preserving.** `dissolve` is the canonical name for the A→B blend
— the standard NLE word, and what both kinds actually do. They are the same
renderer (`() => fade()`), so the two are **byte-identical**: a migrator should
know this is a rename, not a look change.

```diff
- transitionIn: { kind: 'fade', frames: 15 }
+ transitionIn: { kind: 'dissolve', frames: 15 }
```

Two authored literals in total (PP `pp-namesti-republiky/src/Root.tsx:37`, roost
`roost-reel-01/src/Root.tsx:46`), listed above.

**`fade` is NOT removed and NOT reinterpreted.** It keeps working and keeps
meaning crossfade. Reclaiming the name for the colour fade would silently change
real cuts in real projects, which is why the new kind ships under a name that
has never existed. Retiring `fade` is a **Phase 5** decision.

### 2.3-c `fade-coal` warns once in dev — WITHDRAWN

**Grade: n/a.** This entry described a `warnOnce` on a deprecated alias. There is
no alias: the kind was **removed** (§ 2.3-a), and the warning was removed with
it. The migration signal is now a **parse error** on the literal, which is
louder, earlier, and cannot be lost in render-farm output.

### 2.3-d `presentationFor`'s blast radius — UNCHANGED, at four

**Grade: latent, unchanged.**

- `NODE_KINDS` is exactly `checkerboard`, `pixelate`, `scanline-glitch`, `wipe` —
  the four Task 2.1 converted, pinned by test. `fade-coal` briefly made it five;
  its removal put it back to four.
- **`fade-to-color` has CONDITIONAL arity**, which is reviewed and accepted: with
  a resolved `color` it is a native two-input node (a dip has no one-sided form)
  and `presentationFor` returns `null` plus the Task 2.1 `warnOnce`; with no
  colour it is the same one-sided presentation `fade` returns. Both halves are
  pinned directly rather than by membership of a list.
- **Who this reaches today: nobody, measured.** The six `presentationFor` call
  sites are PP's `WebProgramIntro.tsx`, and none of the six authors any
  transition at all (measured in 2.1-e). PP's one migrating literal
  (`projects/pp-namesti-republiky/src/Root.tsx:155`) is in a **layered** reel,
  which drives `transitionNodeFor` / `buildVideoNodes`. A WPI reel that later
  authors `fade-to-color` **with** a colour gets a hard cut plus the warning.
- `fade` and `dissolve` still return a presentation, unchanged.

### 2.3-e Editor: a palette picker appeared, and one label went away

**Grade: editor-only.** `fade-to-color` appears in the Kind dropdown as
`Fade to colour`, with ONE control: an accent-slot picker filled from the brand's
own palette. That control comes from `ACCENT_FIELDS` — the field is named
`color`, exactly like `wipe.color`, and Task 1.6's mark is by NAME. The old
`Fade to black` entry is **gone** from the dropdown: the kind behind it no longer
exists, so `TRANSITION_KINDS` is 20 rather than 21.

> **Superseded by the `color` literal-widening.** `color` moved from
> `ACCENT_FIELDS` to a new, disjoint `ACCENT_OR_COLOR_FIELDS`, and its control
> from `type: 'accent'` to `type: 'accent-or-color'` — a dropdown over the
> brand's accent slots PLUS a "Custom colour" option that reveals a literal
> hex field. Unlike the pure `accent` control above, it is never omitted for
> lack of a palette: its literal half needs none, so with no `accentSlots` at
> all it degrades to a plain colour swatch+text control instead of
> disappearing. `wipe.color` widened identically, in the same commit — same
> field name, same schema type (`AccentOrColorHex`), same control.

## Task 2.4 — the orphan knobs (glitch, whip-pan, zoom-through)

### 2.4-a Six schema fields added — PARITY-PRESERVING, MEASURED

**Grade: parity-preserving.** `glitch.{intensity,slices,rgbShift,scanLines}`,
`whip-pan.blurAmount` and `zoom-through.zoomAmount` all existed only as their
presentation's own destructured defaults; no schema field could set them. All
six are new, OPTIONAL fields — no rename, no removal, no default changed. An
authored literal that omits them (every one found in both brand repos) forwards
`undefined` at the render map and the presentation's own default applies
unchanged; pinned by the pixel harness (315 accepted, 0 drifted) and by the
`MinimalReel` 5-frame hash table (unchanged).

**Verified per kind, both repos read-only** (PP at the pin used throughout this
document, roost likewise), anchored exclusion of the vendored `toolkit/`
submodule:

| kind | PP | roost |
|---|---|---|
| `glitch` | **1 authored** — `pp-mov-koalice/src/Root.tsx:77` (`{kind:'glitch', frames:18}` — no new field set); +1 type-union echo `pp-05-zastupitelsky-klub/src/config/types.ts:15` (not an authored value) | **0** |
| `whip-pan` | 0 (only the type-union echo above) | **0** |
| `zoom-through` | 0 (only the type-union echo above) | **0** |

**No action needed for `pp-mov-koalice`'s `glitch` literal.** It sets only
`kind`/`frames`, so it renders through the exact same code path as before —
verify by reading it (above), not by inference.

### 2.4-b No brand action required

Neither brand repo authors any of the six new fields (there is nothing to
migrate — the fields did not exist to author). A brand wanting one of the six
now can set it directly; that is the whole point of the task, and needs no
migration note of its own.

## Task 2.5 — one name per concept, one `wipe`

### 2.5-a `zoom-through.from` → `direction` — PARITY-PRESERVING, MEASURED

**Grade: parity-preserving.** `zoom-through` spelled the in/out axis `from`
while `zoom-blur` (and `rgb-split`, `light-leak`) spelled the same concept
`direction`. `direction` is now canonical on `zoom-through` too, bounded and
described exactly as `zoom-blur`'s is.

**`from` still works and still renders identically.** It is a DEPRECATED ALIAS,
not a removal: `lib/render/at-cut-transitions.tsx` reads
`t.direction ?? t.from`, so a baked literal keeps its authored value, and
`warnOnce` names it once per process in dev. Reinterpreting or dropping an
authored value silently is the one thing this workstream must never do — the
same rule that kept `fade` meaning crossfade in Task 2.3.

**Authored `from:` literals on `zoom-through`, both repos, read-only.** Exact
command, run in each repo, with the vendored submodule excluded ANCHORED (a bare
`toolkit/` pattern eats every path in a repo named `video-toolkit`):

```bash
grep -rn --include='*.ts' --include='*.tsx' --include='*.json' "zoom-through" . \
  | grep -v '/node_modules/' | grep -vE '^(\./)?toolkit/'
```

| repo | hits | what they are |
|---|---|---|
| PP | **1** | `projects/pp-05-zastupitelsky-klub/src/config/types.ts:17` — a **type-union member** in that project's own local types file (`{ kind: 'zoom-through'; frames: number; from: 'in' \| 'out' }`), not an authored transition. Same class as the `glitch` echo in 2.4. |
| roost | **0** | — |

So **zero reels are affected** and there is nothing to apply. A brand touching
that `types.ts` may widen it to `direction?: 'in' | 'out'; from?: 'in' | 'out'`
at leisure; leaving it is also correct, because `from` keeps working.

**Two consequences worth recording, neither a pixel change.**

1. **`direction` is OPTIONAL, where `from` was required.** A member cannot
   require the field its own deprecated alias stands in for. Unset means the
   presentation's own `'in'` — which is exactly what the old seed said out loud —
   and `defaultTransition('zoom-through')` is now `{kind, frames}` with neither
   field, matching `zoom-blur`. Pixels unchanged: 315 goldens accepted, 0
   drifted (`zoom-through`'s 15 cells among them).
2. **`zoom-through` joined `FramesOnlyTransition`** as a consequence of (1), so
   `deriveMontage`'s `outro.transition` will now accept it. That is a type-level
   widening, not a behaviour change, and it is the status `zoom-blur` has always
   had. The comment at `lib/reel-config-base/derive-montage.ts` was corrected
   rather than left stale.

The deprecated alias gets **no editor control** (`DEPRECATED_FIELDS` in
`lib/reel-config-base/transition-schema.ts`, consulted by `subOptionsFor` and
`defaultTransition`). Two controls for one concept would re-open the fork in the
UI, which is the thing being closed.

### 2.5-b One `wipe` — GALLERY-FACING ONLY, NO REEL PIXELS MOVE

**Grade: not a reel-facing change at all.** `lib/render/at-cut-transitions.tsx`
mapped `wipe` to the toolkit's own presentation (a two-input node since Task
2.1) while `lib/transitions/TransitionGallery.tsx` imported
`@remotion/transitions/wipe` and showed THAT under the same label. Only the
gallery changed: the render path is byte-identical, the 315-cell pixel harness
is unchanged, and the `MinimalReel` 5-frame hashes are unchanged (including
frame 90, which sits inside its `wipe` boundary).

**Core's `wipe` survived**, per the brief's default and confirmed against Task
2.1's report: 2.1 rewrote it as a native two-input node with sequential beats and
pinned it by mutation. Remotion's official wipe was **removed rather than
renamed** — it is not a catalog kind, so a gallery entry for it would demonstrate
a component no reel can author.

**What it took.** `TransitionSeries` hands a presentation one clip at a time and
structurally cannot drive a two-input node, so an import swap was not enough. The
gallery gained a second demo shape, `NodeTransitionDemo`, which drives the
boundary the way `lib/render/video-track.tsx` does (`AtCutTransition` inside its
own `Sequence`), and `galleryTransitionNode(kind)` resolves through the reel's
own `transitionNodeFor` + the kind's catalog defaults. The gallery's total
length per entry is unchanged, so `transitionGalleryConfig.durationInFrames` is
unchanged.

**No brand action.** Neither repo imports `TransitionGallery`, `transitionMap`
or `@remotion/transitions/wipe` outside its vendored `toolkit/` submodule
(verified with the anchored grep above, pattern
`TransitionGallery|transitionMap|transitions/wipe`: **0 hits in both**).

### 2.5-c The editor shows the alias' value and migrates on edit — PARITY-PRESERVING

Added in review round 1. Hiding `from` from `subOptionsFor` (2.5-a) would
otherwise leave a baked `{from:'out'}` literal rendering `'out'` while the
inspector's Direction control showed **unset** — the editor describing a reel
that does not exist, the same class as Task 1.2b's coerced brand kind and Task
1.4's dropped `alignment`.

`transitionFieldValue` / `withTransitionField`
(`lib/reel-config-base/transition-schema.ts`) give the inspector the renamed
field's **effective** value (canonical, else alias — the same precedence the
renderer applies) and, on commit, write the canonical name and **drop** the
alias.

**Nothing changes on disk until a user edits that control**, and when they do,
the only difference is the field's spelling: the rendered value is whatever the
control was showing. Nothing renders differently, and no brand config is
rewritten by opening a section. Zero brand literals carry `from` today (2.5-a),
so no brand file will move at all.

## Task 2.6 — the gallery's three tables became one, derived from the catalog

### 2.6-a One catalog-derived table — GALLERY-FACING ONLY, no reel pixels

`lib/transitions/TransitionGallery.tsx` hand-maintained **three** parallel
kind→presentation tables (`TRANSITIONS`, `transitionMap`, `TRANSITION_NOTES`)
keyed in three different spellings, plus a `noteFor` helper whose only job was
reconciling them. Together they covered **8 of the catalog's 21 kinds**, and only
one of those 8 (`wipe`, Task 2.5) actually claimed a catalog kind — the other
seven hand-picked a presentation under a camelCase label (`rgbSplit`,
`lightLeak`) no reel could author.

`buildGalleryEntries()` now walks `TRANSITION_CATALOG`, skips `cut` (the absence
of a transition — `resolveTransition` returns null for it by design) and
resolves everything else through the reel's own `transitionNodeFor`. Coverage:
**8 → 20**. `noteFor` is gone; notes are keyed by catalog kind and fall back to
the catalog's own label.

**The render path did not change at all.** Nothing in `lib/render`,
`lib/theming` or `lib/reel-config-base` was touched: 315/315 pixel-harness
goldens accepted, 0 drifted, and all five `MinimalReel` frame hashes match
CONSTRAINTS.md. **The gallery is not a reel — this task moves zero reel pixels.**

**What a viewer of `showcase/transitions` sees does change**, deliberately:

- **Twelve kinds appear that never had an entry** — `dissolve`, `fade-coal`,
  `fade-to-color`, `scanline-glitch`, `burn`, `whip-pan`, `zoom-through`,
  `clock-wipe`, `iris`, `gradient-wipe`, `pixelate`, `checkerboard`.
- **Entries are labelled by catalog kind** (`light-leak`, not `lightLeak()`), so
  the label is copy-pasteable into a reel config.
- **Demos show catalog DEFAULTS, not authored values.** The gallery used to call
  `glitch({intensity: 0.9})`, `rgbSplit({direction:'horizontal'})`,
  `zoomBlur({direction:'in'})`, `lightLeak({temperature:'warm'})` — settings no
  reel could express until Task 2.4 exposed them. It now shows what
  `{kind, frames}` alone renders, which is what a reel author gets by default.
- **One demo length for every kind** (45 frames). The old per-entry 40/45/60 was
  a fourth thing the parallel tables carried; a gallery is a comparison, and the
  same window for every kind is what makes two demos comparable.
  `transitionGalleryConfig.durationInFrames` moves from 1135 to 2760 as a
  result of the extra kinds and the uniform length.

**No brand action.** Re-verified with the anchored grep Task 2.5 used
(`grep -rn --include='*.ts*' --include='*.json' 'TransitionGallery|transitionMap|SingleTransitionPreview|TransitionName' . | grep -v '/node_modules/' | grep -vE '^(\./)?toolkit/'`):
**0 hits in both brand repos** outside their vendored `toolkit/`. The renamed
`transitionMap` keys (`lightLeak` → `light-leak`) and the changed
`SingleTransitionPreview` prop type therefore break no brand consumer.

## Task 2.7 — Grade and scanlines close two of core's own ceilings

### 2.7-a `Grade` gains `sepia` and `hueRotateDeg` — PARITY-PRESERVING, MEASURED

**Grade: parity-preserving.** `gradeFilter` (`lib/reel-config-base/grade.ts`)
emitted only `brightness`/`contrast`/`saturate`/`url(#wb)`; `sepia` (0..1) and
`hueRotateDeg` (−180..180) are new, OPTIONAL fields on `Grade`
(`lib/reel-config-base/base-types.ts`, `GradeSchema` in
`segment-base-schemas.ts`) — no rename, no removal, no default changed. Both
are neutral at 0, which is also the CSS no-op, so any `grade` object that
omits them (every one found in both brand repos) emits the exact pre-2.7
filter string. Order is part of the contract: `sepia`/`hue-rotate` slot after
`saturate` and before `url(#wb)`, which stays last. Pinned by the pixel
harness (315 accepted, 0 drifted) and the `MinimalReel` 5-frame hash table
(unchanged).

The same `Grade` shape backs the `grade` **effect**
(`lib/theming/effects/primitives.tsx`), so both surfaces gained the two
fields in one implementation — a brand authoring `{kind:'grade', sepia:
0.22}` on a segment's `item.grade` or as an effect registration gets the
identical string either way.

**Editor consequence (Studio sidebar, not a reel pixel):** `GradeSchema`'s
zod shape drives the inspector's per-clip grade controls, so two new sliders
(`Sepia`, `Hue rotate`) appear for every brand the next time it takes this
commit. No existing control moved or was relabelled.

**Verified per repo, read-only, anchored exclusion of the vendored
`toolkit/` submodule**
(`grep -rn --include='*.ts*' --include='*.json' -E 'sepia|hueRotateDeg' . | grep -v '/node_modules/' | grep -vE '^\./toolkit/'`):
**0 hits in both PP and roost.** PP's `pp-mov-koalice/src/Root.tsx` authors
several `grade:` literals (`brightness`/`contrast`/`saturation`/
`temperature`/`tint` only — the five pre-existing fields); none sets either
new field, so all of them render through the exact same code path as before.
Roost authors no `grade:`/`kind:'grade'` literal at all — its vintage look
(`templates/roost-reels/src/effects/VintageOverlay.tsx`) is a hand-rolled
component with its own hardcoded CSS `filter` string
(`FILM_FILTER = 'sepia(0.22) saturate(0.82) contrast(0.94) brightness(1.03)'`),
entirely outside core's `Grade`/`gradeFilter`. That string is the exact case
`docs/superpowers/phase4-extension-contract.md` discusses under the
promotion pathway (§"`sepia(0.22)` was cited as needing…"): now that core's
own `sepia` field exists, roost's grade *could* be re-expressed through it,
but Task 2.7 does not do that migration — see the extension contract for the
classification, not this document.

### 2.7-b `scanlines` gains `lineWidthPx` / `lineColor` — PARITY-PRESERVING, MEASURED

`scanlinesLayerStyle` (`lib/theming/effects/primitives.tsx`) hardcoded a 50%
duty cycle in opaque black (`half = spacing / 2`, `rgba(0,0,0,1)`/
`rgba(0,0,0,0)`). `lineWidthPx` and `lineColor` are new, optional keys on the
effect's passthrough bag; their defaults (`spacing / 2`, `rgba(0,0,0,1)`)
reproduce the pre-2.7 string byte-for-byte, and `lineWidthPx` is clamped into
`[0, spacing]` so an authored value can't emit out-of-order gradient stops.
The transparent stop stays the literal `rgba(0,0,0,0)` regardless of
`lineColor` (the two stops sit at the same position, so it's a hard cut, not
an interpolated region) — pinned by `lib/editor/src/effect-primitives.test.tsx`
and unmoved in the pixel harness / `MinimalReel` hashes.

**No brand action.** Same anchored-exclusion grep as above, for
`lineWidthPx|lineColor`: **0 hits in both repos.** Roost's `VintageOverlay`
scanlines band is, again, its own hardcoded `repeating-linear-gradient` —
outside core's `scanlines` effect entirely, so this field pair changes
nothing it reads.

### 2.7-c Pointer: the promotion classification

The only brand-facing consequence of Task 2.7 that is *not* "no action" —
roost's `sepia(0.22)` now being expressible in core's own vocabulary, and
what that does or doesn't do to its promotion eligibility — is analysed in
`docs/superpowers/phase4-extension-contract.md`, not repeated here.

## Task 3.2 — the STYLE axis, a derived reserved set, and the ken-burns adapter

### 3.2-a Duplicate `ken-burns` entries on the same item — CHECKED, ABSENT in both repos

The task brief names this as the check to re-run rather than trust: `findKenBurns`
(pre-3.2) took the FIRST matching, ENABLED entry; the new generic `applyStyleEffects`
pipeline was designed to match that exactly — the first ENABLED entry of a type wins, and
a later entry of that SAME type is then ignored regardless of its own `enabled` value
(fixed 2026-07-29, round 1: this is NOT "any first entry blocks a later one" — a DISABLED
first entry does not consume the slot, so a later enabled entry of the same type still
wins, exactly like `Array.find` skipping past it) — but only because no fixture in either
brand repo exercises two `ken-burns` entries on one item, so this was never forced to
matter in practice. Verified, not assumed:

```
grep -rn "ken-burns" projects/ templates/ --include="*.tsx" --include="*.ts" | grep -v "/toolkit/"
```

run in both `/Users/xaralis/Workspace/progpce/video-toolkit` (PP, `main` @ `0e2dfb9`) and
`/Users/xaralis/Workspace/roost/video-toolkit` (roost, `main` @ `ffca36d`), excluding each
repo's own vendored `toolkit/` submodule copy (which is core's own test/example fixtures,
not brand content) and, for roost, its `.claude/worktrees/` scratch copy.

**PP: 0 items with two `ken-burns` entries.** 22 hits total, but every `effects:` array
literal in `WebProgramIntro.tsx`-family files is `[{ type: 'ken-burns', ...seg.kenBurns }]`
— exactly one entry, constructed from a single `seg.kenBurns` field, so it cannot
duplicate. `LayeredCampaignReel.tsx`-family files only ever `.find()` a ken-burns entry
(read, not author). The three literal `type: 'ken-burns',` occurrences in
`pp-namesti-republiky/src/Root.tsx` (lines 57/86/123) and one in `pp-mov-koalice/src/Root.tsx`
were each inspected directly (not just counted): each is in a DIFFERENT segment
(`seg-002`, `seg-004`, `seg-006`, …), one `ken-burns` per segment. `seg-004`/`seg-006` each
pair their one `ken-burns` with one `blend` entry (the effect discussed in
`phase4-extension-contract.md`, not this task's concern) — still one `ken-burns` each, no
duplicate.

**roost: 0 items with two `ken-burns` entries.** 4 hits (2 in the vendored template, 2 in
the one real project `roost-reel-01`), inspected directly: `templates/roost-reels/src/Root.tsx`
lines 34 and 55 are `seg-001` and `seg-002` respectively — two DIFFERENT segments, each
pairing one `ken-burns` with one `vintage` entry. `roost-reel-01/src/Root.tsx` mirrors the
same shape.

**Conclusion: the duplicate-entry decision this task had to pin (see below) has NOT been
exercised by any real project in either brand repo as of this measurement.** It is
insurance for a config that does not exist today, not a fix for one that does. No brand
migration action follows from this finding.

### 3.2-b The pinned decision for a duplicate: first ENABLED entry per type wins

`applyStyleEffects` (`lib/theming/effects/style-effect.ts`) generalizes the pre-3.2
`findKenBurns` semantics (`Array.find(e => e.type === 'ken-burns' && isNodeEnabled(e))`) to
every style-axis type: iterating `item.effects[]` in order, a type already applied is
skipped on a later occurrence; a DISABLED entry does not count as "applied", so a later
enabled entry of the same type can still win. Silently applying every duplicate (doubling
the movement) was considered and rejected as almost certainly wrong, per the task brief.
No config in either brand repo is affected by this decision today (see 3.2-a) — this is
recorded so a future duplicate-authoring config gets the INTENDED behaviour, not a surprise.
No brand action required.

### 3.2-c The render path itself needed no brand action — but a LATENT trap does (corrected 2026-07-29, round 1)

This task rebuilt the crop/ken-burns/grade merge inside `SegmentMedia` and made the
reserved-effect-type set derived rather than listed. Both are internal to core's render
path — `segment-media-merge-baseline.test.tsx` (Task 3.1's baseline, 25 assertions across
the 18-cell matrix plus the dedicated objectPosition/transformOrigin pairing test) stays
green, UNMODIFIED, across the rewrite, and the `MinimalReel` 5-frame hash table and the
20-kind pixel-gate matrix are unchanged.

**The original version of this section stopped there and said "nothing to migrate." That
was wrong** — it checked only whether either brand registers on the new
`theme.styleEffects` axis (neither does; the axis did not exist before this task), and
missed that both brands ALREADY bypass the axis entirely for a different, pre-existing
reason: both replace core's per-kind video renderer with their OWN, and that renderer calls
`SegmentMedia` directly without forwarding `styleEffects` (or several of `SegmentMedia`'s
other narrowly-threaded props). Verified with an ANCHORED grep (call sites only, not every
`SegmentMedia` mention):

```
grep -rn "<SegmentMedia" /Users/xaralis/Workspace/progpce/video-toolkit/projects /Users/xaralis/Workspace/progpce/video-toolkit/templates /Users/xaralis/Workspace/progpce/video-toolkit/brand-lib
grep -rn "<SegmentMedia" /Users/xaralis/Workspace/roost/video-toolkit/projects /Users/xaralis/Workspace/roost/video-toolkit/templates
```

**CORRECTED (Task 3.3 review, round 1, IMPORTANT 4): the count below was 12, and that missed
two call sites.** The original command here scanned only `projects/` and `templates/`, which
is exactly the unanchored-grep failure this document has already been bitten by twice
(§ 1.2-c, § 2.3-a) — this time by OMISSION rather than an unintended match: `brand-lib/` is
neither `projects/` nor `templates/`, so it was never scanned, even though PP's own two
`FootageSegment.tsx`/`MultiClipSegment.tsx` files under `brand-lib/` are exactly the shared
renderers the surrounding paragraph is describing.

**PP: 14 call sites**, not 12: the 12 `PhotoSegment.tsx:39` sites below (one per project
(11) plus the template, ALL identical), PLUS `brand-lib/segments/FootageSegment.tsx:218`
and `brand-lib/segments/MultiClipSegment.tsx:54` — same shape
(`<SegmentMedia item={…} handles={…} />`), same gap. `src/segments/PhotoSegment.tsx:39` —
`<SegmentMedia item={mediaItem} handles={handles} />`. `PhotoSegment`'s own `Props`
(`{ segment, mediaItem, handles }`) is a brand-specific reconstruction, not
`VideoRenderProps` — so it never receives `styleEffects` (or `tokens`, or
`resolveMediaSource`) from `renderVideoItemNode` in the first place; there is nothing to
forward because the brand renderer's prop shape stops it upstream of this call. The
conclusion of this section (no brand action needed today) is UNCHANGED by the correction —
all 14 sites share the same shape and the same gap; only the count was wrong.

**roost: 2 call sites** (the template and its one real project), both
`src/segments/RoostSegment.tsx` — `<SegmentMedia item={item} handles={handles}
config={config} />` (project, line 97) / `<SegmentMedia item={resolved} handles={handles}
config={config} />` (template, line 109). Same shape, same gap.

**No regression exists TODAY.** `resolveStyleEffectRenderer` falls back to
`CORE_STYLE_EFFECT_RENDERERS` when its registry argument is `undefined` (see
`lib/theming/effects/style-effect.ts`), so `SegmentMedia` called with no `styleEffects` at
all still resolves core's own `ken-burns` correctly — every existing segment in every
project renders exactly as before. This is a LATENT trap, not a live bug: the moment either
brand registers `theme.styleEffects` (to ship its own ken-burns replacement, or another
style effect), that registration is a silent no-op on every segment that goes through
`PhotoSegment`/`RoostSegment` — it would only take effect on a hypothetical segment
rendered through core's OWN generic instead. This is the exact same shape as the
pre-existing `resolveMediaSource`/`resolveAudioSource` threading gap these same files
already have (see `lib/theming/types.ts`'s notes on which axes actually honour a wholesale
override) — not a new category of risk, but a new instance of a known one.

**Graded: PARITY-PRESERVING today; a migration item for WHENEVER either brand adopts the
style-effect axis**, not before. No code changes to either brand repo (both are read-only
for this task); the fix, when needed, is for `PhotoSegment.tsx` and `RoostSegment.tsx` to
accept and forward a `styleEffects` prop the same way they'd need to for `tokens` or
`resolveMediaSource` today.

## Task 3.3 — `scope: 'media'` via React context

### 3.3-a No brand action on the ORDINARY path — but a sub-item obligation exists (corrected, review round 1, IMPORTANT 3)

This task's whole design constraint (re-verified before writing any code, not assumed from
the brief) is that neither brand forwards extra props to `SegmentMedia`:

```
grep -rn "<SegmentMedia" /Users/xaralis/Workspace/progpce/video-toolkit/projects /Users/xaralis/Workspace/progpce/video-toolkit/templates /Users/xaralis/Workspace/progpce/video-toolkit/brand-lib
grep -rn "<SegmentMedia" /Users/xaralis/Workspace/roost/video-toolkit/projects /Users/xaralis/Workspace/roost/video-toolkit/templates
```

**PP: 12 `PhotoSegment.tsx:39` call sites** (11 projects + the template), all
`<SegmentMedia item={mediaItem} handles={handles} />`, plus two more of the same shape in
`brand-lib/segments/FootageSegment.tsx:218` and `brand-lib/segments/MultiClipSegment.tsx:54`
— 14 total, none forwarding anything beyond `item`/`handles`. **roost: 2 call sites**
(`RoostSegment.tsx:97` project, `:109` template), `{item, handles, config}` — same absence.

Because of that, `scope: 'media'` is delivered via `MediaEffectsContext`
(`lib/theming/effects/media-effects-context.tsx`), read by `SegmentMedia` through
`useContext`, not through a new field on `VideoRenderProps`. **This is precisely why no
brand file needs to change to benefit from — or be broken by — this task**: the context
value is supplied one level up, at `renderVideoItemNode` (which the brand's own renderer is
already rendered underneath), and read back down inside `SegmentMedia` regardless of what
props the brand's own call site passes. A brand that never authors a `scope: 'media'`
effect sees `useMediaEffects()` return `[]` (the context's own default) and nothing changes;
a brand that DOES register one gets it applied with no `PhotoSegment.tsx`/`RoostSegment.tsx`
edit required, unlike the `styleEffects` gap 3.2-c documents.

**Graded: PARITY-PRESERVING today** — this task changes core's render path only
(`SegmentMedia`, `GenericMultiClip`, `renderVideoItemNode`), all internal to `lib/`.  Default
`scope` (unset, i.e. `'clip'`) is unchanged for every existing effect and registration in
either brand repo, so nothing already rendering moves. No brand file changes today; no
action for either repo now, unless a brand chooses to author a NEW `scope: 'media'`
registration — see `phase4-extension-contract.md`'s resolved `blend` verdict for what that
registration would look like.

**The original version of this section said "no brand action of any kind" — that overstated
it (review round 1, IMPORTANT 3).** The boundary that resets media-effect delivery for
synthetic sub-items, `MediaEffectsBoundary`, is mounted only by CORE's `GenericMultiClip`
(`lib/theming/generic/GenericMultiClip.tsx`). A brand that hand-rolls its OWN multi-pane
renderer — calling `SegmentMedia` per synthetic sub-item itself, the way core's
`GenericMultiClip` does — does NOT get that reset for free, because it never goes through
core's component at all. **PP has exactly this shape today**:
`brand-lib/segments/MultiClipSegment.tsx:54` builds synthetic per-source `VideoItem`s and
calls `<SegmentMedia item={subItem} handles={{inHalf:0,outHalf:0}} />` directly, with no
`MediaEffectsBoundary` anywhere in the file (verified: `grep -n MediaEffectsBoundary
brand-lib/segments/MultiClipSegment.tsx` returns nothing). If PP ever registers a
`scope: 'media'` effect AND puts it on a `multi-clip` item, that effect would apply ONCE PER
PANE — the exact double-apply `MediaEffectsBoundary` exists to prevent — because nothing in
`MultiClipSegment.tsx` resets the context for its own sub-items.

**This is not a live bug and needs no PP change today**: PP registers no `scope: 'media'`
effect as of `main` @ `0e2dfb9`, so the failure mode above is not yet reachable. It is a
LATENT obligation, the same shape 3.2-c documents for `styleEffects` forwarding — except
here the obligation is "mount `MediaEffectsBoundary` around your own synthetic sub-items",
not "forward a prop", and it currently exists nowhere outside a code comment in core
(`GenericMultiClip.tsx`'s own comment on why it mounts the boundary). **Graded:
PARITY-PRESERVING for the ORDINARY (non-sub-item) path, unconditionally — the provider is
mounted by core, above the brand's own renderer, so nothing about that path needs a brand
change ever.** The sub-item path is a documented latent obligation for whenever PP (or any
brand with its own synthetic-sub-item renderer) adopts `scope: 'media'`: mount
`MediaEffectsBoundary` around each pane's `SegmentMedia` call the same way
`GenericMultiClip` does, at `MultiClipSegment.tsx:54`.

### 3.3-b The `blend` verdict — resolved, not promoted

`phase4-extension-contract.md` recorded PP's `blend` as **"PROMOTE, conditional on an effect
scope that participates in constructing the media element rather than wrapping it"**, naming
this task as the one to earn or deny the condition. **The condition is now MET**: a
`scope: 'media'` registration receives `EffectRenderProps.mediaStyle` — the exact merged
style (crop + style-effects/ken-burns + grade) `SegmentMedia` computed for its own element —
so a renderer CAN construct a second media element (`blend`'s `to: '…mp4'`) carrying the
identical treatment without recomputing it. See `phase4-extension-contract.md`'s "RESOLVED
2026-07-29, Task 3.3" note for the full argument and the code sample of what such a
registration looks like.

**This is a capability unlock, not a promotion.** `blend` itself is not moved into core here
— PP stays read-only for this task (per `CONSTRAINTS.md`), and promoting the kind is a
separate future change needing its own criterion-3 count (a second brand wanting a
gradient-mask cross-blend). No PP file changes as a result of this task; PP's own
`brand-lib/segments/FootageSegment.tsx:122-188` implementation is untouched and keeps
rendering exactly as it does today, `blend` read as an item-level effect by PP's OWN video
renderer, same as before this task.

## Task 4.1 — `anchoredOverlays` actually render

### 4.1-a `routing: 'anchored'` sweep — PP sets it, roost does not; PARITY-PRESERVING for both

Before this task, `anchoredOverlays` was routed and delivered onto `VideoRenderProps` but
consumed by ZERO core renderer — a write-only prop. Any brand setting `routing: 'anchored'`
on an overlay kind whose owning video item fell through to a CORE generic
(`SegmentMedia`/`GenericMultiClip`/`GenericCard`/`GenericOutro`) would have had that overlay
silently deleted, with no error and no type change.

Swept both repos (printed every hit, inspected each — not filtered to a subdirectory, which
is what undercounted a similar sweep before):
```
grep -rn "routing" /Users/xaralis/Workspace/progpce/video-toolkit 2>/dev/null | grep -v node_modules
grep -rn "routing" /Users/xaralis/Workspace/roost/video-toolkit --exclude-dir=toolkit --exclude-dir=node_modules 2>/dev/null
```

**PP DOES set it** — `templates/campaign-reels/src/config/composition-theme.tsx:77`,
`title: { routing: 'anchored' }`. **But PP was never actually hit by the bug**: campaign-reels
registers its own renderer for ALL SIX video kinds
(`composition-theme.tsx:165-172` — `clip`/`broll`/`multi-clip`/`photo`/`card`/`outro` all
resolve to `ClipItem`/`BrollItem`/`MultiClipItem`/`PhotoItem`/`CardItem`/`OutroItem`, never to
a core generic). Core's generics — the only place this task's fix landed — are never invoked
for PP's video track, so this task changes nothing observable for PP.

**CORRECTED (fix round 1) — only FOUR of those six renderers actually consume
`anchoredOverlays`, not all six as this section originally claimed.** Verified against
`templates/campaign-reels/src/config/video-item-renderers.tsx`: `ClipItem` (:126), `BrollItem`
(:160), `MultiClipItem` (:200), and `PhotoItem` (:233) each destructure `anchoredOverlays` and
call `pickTitleOverlay(anchoredOverlays)`, feeding a `titleOverlaySpec` into the reused
`FootageSegment`/`MultiClipSegment` bodies. `CardItem` (:257) destructures `{ item: raw }`
only; `OutroItem` (:270) is `() => <OutroSegment />` — **neither reads `anchoredOverlays` at
all**. This is currently unreachable rather than a live gap: `lib/reel-config-base/derive-layered.ts:227`'s
own comment says "card/outro carry none", and `buildOverlayItems` (called only for clip/photo's
`overlays[]` array and broll/multi-clip's single `overlay`, at derive-layered.ts:328/330) never
anchors an overlay to a card or outro segment — so PP's authoring format cannot currently
produce one that would expose the gap. So: **four of the six (clip/broll/multi-clip/photo)
consume it; card/outro consume none, currently unreachable because `buildOverlayItems` never
anchors to a card or outro item.**

**MINOR, also added in fix round 1** — this analysis covers the `campaign-reels` TEMPLATE
only. PP's 11 live campaign projects each vendor their own `src/LayeredCampaignReel.tsx`
calling `buildVideoNodes` directly with their own overlay assembly (e.g.
`projects/pp-ricni-sauna/src/LayeredCampaignReel.tsx:23`) — none render through
`LayeredReelComposition`, so `routeOverlays` (and this whole routing/delivery axis) never runs
for a live cut. Only the template a new project is scaffolded from goes through the core
composition. This strengthens the parity conclusion below, not weakens it.

**roost does NOT set it anywhere outside its own `toolkit/` submodule** (the only hits there
are core's own source + core's own test suite, vendored in).

**Grade: PARITY-PRESERVING for both repos, no brand file changes required.** This was close,
though: PP escaped the bug only because it happens to override every video kind. Any brand
that set `routing: 'anchored'` on a kind AND left even one video kind on a core generic would
have silently lost that overlay before this task landed. Worth remembering the NEXT time a
brand adds an item-level effect axis or routing-style hook: "delivered to a prop" is not
"rendered" until something is verified to read that prop through the REAL composition path,
not just through a brand's own hand-rolled renderer that happens to duplicate the reading.

## Task 4.2 — Overlay axis parity: `tokens` on `OverlayRenderProps`, per-kind `overlayConfig`

### 4.2-a Non-`text` overlay kind registered with a `config` — sweep, both repos; no live gap found

**Fix round 1 correction:** the sweep commands originally recorded here all ended in
`| grep -v toolkit/`, and both repo paths are themselves `…/video-toolkit/…` — so the filter
matched (and discarded) every single line, and the commands returned **0 hits by
construction**, not because there were none. This is the fifth false-negative-grep artefact
in this programme and the second in this document (Task 4.1's own fix round hit the same
thing). The conclusions below were correct — re-derived independently by the reviewer and
now re-run properly — but the ORIGINAL commands must not be trusted or reused. Re-run from
inside each repo with `git grep`, which excludes `node_modules` and the vendored `toolkit/`
submodule by what's tracked, not by a text filter that can eat its own targets:

```
cd /Users/xaralis/Workspace/progpce/video-toolkit && git grep -n "overlays:\|overlayItems:" -- '*.ts' '*.tsx'   # 49 hits
cd /Users/xaralis/Workspace/progpce/video-toolkit && git grep -n "quote-pull" -- '*.ts' '*.tsx'                  # 57 hits
cd /Users/xaralis/Workspace/roost/video-toolkit && git grep -n "overlays:\|overlayItems:" -- '*.ts' '*.tsx'      # 4 hits
cd /Users/xaralis/Workspace/roost/video-toolkit && git grep -n "quote-pull" -- '*.ts' '*.tsx'                    # 5 hits
```

Before this task, `TrackTextOverlay` (lib/render/layered-composition.tsx) always called
`overlayConfig(theme, 'text')` regardless of which kind ('text' or its legacy alias
'quote-pull') the item actually carried — so a kind other than the hardcoded literal could
never reach its own registered config through this path.

**Neither brand registers a non-`text` kind via the `overlays.<kind> = { renderer, config }`
shape** — the only shape this bug affects:

- **PP** registers `overlays: { text: { renderer: QuotePullAdapter } }` (no `config`) in every
  project's `src/config/brand-theme.tsx:20`, plus **six** `overlayItems` kinds on
  `templates/campaign-reels/src/config/composition-theme.tsx:77-161`: `title` (:77),
  `chevron` (:86), `'stat-callout'` (:105), `'source-tag'` (:121), `'update-badge'` (:135),
  `'party-logos'` (:148) — corrected from an earlier miscount of "four…all use `render`":
  `title` is `{ routing: 'anchored' }` alone, with **no** `render` and no `config`; the other
  five all use the item-level `render` escape hatch (`render: (item) => …`), which bypasses
  `OverlayRenderProps`/`config`/`tokens` entirely, so none of them was ever reachable through
  `overlayConfig` in the first place, buggy or not.
- **roost** registers exactly one entry, `overlays: { text: { renderer: Text, config: {
  strokeRatio: 0.2, lineStaggerSec: 0.35 } } }` (`templates/roost-reels/src/config/brand-theme.ts:12`).
  That IS the hardcoded-'text' kind itself, so it was reachable under the old code
  unconditionally — the bug never touched it.

**Neither brand registers `'quote-pull'` as its own key anywhere** (the 57/5 `quote-pull`
hits above are all comments, type-union members, and `case 'quote-pull':` branches in code
that never touches `overlays`/`overlayItems`). But registration is only half the risk — the
sharper question is whether any LIVE item actually CARRIES `kind: 'quote-pull'` through
`LayeredReelComposition`, since that is exactly the case the fix changes the resolved config
for. Checked directly:

- **roost**: every authored overlay item is `kind: 'text'`
  (`projects/roost-reel-01/src/Root.tsx:178`, `templates/roost-reels/src/Root.tsx:177`) — no
  `quote-pull` item exists anywhere. Moot in any case: roost's `LayeredRoostReel.tsx` renders
  its overlay track through core's `LayeredReelComposition` (`import { LayeredReelComposition
  } from '@video-toolkit/lib/render/layered-composition'`, `LayeredRoostReel.tsx:6,17`), so
  this IS the live path — and the only kind on it is `text`, unaffected by the fix.
- **PP**: `templates/campaign-reels/src/config/composition-theme.tsx:74`'s own comment
  confirms `'text'`/`'quote-pull'` deliberately have no `overlayItems` entry, and the
  template's `Root.tsx` never authors a `kind: 'quote-pull'` overlay item. PP's 11 LIVE
  projects go further out of reach: each vendors its own `src/LayeredCampaignReel.tsx` that
  calls `buildVideoNodes` directly (confirmed: `projects/pp-ricni-sauna/src/LayeredCampaignReel.tsx:23`
  imports `buildVideoNodes`, not `LayeredReelComposition`) and dispatches overlays itself via
  a hand-rolled `case 'quote-pull':` (`LayeredCampaignReel.tsx:326` in all 11) — so
  `TrackTextOverlay`/`overlayConfig` never runs for a live PP cut at all. Only the
  `campaign-reels` TEMPLATE (the scaffold a NEW project starts from) actually renders through
  `LayeredReelComposition`, and it authors no `quote-pull` item.

**Grade: PARITY-PRESERVING for both repos, no brand file changes required** — demonstrated,
not assumed: no live item of either brand carries the one kind (`quote-pull`) whose resolved
config the fix changes, so `overlayConfig(theme, 'text')` → `overlayConfig(theme, kind)`
changes nothing observable today. It is still a real fix: a brand that registers distinct
config for `'text'` and `'quote-pull'` in the future (a very natural thing to do, since both
are today advertised as independently registrable kinds) would otherwise have silently
gotten `'text'`'s config for its `'quote-pull'` items, with no error.

**Recorded, not to be fixed here (scope stays closed):** renderer RESOLUTION stays
hardcoded to `'text'` (`layered-composition.tsx:37`, `resolveOverlayRenderer(theme,
'text')`) while CONFIG became per-kind (`:47`, `overlayConfig(theme, kind)`) — deliberate,
since the `'quote-pull'`→`'text'` renderer alias is documented and pre-existing. The
asymmetry it leaves: a brand that registers `overlays: { 'quote-pull': { renderer: X,
config: Y } }` now gets `Y` delivered to **`'text'`'s** renderer (whatever that resolves to
— the brand's own `overlays.text.renderer`, or `GenericTextOverlay`), never to `X`, because
renderer resolution never looks at the `'quote-pull'` registration at all. Neither brand
does this today (confirmed above), so it is not a live gap — but it is a trap for whoever
registers `'quote-pull'` with its OWN renderer next, and is not this task's to close.

### 4.2-b Which of the four `TextTokens` values each brand overrides today, by writing its own renderer

Neither brand forks `GenericTextOverlay`'s source; both replace it wholesale with a custom
`renderer` registered on `overlays.text` (as documented in `lib/theming/types.ts`'s note that
`GenericTextOverlay` is exactly the copy-paste channel tokens exist to close). Read their
custom renderers directly:

- **PP** (`brand-lib/overlays/QuotePullOverlay.tsx:278-289`): `fontFamily: 'Geist, sans-serif'`,
  `fontWeight: 600`, `lineHeight: 1.35`, `color: LINEN` (a brand paper tone). All **four**
  `TextTokens` fields are overridden.
- **roost** (`templates/roost-reels/src/overlays/TextOverlay.tsx:56-61`):
  `fontFamily: theme.fonts.display`, `fontWeight: 800`, `lineHeight: 1.4`,
  `color: theme.colors.paper`. All **four** `TextTokens` fields are overridden.

So `TextTokens`'s four fields cover every hardcoded value either brand currently overrides —
but covering the four values is not the same as making either brand's custom renderer
unnecessary, and neither should attempt to fold into `GenericTextOverlay` on the strength of
this task alone. Both custom renderers do substantially more than recolour: PP's
`QuotePullOverlay` does per-character accent coloring with punctuation-gluing logic and a
per-character reveal animation; roost's `Text.tsx` adds a `WebkitTextStroke` outline (stroke
width derived from a `strokeRatio` config value) and its own line-stagger reveal. None of
that is in scope here — geometry/animation tokenization is Workstream 5's territory, not
this task's — so this section reports the finding without expanding `TextTokens` to cover it.

---

## Task 4.3 — captions get a mount

### 4.3-a Core now draws a `captions` overlay kind

**What changed in core.** `GenericCaptions` had ZERO mount sites and `ThemeTokens.caption`
was threaded nowhere (its own docblock said so). Core now resolves an overlay item whose
`content.kind === 'captions'` to a new core generic, `TrackCaptionsOverlay`
(`lib/render/layered-composition.tsx`), through the SAME `makeOverlayRenderer` dispatch every
other overlay kind uses — routed `'track'` by default, and honouring
`routing: 'anchored'` if a brand registers it. The mount reads `theme.tokens?.caption` off the
theme and rebases the item's composition-absolute caption times into the mount's own Sequence
domain (`rebaseCaptionTimes`, `lib/theming/generic/caption-lines.ts`).

**Grade: PARITY-PRESERVING for both repos, no brand file changes required — and NO
double-render.** The double-render hazard is the obvious risk of mounting something that
previously mounted nowhere (PP ships its own `brand-lib/overlays/CaptionStrip.tsx`), so it was
checked directly rather than reasoned about. Commands run **from inside each repo** with
`git grep`, so `node_modules` and the vendored `toolkit/` submodule are excluded by tracking,
and every hit was printed and inspected:

```bash
# PP @ 0e2dfb9 — /Users/xaralis/Workspace/progpce/video-toolkit
git grep -n "kind: *['\"]captions['\"]"            # NO hits (exit 1)
git grep -hoE "kind: ['\"][a-zA-Z-]+['\"]" -- '*.ts' '*.tsx' | sort | uniq -c | sort -rn
#   26 distinct kinds authored: clip 44, broll 35, text 24, title 22, watermark 12,
#   outro 12, disclaimer 12, claim-plate 12, chevron 12, dissolve 6, stat-callout 4,
#   update-badge 3, source-tag 3, party-logos 3, quote-pull 2, glitch 2, and 10 singletons.
#   `captions` is NOT among them.
git grep -n "<CaptionStrip"
#   brand-lib/segments/FootageSegment.tsx:241   (the one live mount)
#   .claude/superpowers/plans/2026-05-19-pp-campaign-reels.md:1900   (prose)
#   brands/progresivni-pardubice/BRAND-RULES.md:187                  (prose)

# roost @ ffca36d — /Users/xaralis/Workspace/roost/video-toolkit
git grep -n "kind: *['\"]captions['\"]"      # 0 hits (exit 1)
git grep -n "caption"                        # UNFILTERED: 4 hits in 3 files, ALL inert:
#   brands/roost/brand.json:43   "Coda Caption" — a FONT NAME
#   brands/roost/brand.json:51   a dead `reels.caption` block (see below)
#   projects/roost-reel-01/README.md:181  , templates/roost-reels/README.md:181  — prose
```

*(Fix round 1, MINOR: this block previously recorded "3 files total" against a `wc -l` that
counts HITS, and paired it with a `| grep -v '^toolkit/'` filter justified as making the
exclusion visible. Both were wrong. The unfiltered count is **4 hits across 3 files**
(`brand.json` carries two), and `toolkit` is a git **submodule** — `git ls-files -s toolkit`
shows mode `160000`, a gitlink — so `git grep` never descends into it and the filter removed
nothing. The filter is dropped rather than re-explained: with a submodule, `git grep` from
inside the repo already excludes the vendored toolkit by tracking, which is the whole
technique CONSTRAINTS.md prescribes.)*

**Why no brand renders two caption tracks today — and what would make one.** Core's new
generic fires for exactly one condition: an overlay item with `content.kind === 'captions'`.
**Neither brand authors that kind.** Verified independently twice, at PP `0e2dfb9`:

```bash
git grep -n "kind: *['\"]captions['\"]"          # 0 hits (exit 1)
git grep -n "'captions'\|\"captions\"" -- '*.ts' '*.tsx'   # 0 hits ANYWHERE (exit 1)
```

> **CORRECTED, fix round 1 — an earlier version of this paragraph claimed core's derivation
> "cannot produce" a `captions` overlay, and enumerated `derive-layered.ts`'s emitted overlay
> kinds as "`chevron`, `watermark`, `disclaimer`". Both were false.** `buildOverlayItems`
> (`lib/reel-config-base/derive-layered.ts:227-247`) passes the authored overlay `kind`
> **through verbatim** — the sole rewrite is `quote-pull → text` at `:239` — and
> `CutOverlaySpec.kind` is typed plain `string` at `:29`, not a closed enum. The enumeration
> was already refuted by the tree: the same pass-through emits PP's `title`, `stat-callout`,
> `source-tag`, `party-logos`, `claim-plate` and `update-badge`.
>
> **The true statement, which is the one to rely on:** `deriveLayered` emits a `captions`
> overlay item **iff a cut config authors one**; neither brand does (0 hits, commands above).
>
> **So the live failure scenario is a ONE-LINE authoring change, not a core or brand-lib
> edit.** A PP author adding `overlays: [{ kind: 'captions', appearAt, durationMs, … }]` to a
> cut config gets a derived `captions` overlay item, core's generic draws it, and
> `FootageSegment` goes on mounting `CaptionStrip` off `segment.caption`/`transcript` —
> which is independent of that overlay. **That is two caption tracks.** It is still not
> caused by this change (nothing renders differently until someone authors the kind), but
> "authoring it is a one-line change away" is a materially different warning from "derivation
> cannot produce it", and a brand adopting core's caption track must delete its own mount in
> the same commit — see the two-sided move below.
>
> This is the **third** false claim of one species in this file: an enumeration presented as
> exhaustive. Where this file names a set, prefer the rule that generates it (here: "kinds
> pass through verbatim") over a list of today's members.

PP's captions come from a structurally different mechanism — `segment.caption` / `transcript`
props read by `FootageSegment`, which mounts `CaptionStrip` **inside the video item's own
renderer** (`FootageSegment.tsx:241`). That path is untouched by this task, which is exactly
why it would coexist with a core caption track rather than replace it.

**The tokens are likewise inert today, and the reason is worth recording.** `theme.tokens?.caption`
is `undefined` for both brands: `git grep -n "tokens:" -- '*.ts' '*.tsx'` in PP returns two
hits, both a local variable named `tokens` in accent parsing
(`brand-lib/overlays/QuotePullOverlay.tsx:90`, `projects/pp-05-zastupitelsky-klub/src/lib/accent-parser.ts:31`),
and in roost returns **zero** outside `toolkit/`. Neither brand declares a `tokens` block on
its `CompositionTheme` at all.

**Three dead caption-config blocks, unchanged by this task and still dead.** This confirms
the provenance note in `lib/theming/tokens.ts` with current counts:
- **15** `caption: {` blocks in PP `src/config/theme.ts` files (all at line 36 — 13 projects +
  `templates/campaign-reels` + `templates/web-program-intro`), which nothing imports.
- **1** `reels.caption` block in `brands/roost/brand.json:51` (mode/fontFamily/color/…),
  which no TS/TSX reads.
- The live PP look is still the module constants inside `CaptionStrip.tsx` (`FONT_SIZE 52`,
  `BOTTOM_PCT 0.2`, `TEXT_COLOR #c6f432`, …).

A brand that WANTS core's caption track migrates by (a) authoring `captions` overlay items with
composition-absolute times, (b) filling in `tokens.caption` from those dead blocks, and (c)
**deleting its own caption mount** — the same two-sided move §2 of the extension contract
describes for any promotion. Doing (a)+(b) without (c) is the double-render, and it is the
brand's own change that would cause it, in a repo this phase does not touch.

### 4.3-b The `CaptionLiftWindow` units correction — what a brand porting a mount must know

`CaptionLiftWindow` was documented as **composition-relative** and compared against a
Sequence-**local** `ms`. The doc was wrong (see 4.3 in the task report for why the code
reading is the only possible one under Remotion's per-Sequence frame rebase). The interface
moved to `lib/theming/generic/caption-lines.ts` with corrected units and is re-exported from
`GenericCaptions.tsx`, so **no import path breaks**.

PP is unaffected and its own doc was already right: `CaptionStrip.tsx:25` says
"ms, **segment-relative**", and `FootageSegment.tsx:208-212` builds its windows from
`{ appearAt, appearAt + durationMs }` on the segment's own overlays — segment-local on both
sides. **Grade: PARITY-PRESERVING, documentation-only for both repos.** The only party the
old wording could have misled is a brand porting to core's mount after this task, which is
why it is recorded here rather than only in the code.

---

## Task 5.1 — tokens cover proportion, not just paint

### 5.1-a Caption/card/multiclip geometry promoted to tokens — PARITY-PRESERVING

**What changed in core.** `GenericCaptions`' pop-focus pill padding and highlight halo used
to be flat px against a token-driven `fontSize` (`POP_PAD_X = 22`, `POP_PAD_Y = 10`,
`HIGHLIGHT_HALO_MAX_PX = 10` — all against a default `fontSize` of 52) — so a brand raising
`fontSize` got padding/halo proportionally smaller instead of scaling with it. These, plus
`GenericCaptions`' remaining pop-focus/highlight typography knobs, `GenericCard`'s pattern
radii/pitch/angle, and `GenericMultiClip`'s split ratio and quad grid template, are now
`CaptionTokens`/`CardTokens`/`MultiClipTokens` fields. Every new default reproduces the
pre-Task-5.1 rendered geometry exactly (verified: `pixel-gate:strict` 300/300 accepted,
`MinimalReel`'s 5 reference frames byte-identical, and the ratio-based defaults — e.g.
`popPadXEm = 22/52` — checked to multiply back out to the exact original px literal at
the default `fontSize`, not merely close).

**Grade: PARITY-PRESERVING for both repos, no brand file changes required.** Verified from
inside each repo with `git grep` (submodule excluded by tracking, not by a text filter),
every promoted field name searched, every hit printed and inspected:

```bash
# PP @ 0e2dfb9 — /Users/xaralis/Workspace/progpce/video-toolkit
git grep -nE 'popPadXEm|popPadYEm|popFontMultiplier|popTailMs|popLetterSpacing|popLineHeight|wordGap|highlightOpacityInactive|highlightScaleBump|highlightHaloMaxEm|highlightHaloAlpha|highlightLetterSpacing|highlightLineHeight|wordFadeMs|splitRatio|quadColumns|quadRows|radiusPx|pitchPx|angleDeg' -- .
echo "hit count: $(git grep -nE 'popPadXEm|popPadYEm|popFontMultiplier|popTailMs|popLetterSpacing|popLineHeight|wordGap|highlightOpacityInactive|highlightScaleBump|highlightHaloMaxEm|highlightHaloAlpha|highlightLetterSpacing|highlightLineHeight|wordFadeMs|splitRatio|quadColumns|quadRows|radiusPx|pitchPx|angleDeg' -- . | wc -l | tr -d ' ')"
# → no hits printed, hit count: 0

# roost @ ffca36d — /Users/xaralis/Workspace/roost/video-toolkit
git grep -nE 'popPadXEm|popPadYEm|popFontMultiplier|popTailMs|popLetterSpacing|popLineHeight|wordGap|highlightOpacityInactive|highlightScaleBump|highlightHaloMaxEm|highlightHaloAlpha|highlightLetterSpacing|highlightLineHeight|wordFadeMs|splitRatio|quadColumns|quadRows|radiusPx|pitchPx|angleDeg' -- .
echo "hit count: $(git grep -nE 'popPadXEm|popPadYEm|popFontMultiplier|popTailMs|popLetterSpacing|popLineHeight|wordGap|highlightOpacityInactive|highlightScaleBump|highlightHaloMaxEm|highlightHaloAlpha|highlightLetterSpacing|highlightLineHeight|wordFadeMs|splitRatio|quadColumns|quadRows|radiusPx|pitchPx|angleDeg' -- . | wc -l | tr -d ' ')"
# → no hits printed, hit count: 0
```

**Why this is inert for PP specifically, and the one thing worth flagging.** PP does not
consume core's `GenericCaptions` at all — its live captions come from a structurally
different, forked component, `brand-lib/overlays/CaptionStrip.tsx` (mounted by
`FootageSegment.tsx:241`, per Task 4.3's migration note). That fork **carries the identical
bug this task fixes**: `CaptionStrip.tsx` hardcodes `const FONT_SIZE = 52;` (line 14) and,
inside its own pop-focus branch, `const POP_PAD_X = 22;` / `const POP_PAD_Y = 10;` (lines
144-145) against that same fixed `FONT_SIZE` — plus `CAPTION_MODE: 'highlight' | 'pop-focus'
= 'pop-focus'` hardcoded at line 116, so its `highlight` branch is unreachable dead code in
that brand's shipping build, same as core's was before Task 4.3 gave `GenericCaptions` a
mount. **A brand wanting the scaling fix must adopt core's `captions` overlay kind (Task
4.3's two-sided move: author the kind, fill `tokens.caption`, delete `CaptionStrip.tsx`) —
promoting core's tokens alone changes nothing for PP's actual rendered video**, because
nothing in PP's tree reads them. This is the single most useful fact this entry can carry
forward: the bug this task fixes still ships live, in the fork, until that adoption happens.

roost has no caption mount at all (confirmed at Task 4.3: 4 hits, all inert — a font name,
a dead JSON block, and prose) and does not exercise `GenericCard`'s `pattern` field beyond
its own already-promoted card tokens, so it is unaffected in the same way, for the same
underlying reason (it does not set any of these fields, so it inherits whichever default
core ships).

### 5.1-b `highlight.wordGap` 0.45em → 0.4em — DELIBERATE LOOK CHANGE, unrendered by both brands today

Pre-Task-5.1, `GenericCaptions`' pop-focus mode used a `0.4em` inter-word margin and its
`highlight` mode used `0.45em` — two literals for the same "space between words" concept,
with no shared token. Task 5.1 reconciles them to one `CaptionTokens.wordGap` field,
defaulting to `0.4em` (pop-focus's value, on the grounds that pop-focus is the brand's
shipping live mode per `GenericCaptions`' own docblock). **This is a genuine pixel change
for `highlight` mode** (0.45em → 0.4em) should any brand render it.

**Grade: DELIBERATE LOOK CHANGE, but inert for both brands as things stand today.** Neither
repo sets `mode: 'highlight'` anywhere:

```bash
# PP @ 0e2dfb9
git grep -nE "mode:\s*['\"]highlight['\"]" -- .
echo "hit count: $(git grep -nE "mode:\s*['\"]highlight['\"]" -- . | wc -l | tr -d ' ')"
# → no hits printed, hit count: 0

# roost @ ffca36d
git grep -nE "mode:\s*['\"]highlight['\"]" -- .
echo "hit count: $(git grep -nE "mode:\s*['\"]highlight['\"]" -- . | wc -l | tr -d ' ')"
# → no hits printed, hit count: 0
```

PP's fork hardcodes `CAPTION_MODE = 'pop-focus'` (`CaptionStrip.tsx:116`), so its own
`highlight` branch is dead code regardless of this change. **The action item for any brand
adopting `highlight` mode after a future submodule bump: read `wordGap` off the brand's own
`tokens.caption` if the pre-Task-5.1 0.45em spacing matters to that brand's design, rather
than assuming the shared default matches what `highlight` used to render.**

### 5.1-c `CardTokens.stagger` — was already wired, prior to this task's own base

The brief for this task assumed `CardTokens.stagger` was "declared but never read" and asked
that it be wired or deleted. **That premise was stale by the time this task started**:
`git log -S"tokens.stagger" --oneline` finds `c8f32f4`, a commit well before this task's base
`d5582a8`, already reading `tokens.stagger` in `GenericCard.tsx` to drive the staggered
line-reveal `interpolate()` calls. No change was made to it in this task, and none was
needed — recorded here only so a future reader does not re-open a non-issue.
