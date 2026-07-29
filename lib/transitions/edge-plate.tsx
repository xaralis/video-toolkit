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

/** A transition input, with a reel edge resolved to the background plate.
 *  `input ?? plate` — deliberately NOT a truthiness test, because a legitimate
 *  input can be any ReactNode. */
export function edgeInput(input: React.ReactNode | null, background: string): React.ReactNode {
  return input === null || input === undefined ? <EdgePlate background={background} /> : input;
}
