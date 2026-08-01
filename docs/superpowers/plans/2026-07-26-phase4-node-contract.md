# Phase 4 — One node contract for effects and transitions

## Context

Phase 3 gave core five extension axes sharing one resolution rule
(`lib/theming/registry.ts:61` — `registry?.[kind]?.renderer ?? generics[kind]`). It landed
green, but the foundation is uneven in ways that produce exactly the "surprise moments"
this phase exists to remove.

**The two axes are opposites.** Effects are an *open runtime registry*: brand-extensible,
shared resolver, `config` channel, declared `params`, core generics beneath, silent-skip on
unknown. Transitions are a *closed compile-time catalog*: **no theme surface at all**, a zod
discriminated union over a module-private `const CATALOG`
(`lib/reel-config-base/transition-schema.ts:118`), and an exhaustive
`Record<TransitionKind, Renderer>` table (`lib/render/at-cut-transitions.tsx:52`). A brand
cannot add a transition; it must edit three core files.

`fade-coal` is the proof of what that costs: one brand's colour word ("coal" was its
near-black) frozen permanently into core's public vocabulary because there was nowhere else
to put it. It is also one of **three kinds that render byte-identically** (`fade`,
`dissolve`, `fade-coal` are all `() => fade()`), and its label promises a dip to black that
never happens.

**Intended outcome:** effects and transitions become one node contract — the way every
professional NLE plugin API already models them — so that every kind behaves as its name
promises, a brand can add either without touching core, and the guarantees are enforced
mechanically rather than asserted in prose.

### Decisions taken (from the user)

0. **Both axes are core registries with a brand tier.** Neither may require a core edit to
   extend. **Promotion rule:** if a kind is generic enough it is promoted into core's
   generic set; otherwise it stays brand-only — permanently, and as a supported outcome.
1. **Transitions become an open registry.**
2. **Correctness-first, but generalize rather than patch.** A misleading name is usually a
   *missing parameter*: `fade-coal` is not a rename, it is a fade whose colour was never
   exposed.
3. **Enforcement: pixel-regression harness, conformance example, theme validation + dev
   warnings.** CI deliberately **not** selected — gates stay manual.
4. **Vocabulary:** `fade` + `dissolve` merge; `fade-coal` becomes a fade to a configurable
   colour.

---

## The NLE model, and the one thing core got structurally wrong

Every mature plugin API — OFX (Resolve, Nuke, Vegas), AVX (Avid), FxPlug (FCP/Motion) —
models effects and transitions as **one node type**, differentiated by *arity*, not by being
two separate systems:

| | Effect | Transition |
|---|---|---|
| Inputs | 1 (the clip) | **2** (outgoing A, incoming B) |
| Driving value | clip-local time | **progress 0..1 across the boundary** |
| Parameters | shared descriptor system | *the same* shared descriptor system |
| Placement | where in the clip's pipeline | where relative to the cut (**alignment**) |

Core today does something different, and it is the root cause of most of the defect list.

**Core's transitions are one-sided.** `AtCutTransition` (`at-cut-transitions.tsx:132-174`)
hands each presentation a `direction: 'entering' | 'exiting'` and asks it to draw *itself*,
then composites exiting-wraps-entering. That is Remotion's `TransitionSeries` shape, and it
produces, directly:

- **`wipe` is unfixable in its own terms.** Its two beats (sheet sweeps in over A, sheet
  sweeps out revealing B) are designed to be *sequential*, but the one-sided model runs both
  halves over the same window with entering on top. The pin says so
  (`at-cut-transitions.test.tsx:386`): "both halves run SIMULTANEOUSLY … at a cut and under
  TransitionSeries alike". No amount of patching `wipe.tsx` fixes a model problem.
- **Seven kinds "no-op when exiting"** — `fade`, `dissolve`, `fade-coal`, `burn`,
  `clock-wipe`, `iris`, `gradient-wipe`. That whole *category* is an artefact of asking a
  two-input operation to render itself one side at a time.
- **`checkerboard` draws empty cells on exit** (`checkerboard.tsx:226-238` gates cell
  content on `isEntering`) — the same artefact.
- **The "trailing edge fade" doesn't happen.** `video-track-layout.ts:31-33` gives the last
  item an `outRecord` and calls it the reel's trailing edge, but with no successor to
  *enter*, nothing draws.

