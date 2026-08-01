// THE REEL'S EDGES, as a picture (Phase 4 Task 2.2).
//
// A transition is an operation on TWO pictures. At the reel's leading edge
// there is no outgoing clip, and at its trailing edge no incoming one — which
// is why `TransitionNodeProps.from`/`to` are nullable. Until this task the
// missing side was simply not drawn, and every kind whose EXITING branch is
// the identity function therefore did NOTHING as a `transitionOut`: `fade`,
// `dissolve`, `fade-to-color` with no colour, `burn`, `clock-wipe`, `iris`,
// `gradient-wipe`, and
// `checkerboard` (which drew no grid there at all).
//
// The model's answer is that the missing neighbour IS the composition
// background: a fade against `null` is a fade to `theme.background`. That makes
// the "trailing edge fade" that lib/render/video-track-layout.ts has always
// claimed in a comment true for the first time.
//
// THE COLOUR IS ALWAYS PASSED IN, never chosen here. Core owns no colour
// vocabulary — a literal `#000` in this file would be precisely the brand leak
// the theming programme exists to remove. It arrives as
// `TransitionNodeProps.background`, threaded from `CompositionTheme.background`
// (layered-composition → buildVideoNodes → AtCutTransition → the node). A
// caller with no background in scope gets `transparent`, which paints nothing
// and leaves whatever sits behind the video track showing — the pre-2.2 pixel.
//
// This module lives in lib/transitions, not lib/render, so that BOTH sides can
// use it: lib/render/at-cut-transitions.tsx already imports `../transitions`,
// and a native node under ./presentations can import it without a cycle.
import React from 'react';
import { AbsoluteFill } from 'remotion';

/** The composition background, as a full-frame picture a transition can
 *  composite against. */
export const EdgePlate: React.FC<{ background: string }> = ({ background }) => (
  <AbsoluteFill style={{ backgroundColor: background }} />
);

// PHASE 5 TASK 5 — `edgeInput` DELETED. It resolved a `composite` node's
// nullable `from`/`to` React-subtree input to the background plate
// (`input ?? plate`, deliberately not a truthiness test, since a legitimate
// input can be any ReactNode) — `fromRemotionPresentation`'s only caller
// (`lib/render/at-cut-transitions.tsx`), which is deleted with it. A reel
// edge's missing side is now materialised as an `EdgePlate` TIMELINE SIBLING
// (`video-track.tsx`'s `edge()`), reached through the same `LayerShell` a
// real clip is — the `plan` arm's answer to the same problem, already true
// for every kind that had migrated before this task. `git grep -n edgeInput`
// before this task found no other caller, in core or either brand repo.
