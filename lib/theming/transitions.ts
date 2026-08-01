// lib/theming/transitions — the TRANSITION extension axis.
//
// The last extension axis to get a registry. Until Phase 4 a
// transition resolved through a module-private table in
// lib/render/at-cut-transitions.tsx with NO theme surface at all: a brand that
// wanted its own look had to edit three core files, which is how one brand's
// colour word ended up frozen into core's public vocabulary as a kind of its
// own. That kind is gone (Phase 4); this registry is where its replacement
// belongs.
//
// Resolution is the ONE rule from ./registry.ts — brand registration wins, core
// generic beneath, a registration with only `config` does NOT mask the generic,
// and a kind neither side has resolves to nothing (a hard cut) rather than
// throwing. The dev warning in lib/render/transition-record.ts is what keeps
// that silence from being invisible.
//
// WHY THE RENDERER IS NOT A REACT COMPONENT. A transition does not draw; it
// hands back the NODE `AtCutTransition` should drive at the boundary. That
// return value is a plain object, not a ReactNode, so it cannot be an
// `React.FC`. That is exactly why `Registration` takes the renderer type as a
// parameter — see the note there.
//
// TWO INPUTS, ONE PROGRESS (Phase 4 Task 1.3). A transition is one node with
// TWO inputs (outgoing A, incoming B) and ONE progress value across the
// boundary — the arity every mature plugin API (OFX, AVX, FxPlug) uses to tell
// a transition from an effect. It is invoked ONCE per boundary with
// `(from, to, progress)` and returns one frame. It is NOT invoked twice with a
// `direction`, which is `TransitionSeries`' shape and was the root of core's
// defect list: a two-input operation asked to draw itself one side at a time.
//
// A renderer may still return the ONE-SIDED `AnyPresentation` shape — the five
// official `@remotion/transitions` presentations are one-sided, and so is every
// brand registration written against the Task 1.2 contract. Core LIFTS those
// into the two-input form with `fromRemotionPresentation`
// (lib/render/at-cut-transitions.tsx), so nothing that already worked has to
// change. `TransitionNode` is the shape a natively two-input presentation
// returns instead.
import React from 'react';
import type { Registration, Registry } from './registry';
import type { AccentSlot } from './palette';
import type { Transition } from '../reel-config-base/transition-schema';

/** A Remotion transition presentation plus the props it was built with — the
 *  shape `@remotion/transitions`' own presentations return, and what
 *  `TransitionLayer` invokes.
 *
 *  DEFINED HERE, not in lib/render, because `BrandTheme` (this directory) has
 *  to name it and lib/theming is imported BY lib/render, never the reverse.
 *  `lib/render/at-cut-transitions.tsx` re-exports it, so every existing import
 *  path still resolves. */
export type AnyPresentation = { component: React.ComponentType<any>; props: Record<string, unknown> };

/** The prop bag every transition renderer receives. Mirrors the other axes: the
 *  authored item (here the transition record itself), what the renderer needs
 *  from the composition, and the brand's opaque per-kind config. */
export interface TransitionRenderProps {
  /** The authored transition — `frames` plus whatever params its kind declares.
   *  For a BRAND kind those params survive the parse (`BrandTransitionSchema`
   *  is `.passthrough()`), so the brand's own renderer can read them. */
  transition: Transition;
  /** Composition pixel size — `clock-wipe` and `iris` size their mask off it. */
  width: number;
  height: number;
  /** The brand's accent palette: the only place a schema's colour KEY becomes a
   *  hex. Empty (never undefined) when the composition has no palette. */
  palette: readonly AccentSlot[];
  /** Opaque brand config off this kind's registration. */
  config?: unknown;
}

/** The prop bag a TWO-INPUT transition node is invoked with — ONE call per
 *  boundary, per frame.
 *
 *  `from`/`to` being NULLABLE is what makes the reel's leading and trailing
 *  edges fall out of the model instead of needing special cases: a trailing-edge
 *  transition is one with `to === null`, a leading-edge one has `from === null`,
 *  and a dissolve against `null` is a dissolve to the composition background.
 *  Core passes the null; what a node does with it is the node's decision — and
 *  since Task 2.2 core's own answer, for every kind it lifts and for
 *  `checkerboard`, is `edgeInput(input, background)`: the missing neighbour is
 *  a plate of `background`. */