**The fix is the NLE model: a transition is one node with two inputs and one progress
value.** It is not called twice with a direction; it is called once with `(from, to,
progress)` and returns one frame. Then `wipe` is trivially correct — show A, sweep the sheet
in, sweep it out, reveal B — the "exiting no-op" category ceases to exist, `checkerboard`
clips B into cells over A with one implementation, and the trailing edge is well-defined
because `to` is simply the composition background.

This is feasible here: at a boundary core *already* has both clips on screen as sibling
`Sequence`s with handle overlap (`video-track.tsx:38-57`). A two-input node takes over
compositing that overlap instead of stacking two one-sided wrappers.

**Remotion compatibility is preserved by an adapter, not by compromise.** The five official
`@remotion/transitions` presentations are one-sided; core ships
`fromRemotionPresentation(p)` that lifts one into the two-input form by rendering `from` and
`to` as layers and driving the presentation with progress. Those five keep working
unchanged; the four defective *custom* ones get rewritten two-input, which is precisely
where their bugs live.

---

## The contract

### One parameter descriptor, for both axes

Today there are two incompatible vocabularies: `ParamField` (`registry.ts:26-31` —
`number|string|boolean` + `options`) for effects, and `SubOption`
(`transition-schema.ts:397-402` — `enum|number|boolean|accent`) for transitions. Neither is
a superset, which is why `burn.mask` and `burn.glowColor` have **no editor control at all**.

One descriptor, typed the way an NLE parameter is:

```ts
export type ParamType = 'number' | 'string' | 'boolean' | 'enum' | 'color' | 'accent' | 'percent' | 'angle';

export interface ParamField {
  prop: string;
  label?: string;
  type?: ParamType;
  options?: readonly ParamChoice[];
  /** NLE parameter metadata — drives the control, not just the type. */
  min?: number; max?: number; step?: number;
  default?: unknown;
  /** Reserved: this parameter may vary over the node's span. See Animatable. */
  animatable?: boolean;
}
```

`percent` and `angle` are not pedantry — they are the two units this codebase keeps getting
wrong by storing as bare numbers (pattern angles, opacity, softness), and they let the
editor render a dial or a 0–100 field instead of a raw float.

### Values may be constant or time-varying — ship constants, reserve curves

Every NLE parameter is keyframable, and core already has **three hand-rolled two-keyframe
animations** pretending to be static params: `ken-burns`' `fromScale`/`toScale`,
`fromX`/`toX`, `fromY`/`toY`. That is a curve with the generality removed.

```ts
export type Keyframe<T> = { t: number; v: T; ease?: EaseName };   // t normalized 0..1 over the node's span
export type Animatable<T> = T | ReadonlyArray<Keyframe<T>>;

export function sampleAnimatable<T>(v: Animatable<T>, t: number): T;
```

**Ship the type and the sampler; expose only constants in the editor for now.** This costs
almost nothing today and is the difference between adding keyframes later and rewriting the
contract later. Any param declared `animatable` accepts either form; `sampleAnimatable`
short-circuits on the constant case so there is no cost when unused.

### The node registration

```ts
/** Shared by both axes. */
export interface NodeRegistration<P> {
  renderer?: React.FC<P>;
  label?: string;
  config?: unknown;
  params?: readonly ParamField[];
}

export interface EffectRegistration extends NodeRegistration<EffectRenderProps> {
  /** NLE pipeline position. 'media' = inside the clip's own compositing, on the
   *  media element; 'clip' = around the clip's whole output. Default 'clip'. */
  scope?: 'media' | 'clip';
  /** The style-fragment form: merges into the media element's own style rather
   *  than wrapping. Inherently media-scoped. Mutually exclusive with `renderer`. */
  style?: StyleEffectRenderer;
}

export type TransitionRegistration = NodeRegistration<TransitionRenderProps>;

export interface TransitionRenderProps {
  /** The outgoing clip (A). Null at the reel's leading edge. */
  from: React.ReactNode | null;
  /** The incoming clip (B). Null at the reel's trailing edge. */
  to: React.ReactNode | null;
  /** 0..1 across the boundary, clamped by core — presentations never clamp. */
  progress: number;
  params: Record<string, unknown>;
  config?: unknown;
  dims: { width: number; height: number; fps: number };
  palette: readonly AccentSlot[];
}
```

`from`/`to` being nullable is what makes the leading and trailing edges *fall out of the
model* instead of needing special cases: a trailing-edge transition is one with `to === null`,
and a `fade` against `null` is a fade to `theme.background` — which is exactly what the
"trailing edge fade" comment always claimed happened.

