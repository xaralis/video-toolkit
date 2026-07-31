# Phase 5 — Single-mount transitions, without reverting the NLE node model

**Status: DESIGN. Nothing implemented. Read-only investigation; no code changed.**

Base: `refactor/phase4-node-contract` @ `deb9efb`.

**Verdict: SOUND_WITH_CARVE_OUTS.**

---

## The one-line contract change

> A transition node stops returning **JSX that wraps its two inputs** and starts returning a
> **declarative two-sided composite plan** — per-side styles, media-free overlay layers, and an
> optional track-scoped post filter — which core applies to each clip's **single existing mount**.

Everything the NLE model bought stays: **one** registration, **arity two**, **one** clamped
progress, **one** parameter set, **one** implementation per kind, `to === null` at the trailing
edge. What changes is only the *medium* the node speaks in. The node still sees both sides and
still decides what happens to both of them, in one call, from one progress value. **This is not
the pre-1.3 one-sided `direction` model** — that model called a kind twice, independently, with
two unrelated progress sweeps and no knowledge of the other side. Section 4 walks the four
defects one at a time.

---

## Context — why this is on the table at all

Phase 4 Task 1.3 (`8ed0c13`) replaced core's one-sided transition rendering with the NLE model:
one node, two inputs, one progress. That was right, and the plan says why
(`docs/superpowers/plans/2026-07-26-phase4-node-contract.md:45-96`): `wipe` became expressible,
the "exiting no-op" *category* ceased to exist, `checkerboard` got one implementation instead of
two, and the reel's trailing edge fell out of the model as `to === null`.

It also introduced a **rendering** consequence that is not part of the model. Because a node
receives its inputs as `React.ReactNode` subtrees and decides where to draw them, the node must
own a mount of each input — so at a boundary an item's content exists **twice**: once under its
own `Sequence`, once inside the boundary's (`lib/render/video-track.tsx:390-398`,
`:422-428`). React reconciles by position, so crossing a boundary destroys and recreates the
footage `<video>`; in the Player that is a re-fetch, a re-seek, a background flash and a stall
(`.superpowers/sdd/2026-07-26-phase4-node-contract/editor-transition-regression.md`).

Tasks R1 and R2 mitigated it — `ItemBody` hides instead of unmounting, the boundary premounts,
the resolved node is memoised, and the outgoing clip's dead copy is released
(`lib/render/video-track.tsx:150-170`, `:199`, `:420`;
`lib/render/at-cut-transitions.tsx:494-572`). The user's assessment of the result: *"works
better now, still not ideal, but acceptable."* R2 then declared **three media elements the
floor**, structurally (`lib/render/video-track.tsx:53-59`).

`.superpowers/sdd/2026-07-26-phase4-node-contract/r2-wall-investigation.md` challenged that and
was right to: the floor is a property of *the contract's medium*, not of Remotion or React. Its
mechanism claims are re-verified here from Remotion's own source, and one of its counts is
wrong (§3, `rgb-split`).

What that investigation then proposed — dropping to Remotion's `TransitionSeries` arrangement —
the user read, correctly, as a revert:

> "This looks like a revert of something that was intentional. We need to make sure it is sound,
> won't break stuff and will allow for flexibility we're after. We still need an NLE best
> practice applied to Remotion world."

This document is the answer to that. It keeps the arity and takes the single mount.

---

## 1. What is verified, from source

Re-derived here rather than taken from the investigation, per the brief.

### 1.1 Remotion's own primitive mounts each clip exactly once, and lets two boundaries style it

`@remotion/transitions@4.0.498` (`lib/editor/node_modules/@remotion/transitions/package.json`
`"version": "4.0.498"`).

- **Four return branches, one `sequenceChildren` each.**
  `dist/TransitionSeries.js:369` (both sides), `:386` (entering only), `:395` (exiting only),
  `:401` (no transition). Every branch emits a single `SequenceWithoutSchema` with
  `from: actualStartFrame, durationInFrames: durationInFramesProp`, and writes
  `sequenceChildren` exactly once.
- **The branch taken is constant for an item's whole life** — this is the property that makes
  the arrangement remount-free, and it is the one the investigation did not check.
  `dist/TransitionSeries.js:341-355`: `nextProgress` is `null` **iff** `next` is falsy and
  `prevProgress` is `null` **iff** `prev` is falsy, and `next`/`prev` are decided from sibling
  *positions* (`:266-275`), not from the frame. So a given item's Sequence renders the same
  branch — the same element types in the same order — on every frame it exists.
- **An item that is both a `to` and a `from` is the parent of both boundaries, not the child of
  either.** `dist/TransitionSeries.js:369-381`: outer = the *next* transition's presentation
  with `presentationDirection: "exiting"`, inner = the *previous* transition's with
  `"entering"`, both `bothEnteringAndExiting: true`, `WrapInExitingProgressContext` /
  `WrapInEnteringProgressContext` between them.
- **The overlap comes from pulling start frames back, not from relocating content.**
  `:306` `resolvedTransitionOffsets -= duration`; `:308`
  `actualStartFrame = currentStartFrame + resolvedTransitionOffsets`.
- **A presentation styles `children`; it never re-renders them.** Contract at
  `dist/types.d.ts:23-31`. Verified per presentation: `fade`, `slide`, `clock-wipe`, `iris`
  write `children` once; `flip` writes it once
  (`dist/presentations/flip.js:44`, inside two nested `AbsoluteFill`s).

This refutes R2's obstruction #3 (`lib/render/video-track.tsx:49-51`, "React gives a subtree
one parent") as a conclusion: the premise is true, and the boundary simply is not the parent.

### 1.2 Core's own layout already mounts both sides for the whole window — for every alignment

`computeVideoLayout` is untouched by Task 1.3 and is untouched by this design.
For an interior cut at composition frame `C` between items `i` and `i+1`, with
`{before, after} = transitionHandles(frames, alignment)`
(`lib/reel-config-base/transition-schema.ts:117-124`, so `before + after === frames` for all
three alignments):

| | value | from `lib/render/video-track-layout.ts` |
|---|---|---|
| boundary window (inclusive) | `[C - before, C - before + frames] = [C - before, C + after]` | `video-track.tsx:294`, `:317-322` |
| item `i` mounted through | `C + after - 1` | `:88` `outHalf = after`, `:91` `seqDuration` |
| item `i+1` mounted from | `C - before` | `:87` `inHalf = before`, `:90` `seqFrom` |

So **both adjacent items' own Sequences already span the entire boundary window**, except its
final `progress === 1` frame, on which the outgoing item is genuinely absent — which is exactly
what `BOUNDARY_TAIL` (`video-track.tsx:172-180`) reproduces today by having the outgoing clip's
re-based Sequence render nothing there. Substituting `alignment: 'start'` (`before=0`) and
`'end'` (`after=0`) into the table changes nothing about that conclusion.

**Consequence: single-mount needs no layout change, and Task 1.4's alignment survives
untouched.** This is the single most important verification in this document, because it is
what distinguishes this design from "adopt `TransitionSeries`", which hardcodes
end-of-outgoing/start-of-incoming (`dist/TransitionSeries.js:258`, `:306`) and would lose
alignment.

### 1.3 The investigation's "2 media elements, invariant across every kind" is wrong

The single mount removes the duplication **core's assembly imposes**. It does not remove
duplication a **presentation chooses**, and two kinds choose it — one of which the
investigation never measured:

| kind | writes its input | file:line |
|---|---|---|
| `rgb-split` | **3×** — main layer plus two offset, screen-blended ghosts | `lib/transitions/presentations/rgb-split.tsx:68`, `:81`, `:95` |
| `scanline-glitch` | **3×** the A⊕B blend | `lib/transitions/presentations/scanline-glitch.tsx:55`, `:64`, `:70` |
| `checkerboard` | `gridSize²` × the incoming clip | `checkerboard.tsx:246` |
| `glitch` | 1× (the whole effect is one SVG filter) | `glitch.tsx:83`, filter at `:149-204` |
| every other kind | 1× | verified per file |

`rgb-split` is not in the investigation's table. Under single-mount it is **6** media elements
at an interior cut (3 per side), not 2, unless its ghosts are re-expressed as an SVG filter the
way `glitch`'s already are. That is a real correction and it is why this design makes
duplication an **explicit, authored** feature of the contract (`ghosts`) rather than pretending
it is gone.

---

## 2. The model

### 2.1 What separates cleanly

- **The authoring contract** — one node per kind, two inputs, one clamped progress, one
  parameter set, nullable sides, `alignment`, `enabled`, the shared `ParamField` descriptor.
  This is the NLE model. It is what brands and the editor depend on. **Preserved.**
- **The rendering strategy** — that the two inputs are `React.ReactNode` subtrees the node
  *instantiates*. This is what forces the double mount. **Replaced.**

### 2.2 The new strategy, in one picture

```
                     ┌─ paint order ─────────────────────────────────────────┐
<VideoTrack>         │                                                        │
  <Sequence item A>  │  ExitShell(boundary AB) > EnterShell(boundary ZA) > A  │  A mounted ONCE
  <Layers  AB>       │  media-free plates the AB node asked for               │
  <Sequence item B>  │  ExitShell(boundary BC) > EnterShell(boundary AB) > B  │  B mounted ONCE
  <Layers  BC>       │                                                        │
  <Sequence item C>  │  ExitShell(     —     ) > EnterShell(boundary BC) > C  │  C mounted ONCE
</VideoTrack>        └────────────────────────────────────────────────────────┘
   ▲ always-mounted wrapper; carries `post` for whichever boundary is live
```

Two shells per item, nested in Remotion's order (**outer = exit**, inner = enter), mounted for
the item's whole life, **structurally constant** — they change `style`, never element type,
count or order. Media-free layers a node needs *between* the two clips are emitted as sibling
Sequences between the two item Sequences, which is already how `buildVideoNodes` controls paint
order (`video-track.tsx:410-431`, a boundary is emitted right after its owner).

`ItemBody`'s blanking, `rebased()`, the boundary `Sequence` and `BOUNDARY_TAIL` all disappear.
Nothing is ever relocated, so nothing ever remounts.

### 2.3 The contract

**Naming correction (Task 1.1):** this section originally named the plan-invocation prop bag
below `TransitionRenderProps`. That collides with the PRE-EXISTING, unrelated
`TransitionRenderProps` already exported from `lib/theming/transitions.ts` (the props a
*registry renderer* receives — `transition`, `width`, `height`, `palette`, `config` — a different
concept, reused by mistake when this section was drafted). Task 1.1 caught the collision before
writing it (it would have been a duplicate top-level export, a hard compile error) and renamed
this one to **`TransitionPlanProps`**, parallel to the existing `TransitionNodeProps` for the
`composite` arm. Every occurrence below and in §4.4 has been corrected to match; §8.2/§8.5's
mentions of `TransitionRenderProps` are the OTHER, pre-existing type and are unchanged.

```ts
// lib/theming/transitions.ts

/** What the node is told about one side of the boundary. NOT a ReactNode: the
 *  layer is ALREADY MOUNTED and the node styles it.
 *
 *  **CORRECTED IN PLACE BY TASK 1.4.** This originally also carried
 *  `readonly source: 'clip' | 'edge'`, on the premise that a node needed a way
 *  to branch at a materialised reel edge. Task 1.2's review found it dead
 *  (core always passes `'clip'`; nothing ever produced `'edge'`) *and*
 *  redundant, not merely unused: `from === null` / `to === null` already say
 *  "this side is the reel edge" (§2.5), and the materialised edge plate
 *  reaches the same `LayerShell` a clip does, so a node's `from`/`to` op
 *  applies to it identically either way. The field is removed rather than
 *  reconciled with a third nullability state — see §2.5, also corrected. */
export interface LayerHandle {
  /** The layer's own frame range, in BOUNDARY coordinates — how much handle it
   *  actually has. `[0, frames]` for a full-window side; a shorter range is how
   *  a node can see that the outgoing clip expires before progress 1. */
  readonly range: readonly [number, number];
}

/** ONE call per boundary per frame. BOTH sides. ONE progress. Unchanged
 *  semantics; `from`/`to` are handles instead of subtrees. */
export interface TransitionPlanProps {
  /** The OUTGOING side (A). `null` at the reel's LEADING edge. */
  from: LayerHandle | null;
  /** The INCOMING side (B). `null` at the reel's TRAILING edge. */
  to: LayerHandle | null;
  /** 0..1 across the boundary. CLAMPED BY CORE — a node must never clamp. */
  progress: number;
  /** Boundary-relative frame. Passed explicitly because a plan is a plain
   *  function and cannot call `useCurrentFrame()`; this also makes the clock
   *  a documented input instead of a footgun (see scanline-glitch.tsx:20-24). */
  frame: number;
  durationInFrames: number;
  params: Record<string, unknown>;
  config?: unknown;
  dims: { width: number; height: number; fps: number };
  palette: readonly AccentSlot[];
  background: string;
}

/** How one already-mounted layer is treated. */
export interface LayerOp {
  /** Merged onto the layer's shell. opacity / transform / filter / clipPath /
   *  mask / mixBlendMode / visibility — anything that is a style. */
  style?: React.CSSProperties;
  /** Stacking relative to the other side. Default: `to` over `from`. */
  z?: number;
  /** EXTRA styled copies of this layer. Each entry is one extra MOUNT of the
   *  clip — the only way to duplicate media, deliberately explicit so the cost
   *  is authored and visible in review. `ghosts.length` MUST NOT vary with
   *  `progress` (dev-warned, and pinned by a test): a varying count is an
   *  element-count change mid-window, i.e. the remount this design removes. */
  ghosts?: readonly React.CSSProperties[];
  /** Component form, for a shell no style can express — SVG `mask`/
   *  `foreignObject` (`burn`), and the route `fromRemotionPresentation` uses.
   *
   *  **CORRECTED IN PLACE BY TASK 1.4.** This originally took only
   *  `{ children: React.ReactNode }` and was applied *only while the
   *  boundary was live* — a type change at `children`'s tree position at
   *  both window edges, which remounts the clip through the contract rather
   *  than the assembly (found during Task 1.2, §4.6; not yet reachable then
   *  because no kind produced a plan). Core now mounts a declared `wrap` for
   *  the item's WHOLE life and passes `active: false` outside the window,
   *  `active: true` inside it, so the element type at `children`'s position
   *  never changes; a `wrap` that must be inert outside the window renders
   *  `children` unchanged when `active` is false.
   *
   *  MUST render `children` exactly once, and MUST be a STABLE component
   *  reference for the item's whole mounted life (not merely across the
   *  window's own frames, now that the mount spans more than the window). */
  wrap?: React.ComponentType<{ active: boolean; children: React.ReactNode }>;
}

/** A media-free full-frame plate. */
export interface PlateLayer {
  key: string;
  /** `under` both clips, `between` them, or `over` both. */
  z: 'under' | 'between' | 'over';
  style: React.CSSProperties;
  /** Optional media-free children (an SVG filter `<defs>`, a cell grid, …). */
  content?: React.ReactNode;
}

/** What a node returns instead of JSX around its inputs. */
export interface TransitionComposite {
  from?: LayerOp;
  to?: LayerOp;
  layers?: readonly PlateLayer[];
  /** Applied to the WHOLE video track for this window — the only way to treat
   *  the composite of both inputs (`scanline-glitch`). At most one live boundary
   *  may set it; a second is dev-warned and the later wins. */
  post?: React.CSSProperties;
}

/** A transition kind's node. `plan` is the single-mount contract; `composite`
 *  is Task 1.3's JSX form, retained through the staged migration (§7) and
 *  removed at the end of it. A node must supply exactly one. */
export type TransitionNode =
  | { plan: (props: TransitionPlanProps) => TransitionComposite; composite?: never }
  | { composite: React.ComponentType<TransitionNodeProps>; plan?: never };
```