export interface TransitionNodeProps {
  /** The OUTGOING clip (A), already carrying its own time base. Null at the
   *  reel's leading edge — there is no predecessor. */
  from: React.ReactNode | null;
  /** The INCOMING clip (B). Null at the reel's trailing edge. */
  to: React.ReactNode | null;
  /** 0..1 across the boundary. CLAMPED BY CORE — a node must never clamp, and
   *  several of core's own presentations (`whipPan`, `zoomThrough`) rely on that
   *  because they set no `extrapolateLeft`/`Right`. */
  progress: number;
  /** The boundary's length in frames (what the transition's `frames` authored). */
  durationInFrames: number;
  /** Composition pixel size and rate — `clock-wipe`/`iris` size their mask off it. */
  width: number;
  height: number;
  fps: number;
  /** The brand's accent palette. Empty (never undefined) when there is none. */
  palette: readonly AccentSlot[];
  /** The composition background — `CompositionTheme.background`, threaded down
   *  by `buildVideoNodes`. This is what a null input RESOLVES TO: at the reel's
   *  trailing edge a fade fades to this colour, at its leading edge it fades
   *  out of it. `'transparent'` when the caller has none in scope, which paints
   *  nothing and leaves whatever is behind the video track showing.
   *
   *  A node must never substitute a colour of its own — core owns no colour
   *  vocabulary. `edgeInput` (lib/transitions/edge-plate.tsx) is the shared
   *  helper that turns a null input into this plate. */
  background: string;
}

// THE SINGLE-MOUNT CONTRACT (Phase 5 Task 1.1). Added ADDITIVELY: `TransitionNode`
// widens from a single shape to a union, and every existing `{ composite }` node
// keeps type-checking unchanged (the `plan?: never` member makes an object
// literal that omits `plan` still assignable). Nothing renders through the
// `plan` arm yet — that starts at Task 1.2. See
// docs/superpowers/phase5-single-mount-design.md §2.3 for the design.
//
// NAMING NOTE: the design doc's §2.3 names the per-frame plan-invocation prop
// bag `TransitionRenderProps` — but that identifier is already this file's
// public export (the renderer-SELECTION prop bag: `transition`,
// `width`, `height`, `palette`, `config`, consumed by `TransitionRenderer`).
// Reusing it here would be a duplicate top-level export, not a shadow — a hard
// compile error, not a style question. This task renames the NEW type to
// `TransitionPlanProps` (parallel to the existing `TransitionNodeProps` for the
// `composite` arm) and keeps everything else verbatim. The existing
// `TransitionRenderProps` is untouched, per this task's additive-only mandate.

/** What the node is told about one side of the boundary. NOT a ReactNode: the
 *  layer is ALREADY MOUNTED and the node styles it.
 *
 *  PHASE 5 TASK 1.4 — `source: 'clip' | 'edge'` REMOVED. It was dead (core's
 *  `handleFor` in `lib/render/video-track.tsx` always passed `'clip'`;
 *  `git grep "source: 'edge'"` over `lib/` — plus every consuming brand
 *  repo — returns nothing) and, more to the point, redundant: `from === null`
 *  / `to === null` (on `TransitionPlanProps`) already tell a node its side is
 *  the reel edge, and the materialised edge plate (`edge()` in
 *  `video-track.tsx`) reaches the node's `from`/`to` op through the SAME
 *  `LayerShell` a real clip does, so `style`/`z`/`ghosts`/`wrap` all apply to
 *  it exactly as they do to a clip. A third nullability state was never
 *  needed; the field was. See `docs/superpowers/phase5-single-mount-design.md`
 *  §2.3/§2.5, corrected in the same commit. */
