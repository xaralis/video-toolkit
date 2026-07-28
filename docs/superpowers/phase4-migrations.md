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

Grep over both repos' `templates/` and `projects/`: **zero** mentions of
`TransitionSchema` or `alignment`. The one brand-side `Transition` type
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

### 1.6 Accent/colour field marking — PARITY-PRESERVING (no action)

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