### 2.4 How a node composes *both* sides — the thing one-sided presentations cannot do

By computing both `LayerOp`s in **one call from one progress**. The coordination lives in the
author's own code, in one function, exactly as it does today. Worked examples:

| kind | today | as a plan |
|---|---|---|
| `wipe` | `progress < 0.5 ? from : to` behind a sheet (`wipe.tsx:59`) | `from.style.opacity = p < 0.5 ? 1 : 0`; `to.style.opacity = p < 0.5 ? 0 : 1`; one `over` plate carrying the sheet's `backgroundColor` + `translateX`. Same single `interpolate(p,[0,.5,1],[100,0,-100])` (`wipe.tsx:48-52`). |
| `fade-to-color` | A, colour plate, B (`fade-to-color.tsx:64-69`) | `from: {}`; one `between` plate at `opacity: min(1, 2p)`; `to.style.opacity = max(0, 2p-1)`. Byte-identical opacity arithmetic (`:51-58`). |
| `pixelate` | `plate(from, fromOpacity)`, `plate(to, toOpacity)` — identical treatment, different opacity (`pixelate.tsx:117-141`) | the same filter/transform string on **both** `LayerOp.style`s, differing only in `opacity`; the grid / glitch-slice / RGB overlays become `over` plates. |
| `checkerboard` | 64 clipped copies of `to` over an intact `from` | `from: {}`; `to` wrapped in an SVG-native `<foreignObject mask="url(#cells)">` with `maskUnits="userSpaceOnUse"` and PIXEL (not `%`) `<rect>` geometry — **not** `to.style.mask = url(#cells)`. Task 0.1 measured the CSS-`mask`-on-an-HTML-element form of this row as-originally-written BROKEN under the real renderer (the masked layer came out fully invisible at every progress, not merely drifted); `burn.tsx`'s already-proven `foreignObject`+`maskUnits="userSpaceOnUse"` technique fixed it. One `over`-z-0 plate holding the SVG `<mask>` with `gridSize²` `<rect fill-opacity>`, values unchanged. Stage 4 should build on the `foreignObject` form directly rather than rediscovering this. |

The essential property is preserved and is worth stating plainly: **there is no direction
argument, no second invocation, and no per-side progress.** One function, one `p`, both sides.

### 2.5 Nullability at the reel's edges

Preserved verbatim in the props. Core additionally materialises the missing side as a **real
timeline sibling** — an `EdgePlate` Sequence spanning the window (plus its progress-1 frame) —
and applies the node's `from`/`to` op to it. That is the ordinary NLE idiom (a slug), and it
is what `edgeInput` (`lib/transitions/edge-plate.tsx:40-42`) already does in spirit; the plate
just stops being something the node instantiates. `from === null` / `to === null` still mean
what Task 2.2 made them mean, and that is now the ONLY way a node branches at an edge.

**CORRECTED IN PLACE BY TASK 1.4.** This section originally also said `LayerHandle.source ===
'edge'` gives a node a second way to branch at an edge. Task 1.2's review found `source` dead
(core always passes `'clip'`) and redundant (the nullability check above already tells a node
its side is the reel edge, and the materialised plate reaches the node's op through the same
`LayerShell` a clip does) — so the field is retired rather than reconciled with a third state.
See §2.3, also corrected.

At a trailing edge the outgoing clip's Sequence ends one frame before the window does
(§1.2). The plate covers that frame, so the `progress === 1` picture is the background — the
same pixel `BOUNDARY_TAIL` produces today.

### 2.6 Stacking, blending and the `post` slot

`buildVideoNodes` returns `React.ReactNode[]` today (`video-track.tsx:262`). It keeps that
signature and returns a **single-element array** holding one always-mounted track wrapper. Two
properties on that wrapper:

- `isolation: 'isolate'`. `mixBlendMode` on a `to` layer must blend against `from`, not against
  everything beneath the video track.

  **CORRECTED IN PLACE BY TASK 1.2 (measured).** This section originally said
  *unconditionally*, and that is wrong as built: `isolation: 'isolate'` is a blending-group
  boundary, so applying it to a tree where no kind has migrated changes what the EXISTING
  `mixBlendMode`-using presentations blend against. Measured on the Task 1.2 tree, with the
  wrapper as the only change: `npm run pixel-gate:strict` reported **37 drifted + 24
  same-picture-different-bytes of 300**, max 8×8 cell delta **10** — `light-leak` (9 cells),
  `whip-pan` (7), `zoom-blur` (2), plus NEARs across `pixelate`, `scanline-glitch` and
  `rgb-split`. That would have destroyed the only instrument that can prove this phase neutral.

  What ships instead: the flag is derived from the reel's **config** — is any boundary's node a
  plan? — and is therefore **constant across every frame of a composition**. The property this
  paragraph actually argues for (no divergence between in-window and out-of-window frames) is
  preserved exactly; what changes is that a reel's blending is coupled to whether it contains a
  plan kind at all, which **Stage 2 must adjudicate** when the first kind migrates and its cells
  move partly for this reason rather than for the kind's own. At Stage 5, with every kind
  migrated, the condition is true for every reel that has a transition at all and the deviation
  disappears.
- `filter` (and only `filter`/`transform`) from the live boundary's `post`, `undefined`
  otherwise.

This is the third tier the investigation identified. It is what makes `scanline-glitch`
expressible: `screen(offset(A ⊕ B))` cannot be produced by two independent per-side shells,
because neither shell contains both inputs — but an SVG `feOffset` + `feColorMatrix` +
`feBlend mode="screen"` chain over a single source reproduces the RGB split with no
duplication, and only A and B are on the track during the window.

---

## 3. Per-kind feasibility — all 20 kinds