export interface LayerHandle {
  /** The layer's own frame range, in BOUNDARY coordinates — how much handle it
   *  actually has. `[0, frames]` for a full-window side; a shorter range is how
   *  a node can see that the outgoing clip expires before progress 1. */
  readonly range: readonly [number, number];
}

/** ONE call per boundary per frame. BOTH sides. ONE progress. Unchanged
 *  semantics; `from`/`to` are handles instead of subtrees. Named
 *  `TransitionPlanProps`, not `TransitionRenderProps` — see the naming note
 *  above. */
export interface TransitionPlanProps {
  /** The OUTGOING side (A). `null` at the reel's LEADING edge. */
  from: LayerHandle | null;
  /** The INCOMING side (B). `null` at the reel's TRAILING edge. */
  to: LayerHandle | null;
  /** 0..1 across the boundary. CLAMPED BY CORE — a node must never clamp. */
  progress: number;
  /** Boundary-relative frame. Passed explicitly because a plan is a plain
   *  function and cannot call `useCurrentFrame()`. */
  frame: number;
  durationInFrames: number;
  params: Record<string, unknown>;
  config?: unknown;
  dims: { width: number; height: number; fps: number };
  palette: readonly AccentSlot[];
  background: string;
}

/** The live progress a `wrap` needs, delivered by CONTEXT rather than a prop or
 *  a closure.
 *
 *  MOVED HERE FROM `lib/render/video-track-plan.tsx` (Phase 5 Task 4). Until
 *  this task, every `wrap`-needing kind was a LIFTED one-sided
 *  `@remotion/transitions` presentation, and the lift (`wrapRemotionPresentation`
 *  in `lib/render/at-cut-transitions.tsx`) is what built the `Wrap` component —
 *  entirely inside `lib/render`, so the context never had to be reachable from
 *  `lib/transitions/presentations`. `checkerboard` (Task 4) is the first NATIVE
 *  node whose OWN factory needs to build a `wrap` (its `'fade'` path masks the
 *  incoming clip with an SVG `<mask>`, which only `wrap` can express — see
 *  `LayerOp.wrap`'s doc comment) — and a native node's factory lives in
 *  `lib/transitions/presentations`, a layer BELOW `lib/render` by this file's
 *  own stated rule ("`lib/theming` is imported BY `lib/render`, never the
 *  reverse", this file's header comment). Defining the context here, where
 *  `TransitionPlanProps`/`LayerOp` already live, keeps that direction intact:
 *  `lib/render/video-track-plan.tsx` re-exports both symbols unchanged, so
 *  every existing import path (`@video-toolkit/lib/render/video-track-plan`)
 *  still resolves.
 *
 *  `LayerOp.wrap`'s prop type is fixed at `{active, children}` — deliberately,
 *  because a `wrap` must be a STABLE reference for an item's whole life, and
 *  `transitionNodeFor`'s memoization can hand the IDENTICAL cached
 *  `TransitionNode` — and therefore the identical `wrap` reference — to TWO
 *  DIFFERENT boundaries whose authored config happens to be byte-identical. A
 *  `wrap` implementation that needs the live progress cannot close over it
 *  either, for the same reason. Context sidesteps this because each
 *  `LayerShell` instance provides its OWN value at its OWN tree position —
 *  scoped by the TREE, never by the `Wrap` component's identity. */
export interface ActiveTransitionProgress {
  /** 0..1, clamped — the same value `LayerShell`'s own boundary saw this frame
   *  from `plan()`. Meaningless while `active` is false; a `wrap` must not
   *  read it then. */
  readonly progress: number;
  /** Boundary-relative frame — mirrors `TransitionPlanProps.frame`. */
  readonly frame: number;
  readonly durationInFrames: number;
}
const INACTIVE_PROGRESS: ActiveTransitionProgress = { progress: 0, frame: 0, durationInFrames: 0 };
export const ActiveTransitionProgressContext =
  React.createContext<ActiveTransitionProgress>(INACTIVE_PROGRESS);
