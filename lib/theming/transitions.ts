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
import type React from 'react';
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

/** A natively TWO-INPUT transition: one component that composites both inputs
 *  itself. Structurally distinguishable from `AnyPresentation` by its
 *  `composite` field, which is what lets one registry hold both shapes. */
export type TransitionNode = { composite: React.ComponentType<TransitionNodeProps> };

/** What a renderer may hand back: a two-input node, or a one-sided Remotion
 *  presentation that core lifts into one. */
export type ResolvedTransition = AnyPresentation | TransitionNode;

/** True for the two-input shape. A structural test, not a tag, so a brand can
 *  build a node as a plain object literal without importing a constructor. */
export function isTransitionNode(r: ResolvedTransition): r is TransitionNode {
  return typeof (r as TransitionNode).composite === 'function';
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
