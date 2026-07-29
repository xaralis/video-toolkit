# The promotion pathway — which tier a kind belongs in

**What this is.** `phase3-extension-contract.md` says how a brand *registers* over a core
generic. This file says which tier a kind should be in at all: the rule that decides
**core generic** vs. **brand registration**, the mechanics of moving between them, and the
verified classification of everything the two brand repos ship today.

Companion documents: `phase3-extension-contract.md` (how registration resolves),
`phase4-migrations.md` (what each brand repo would have to change).

Measured against the tree at Phase 4 Task 2.7. Every count in this file was re-derived by
running the command shown beside it; nothing here is carried forward from the plan.

---

## 1. Two tiers, one direction

Every axis is two tiers: **core generics** beneath a **brand registry**. A kind moves
**one direction only** — brand → core — and only on evidence. Nothing is ever demoted out
of core, because core's vocabulary is a published surface: a brand's baked `defaultProps`
literals name kinds by string, and removing one breaks reels that already render.

### Promote when all three hold

**1. Brand-neutral by construction.** Every colour, every magnitude and every asset arrives
as a parameter or a token — never as a constant in the renderer.

> **The five-word brand-leak grep is NECESSARY BUT NOT SUFFICIENT.** This is the most
> misunderstood part of the rule, so it gets the strongest wording available:
>
> ```bash
> grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
> ```
>
> A hardcoded `#0a0a0a` passes that grep and **is still a leak**. So does `sepia(0.22)`,
> `folds: 0, scale: 0.3, amount: 0.6`, a 512-px grain tile, and a `120`-px tracking band.
> The grep catches brand *words*. It cannot catch brand *numbers*, and a look is made of
> numbers. The grep is a tripwire for the careless case; criterion 1 is decided by reading
> the renderer and asking of every literal in it: *would a second brand want a different
> value here?* If yes, it is a parameter or the kind is not promotable.
>
> Two literals are exempt because they are not look choices: a value that is the **CSS/
> geometric no-op** (`sepia(0)`, `hue-rotate(0deg)`, a vignette radius of 50% — the
> inscribed circle), and a value **derived from another parameter** (`scanlines`'
> pre-2.7 line width was `spacing / 2`). Both are defensible as "neutral", and both are
> written down as such at the point of use.

**2. Expressible in core's vocabulary.** No dependency core lacks and no rendering model
core lacks. This is the criterion that fails hardest and most often, and it is also the
one most likely to be *core's fault rather than the kind's* — see §4.

**3. Two brands want it, or one plus an obvious second use.**

> **One brand's tuned number is a token default, not a core kind.** A brand that wants
> core's `grade` at `sepia: 0.22` does not get a `film-grade` kind; it gets `grade` with
> `sepia: 0.22` in its own `defaultProps`, or a `config` on its registration. A new kind is
> justified by a new *shape*, never by a new *value*.

### Otherwise it stays brand-only — and that is a SUPPORTED END STATE

Not a failure. Not a TODO. Not technical debt. **The registry exists precisely so a brand
can ship something exotic without pushing it into core's public vocabulary.** roost's
`vintage` is a good brand effect and should stay one; the fact that core cannot express it
is a fact about `vintage`, not a defect in either side.

`fade-coal` is what the absence of this path costs. One brand's colour word — "coal" — sat
frozen in core's transition catalog for a year, editable by every other brand's users, for
want of anywhere else to put a look of its own. **It has since been deleted from core**
(Phase 4): Task 2.3 shipped the generic replacement `fade-to-color`, whose colour is a
brand accent-slot key, and a follow-up removed the brand-named kind entirely — no alias, no
deprecation shim, and no colour constant of core's own.

The cost of that year is what this section is really about, and it is not zero: **one**
authored use exists in a PP reel (`projects/pp-namesti-republiky/src/Root.tsx:155`, plus a
type-union member at `pp-05-zastupitelsky-klub/src/config/types.ts:14` that is not an
authored transition), and that literal now **fails to parse** until it is rewritten — a
required, breaking migration for a name core should never have owned
(`phase4-migrations.md` § 2.3-a). *(This entry has been corrected twice: it first claimed
"two authored uses that must keep rendering" — the count was wrong; then that the kind
"cannot be deleted" — that was wrong too, it just is not free.)* That is the whole argument
for the two-tier model in one entry.