/** Read by a `wrap` implementation that needs this frame's live progress —
 *  see the context's own doc comment for why this is a context, not a prop or
 *  a closure. */
export function useActiveTransitionProgress(): ActiveTransitionProgress {
  return React.useContext(ActiveTransitionProgressContext);
}

/** How one already-mounted layer is treated. */
export interface LayerOp {
  /** Merged onto the layer's shell. */
  style?: React.CSSProperties;
  /** Stacking relative to the other side. Default: `to` over `from`. */
  z?: number;
  /** EXTRA styled copies of this layer. Each entry is one extra MOUNT of the
   *  clip. `ghosts.length` MUST NOT vary with `progress` — a varying count is
   *  an element-count change mid-window, i.e. the remount this whole phase
   *  exists to remove. STALE AS OF PHASE 5 TASK 4 (corrected in place): this
   *  comment used to say "nothing consumes `ghosts` yet" — `rgb-split` (Task
   *  3) was the first to, and `checkerboard`'s `'scale'`/`'flip'` carve-out
   *  (Task 4, `gridSize²` entries) is the second. The invariant IS enforced —
   *  `auditGhosts` in `lib/render/video-track-plan.tsx` dev-warns when a live
   *  boundary's `ghosts.length` varies with `progress` — and is exercised by
   *  `lib/editor/src/video-track-remount.test.tsx`'s identity ratchet and
   *  `dev-warnings.test.tsx`. */
  ghosts?: readonly React.CSSProperties[];
  /** Component form, for a shell no style can express (an SVG `mask`/
   *  `foreignObject`; the route `fromRemotionPresentation` uses starting at
   *  Stage 2.1). Core mounts a declared `wrap` for the ITEM'S WHOLE LIFE, not
   *  only while this boundary is live: `active` is `true` for the frames
   *  inside the window and `false` outside it, and a `wrap` that must be
   *  inert when `active` is false renders `children` unchanged.
   *
   *  PHASE 5 TASK 1.4 — WHY `active` EXISTS AND WHY MOUNTING IS LIFE-LONG.
   *  Before this task, `wrap` was applied only for the frames a live
   *  boundary actually returned one — so the element type at `children`'s
   *  tree position changed at BOTH window edges (absent outside, present
   *  inside), which remounts the clip: the exact defect class this phase
   *  removes, reached through the CONTRACT rather than the assembly (Task
   *  1.2's finding, unreachable then because no kind produced a plan; the
   *  first kind to reach it is Stage 2.1's `fromRemotionPresentation` lift).
   *  Mounting life-long and letting `active` carry the in/out-of-window
   *  distinction is what keeps the element type constant across both edges.
   *
   *  MUST render `children` exactly once, and MUST be a STABLE component
   *  reference for the item's whole mounted life — not merely across the
   *  window's own frames, now that the mount outlives the window — because a
   *  fresh reference on any frame remounts the subtree. THIS IS ENFORCED BY
   *  NOTHING IN THIS REPO AUTOMATICALLY; there is no dev warning for it (only
   *  `ghosts`-count variance and a second live `post` get one, in
   *  `lib/render/video-track-plan.tsx`). What DOES catch a violation is
   *  `lib/editor/src/video-track-remount.test.tsx`'s derived DOM-identity
   *  ratchet, for any kind that has migrated to the `plan` arm — a fresh
   *  reference collapses its base-mount-persistence check to an empty
   *  intersection within a couple of frames. */
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
  /** Applied to the WHOLE video track for this window. At most one live
   *  boundary may set it; a second is dev-warned and the later wins. */
  post?: React.CSSProperties;
}