Derived from `TRANSITION_CATALOG`, which is built from `CATALOG` in
`lib/reel-config-base/transition-schema.ts:689-692`. The 20 members, at their `z.literal`
lines: `cut` `:260`, `dissolve` `:269`, `fade` `:270`, `fade-to-color` `:295`, `glitch` `:306`,
`rgb-split` `:325`, `scanline-glitch` `:345`, `burn` `:358`, `light-leak` `:376`, `slide` `:399`,
`flip` `:400`, `whip-pan` `:405`, `zoom-through` `:418`, `zoom-blur` `:448`, `clock-wipe` `:465`,
`iris` `:466`, `wipe` `:469`, `gradient-wipe` `:489`, `pixelate` `:511`, `checkerboard` `:535`.
(Cross-checks: `HANDOFF.md`'s "20 demonstrable kinds"; the harness's 300 cells = 20 × 3 modes ×
5 progress.)

| # | kind | form | bucket | how, and what moves |
|---|---|---|---|---|
| 1 | `cut` | no node (`at-cut-transitions.tsx:146`) | **A** | N/A — the gate in `transition-record.ts` filters it out. |
| 2 | `fade` | official, one-sided | **A** | `wrap` per side, `dist/presentations/fade.js` writes children once. Opacity is a pure function of progress. |
| 3 | `dissolve` | ditto (`:151`) | **A** | ditto. |
| 4 | `fade-to-color` | node **only when its colour resolves** (`:164-187`); otherwise the one-sided `fade` | **A** | §2.4. Pure opacity arithmetic (`fade-to-color.tsx:51-58`). Both routes are bucket A. Note it is **not** in `NODE_KINDS` — the catalog default carries no colour, so the harness renders it through `fade`. |
| 5 | `glitch` | one-sided, one SVG filter | **A**, goldens move | `wrap` per side. Children written once (`glitch.tsx:83`). **Its clock changes**: it calls `useCurrentFrame()` (`:64-65` seed) and moves from the boundary Sequence to the item's, so its seed sequence shifts. 15 cells re-baseline, same mechanism as `phase4-migrations.md` §1.3-d. |
| 6 | `rgb-split` | one-sided, **3× children** | **B** | Main layer → `to`/`from` style; the two ghosts → `ghosts: [redStyle, cyanStyle]`. The `splitIntensity > 0.05` guards (`rgb-split.tsx:72`, `:86`) must become `opacity: 0` instead of conditional mounts, so the element count is progress-invariant. Max ghost opacity at the threshold is `0.05 × 0.7 = 0.035`, so the picture moves slightly. **6 media elements per cut, not 2** — reducible to 2 by an SVG-filter rewrite (the shape `glitch` already uses), which is a separate, optional task. |
| 7 | `scanline-glitch` | native node, 3× the blend | **B** | `from: {}`, `to.style.opacity = p` (the blend, `:49`), scanline gradient → `over` plate, RGB split → `post` SVG filter. Not byte-exact against the DOM triple-render; 15 cells re-baseline. Its own historic defect was never arity (`scanline-glitch.tsx:44-50`). |
| 8 | `burn` | one-sided, SVG mask + `foreignObject` | **A** | `wrap` per side. Children once (`burn.tsx:82`). Branches are on `presentationDirection` (`:44`) and on `mask` (`:49`) — **both constant per side per node**, never on progress, so the shell shape is stable. |
| 9 | `light-leak` | one-sided | **A** | `wrap` or style. Children once (`light-leak.tsx:129`), overlays after it. |
| 10 | `slide` | official | **A** | `wrap`; children once. |
| 11 | `flip` | official | **A** | `wrap`; children once (`dist/presentations/flip.js:44`). |
| 12 | `whip-pan` | one-sided | **A** | children once (`whip-pan.tsx:92`). |
| 13 | `zoom-through` | one-sided | **A** | children once (`zoom-through.tsx:101`); the `presentationDirection` branch is in a `useMemo` over a *number* (`:85-95`), not over shape. |
| 14 | `zoom-blur` | one-sided | **A** | children once (`zoom-blur.tsx:110`). |
| 15 | `clock-wipe` | official | **A** | `wrap`; children once. |
| 16 | `iris` | official | **A** | `wrap`; children once. |
| 17 | `wipe` | native node | **A** | §2.4. The occluded side is fully covered by the sheet at every `p` where it is hidden, so the opacity swap is pixel-identical to the `from`/`to` swap. |
| 18 | `gradient-wipe` | one-sided, CSS mask | **A** | `to.style.maskImage` directly — no `wrap` needed. `presentationDirection` branch (`gradient-wipe.tsx:41`) is per-side, not per-frame. |
| 19 | `pixelate` | native node | **A** | §2.4. Overlays are media-free and become `over` plates. |
| 20 | `checkerboard` | native node, `gridSize²` mounts | **C** | `squareAnimation: 'fade'` (**the default**, `checkerboard.tsx:136`) is per-cell **alpha only** (`:206`) → an SVG `<mask>` with `gridSize²` `<rect fill-opacity>`; 1 media element, and the alpha values are identical. `'scale'` (`:209-211`) and `'flip'` (`:212-215`) apply a **geometric transform to the media pixels per cell** (`:232`) — a mask changes alpha, not geometry, so they are **not** reproducible by masking. **See the carve-out below.** |

**Buckets: 17 A / 2 B / 1 C / 0 not expressible.**

- **A — expressible, pixel-exact by construction** (17): every layer's appearance is a pure
  function of progress applied to one mount, and the DOM elements that disappear (the boundary
  `AbsoluteFill`, the `layout="none"` re-based Sequences, which emit no element at all) are
  layout- and paint-neutral. `glitch` is in A on *structure* but its goldens move on *clock*.
- **B — expressible, requires a deliberate re-baseline** (2): `rgb-split`, `scanline-glitch`.
- **C — expressible with a carve-out** (1): `checkerboard`.

### The one carve-out, stated honestly

`checkerboard`'s `squareAnimation: 'scale'` and `'flip'` need the media transformed per cell.
Three options, and the design **does not force a choice** — the contract supports all three:

1. **`ghosts` with `gridSize²` entries.** Pixel-exact, still 64 mounts. The cost becomes
   *authored and visible* instead of hidden inside a node. This is the compatibility answer and
   is available with zero core work beyond the contract.
2. **Re-specify as mask geometry** — a growing / anisotropically squashed mask rect per cell.
   Visually similar, **not** identical; 1 mount. Requires a golden re-baseline for those
   sub-options and a migration note.
3. **Drop the two sub-options.** Smallest code, a breaking schema change.

Recommendation: ship (1) as the mechanical migration so nothing regresses, and offer (2) as a
new, differently-named sub-option value if a brand wants the cheap version. **Nothing in the
catalog becomes inexpressible.**

---

## 4. Does it keep everything Task 1.3 bought?

The four defects, one at a time. The test in each row is: *does the new strategy re-open it?*

### 4.1 `wipe`'s two beats running simultaneously

**Root cause** (`docs/superpowers/at-cut-transition-findings.md:192-195`): the one-sided model
ran two *independent* 0→1 sweeps over one window and drew the entering one on top, so the
sheet was already at `translateX(0%)` at progress 0.

**Not re-opened.** The plan is one function of one `p`, computing both sides. `wipe`'s plan
contains the *single* `interpolate(p,[0,.5,1],[100,0,-100])` sheet timeline and the midpoint
swap, in one place (§2.4). There is no per-side sweep to get out of phase because there is no
per-side invocation. The thing that caused this defect — *two calls, two progresses* — is
absent from the contract, as it has been since 1.3.

### 4.2 The eight "exiting no-op" kinds

