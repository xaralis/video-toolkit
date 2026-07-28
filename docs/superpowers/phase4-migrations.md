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
  restating the range.

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