---

## 2. The mechanics of promotion

Promotion is not "core copies the brand's file". It is a two-sided move, and the second
side is the part that is not obvious:

1. **Core adds the kind to its generic set**, parameterised — every number the brand had
   as a literal becomes a field with a neutral default.
2. **The brand DELETES its registration.**

Step 2 is the whole point. Because `resolveRegistered` is
`registry?.[kind]?.renderer ?? generics[kind]` (`lib/theming/registry.ts:58`), a brand
registration that *survives* promotion keeps masking the new core generic — the brand would
carry two implementations of the same kind and render the old one. Deleting the
registration lets the core generic resolve beneath, and the brand keeps only its **tuning**:
its authored `defaultProps` values, or a `config` on a renderer-less registration.

That renderer-less registration is why the resolution rule was built the way it was. Rule 2
of the Phase 3 contract — *a registration with no `renderer` does NOT mask the generic* —
exists exactly so that "the brand keeps its config but gives up its renderer" is a
one-line diff rather than a rewrite.

**Worked example, live in the tree today.** roost does not register the `burn` transition.
It authors `{ kind: 'burn', frames }` and then supplies its own mask and glow at assembly
time:

```ts
// roost: templates/roost-reels/src/config/composition-theme.tsx:16-25
withTransitionOverrides(it.transitionOut, {
  mask: 'brand/burn-mask.png',
  glowColor: theme.colors.paper,
})
```

Core owns the kind; roost owns the two brand values. That is the post-promotion end state,
reached without a promotion because `burn` was parameterised correctly to begin with.

---

## 3. The verified classification

**Method.** Two things are distinct and were checked separately:

- **What a brand REGISTERS** — keys under `theme.effects` / `theme.transitions`.
- **What a brand AUTHORS** — `type:` / `kind:` strings in `defaultProps` literals.

```bash
# registrations (run in each brand repo; ./templates ./projects are named
# explicitly — a bare `grep -v toolkit/` eats every path in a repo NAMED
# video-toolkit, which has already produced one confident false claim here)
grep -rn "effects:\|transitions:" --include='*.ts' --include='*.tsx' \
  ./templates ./projects ./brands ./brand-lib | grep -v node_modules | grep -v '\.test\.'

# authored kinds / effect types
grep -rhoE "kind: ['\"][a-z-]+['\"]" --include='*.ts' --include='*.tsx' ./templates ./projects | sort -u
grep -rhoE "type: ['\"][a-z-]+['\"]" --include='*.ts' --include='*.tsx' ./templates ./projects | sort | uniq -c
```

**The headline measurement: NEITHER brand registers a single entry on the effect axis or the
transition axis today.** PP @ `5a9cc1e`, roost @ `c498f8c`. Every `effects:` hit above is an
`item.effects[]` array inside a `defaultProps` literal, not a `theme.effects` key. Both
brands register only on the **overlay** and **video** axes. `vintage` and `blend` are, in
the tree as it stands, effect *entries* consumed by each brand's own video renderer, which
reads them off the item before core's `applyEffects` ever sees them.

> **Read that as the UNAPPLIED-MIGRATION state, not as a fact about the kinds.**
> *(Corrected 2026-07-29; the first pass of this document drew the opposite inference.)*
> `phase3-migrations.md` **§2 requires PP to register `blend` as a brand effect** — it gives
> the `effects: { blend: { renderer: BlendEffect, params: […] } }` shape verbatim and tells
> PP to delete `extractEffects` — and **§4 rules that roost's `vintage` STAYS
> brand-registered**, with a params-only registration so the editor learns the kind.
> Phase 3.5 is unapplied, which is the entire reason nothing is registered. **Registering
> both is the intended end state**, and the measurement above is evidence of a pending
> migration, not evidence that these kinds do not belong in a registry.
>
> Every verdict in this section is therefore stated on its **merits** — what core's
> vocabulary and rendering model can express — and none of them turns on the absence of a
> registration. Re-checked one by one when this correction was written.