**Root cause** (`at-cut-transition-findings.md:225-229`): asked to draw one side at a time, a
presentation whose exiting branch is the identity did nothing as a `transitionOut`.

**Not re-opened.** A plan author writes `from` and `to` in the same function; there is no
default-identity exiting branch to inherit, because there is no exiting branch. For the five
official presentations, which genuinely *are* one-sided, the `wrap` route reproduces exactly
today's lift — and Task 2.2's answer to the case where it bites (the reel edge) is preserved by
the edge plate (§2.5), now as a real timeline item rather than a node-instantiated one.

### 4.3 `checkerboard`'s empty cells on exit

**Root cause** (`at-cut-transition-findings.md:121-123`): two implementations, the exiting one
drawing content-less cells.

**Not re-opened.** Still exactly one implementation — `to` masked into cells over an intact
`from`, no direction branch (`checkerboard.tsx:218-220` records the deletion). The plan form
makes the asymmetry *more* explicit, not less: `from` gets `{}` and `to` gets the mask.

### 4.4 The undefined trailing edge

**Root cause** (`at-cut-transition-findings.md:235-241`): the last item has an `outRecord` but
no successor to enter, so nothing drew.

**Not re-opened.** `to === null` survives verbatim in `TransitionPlanProps` (§2.3) and is
still what defines the trailing edge; the background still comes from
`CompositionTheme.background` threaded through `buildVideoNodes`
(`layered-composition.tsx:388`), and core still names no colour of its own. The only change is
*where* the plate is mounted.

### 4.5 Two defect classes the new strategy actively closes

- **The preview remount** — the reason this document exists. Nothing is relocated, so nothing
  remounts. Media elements at an interior footage cut: **2** for the 17 bucket-A kinds (down
  from 3 for a lifted kind, 7 for `scanline-glitch`, 66 for `checkerboard`), **6** for
  `rgb-split` until its ghosts become a filter.
- **The fresh-component-function amplifier** (`editor-transition-regression.md:155-181`). A
  `plan` is a plain function; the JSX element types at the call site become **core's own stable
  shell components**. The element type can no longer change per render, so R1's Fix 3 stops
  being load-bearing and becomes a pure optimisation (§6).

### 4.6 The one new hazard the strategy introduces

**A shell must be structurally constant across the window.** This is a real trap — the
investigation hit it on its first probe (`r2-wall-investigation.md:151-155`), and
`video-track.tsx:99-107` already documents the same mechanism from R1's side. It is contained
by three things, all cheap:

1. Shells are **core's** components, always mounted, styled-only. Brands cannot get this wrong
   through `style`, `z`, `layers` or `post`.
2. The two places a brand *can* get it wrong are `ghosts.length` varying with progress and a
   `wrap` that is not a stable reference. Both get a dev warning (`warnOnce`, per §6) and a
   derived test over `TRANSITION_CATALOG` — one that renders each kind at every probe progress
   and asserts DOM element identity is stable, which is the promoted form of
   `lib/editor/src/video-track-remount.test.tsx`.
3. Remotion's own arrangement has the same requirement and satisfies it the same way
   (§1.1, `dist/TransitionSeries.js:341-355`).

---

## 5. Flexibility

The user's third requirement. Measured against the plan's own table
(`2026-07-26-phase4-node-contract.md:219-231`).

| Capability | Today | Under the plan model |
|---|---|---|
| A brand adds a kind in ~5 lines of theme, zero core edits | `theme.transitions[kind] = { renderer }` | **unchanged** — the renderer returns a node; only the node's shape differs |
| `params` / `ParamField` / `subOptionsFor` | works | **unchanged** — `params` is still a plain record on the props |
| `alignment` | `computeVideoLayout` | **unchanged** — §1.2 proves the layout is untouched |
| `enabled`, `config`, presets | works | **unchanged** |
| `fromRemotionPresentation` lifts the 5 official one-sided presentations | works | **works** — via `LayerOp.wrap`, which is *literally* what `TransitionSeries` does (`dist/TransitionSeries.js:369-381`); the adapter stops being a lift-by-double-render and becomes the native path |
| Core's kinds driven by `TransitionSeries` / `presentationFor` | **broken for 4 kinds** — a node returns `null` and hard-cuts (`at-cut-transitions.tsx:394-410`) | **restored for all 20** — a plan adapts *down* to a one-sided presentation (§8.5 point 2) |
| Brand-only exotic kinds stay supported | yes | yes, and `wrap` + `ghosts` are the escape hatches |
| Accent-slot colour resolution | `resolveAccentColorOrWarn` | **unchanged** — resolution happens at `resolveTransition`, before the node |

**What gets wider:**

- **`post`** is new expressive power: no kind can treat the composite of both inputs today
  without rendering both of them 3× (`scanline-glitch` does exactly that and pays for it).
- **`LayerHandle.range`** tells a node how much handle each side actually has — information the
  node cannot get today at all.
- **`frame` in the props** makes the clock an explicit input. Today a node reads
  `useCurrentFrame()` and silently gets *boundary*-relative frames, a footgun documented in
  prose at `scanline-glitch.tsx:20-24`.
- **`ghosts`** makes media duplication a reviewable, budgeted decision.
- A brand can express a style-only transition **without writing a React component at all**.
- **All 20 kinds become drivable by `TransitionSeries` again.** A plan adapts *downward* into a
  one-sided `TransitionPresentation` (apply `plan.from` on the exiting call, `plan.to` +
  `plan.layers` on the entering one). Today four kinds cannot go through that path at all and
  silently hard-cut, which is why `TransitionGallery` needed `NodeTransitionDemo` and why PP's
  six `web-program-intro` files cannot use `wipe`/`pixelate`/`checkerboard`/`scanline-glitch`
  (§8.5). **This is capability the current contract removed, returned.**

**What gets narrower — the honest cost:**

1. **A node can no longer place arbitrary JSX inside an input's own subtree**, or reparent /
   reorder an input's internals. Nothing in core or either brand repo does this; it was never a
   sane thing to do (the input is someone else's renderer's output).
2. **A node can no longer scope a filter or blend to exactly the A⊕B pair.** `post` is
   **track**-wide. In practice the video track holds only A and B during a window — but with
   *overlapping* boundaries (already a warned pathology, `video-track.tsx:329-362`) a third clip
   can be present, and two boundaries cannot both hold `post`. This is a genuine, if narrow,
   reduction, and it needs the "last wins + warn" rule stated in the contract.
3. **Per-element geometric transforms of media require `ghosts`.** Expressible, but the mount
   cost is now visible rather than hidden. That is arguably a feature; it is listed as a cost
   because someone will experience it as one.
4. **A `plan` cannot call React hooks.** `useCurrentFrame` is replaced by `frame`;
   `useVideoConfig` by `dims`; `useMemo` moves to the node factory, where params are closed over
   and only `progress` varies (this is what `checkerboard.tsx:142-160` and
   `pixelate.tsx:104-111` need). A node that genuinely needs a hook uses `wrap`.

Nothing in the catalog, in core, or in either brand repo becomes **impossible**.

---

## 6. What this deletes, and what it must preserve

**Deleted — and each deletion is a benefit, not a side effect:**