### Alignment — the NLE property core hardcoded

`computeVideoLayout` hardcodes `inHalf = floor(frames/2)`, `outHalf = ceil(frames/2)`
(`video-track-layout.ts:56-57`). That is **center-at-cut**, and it is the only alignment core
can express. Every NLE offers three:

```ts
alignment?: 'center' | 'start' | 'end';   // Premiere: Center / Start / End at Cut
```

- `center` (default, today's behaviour) — half before the cut, half after.
- `start` — the whole transition after the cut; the incoming clip carries it.
- `end` — the whole transition before the cut; the outgoing clip carries it.

This is a genuine flexibility gap with a real editorial use ("hold the outgoing clip, then
dissolve entirely inside the incoming one"), and it is a handful of lines in
`computeVideoLayout` once the field exists. Default `center` keeps every existing cut
byte-identical.

### Per-instance enable, and presets

```ts
effects: [{ type: 'grain', enabled?: boolean, ...params }]
```

An fx enable toggle is standard in every NLE and is how you A/B a look without destroying
authored params. `enabled: false` skips the node; absent means enabled, so every existing
literal is unchanged. Named presets fall out of `params.default` + `config` and need no new
concept.

### What the contract must let a brand do without touching core

| Capability | Mechanism |
|---|---|
| Add an effect | `theme.effects` registry |
| Add a transition | `theme.transitions` registry |
| Modify the media element vs wrap the clip | `scope: 'media' \| 'clip'`, or `style` |
| Non-center transition alignment | `alignment` on the item |
| A parameter that animates | `Animatable<T>` + `sampleAnimatable` |
| Disable a node without deleting it | `enabled` |
| Re-colour a core generic | tokens |
| Tune a core generic | registration `config` |
| Ship something exotic core can't express | stays brand-only, permanently supported |

---

## The promotion pathway

Every axis is two tiers: **core generics** beneath a **brand registry**, resolved by the one
rule. A kind moves in one direction only, on evidence.

**Promote when all three hold:**

1. **Brand-neutral by construction** — every colour, magnitude and asset arrives as a
   parameter or a token. The five-word brand-leak grep is necessary but **not** sufficient:
   a hardcoded `#0a0a0a` passes it and is still a leak.
2. **Expressible in core's vocabulary** — no dependency and no rendering model core lacks.
3. **Two brands want it**, or one plus an obvious second use. One brand's tuned number is a
   token default, not a core kind.

**Otherwise it stays brand-only, and that is a supported end state** — the registry exists
precisely so a brand can ship something exotic without pushing it into core's public
vocabulary. `fade-coal` is what happens when there is no such path.

Applying it to what exists today (Task 2.8 turns this into a verified classification):

| Kind | Verdict | Why |
|---|---|---|
| roost `vintage` (`film`) | **stays brand** | `HtmlInCanvas` + `@remotion/effects` `paper()`/`noise()` — a rasterising model core lacks; `sepia(0.22)` needs a non-diagonal WB matrix. Fails (2). |
| roost `vintage` (`vhs`) | **stays brand** | Needs `hue-rotate`, a 1-in-4 scanline duty cycle, a scrolled PNG grain tile, a moving tracking band. Fails (2); the grain tile fails (1). |
| PP `blend` | **promote** | A feathered gradient-mask cross-blend is generic; mask angle and softness are parameters. Passes all three once `scope: 'media'` exists. |
| `ken-burns` | already core | Becomes a *style* effect, not a reserved-name exception. |

Two arbitrary ceilings to remove so the bar is genericity rather than core's own limits:
`gradeFilter` emits only `brightness`/`contrast`/`saturate`/`url(#wb)` — `sepia` and
`hueRotateDeg` are purely additive; and `scanlines` hardcodes a 50% duty cycle and a black
line, so `lineWidthPx`/`lineColor` should be parameters. Neither makes `vintage` promotable
alone, but both stop core's gaps masquerading as design.

---

## Workstream 1 — The node contract

### Task 1.0 — Spike: open the transition schema without losing the typo guarantee

`TransitionSchema` buys a real guarantee — `layered-schema.ts:49-53` records that a typo'd
kind used to "parse cleanly and then degrade silently to a hard cut". Split rather than
weaken:

```ts
export const CoreTransitionSchema = z.discriminatedUnion('kind', CATALOG_MEMBERS); // unchanged
export const BrandTransitionSchema = z.object({ kind: z.string(), frames: TransitionFrames }).passthrough();
export const TransitionSchema = z.union([CoreTransitionSchema, BrandTransitionSchema]);
```

Core kinds keep full per-field validation; a brand kind validates shape-only, and the typo
guarantee moves to a **dev warning** at `getTransitionRecord`
(`lib/render/transition-record.ts`) — already "the last line before the renderer", already
sees every record. Strictly better than today, where an unrecognised kind silently returns
`null` (`at-cut-transitions.tsx:107`).

**Verify:** every baked literal in both brand repos still parses; a typo'd core kind still
fails; a brand kind reaches the renderer; `Transition` still discriminates for core kinds so
`PRESENTATIONS`' exhaustiveness survives. If that cannot hold, stop and report — the rest of
Workstream 1 depends on this shape.

### Task 1.1 — `ParamField` unification + `Animatable`

Merge `SubOption` into the descriptor above; `subOptionsFor` emits it; collapse
`LayeredInspector`'s two dispatches (`:268-325` and the declared-params path) into one. Add
`Animatable<T>`/`Keyframe<T>`/`sampleAnimatable` with constants-only editor exposure.
Adding `string` gives `burn.mask`/`burn.glowColor` controls for the first time.

### Task 1.2 — `BrandTheme.transitions` + shared resolution

Add the registry; replace the private `PRESENTATIONS` lookup with
`resolveRegistered(theme.transitions, kind, CORE_TRANSITIONS)`. Thread the theme into
`buildVideoNodes` — it already receives `palette` by that route (`video-track.tsx:29-36`).

### Task 1.3 — Two-input transition rendering

The core structural change. `AtCutTransition` becomes a boundary compositor that resolves
one node and calls it once with `(from, to, progress)`. Ship
`fromRemotionPresentation()` so the five official one-sided presentations lift unchanged.
Progress stays clamped in core — presentations never clamp, and several custom ones
(`whipPan`, `zoomThrough`) rely on that today (`at-cut-transitions.tsx:141-144`).

**This is behaviour-preserving for the 13 kinds that are already correct** and must be
proven so by the pixel harness before Workstream 2 changes any look.

### Task 1.4 — Alignment

Add `alignment?: 'center' | 'start' | 'end'` to the transition schema and honour it in
`computeVideoLayout`. Default `center` = today's `floor/ceil` split, byte-identical.

### Task 1.5 — `enabled`, `config`, and one `cut` constant

Per-node `enabled`; `transitionConfig(theme, kind)` via `registrationConfig`; route
`videoConfig` (`brand-theme.ts:85`) through the shared helper — it is the one accessor of
four that restates the rule. Collapse `cut`'s **five** independent special-cases
(`at-cut-transitions.tsx:55`, `transition-record.ts:14`/`:24`, `transition-schema.ts:380`/`:353`)
into one exported predicate.

### Task 1.6 — Replace the `AccentKey` WeakSet with a declarative mark

`markAsAccentKey` (`transition-schema.ts:44-89`) patches only `describe`; `innerType`
unwraps only `ZodOptional`/`ZodDefault`. Any of `.min()`, `.nullable()`, `.readonly()`,
`.catch()`, `.transform()` **silently drops the mark**, and the field then gets *no editor
control at all* — no compile error, no test failure. Replace with an explicit `ACCENT_FIELDS`
set beside `PROP_LABELS`. Pin with a test that chains `.min(1)` and asserts survival.

---

## Workstream 2 — Every kind behaves as its name promises

Correctness-first. Each task moves pixels and needs a still render plus a written grade in
`docs/superpowers/phase4-migrations.md`.

### Task 2.1 — The four defects dissolve into the two-input model

- **`wipe`** — rewrite two-input: A visible, sheet sweeps in, sweeps out, B revealed. The
  defect was the model, not the code. **`MinimalReel` uses `wipe` at its first cut**, so this
  re-baselines the render-parity reference.
- **`checkerboard`** — clip B into cells over A. One implementation, no direction branch.
- **`pixelate`** — the opaque root (`pixelate.tsx:112`) has no meaning with two inputs;
  A shows through beneath.
- **`scanline-glitch`** — never touched opacity and never destructured
  `presentationDirection` (`scanline-glitch.tsx:9-12`); two-input makes the blend explicit.

All four are pinned `it.fails` at `at-cut-transitions.test.tsx:293,320,374,392`; each flips
to a normal `it`. Note their assertions each assume **one** fix shape and the comments say a
different-but-correct fix leaves them red — expect to rewrite the assertions, not just
un-fail them.

### Task 2.2 — The seven exiting no-ops and the trailing edge

The category disappears with two inputs. The trailing edge becomes `to === null`, and
`fade`/`dissolve` against `null` resolve to `theme.background` — making
`video-track-layout.ts:31-33`'s "trailing edge fade" comment true for the first time.

### Task 2.3 — Honest vocabulary, via parameters not renames

| Today | Becomes | Why |
|---|---|---|
| `fade`, `dissolve` (identical) | **`dissolve`** — A→B blend | Standard NLE meaning; what they actually do |
| `fade-coal` | **fade to a configurable colour** | "Coal" was a missing parameter |

**Renaming must not silently reinterpret baked literals.** `{kind:'fade'}` means crossfade
today; reusing that name for the colour fade would change real cuts. Therefore: `dissolve`
is canonical for the blend and today's `fade` migrates to it by a graded item; the colour
fade ships as a name that has never existed (`fade-to-color`); `fade-coal` becomes its
deprecated alias with `color` defaulting to black so existing literals keep their pixels.
Reclaiming `fade` is a Phase 5 decision.

### Task 2.4 — Expose the orphan knobs

Six presentation props are unreachable from any config: `glitch`'s `intensity`, `slices`,
`rgbShift`, `scanLines` (its catalog entry is `{kind, frames}` only, yet
`TransitionGallery.tsx:127` calls `glitch({intensity: 0.9})`), `whip-pan.blurAmount`,
`zoom-through.zoomAmount`. Add schema fields. (`checkerboard.easing` stays excluded — a
function cannot be serialised; already documented.)

### Task 2.5 — One name per concept, one `wipe`

`zoom-through` uses `from: 'in'|'out'` while `zoom-blur` uses `direction: 'in'|'out'` for the
identical concept, forced through a `RENAMED` table (`at-cut-transitions.test.tsx:72`).
Unify on `direction`, keep `from` as a deprecated alias. And `at-cut-transitions.tsx:46-49`
maps `wipe` to core's custom presentation while `TransitionGallery.tsx:24` imports
Remotion's official one and shows *that* under the same label — two components, one name,
the exact "second answer to the same kind" the `clock-wipe` note
(`lib/transitions/index.ts:42-46`) says was deliberately eliminated.

### Task 2.6 — Collapse the gallery's parallel tables

`TransitionGallery.tsx` hand-maintains **three** kind→presentation tables (`TRANSITIONS`
:344, `transitionMap` :443, `TRANSITION_NOTES` :41) in camelCase spellings that disagree
with catalog kinds, plus a `noteFor` helper (`:58-61`) whose only job is to paper over the
mismatch. It covers 10 of 20 kinds and is in no gate. Drive it off `TRANSITION_CATALOG`, as
`TransitionMatrix.tsx:153` already does.

### Task 2.7 — Write the promotion pathway down, and apply it

The rule into `docs/superpowers/phase4-extension-contract.md`, including the mechanics:
promotion means core adds the kind to its generic set and the brand **deletes its
registration**, whereupon the core generic resolves beneath and the brand keeps only its
tuning via `config`/tokens. Then the verified classification of every effect and transition
either brand ships, with a verdict and reason per kind. Close the two ceilings while here:
`sepia`/`hueRotateDeg` on `Grade` (touches `GradeSchema`, since `item.grade` and the effect
share one implementation) and `lineWidthPx`/`lineColor` on `scanlines`.

---

## Workstream 3 — Effects: one contract, no exceptions

The effect axis has one insertion point and **three** things have needed a different one:
`ken-burns` (a `RESERVED_EFFECT_TYPES` name list), `grade` (two parallel implementations,
silent multiplication if both set), roost's `vintage` (brand reads `item.effects` by hand,
bypassing the axis).

### Task 3.1 — Merge baseline test, written first

Nothing pins the *merge* of crop + ken-burns + grade — only the inputs
(`ken-burns-parity.test.ts`). Render `SegmentMedia` over {no crop, crop} × {no kb,
direction-kb, from/to-kb} × {no grade, grade, grade+wb} and assert exact `transform` /
`objectPosition` / `transformOrigin` / `filter` strings plus `wbDef` presence and order.

**The `objectPosition`/`transformOrigin` pairing is the highest-probability silent
regression in this plan.** `SegmentMedia.tsx:67-70` moves them *together*: a fragment setting
`objectPosition` also replaces `transformOrigin`, discarding the crop's. A naive
per-property merge keeps the crop's origin under a from/to ken-burns, shifting the zoom pivot
on every cropped photo in PP.

### Task 3.2 — Style effects, derived reserved set

`MediaStyleFragment` is a **closed** bag with one composition rule per property — `transform`
concatenates after the crop's, `objectPosition`/`transformOrigin` move as a pair and
override, `filter` concatenates, `opacity` multiplies, `defs` mounts sibling SVG defs.
Deliberately not `CSSProperties`: an open bag lets two effects fight over `inset`/`position`
with no rule.

`RESERVED_EFFECT_TYPES` becomes **derived** — an entry consumed by the style path is skipped
by the wrapper path, computed as a pure function of `(theme, type)` so the two components
agree without communicating. This also *gains* a capability: a brand can register its own
`style` ken-burns, which today requires replacing a whole video renderer.

`kenBurnsStyle` stays **byte-for-byte untouched at its current signature** so
`ken-burns-parity.test.ts` stays green by construction; a thin adapter forwards to it. Grep
for duplicate `ken-burns` entries before landing — `findKenBurns` takes the *first*, the
generic pipeline would apply *every* (verified latent today; re-check).

### Task 3.3 — `scope: 'media'` via React context

**Not a prop.** Verified: neither brand forwards extra props to `SegmentMedia` (PP passes
`{item, handles}`, roost `{item, handles, config}`), so a new prop would be dropped on day
one — recreating the `anchoredOverlays` write-only bug. `SegmentMedia` is a component core
owns but which sits inside brand renderers core does not; different consumer position,
different delivery.

`MediaEffectsContext`, `MediaEffectsBoundary` (mounted by `GenericMultiClip` so a parent's
media effects don't leak onto synthetic sub-items), `useMediaEffects()` for a brand that
hand-rolls media. `EffectRenderProps` gains `mediaStyle` so a media-scope wrapper that must
line up with the media (PP's `blend` sweeps a second `<OffthreadVideo>` under the same
crop+ken-burns transform) mirrors it instead of recomputing and drifting. This dissolves PP's
migration hazard 2, regrading it from *deliberate look change* to *parity-preserving*.

### Task 3.4 — `grade` disambiguated

Keep `item.grade` — deprecating it means touching baked literals in 16 vendored projects,
`derive-layered.ts` × 3, two schemas and the inspector. Verified: **zero `type: 'grade'`
effect entries exist in any brand cut**, so there is no live double-application and this is
free of parity risk. Re-express `item.grade` as a synthetic style effect evaluated first,
preserving `SegmentMedia`'s final style-object literal verbatim. Make the inspector refuse
"+ Add effect → grade" on an item that already has `item.grade`, and grey the Color panel
when a grade effect is present — the editor owns both controls and is where the accident is
authored.

---

## Workstream 4 — Close the write-only props

### Task 4.1 — `anchoredOverlays` actually render

Routed (`overlay-routing.ts:18-22`), delivered (`layered-composition.tsx:88`), consumed by
**zero** production code. Against a stock core theme, `routing: 'anchored'` **deletes the
overlay** — no error, no warning, no type change.

Thread `renderAnchoredOverlay: (item: OverlayItem) => React.ReactNode` on
`VideoRenderProps`, built from a `makeOverlayRenderer(theme)` extracted from
`layered-composition.tsx:140-146` so track and anchored can never disagree. All four core
generics call it; `SegmentMedia` wraps in an `AbsoluteFill` **only when the list is
non-empty** so the zero case returns an identical tree.

Timing rebase into a pure `lib/render/overlay-anchor.ts`:

```
from             = round(o.startMs/1000*fps) - round(item.startMs/1000*fps) + handles.inHalf
durationInFrames = round(o.endMs/1000*fps)   - round(o.startMs/1000*fps)
```

**Per-endpoint rounding**, not `round(o.startMs − item.startMs)` — only the former guarantees
the overlay lands on the same composition frame it would have on the track, i.e. that
changing `routing` never moves the picture. PP arrived at the ms-domain form independently
(`video-item-renderers.tsx:83`); core should not copy it.

### Task 4.2 — Overlay axis parity

`OverlayRenderProps` has no `tokens`, so `GenericTextOverlay` hardcodes `#ffffff`,
`sans-serif`, `700`, `1.3` (`:14-26`) and every brand replaces it wholesale — the exact
copy-paste channel tokens exist to close. Add `tokens` + a `TextTokens` block. Fix
`overlayConfig(theme, 'text')` (`layered-composition.tsx:39`), hardcoded to `'text'` so no
other kind's config is reachable.

### Task 4.3 — Captions get a mount

`GenericCaptions` is fully built and tested with **zero mount sites**;
`ThemeTokens.caption` is threaded nowhere. Its docblock names the blocker: routing captions
is "a real design decision (which tier owns them, how they interact with anchored
overlays)". Task 4.1 settles the anchored half. Fix the units bug while here:
`GenericCaptions.tsx:15-16` documents `CaptionLiftWindow` as composition-relative while
`:96-97` computes item-local ms.

---

## Workstream 5 — Tokens cover proportion, not just paint

Colour and font tokenization is complete. **Geometry is not**, with a sharp failure mode:
`POP_PAD_X = 22`/`POP_PAD_Y = 10` are absolute px against a token-driven `fontSize`
defaulting to 52, so a brand setting `fontSize: 96` gets padding proportionally less than
half what the design intends, uncorrectably.

Promote every geometry magnitude to a token — `GenericCard`'s pattern radii/pitches/angle
(`:37-72`, only `color`/`accentColor`/`opacity` exposed), `GenericCaptions`' nine module
constants and six inline literals, `GenericMultiClip`'s split ratio and quad template, and
`CardTokens.stagger` (declared but **never read**). Express proportional magnitudes
**relatively** (`em` or a ratio of the token they scale against) rather than as px that
silently decouple. `caption-lines.ts:48`'s `DEFAULT_CAPTION_WORD_FADE_MS` has no token field
while its four siblings do. Reconcile `0.4em` vs `0.45em` for the same inter-word gap.

---

## Workstream 6 — Make the guarantees mechanical

### Task 6.1 — Pixel-regression harness (build EARLY)

**Today zero tests assert pixels.** The discriminator that found `scanline-glitch` and
`wipe` — *"at progress 0 the composite must show the OUTGOING clip"* — exists only as a
human-inspected contact sheet. Nothing would catch a **new** kind reintroducing the bug
family.

Turn `examples/layered-minimal/scripts/render-transition-matrix.mjs` into an asserting gate:
golden hashes per kind × direction × progress, committed, compared, failing on drift, with
an explicit `--update-goldens` path so a re-baseline is always a reviewed edit. Renders are
byte-deterministic (proven Phase 2.5) with a known ~1-in-20 flake on video-heavy frames — use
the flat-colour probe content the matrix already uses and re-render once before failing.
Add the *semantic* assertions the contact sheet made by eye.

**Build this before Workstream 2**, not after. It is the only thing that makes
correctness-first changes verifiable rather than hopeful.

### Task 6.2 — Conformance example

`examples/layered-minimal` exercises **no** video registration, **no** effect registration,
**no** brand registration, no `overlayItems`, no anchored overlays, no media-source override,
no `params`. Build a fixture theme registering **every** axis with a deliberately non-core
look, plus a reel exercising each, so the contract is proven end-to-end. This becomes what a
new brand reads.

### Task 6.3 — Theme validation + dev warnings

Dev-only, never-throwing, one shared `warnOnce(key, message)` modelled on
`lib/project/zod-guard.ts` (warns, never throws, by design):

- a `renderer` on a non-core overlay kind (silently ignored today — register with `render`)
- anchored overlays delivered to a renderer that drew none
- a registration for a reserved effect type
- a `ParamField` with neither `options` nor `type` (writes a string into a numeric field)
- a transition kind in neither core's catalog nor `theme.transitions`
- `item.grade` and a `grade` effect on the same item
- media-scope effects present but unconsumed

### Task 6.4 — Gate documentation

Fold the pixel harness into the gate tables in `CLAUDE.md` and
`docs/superpowers/core-typecheck-gate.md`. Gates remain **manual** — record that as a
deliberate choice so its absence isn't read as an oversight.

---

## Verification

```bash
cd lib/editor && npx vitest run --no-file-parallelism   # 70 files / 905 baseline
cd lib/editor && npx tsc --noEmit                        # exactly 3; check exit code separately
cd examples/layered-minimal && npm run typecheck         # 0 + coverage guard
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'   # exactly 2
python3 -m pytest video_toolkit/tests/test_sync_template.py -v
```

`npx tsc --noEmit | grep -c 'error TS'` returns 0 when tsc **crashes** — check the exit code
separately. This has bitten twice.

**Render parity, per pixel-moving task:**

```bash
cd examples/layered-minimal
for f in 0 30 45 90 120; do npx remotion still src/index.ts MinimalReel "out/f$f.png" --frame=$f; done
shasum -a 256 out/f*.png
```

`MinimalReel` uses `wipe` at its first cut, but that cut is at 3000 ms — frames 80-100
of the boundary window — so of the five sampled frames only **frame 90** sits inside it.
Task 2.1 re-baselined frame 90 and **nothing else**; frame 45 is mid-clip and did not
move. Current values (measured 2026-07-28, each reproduced in three fresh processes):

| frame | sha256 |
|---|---|
| 0 | `1c7563d8f71cd8011c57bdca451ec4a4e3a7808608140bc989bf52142303c3d2` |
| 30 | `85a4d6a051394b7034eeec60f2d15a6a8a71fc5140e33f5064bfed2735d50b3c` |
| 45 | `7c1512ed39018f728a93b648d6ebbb18fda8d73eb8f12d8dc2a5bb74d70169ee` |
| 90 | `8909970fb4802bf9f7e24e2a6e4862735bffa7c64f5cd983a7ce4d58aaf9253d` (was `8904999e…`) |
| 120 | `a6b7a9175ebe3c0dbf97c002b1f74517bd669062a1926177037be909de624778` |

Every re-baseline is a reviewed edit with a still and a written grade.

**End-to-end:** render the conformance example and eyeball it; run the pixel harness and
confirm every kind × direction matches its golden.

**Mutation discipline:** for each capability a task claims to add, name the line that
implements it and mutate **that** line. Every one of the twelve Phase 3 tasks initially
tested what the change *preserved* rather than what it *added*.

---

## Sequencing

```
1.0 schema spike ─── gates Workstream 1
  └─ 1.1 params+Animatable → 1.2 registry → 1.3 TWO-INPUT → 1.4 alignment → 1.5 enabled/config/cut → 1.6 accent mark

3.1 merge baseline ── gates Workstream 3
  └─ 3.2 style effects → 3.3 media scope → 3.4 grade

6.1 pixel harness ── BEFORE Workstream 2
  └─ then 2.1 … 2.6 (every one pixel-moving) → 2.7 promotion pathway

4.1 anchored → 4.2 overlay parity → 4.3 captions
5.x tokens ── independent
6.2 conformance, 6.3 warnings ── after the axes settle
6.4 docs ── last
```

Behaviour-preserving: 1.0–1.6 (incl. 1.3 for the 13 already-correct kinds, proven by the
harness), 3.1–3.4, 4.1, 5.x, 6.x.
Pixel-moving, each needing a grade: **all of Workstream 2**, and 4.3 if captions gain a core
mount.

---

## Constraints and risks

- **Core-only.** Both brand repos stay untouched; migrations are *written* into
  `docs/superpowers/phase4-migrations.md`, graded. **roost is a moving target** — on
  `claude/exciting-hellman-35e25a` with concurrent work from another session, referencing
  core SHAs absent here. Write roost items against the documented baseline and say so.
- **Never edit a `defaultProps` literal in a project.** `examples/layered-minimal` is a core
  example and is fair game.
- **zod pinned to exactly `3.22.3`** (`docs/zod-version.md` — the mismatch fails silently).
- Commits: repo style, never `Co-Authored-By`, always `--no-gpg-sign`.
- **Highest risks, in order:** (1) **Task 1.3, the two-input rewrite** — it touches every
  kind at once, which is why the pixel harness must exist first and why the 13 correct kinds
  must be proven byte-identical before any look change lands; (2) opening the transition
  schema without losing the typo guarantee (Task 1.0 is a spike for exactly this); (3) the
  `objectPosition`/`transformOrigin` pairing in the style merge; (4) re-baselining
  `MinimalReel` when `wipe` is fixed, which changes the reference every later task compares
  against — land 2.1 early within Workstream 2 and re-pin once.
- **Deliberately out of scope:** CI (not selected); keyframe *editing* UI (the type and
  sampler ship, the editor exposes constants); dissolving `brand-lib/`; migrating
  `web-program-intro` (it does not use the layered schema at all and needs its own plan);
  applying any brand migration.