### Effects

Counts are `grep -rc "type: '<t>'"` per file, so they count **authored entries in
`defaultProps` literals**, and are reported separately from code that *constructs* an entry
at runtime. Conflating the two overstates demand, which is exactly the error criterion 3
exists to prevent.

| Kind | Brand | Authored uses | Verdict | Reason |
|---|---|---|---|---|
| `vintage` (`film`) | roost | **6**, all in `templates/roost-reels/src/Root.tsx`'s demo props — **0 in the one real project** (`roost-reel-01`) | **stays brand** | Fails (2). `HtmlInCanvas` + `@remotion/effects` `paper()`/`noise()` is a **rasterising** model core has no equivalent of. Fails (1) too: `folds: 0, scale: 0.3, amount: 0.6, colorFront: '#6b4f34', colorBack: '#f6efdd'` are five brand literals, and `#6b4f34` passes the brand-leak grep. |
| `vintage` (`vhs`) | roost | **0** | **stays brand** | Fails (3) on the strongest possible evidence — **zero authored uses anywhere**. `mode: 'vhs'` is implemented (`RoostSegment.tsx:57`, `VintageOverlay.tsx:41`) and never selected; all 6 entries are `mode: 'film'`. Also fails (1): the scrolled `brand/grain.png` tile is a brand **asset**, not a parameter. |
| `blend` | PP | **2**, both in `projects/pp-namesti-republiky/src/Root.tsx` | **CONDITIONAL — see below** | Generic in shape, but needs a rendering model core lacks *today*. |
| `ken-burns` | both | roost **4** (2 template + 2 project); PP **4** authored, plus **6** constructed in code by `WebProgramIntro.tsx:160` from a `seg.kenBurns` field | **already core, with a caveat** | Core implements it, but as a **reserved-name exception**, not as a normal effect. |

#### `blend` — conditional, and what the condition is

A feathered gradient-mask cross-blend **is** generic: mask angle, softness and the two
sweep endpoints are already parameters in PP's own implementation
(`brand-lib/segments/FootageSegment.tsx:122-188`), and the only constants are neutral
defaults (`startPct 30`, `endPct 65`, `softness 40`) plus a 4-entry angle lookup. It passes
(1). It plausibly passes (3) — a "before → after" reveal is an obvious second use for any
brand doing proposal/visualisation footage.

It fails **(2)**, and the reason is precise. `blend` needs a **second media source** —
`to: 'br_vizualizace_zelen_vic.mp4'` — constructed with the *same* trim / crop / grade /
ken-burns treatment as the first, and then masked. Core's effect contract cannot express
that: `EffectRenderProps` is `{ effect, index, item, handles, config, children }`
(`lib/theming/effects/index.ts:26-40`) and an effect is a **wrapper** — it decorates a media
node it is handed, and has no way to ask core to build a second one. Rendering a bare
`<OffthreadVideo>` itself would duplicate everything inside `SegmentMedia`.

> **Verdict: PROMOTE, conditional on an effect scope that participates in constructing the
> media element rather than wrapping it** — the `scope: 'media'` idea the plan named.
>
> **Owning task: Workstream 3 (3.2–3.4), none of which has landed.** Verified — MINOR fix,
> round 1: the command as first written here (`grep -rn "scope" …`, no trailing colon) also
> matches every prose use of the word "scope" and returns 26 hits, none of them a field; the
> command that actually demonstrates "no `scope:` field of any kind" is anchored on the colon:
> `grep -rn "scope:" lib/theming lib/reel-config-base lib/render` returns **0**. Re-evaluate
> `blend` when that lands; do not promote it before.

The plan recorded this as **promote**, on the premise that "Task 3.3 added it". It did not.
See §5.