| Deleted | Where | Why it can go |
|---|---|---|
| `ItemBody` + its blanking, and the whole preview gate | `video-track.tsx:77-170` | Nothing is ever blanked; an item draws itself for its whole life. |
| R1 Fix 2 — the boundary premount | `video-track.tsx:182-199`, `:420` | There is no boundary Sequence to premount. |
| R2 — `drawnThrough` / `lastDrawnFrame` | `video-track.tsx:121-149`, `:364-384` | There is no second copy to release. |
| `isPreviewEnvironment()` and its module | `lib/render/preview-environment.ts` | **Its only production consumer is `video-track.tsx`** (verified: `git grep -n isPreviewEnvironment -- lib examples` → `preview-environment.ts:31`, `video-track.tsx:64,88,159,420`, plus one test). **The preview/render divergence goes away entirely**, which is the single largest maintenance win here. |
| `rebased()`, the boundary `Sequence`, `BOUNDARY_TAIL` | `video-track.tsx:172-180`, `:386-398`, `:414-430` | The mount that made them necessary is gone. |
| `TransitionLayer` as a public component | `at-cut-transitions.tsx:353-371` | Folds into `wrap`. |
| `presentationFor`'s two-input warning | `at-cut-transitions.tsx:394-410` | Every kind resolves to a node; there is no one-sided render path left to warn about. `presentationFor` itself can stay as an accessor or go. |
| `NodeTransitionDemo`'s separate gallery path | `lib/transitions/TransitionGallery.tsx` | It exists because a node cannot go through `TransitionSeries` (`HANDOFF.md`, Workstream 2 finding 4). Shells can. |

