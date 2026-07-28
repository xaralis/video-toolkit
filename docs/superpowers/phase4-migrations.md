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

### 1.2-c `fade-coal` stays in core's catalog

**Grade: unchanged, but worth knowing.** `fade-coal` is one brand's colour word
frozen into core's public vocabulary — exactly what the axis exists to prevent.
It is NOT retired here: PP authors it (2 sites), and retiring it would be a
brand-visible rename. The axis is what makes a *future* look a brand's own; the
existing catalog is untouched.

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

### 1.3-b `presentationFor` is unchanged, and `WebProgramIntro` is safe

**Grade: parity-preserving. No action.**

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
| PP `pp-namesti-republiky` | trailing (`seg-008`) | `fade-coal` | **deliberate look change** — 4 harness cells moved |
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

### 2.2-e `presentationFor`'s blast radius did NOT widen

**Grade: no action.**

Task 2.1's warning covers the four kinds that became native nodes. Task 2.2 adds
**none** — all seven lifted kinds are still one-sided `TransitionPresentation`s,
so `presentationFor` still returns them, and `NODE_KINDS` is still pinned to
exactly `checkerboard`, `pixelate`, `scanline-glitch`, `wipe`. Re-measured: PP
still has exactly 6 `presentationFor` call sites (the five
`projects/*/src/WebProgramIntro.tsx` plus `templates/web-program-intro/`), roost
0.

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

Core gained ONE kind, `fade-to-color`, and deprecated one, `fade-coal`. **No
brand repo has to do anything**, and nothing changes on the submodule bump: the
whole point of the design is that every baked literal keeps its pixels. The
entries below are the migrations a brand *may* choose, each graded.

### 2.3-a `fade-coal` → `fade-to-color` — PARITY-PRESERVING, and MEASURED

**Grade: parity-preserving.** Verified with the pixel harness rather than
argued, because this is the claim most worth checking:

```bash
cd examples/layered-minimal && npm run pixel-gate     # against the UNCHANGED 300 goldens
# → 300 accepted, 0 same-picture-different-bytes, 0 drifted, 15 missing
#   (the 15 are the NEW fade-to-color cells; not one existing cell moved,
#    fade-coal's 15 included)
```

`fade-coal` is now implemented **as** `fade-to-color` with no colour, and
"no colour" resolves to the very same `fade()` presentation it always used —
not to a node imitating it. Core has no black to default to (it owns no colour
vocabulary), and defaulting to one WOULD have moved pixels: today's `fade-coal`
does not dip to anything, so a black dip is a look change, not parity. The
brief's "colour defaults to black, so existing literals keep their pixels
exactly" cannot be true of both halves at once; parity won, because
reinterpreting a baked literal is the risk this task exists to avoid.

Migrating a literal:

```diff
- transitionOut: { kind: 'fade-coal', frames: 30 }
+ transitionOut: { kind: 'fade-to-color', frames: 30 }                    // identical pixels
+ transitionOut: { kind: 'fade-to-color', frames: 30, color: 'coal' }     // the dip it was named for
```

The second form is a **deliberate look change** and needs a brand accent slot
called `coal` (or whatever the brand names it) in `theme.accentSlots` — which is
the entire point: the colour word belongs to the brand, not to core's public
vocabulary. An unresolvable key renders the plain crossfade; core never invents a
colour.

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

### 2.3-c `fade-coal` now warns once in dev

**Grade: no action; visible, not fatal.** Rendering is unchanged. A dev build
emits one `warnOnce` per process naming the kind, why it is deprecated (it never
dipped to black), and what to use instead. No schema rejection — a deprecation
that stops a render is a worse trade than the one it fixes.

### 2.3-d `presentationFor`'s blast radius — RE-GRADED, and it does NOT widen today

**Grade: latent, unchanged.** `fade-to-color` resolves to a **native two-input
node only when a colour actually resolves**; with no colour it is still a
one-sided presentation. So:

- `fade`, `dissolve` and `fade-coal` all still return a presentation from
  `presentationFor` — the six PP `WebProgramIntro.tsx` call sites are unaffected,
  and `NODE_KINDS` is still exactly `checkerboard`, `pixelate`,
  `scanline-glitch`, `wipe` (pinned by test);
- a WPI reel that authors `{kind:'fade-to-color', color:'…'}` **with** a colour
  WOULD get `null` — a silent hard cut — and the Task 2.1 `warnOnce` fires,
  naming the kind. None of the six authors any transition at all today
  (measured in 2.1-e), so this is latent.

### 2.3-e Editor: the "Fade to black" label changed, and a palette picker appeared

**Grade: editor-only.** `fade-coal`'s label is now
`Fade to black (deprecated — use Fade to colour)` — it stopped promising a black
it never delivered. `fade-to-color` appears in the Kind dropdown as
`Fade to colour`, with ONE control: an accent-slot picker filled from the brand's
own palette. That control comes from `ACCENT_FIELDS` — the field is named
`color`, exactly like `wipe.color`, and Task 1.6's mark is by NAME. `fade-coal`
deliberately gets no colour control of its own: it is the alias, and a knob there
would invite configuring a kind one should be migrating off.

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