> **STILL CONDITIONAL after Task 3.2 — this is Task 3.3's verdict to earn, not this one's.**
> Task 3.2 shipped a STYLE axis (`theme.styleEffects`, `MediaStyleFragment`,
> `StyleEffectRenderProps`), but that shape is `{ effect, index, item, frame, durationInFrames,
> focalX, focalY } => MediaStyleFragment` — a pure function returning a style FRAGMENT for the
> ONE media element SegmentMedia already owns. It still cannot ask core to construct a SECOND
> media element (`blend`'s `to: '…mp4'`), which is the exact blocker named above. Verified,
> anchored on the colon (an unanchored `grep -rn "scope"` over the same trees matches prose
> too and returns 26 hits — see the correction just above):
> `grep -rn "scope?:" lib/theming lib/reel-config-base lib/render` (2026-07-29, post-3.2,
> anchored on the `?` a REAL optional field carries — a bare `scope:` would also match this
> section's own prose, e.g. "`scope: 'media'`" in a comment, which is not a field) still
> returns **0** — no `scope` field of any kind.
>
> The seam Task 3.2 deliberately leaves open for 3.3: `StyleEffectRenderProps` carries `item`
> (the whole `VideoItem`, including its `crop`/`grade`/`focalX`/`focalY`) and returns a
> `MediaStyleFragment` rather than a `ReactNode` — so a future `scope: 'media'` axis has
> everything a second-media-element renderer would need to build the same crop/grade/ken-burns
> treatment as the first, without `blend` (or `scope: 'media'` generally) needing yet another
> new prop bag. Nothing in Task 3.2 promotes `blend`, registers it, or narrows this seam; that
> remains 3.3's job.

> **RESOLVED 2026-07-29, Task 3.3 — the condition IS now met.** `scope: 'media'`
> (`EffectRegistration.scope`, `lib/theming/effects/index.ts`) lets a registration route the
> SAME wrapper shape (`EffectRenderer`: `{ effect, index, item, handles, config, mediaStyle,
> children } => ReactNode`) to wrap the media element itself instead of the whole item
> renderer — delivered via `MediaEffectsContext` (`lib/theming/effects/media-effects-context.tsx`)
> to `SegmentMedia`, not a new prop (verified: neither brand repo forwards extra props to
> `SegmentMedia` — see the task report). The blocker named above was precise: "no way to ask
> core to build a second [media element]". A media-scope renderer now CAN — it receives
> `mediaStyle`, the exact merged style (crop + style-effects/ken-burns + grade)
> `SegmentMedia` computed for its OWN element, so a second `<OffthreadVideo>` built inside the
> effect renderer carries the identical treatment without recomputing it and risking drift.
> Nothing else about the wrapper contract changed — `item`/`handles`/`config` were already
> there — so `blend` needs no further core capability to be authored as a brand registration.
>
> **What a brand writes to register `blend` under this scope** (illustrative — this is what
> PP's `brand-lib/segments/FootageSegment.tsx:122-188` reduces to, not a promotion of it into
> core; PP itself stays read-only per the phase's scope rule):
>
> ```tsx
> const BlendEffect: EffectRenderer = ({ item, handles, config, mediaStyle, children }) => {
>   const cfg = config as { to: string; angle?: number; startPct?: number; endPct?: number; softness?: number };
>   const secondSrc = resolveMediaSource(cfg.to, item.kind as MediaRole); // core's rule, or the brand's own override
>   return (
>     <>
>       {children}
>       <OffthreadVideo
>         src={secondSrc.startsWith('http') ? secondSrc : staticFile(secondSrc)}
>         muted
>         // same trim math SegmentMedia uses for `item` itself — the effect has
>         // `item`/`handles`, everything that math needs.
>         startFrom={/* … */}
>         endAt={/* … */}
>         style={{ ...mediaStyle, maskImage: gradientMask(cfg) }} // mediaStyle: identical crop/grade/ken-burns
>       />
>     </>
>   );
> };
>
> const theme: CompositionTheme = {
>   // …
>   effects: {
>     blend: {
>       renderer: BlendEffect,
>       scope: 'media',
>       config: { to: 'br_vizualizace_zelen_vic.mp4', angle: 30, startPct: 30, endPct: 65, softness: 40 },
>     },
>   },
> };
> ```
>
> **What is still missing, precisely, so this is not overstated:** the mask math itself
> (`gradientMask(cfg)`, PP's own angle lookup + softness ramp) is brand code either way —
> core does not generalize a gradient-mask primitive, and nothing here asks it to. What
> changed is that the renderer now has a legal SEAM to build the second element at all,
> where before it had none. **Promoting `blend` into core** — moving this shape into
> `CORE_EFFECT_RENDERERS` and having PP delete its own registration (the two-sided promotion
> mechanics in §2) — is a SEPARATE future change: core-only still binds this phase, PP is
> read-only, and the promotion itself needs its own criterion-3 count (does a second brand
> want a gradient-mask cross-blend, not just PP). Re-verified command, anchored the same way as
> above: `grep -rn "scope?:" lib/theming lib/reel-config-base lib/render` now returns exactly
> **1** hit, `lib/theming/effects/index.ts` (`EffectRegistration.scope`) — no longer 0, which
> is the whole point; `BrandTheme.effects` in `lib/theming/types.ts` carries the field only
> through that same `EffectRegistration` type, not a second declaration of its own.

#### `ken-burns` — core, but not yet on the ordinary contract

`ken-burns` is in core (`lib/theming/effects/ken-burns.ts`) and is the *only* member of
`CORE_EFFECTS` in the editor catalog (`lib/editor/app/editor-meta.ts:75-81`). But it is
implemented as a **reserved-name exception**: `RESERVED_EFFECT_TYPES` is
`new Set(['ken-burns'])` (`lib/theming/effects/index.ts:66`), and `applyEffects` `continue`s
on it before resolution, because it composes into the media element's own
transform/objectPosition rather than wrapping it.

> **Verdict: already core. The reserved-name exception is CONDITIONAL on Workstream 3.**
> The plan says it "becomes a style effect (Task 3.2)". Task 3.2 has not landed;
> `RESERVED_EFFECT_TYPES` still exists and still has exactly one member. Until then,
> "core implements ken-burns" and "ken-burns is on the same contract as grain/grade" are
> two different statements and only the first is true.

Note the coupling this exception creates, already documented at the definition site: the
reserved `continue` runs *before* the `enabled` test, so each reserved path carries its own
enable check. A second reserved type would need one too.

> **RESOLVED 2026-07-29, Task 3.2.** `RESERVED_EFFECT_TYPES` (the hand-maintained `Set`) is
> gone. `isReservedEffectType(theme, type)` (`lib/theming/effects/style-effect.ts`) is now a
> pure function of `(theme, type)`: reserved exactly when `type` resolves on the new STYLE
> axis (`theme.styleEffects`, core's own generic being `ken-burns` via
> `CORE_STYLE_EFFECT_RENDERERS`). "Core implements ken-burns" and "ken-burns is on the same
> contract as grain/grade" are now the SAME statement: `ken-burns` is a normal registered
> style effect, resolved through `resolveRegistered` exactly like every other axis — the only
> thing distinguishing it is which registry it lives in (style vs. wrapper), not a name check.
> A brand can now register its OWN `styleEffects['ken-burns']` (or any other type name) to
> replace the movement without replacing SegmentMedia or the whole video renderer.
>
> The `enabled` coupling is **DISSOLVED**, not merely relocated: `applyStyleEffects`
> (`lib/theming/effects/style-effect.ts`) applies ONE generic `isNodeEnabled` test to every
> style-axis type in the loop that also resolves and merges it, rather than each reserved type
> needing its own bespoke finder (`findKenBurns` used to be that bespoke check; it still
> exists, unchanged, as a standalone utility, but SegmentMedia no longer calls it — the generic
> pipeline handles `enabled` for every style type uniformly). A second style-effect type gets
> `enabled: false` support for free, with no new file to touch.
>
> **IMPORTANT 3, corrected 2026-07-29, round 1 — "same contract as grain/grade" overstated
> the parity.** It is true on the RENDER contract (`resolveRegistered`, one resolution rule,
> no name check) — that part stands. It is **not yet true on the EDITOR contract**: `grain`
> and `grade` each get a catalog entry with declared `params` (`CORE_EFFECTS`,
> `lib/editor/app/editor-meta.ts`), so the inspector renders real controls for them. A style
> effect has **no editor surface at all** — `effectsFromTheme` (`editor-meta.ts:127`) iterates
> only `theme.effects`, `grep -rn styleEffects lib/editor/app/` returns zero hits, and any
> `params` a brand declares on a `StyleEffectRegistration` are dead: nothing ever calls
> `registrationParams` against the style registry. The precise, honest statement is
> **"renderable, not yet authorable or editable in the reel editor — owned by Task 4.4."**
>
> The one fact that makes this load-bearing rather than cosmetic: it **removes a workaround
> that used to exist**. Before Task 3.2, a brand wanting an editor entry for `ken-burns` (or
> a style-effect type it planned to add) could register it on `theme.effects` — inert at
> RENDER time (reserved, skipped by `applyEffects`) but visible at EDIT time, because
> `editorMetaFromTheme` read `theme.effects` regardless of reserved status *before* Task
> 3.2's derivation tightened that check. The derived reserved set now also governs
> `effectsFromTheme`'s own skip (`isReservedEffectType(theme, type)`, `editor-meta.ts`), so
> a `theme.effects` registration for a reserved type is now UNCONDITIONALLY invisible to the
> editor too — the workaround is gone, with nothing put in its place yet.
>
> **User ruling, 2026-07-29: DEFERRED and SCHEDULED, not a standing limitation.** Task 3.2
> does not build the editor surface. It is not left as an open-ended known gap either —
> it has a task number: **Task 4.4, Workstream 4 ("close the write-only props")**. A
> registered style effect that renders but cannot be authored or edited is a write-only
> prop, the same shape `anchoredOverlays` is in Task 4.1; it belongs in the same cleanup as
> that, alongside closing core's five generic WRAPPER effects' own missing `params` (the
> pre-existing gap this carries forward from Workstream 2 — there is no effect-axis
> equivalent of the transition differential pin yet, for either axis). Recorded here so the
> gap is TRACKED, not tolerated — the "same contract as grain/grade" line was, before this
> correction, quietly implying the editor half was already closed too.

### Transitions

Every transition kind either brand authors is **already a core kind**. There is nothing to
classify and nothing to promote.

| Brand | Authored kinds | All core? |
|---|---|---|
| PP | `cut`, `fade`, `fade-coal`, `dissolve`, `glitch`, `wipe`, `whip-pan`, `zoom-through` | 7/8 — `fade-coal` was **removed from core**; see § 2.3-a for its rewrite |
| roost | `cut`, `fade`, `burn`, `gradient-wipe` | yes (4/4) |

Core's catalog is **20** kinds (`TRANSITION_CATALOG`, derived from `CATALOG` in
`lib/reel-config-base/transition-schema.ts`; Task 2.3 added `fade-to-color`, and the
follow-up removal of `fade-coal` took one back off). The two brands author **10** distinct
kinds between them, of which 9 are core; so **11** core kinds are authored by neither — `fade-to-color`, `rgb-split`,
`scanline-glitch`, `light-leak`, `slide`, `flip`, `zoom-blur`, `clock-wipe`, `iris`,
`pixelate`, `checkerboard`. The catalog is wider than demand, which is the opposite of the pressure the promotion rule is
designed to relieve.

**The plan's hypothesis table implicitly frames both brands as pushing against core's
transition vocabulary, and the demand measurement does not support that**: 10 authored kinds
against a 21-kind catalog, all 10 already core. roost's `burn` is the *post-promotion*
pattern working exactly as designed.

That conclusion rests on the **authored** counts above, not on the fact that neither brand
registers a transition. *(Clarified 2026-07-29.)* The absence of transition registrations is
a separate observation, and unlike the effect axis it is **not** a pending migration:
`phase3-migrations.md` asks for exactly two registrations — PP's `blend` (§2) and roost's
`vintage` (§4) — and both are effects. It specifies no transition registration for either
brand.

### Registered but out of scope here

For completeness, since "what a brand registers" is the question people actually ask:
both brands register on the **overlay** axis (`overlays.text`) and the **video** axis
(PP: `clip`, `broll`, `multi-clip`, `photo`, `card`, `outro`; roost: `clip`, `photo`,
`broll`, `outro`). Those are renderer replacements for kinds core already has, not new
kinds, so the promotion rule does not apply to them.

---

## 4. Core's own limits are not design

The second criterion — *expressible in core's vocabulary* — is only an honest test if
core's vocabulary is honest. Where core simply hadn't got round to a generic CSS filter
function, a brand kind "failed criterion 2" for a reason that had nothing to do with the
kind. Task 2.7 closed two such ceilings:

| Ceiling | Was | Now | File |
|---|---|---|---|
| `Grade` emitted only `brightness`/`contrast`/`saturate`/`url(#wb)` | a sepia or hue-shifted look was not expressible | `sepia` (0..1) and `hueRotateDeg` (−180..180), both neutral at **0** | `lib/reel-config-base/grade.ts` |
| `scanlines` hardcoded a 50% duty cycle and an opaque black line | roost's 1-in-4 VHS scanline was not expressible | `lineWidthPx` (default `spacing / 2`) and `lineColor` (default `rgba(0,0,0,1)`) | `lib/theming/effects/primitives.tsx` |

**Neither makes `vintage` promotable.** `film` still needs `HtmlInCanvas`; `vhs` still
needs the grain-tile asset, the tracking band, and — even now — has zero authored uses.
What they do is stop core's gaps from *masquerading* as design: after 2.7, "core cannot do
sepia" is no longer available as a reason, so the remaining reasons are the real ones.

Both are strictly additive. Every field is optional, every default is the pre-2.7 value,
and the `url(#wb)` reference stays last in the filter chain.

**A known gap this exposes, not closed here.** Core's five generic effects — `grain`,
`scanlines`, `vignette`, `grade`, `transform` — declare **no** `params` anywhere;
`CORE_EFFECTS` lists only `ken-burns`. Their parameters (including the four added by 2.7)
are readable off the passthrough bag by the renderers and authorable in `defaultProps`, but
have **no editor control** on the effect-registry path and no schema-driven pin. That is the
same write-only-prop shape Workstream 4 owns for other axes.

---

## 5. Where the plan's hypothesis table was wrong

Recorded because the table predates four workstreams and is now the main way this rule gets
misapplied.

1. **The 3.x tasks are written in the past tense and none of them exist.** The plan says
   "Task 3.3 added it, so re-check whether that is now true", "Becomes a style effect
   (Task 3.2)", "Task 3.4 re-expressed `item.grade` as a synthetic style effect". Workstream
   3 is unstarted apart from **3.1**, which is test-only. Verified: `scope:` does not appear
   in `lib/theming`, `lib/reel-config-base` or `lib/render`; `RESERVED_EFFECT_TYPES` still
   has one member; `item.grade` and the `grade` effect still share the **one**
   implementation in `lib/reel-config-base/grade.ts` (`SegmentMedia.tsx:74` and
   `primitives.tsx:147` both call `gradeFilter`).
2. **`blend`'s "promote" verdict rested on that premise** and is downgraded to
   **conditional** above, with the condition and the owning workstream named. A verdict that
   will be wrong next week is worse than one that names its own dependency.
3. **Neither brand registers ANY effect or transition *yet*.** The measurement stands; the
   inference the first pass drew from it did not, and is corrected in §3. `vintage` and
   `blend` are effect *entries* read by brand *video* renderers **because Phase 3.5 is
   unapplied** — `phase3-migrations.md` §2 requires PP to register `blend`, and §4 rules
   that roost's `vintage` stays brand-registered. They are pending registrations, and this
   item is a note about migration state, not a refutation of the two-tier model. Nothing in
   the plan's hypothesis table is overturned by it; what does bear on that table is the
   authored-demand count in §3.
4. **`vintage (vhs)` has zero authored uses.** The plan rejected it on criterion (2). It
   fails (3) first, and (3) is the cheaper and more honest test.
5. **`sepia(0.22)` was cited as needing "a non-diagonal WB matrix".** It needs no matrix at
   all — CSS `filter: sepia()` is a native function, and it is now core's, at
   `grade.ts`'s `sepia !== 0` branch. The obstacle was core's filter chain, not colour maths.