**Downgraded, not deleted:** R1 Fix 3's LRU node cache
(`at-cut-transitions.tsx:449-572`, ~120 lines). It stops being *correctness* (the element type
at the call site is core's own stable shell) and becomes an allocation optimisation. Keep it
initially; measure before removing.

**Must be preserved:**

- **Task 6.3's audit invariant — the audit and the renderer travel together.** Two fix rounds
  established it (`task-6.3-report.md`). Warning 8
  (`at-cut-transitions.tsx:332-337`) lives in `resolveTransition`, which is *upstream* of the
  node's shape and does not move. Warnings 2 and 7
  (`layered-composition.tsx:388`, `:400`) audit `renderItem`'s output, which is untouched. The
  overlapping-boundaries diagnostic (`video-track.tsx:350-362`) and
  `resolveAccentColorOrWarn` (`at-cut-transitions.tsx:120-141`) **move with the assembly they
  audit** and must land in the same task as it. The design *adds* two warnings under the same
  discipline (progress-varying `ghosts.length`; a second `post` on one frame), each with a
  positive and a negative pin in `dev-warnings.test.tsx`.
- **Task 4.1's anchored-overlay parity.** `renderItem`'s output is not modified. But two shell
  divs now wrap every video item **in every environment**, where R1's wrapper was preview-only.
  That is a uniform DOM change rather than a divergent one — better in kind, but it is a change,
  and it is the same class of concern Task 4.1's conditional wrapper was written to avoid. Both
  shells are `position:absolute; inset:0` for the same reason R1's wrapper is
  (`video-track.tsx:109-119`).
- **Tasks 1.4 / 1.5 / 1.6 / 2.2 / 2.3 / 2.4 / 2.5**: alignment, `enabled`/`config`/`cut`, the
  accent mark, the edge background, the honest vocabulary and the forwarded params are all
  either upstream of the node or in the layout. Untouched.
- **The 11-param differential coverage** in `at-cut-transitions.test.tsx`
  (`CLAUDE.md`'s gate table). It renders a kind twice with one param changed and requires the
  output to differ. It survives the strategy change unchanged in *intent*, and it is the test
  that catches a param dropped in the plan-forwarding table — the hole that was real once
  already.

---

## 7. Staged path — stoppable at every stage

The contract is **additive first and flipped once, at the end**. The seam that makes this work
is that the choice of strategy is **per boundary**: a kind whose node offers `plan` renders
through shells; a kind that still offers only `composite` renders through today's boundary
Sequence. Mixed reels work, because an item's shells are always mounted and are the identity
for a boundary that has no plan, and that boundary's blanking path is untouched.

**Stage 0 — two wins that need no contract change at all.** Independently valuable; keep them
even if everything after this is abandoned.

| Task | What | Goldens |
|---|---|---|
| 0.1 | `checkerboard` as an SVG alpha mask over one mounted `to`. 66 → 3 media elements *inside today's model*. **NOT pixel-exact** for the default `'fade'` — measured (not "likely"): 12 of 15 cells moved, all within the harness's own lenient tolerance except one (`cut__p025`, max cell delta 3), re-baselined deliberately. Root cause (confirmed mechanistically on review): the composition's pixel width does not divide evenly by `gridSize`, so every other cell boundary lands on a half-pixel; the two abutting mask `<rect>`s each contribute partial (anti-aliased) coverage there, compositing source-over to a seam alpha rather than the fully-opaque/fully-transparent value either rect alone declares — visible as a faint 1px seam on the alternating columns whose boundary happens to fall mid-pixel, persisting even at progress 1. This is a NEW artifact class the mask technique introduces (the clipped-copy path had no such seam: each cell was an independent DOM box with its own edge AA, not a shared mask boundary). **Any later task masking a kind with visible internal cell/segment boundaries should expect this seam and budget review time for it**, not treat checkerboard's outcome as proof of pixel-exactness. See `.superpowers/sdd/phase5-single-mount-design/task-0.1-report.md` for the full account, including a first implementation attempt (CSS `mask` on an HTML element) that was outright broken, not just non-exact — corrected in §2.4's `checkerboard` row. The two other sub-options keep the cell path. | 15 cells (1 kind), **12 moved** |
| 0.2 | `scanline-glitch`'s DOM triple-render → one SVG `feOffset`/`feColorMatrix`/`feBlend` chain. 7 → 3. | 15 cells, will move |

**Stage 1 — the contract, additively.**

| Task | What |
|---|---|
| 1.1 | Add `LayerHandle`, `LayerOp`, `PlateLayer`, `TransitionComposite` and the `plan` arm of `TransitionNode` to `lib/theming/transitions.ts`. No renderer changes. Both brand repos keep compiling — the union only widens. |
| 1.2 | Shell components + the plan path inside `buildVideoNodes`, selected per boundary by `'plan' in node`. Item shells always mounted; `layers` as sibling Sequences; the track wrapper with `isolation: isolate` and the `post` slot; the `EdgePlate` timeline sibling. `computeVideoLayout` untouched. Zero kinds migrated yet, so **every golden must still be byte-identical** — that is this task's acceptance criterion and it is a strong one. |
| 1.3 | The remount test promoted to a kept, derived test over `TRANSITION_CATALOG`: DOM element identity per item across every boundary crossing. It fails for every kind today and passes per kind as they migrate — the ratchet for stages 2-4. |

**Stage 2 — migrate the 17 bucket-A kinds.** Three tasks, batched by mechanism, each ending
with a full unfiltered `pixel-gate:strict`:

| Task | Kinds |
|---|---|
| 2.1 | `fromRemotionPresentation` → `wrap`: `fade`, `dissolve`, `slide`, `flip`, `clock-wipe`, `iris` (+ `fade-to-color`'s no-colour fallback) |
| 2.2 | style-only natives: `wipe`, `fade-to-color`, `pixelate`, `gradient-wipe` |
| 2.3 | `wrap`-shaped customs: `burn`, `glitch` (**15 cells move — clock origin**), `light-leak`, `whip-pan`, `zoom-through`, `zoom-blur` |

**Stage 3 — the two re-baseline kinds.** `rgb-split` (`ghosts`, un-conditioned) and
`scanline-glitch` (`post`). 30 cells, reviewed picture by picture.

**Stage 4 — the carve-out.** `checkerboard` to the mask plan; `'scale'`/`'flip'` onto
`ghosts` (option 1) with option 2 offered as a new sub-option value. Migration note.

**Stage 5 — the flip, once.** Delete the `composite` arm and everything in §6's deletion table;
move the two diagnostics; migrate the editor suite; full 300-cell re-baseline reviewed; re-seed
the bimodal cells; write `phase5-migrations.md` and bump both brand repos' submodule pins.

**Honest task count: 11** (2 + 3 + 3 + 1 + 1 + 1), i.e. **a Phase 5 workstream**, not a fix.
Stages 0-4 are individually shippable; only Stage 5 is a public break.

---

## 8. Blast radius

### 8.1 Core

| File | Lines today | Change |
|---|---|---|
| `lib/render/video-track.tsx` | 435 | Rewritten assembly; **materially smaller** after §6's deletions |
| `lib/render/at-cut-transitions.tsx` | 635 | `AtCutTransition` → shell driver; `fromRemotionPresentation` → `wrap`; `TransitionLayer` folded in |
| `lib/theming/transitions.ts` | 153 | **Public contract.** Additive at Stage 1, narrowed at Stage 5 |
| `lib/render/layered-composition.tsx` | — | one call-site change (`buildVideoNodes` returns the wrapper) |
| `lib/render/preview-environment.ts` | 31+ | **deleted** |
| `lib/transitions/presentations/*.tsx` | 13 files, 2034 lines total | 13 migrations; `checkerboard` and `scanline-glitch` are rewrites, the rest mechanical |
| `lib/transitions/edge-plate.tsx` | 42 | `edgeInput` retires; `EdgePlate` becomes a timeline item |
| `lib/transitions/TransitionGallery.tsx` | 548 | `NodeTransitionDemo` collapses |
| `lib/render/video-track-layout.ts` | 105 | **untouched** (§1.2) |
| `lib/reel-config-base/transition-schema.ts` | — | **untouched** unless `checkerboard` option 3 is chosen |

### 8.2 Public types that reach brand repos

`TransitionNode`, `TransitionNodeProps`, `TransitionRenderProps`, `TransitionRenderer`,
`ResolvedTransition`, `isTransitionNode` — all exported from `lib/theming/transitions.ts` and
re-exported from `lib/render/at-cut-transitions.tsx:37-40`. Nominally this is **the second
contract flip inside Phase 4** — and the user is right to weigh that. But the census (§8.5)
measures the actual exposure at **zero brand-owned references**, in either repo. The flip is
public in the type system and private in practice. Stage 1's additivity keeps it that way for
anything not yet surveyed.

### 8.3 Goldens

- **All 300 cells must be re-run and reviewed at Stage 5.** Provably moving: `glitch` (clock
  origin), `rgb-split` (un-conditioned ghosts), `scanline-glitch` (filter vs DOM triple),
  `checkerboard` (mask vs cells) = **60 cells guaranteed to move**. The other 240 are *expected*
  byte-identical and Stage 1's acceptance criterion is designed to prove the assembly itself is
  neutral before any kind moves — but "expected" is not "verified", and every cell gets looked
  at. `frameFor()` places `enter`/`exit` windows inside the clip's own Sequence, so the
  non-`cut` modes are not exempt.
- **The 24 bimodal cells need re-seeding at `--repeat=24`.** Their second recorded picture comes
  from a DOM arrangement that will no longer exist. They sit in `clock-wipe` (9), `iris` (7) and
  `light-leak` (8) — all bucket A, so the *first* hash is expected to hold and only the second
  needs re-sampling (§8.6). Expect `knownDefective` and `semanticXfail` to stay empty.
- **Use the filter while iterating.** `node scripts/render-transition-matrix.mjs <kinds>` — each
  Stage-2 task touches 4-6 kinds, i.e. 60-90 stills instead of 300. Full unfiltered run only
  before each commit.

### 8.4 Editor suite

`lib/editor/app/` has **zero** references to any of `TransitionNode`, `TransitionNodeProps`,
`AtCutTransition`, `transitionNodeFor`, `fromRemotionPresentation`, `presentationFor`,
`isTransitionNode`, `.composite`, `buildVideoNodes`, `ItemBody`, `rebased`. **The editor's
application code is not coupled to the strategy at all** — every hit is a test.

**13 test files need migration** (15 match, two of them only on the English word "rebased":
`segment-media-anchored-overlays.test.tsx`, `caption-mount.test.tsx` — verify before counting).
Ordered by coupling depth:

| File (`lib/editor/src/`) | hits | lines | depth |
|---|---|---|---|
| `at-cut-transitions.test.tsx` | **113** | 1585 | **Rewrite.** The only file touching every symbol. Carries the pinned `NODE_KINDS` (`:221`) and the per-kind node-vs-one-sided duality assertion (`:295`). |
| `transition-registry.test.tsx` | 18 | 237 | heavy `presentationFor` (14) + `buildVideoNodes` (4) |
| `fade-to-color-edge.test.tsx` | 11 | 311 | `buildVideoNodes`-driven wiring |
| `transition-gallery.test.tsx` | 8 | 143 | asserts against `.composite` |
| `two-input-transitions.test.tsx` | 7 | 234 | ditto |
| `transition-gallery-catalog.test.tsx` | 6 | 94 | ditto |
| `transition-alignment-render.test.tsx` | 6 | 161 | ditto |
| `video-track-remount.test.tsx` | 6 | 248 | **its pins invert** — it asserts the 3-element floor |
| `dev-warnings.test.tsx` | 4 | 655 | `transitionNodeFor` warn paths; **gains two new pins** (§6) |
| `reel-edge-background.test.tsx` | 3 | 101 | wiring |
| `cut-predicate-collapse.test.ts` | 2 | 153 | wiring |
| `video-track-layout.test.ts` | 1 | 84 | 1 hit; layout is untouched |
| `conformance-example.test.tsx` | 1 | 424 | 1 hit |

**The 4 skipped tests change meaning.** They are one `it.skipIf(isNode)` declaration
(`at-cut-transitions.test.tsx:356`) × the four kinds in `NODE_KINDS` (pinned at `:221` to
`checkerboard`, `pixelate`, `scanline-glitch`, `wipe`). Once every kind is a plan, *every* kind
loses its one-sided props bag, so either all 20 skip or — better — the differential
`two-input node <kind> delivers every authored param` block (`:387`) becomes the **only** param
test and the `skipIf` is deleted. That is a strictly stronger suite: the differential test is
derived and catches a param dropped in the forwarding table, which the props-bag test never did.
`it.fails` count remains **0** (verified).

Note also: **`fade-to-color` is not in `NODE_KINDS`.** It is a node only when its colour
resolves (`at-cut-transitions.tsx:186`); with the catalog default (no colour) it is the
one-sided `fade`. Both routes are bucket A, but any test written against "the four node kinds"
must be re-derived, not pattern-matched.

### 8.5 Brand repos — READ-ONLY here; what they would have to do

Surveyed at PP `/Users/xaralis/Workspace/progpce/video-toolkit` @ `0e2dfb9` and ROOST
`/Users/xaralis/Workspace/roost/video-toolkit` @ `f71b85d` (both confirmed by
`git rev-parse --short HEAD`). Nothing was modified.

**The headline is much better than "a second contract flip" implies:**

> **Neither brand repo has a single line of code that touches `TransitionNode`,
> `TransitionNodeProps`, `TransitionRenderProps`, `TransitionRegistry`, `transitionNodeFor`,
> `fromRemotionPresentation`, `isTransitionNode`, or `.composite`.** Zero brand-owned hits in
> `.ts`/`.tsx` in either repo, `toolkit/` and `node_modules` excluded. **Neither brand registers
> a transition kind at all** — no `transitions:` key exists in any brand or composition theme.

So the node contract itself — the thing Stage 5 narrows — has **no brand consumers**. What the
brands *do* consume is two things:

| Surface | Sites | Repo | Detail |
|---|---|---|---|
| `buildVideoNodes` | **12** | PP 11, ROOST 1 | All **vendored per-project hand-rolls**, none on the migrated `LayeredReelComposition` path even though *both templates already are*. PP's 11 copies of `projects/pp-*/src/LayeredCampaignReel.tsx` are byte-identical (481 lines each, call at `:407`) and pass only `width/height/fps/palette/renderItem` — **no `transitions`, no `background`**. ROOST's `projects/roost-reel-01/src/LayeredRoostReel.tsx:131` is the only call site anywhere passing the full Phase-4 option set. |
| `presentationFor` | **6** | PP only | `templates/web-program-intro/src/WebProgramIntro.tsx:37` plus 5 byte-identical project copies. These drive `TransitionSeries.Transition`, **not** `AtCutTransition`. |

**Consequences for migration, concretely:**

1. **`buildVideoNodes` keeps its signature** — `(items, opts) => React.ReactNode[]` — so all 12
   hand-rolls keep compiling and keep rendering. They get the single mount for free. This is why
   §2.6 insists on returning a one-element array rather than a bare element.
2. **The 6 `presentationFor` sites get *better*, not worse.** Today a two-input kind returns
   `null` there and the boundary silently hard-cuts, warned
   (`at-cut-transitions.tsx:394-410`) — so `wipe`, `pixelate`, `checkerboard` and
   `scanline-glitch` are *unusable* in `web-program-intro` right now. A `plan` can be adapted
   *back* into a one-sided `TransitionPresentation`: apply `plan.from` on the exiting call,
   `plan.to` plus `plan.layers` on the entering call. That is exactly the shell semantics, and it
   restores all 20 kinds to `TransitionSeries`. **This is a capability the current contract
   removed and the new one gives back.** It also deletes the gallery's parallel
   `NodeTransitionDemo` path (§6).
3. **17 project directories hold a vendored file on the transition contract surface** (PP 16 of
   16, ROOST 1 of 1). None vendors a *copy of a core file* — they all resolve through
   `@video-toolkit/…` — so `sync-template` work is about the vendored *brand* code drifting from
   its own template, which is pre-existing debt this design does not create and should not try to
   pay off in the same workstream.
4. **ROOST's `burn` look is params, not a registration** —
   `withTransitionOverrides(it.transitionOut, { mask, glowColor })` via `prepareVideoTrack`
   (`templates/roost-reels/src/config/composition-theme.tsx:15-26`, duplicated at
   `projects/roost-reel-01/src/LayeredRoostReel.tsx:106-119`). `burn` is bucket A and its
   params flow through `resolveTransition`, upstream of the node. Unaffected.

**What each brand repo must actually do at Stage 5: bump the submodule pin and re-render.** No
code change is required by the contract narrowing. That is the finding that most changes the
cost/benefit of doing this at all.

### 8.6 Goldens — census detail

`examples/layered-minimal/goldens/transition-matrix.json` (110151 bytes,
`render-transition-matrix.mjs:144`): `frames` has **300** entries, `kindCount: 20`,
`knownDefective: []`, `semanticXfail: []`. Probe:
`540×960, frames 20, clipFrames 60, progress [0,.25,.5,.75,1], modes ['enter','exit','cut']`.

**24 bimodal cells, and they are concentrated in three kinds** — `clock-wipe` 9, `iris` 7,
`light-leak` 8. All three are **bucket A**, i.e. their pictures are not expected to change; but
their *second recorded hash* was produced under a DOM arrangement that will no longer exist, so
all 24 re-seed at `--repeat=24`. Entry shape: key `<kind>__<mode>__<pKey>`, value
`sha256[|sha256] SPACE 8×8 grid of 4-char cell digests`.

`frameFor()` (`render-transition-matrix.mjs:152-164`) samples `enter` at frames 0/5/10/15/20,
`exit` at 40/45/50/55/60, `cut` at 50/55/60/65/70 — so **no mode is exempt** from a mount-position
change; all three place their window inside a clip's own Sequence.

---

## 9. Constraints and risks

**The single biggest risk: the 300-cell golden re-baseline is the only instrument that can prove
this change is neutral, and it is a judgement call, not a pass/fail.** 60 cells are *expected* to
move and 240 are *expected* not to; the reviewer has to look at every moved cell and decide
whether it is the intended consequence of a mount-position change or a real regression. The
programme has already been burned three times by a written count being trusted instead of
re-derived, and the margin that separates a real regression (8×8 mean delta 1-2) from the flake
(0.0183) is small. Stage 1.2's acceptance criterion — *the assembly lands with zero kinds
migrated and every golden byte-identical* — exists specifically to isolate this, and it must not
be skipped or merged into Stage 2.

The risk this document was expected to find largest — *a second public-contract flip inside one
phase* — measures much smaller than feared: the census found **zero brand-owned references to the
node contract in either brand repo, and no brand-registered transition kind at all** (§8.5). The
flip is public in the type system and, today, private in practice. Stage 1's additivity remains
the mitigation for anything the census could not see.

Other risks, in order:

1. **Structural constancy is a discipline, not a type.** §4.6. Mitigated by keeping shells in
   core, by two dev warnings, and by the derived identity test at Stage 1.3 — which must land
   *before* any kind migrates, or the ratchet does not exist.
2. **`post` is track-wide, not pair-scoped.** §5 cost 2. Needs the last-wins rule and a warning.
   The overlapping-boundary case is already pathological and already warned.
3. **`rgb-split` at 6 media elements** is worse than the investigation's headline number implies,
   and better than today only marginally. If the point of the whole exercise is preview
   performance, `rgb-split` needs the SVG-filter rewrite too, and that should be scoped in
   rather than discovered.
4. **240 cells "expected identical" is a prediction.** One render is not evidence, and neither
   is one gate run; the mitigation is Stage 1's byte-identical acceptance criterion, which tests
   the assembly independently of any kind's migration.
5. **The `checkerboard` carve-out is permanent** unless option 3 is taken. That is fine, and it
   should be written into `docs/creating-templates.md` rather than left in a report.
6. **`isolation: isolate` on the track wrapper is a real pixel risk** for any brand relying on a
   video-item `mixBlendMode` blending against the overlay track or the root background. Neither
   core nor (pending the census) either brand does — but it is the kind of thing that is only
   discovered by rendering, and it is unconditional by design (§2.6).
