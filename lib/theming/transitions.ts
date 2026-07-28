// lib/theming/transitions — the TRANSITION extension axis.
//
// The sixth axis, and the last one to get a registry. Until Phase 4 a
// transition resolved through a module-private table in
// lib/render/at-cut-transitions.tsx with NO theme surface at all: a brand that
// wanted its own look had to edit three core files, which is how `fade-coal`
// (one brand's colour word) ended up frozen into core's public vocabulary.
//
// Resolution is the ONE rule from ./registry.ts — brand registration wins, core
// generic beneath, a registration with only `config` does NOT mask the generic,
// and a kind neither side has resolves to nothing (a hard cut) rather than
// throwing. The dev warning in lib/render/transition-record.ts is what keeps
// that silence from being invisible.
//
// WHY THE RENDERER IS NOT A REACT COMPONENT. A transition does not draw; it
// hands back the presentation `AtCutTransition` should wrap the item's own
// Sequence in, in both directions, driven off useCurrentFrame(). That return
// value (`AnyPresentation`) is a plain object, not a ReactNode, so it cannot be
// an `React.FC`. That is exactly why `Registration` takes the renderer type as
// a parameter — see the note there.
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

/** What a registered transition kind resolves to. Returning `null` means "no
 *  presentation" — the boundary is a hard cut, which is how core's own `cut`
 *  entry behaves. */
export type TransitionRenderer = (props: TransitionRenderProps) => AnyPresentation | null;

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