/** A natively TWO-INPUT transition: either the declarative `plan` form (the
 *  single-mount contract this phase migrates every kind to) or the JSX
 *  `composite` form (Task 1.3's shape, retained through the staged migration
 *  and removed at its end). A node supplies exactly one.
 *
 *  `composite?: never` (on the `plan` arm) is what rejects a FRESH LITERAL
 *  supplying both `plan` and `composite` instead of silently picking one —
 *  verified by deleting it (`transition-single-mount-types.test.ts`'s
 *  double-field literal pin goes red). `plan?: never` (on the `composite`
 *  arm) is NOT independently exercised by that same literal pin — deleting
 *  it alone there stays green, because a fresh literal's excess-property
 *  check treats `plan` as non-excess as long as it is declared SOMEWHERE in
 *  the union, so `composite?: never` alone already carries that particular
 *  test. `plan?: never` has its OWN pin instead, one a fresh literal cannot
 *  exercise: a DECLARED (non-literal) value shaped like a composite node,
 *  whose `plan` key holds something other than `never`, is accepted by a
 *  composite-only type and rejected only because `plan?: never` is present —
 *  ordinary structural typing tolerates a value's extra properties, but not
 *  when the target itself declares that key. Both members are therefore
 *  pinned, by two different tests exercising two different TypeScript
 *  mechanisms; keep both.
 *
 *  Narrow with `typeof node.plan === 'function'`, NOT `'plan' in node`:
 *  `plan?: never` being OPTIONAL means `{ composite: X, plan: undefined }` —
 *  a plausible shape for a spread-built node — has the `plan` KEY present
 *  without a callable VALUE, and `'in'` would take the wrong branch for it.
 *  `isTransitionNode` below and `AtCutTransition`
 *  (`lib/render/at-cut-transitions.tsx`) both use `typeof` for this reason.
 *
 *  Structurally distinguishable from `AnyPresentation` by having neither a
 *  `component` nor a `props` field. */
export type TransitionNode =
  | { plan: (props: TransitionPlanProps) => TransitionComposite; composite?: never }
  | { composite: React.ComponentType<TransitionNodeProps>; plan?: never };

/** What a renderer may hand back: a two-input node, or a one-sided Remotion
 *  presentation that core lifts into one. */
export type ResolvedTransition = AnyPresentation | TransitionNode;

/** True for the two-input shape — either arm of the `TransitionNode` union. A
 *  structural test, not a tag, so a brand can build a node as a plain object
 *  literal without importing a constructor. Widened in Task 1.1 to also accept
 *  the `plan` arm: it previously pattern-matched on `composite` alone, which
 *  would have misclassified a `plan`-only node as `AnyPresentation`. */
export function isTransitionNode(r: ResolvedTransition): r is TransitionNode {
  const n = r as TransitionNode;
  return typeof n.composite === 'function' || typeof n.plan === 'function';
}

/** What a registered transition kind resolves to. Returning `null` means "no
 *  transition" — the boundary is a hard cut, which is how core's own `cut`
 *  entry behaves.
 *
 *  The return type WIDENED in Task 1.3 (`AnyPresentation` → `ResolvedTransition`).
 *  That direction is backwards-compatible: a brand renderer that still returns
 *  `AnyPresentation | null` is assignable here unchanged, and core lifts its
 *  result. No brand registration needs to be migrated. */
export type TransitionRenderer = (props: TransitionRenderProps) => ResolvedTransition | null;

/** One transition kind's registration. Built on the shared `Registration`
 *  primitive, so this axis resolves through `resolveRegistered` like the other
 *  four — and, like them, a registration with NO `renderer` contributes
 *  `config`/`params` only and does NOT mask the core generic for that kind.
 *
 *  Like `Registration`, deliberately NOT open with an index signature: a typo'd
 *  `renderer` must not compile clean and silently drop the brand's transition
 *  back into core's generic (or, for a brand-only kind, into a hard cut). */
export interface TransitionRegistration extends Registration<TransitionRenderProps, TransitionRenderer> {
  renderer?: TransitionRenderer;
}

/** ONE open-keyed transition registry. Keys are transition kinds — core's own
 *  (to override the generic) or the brand's own (which core has never heard
 *  of). Declaring a kind here is ALSO what stops it warning as unrecognised at
 *  render time (lib/render/transition-record.ts). */
export type TransitionRegistry = Registry<TransitionRenderProps, TransitionRenderer>;
