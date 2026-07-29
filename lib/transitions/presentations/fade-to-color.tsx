// lib/transitions/presentations/fade-to-color.tsx
//
// A DIP TO COLOUR — the outgoing clip is covered by a colour, and the incoming
// one resolves out of it. A native two-input node (Phase 4 Task 2.3).
//
// WHY THIS EXISTS. Core's catalog used to carry a fade kind named after ONE
// BRAND'S COLOUR WORD — its own near-black — frozen permanently into core's
// PUBLIC vocabulary, because before Task 1.2 there was nowhere else for a brand
// to put a look of its own. Worse, it never dipped to anything: it was
// `() => fade()`, the same plain crossfade as `fade` and `dissolve`, byte for
// byte, under a label promising a dip.
//
// The fix is not a rename. A MISLEADING NAME IS USUALLY A MISSING PARAMETER:
// what that kind lacked was an exposed COLOUR. That colour is a brand
// ACCENT-SLOT KEY, resolved against the brand's own palette in
// `lib/render/at-cut-transitions.tsx` before it reaches this file — so a brand
// that wants a dip through its near-black declares that slot in its own palette
// and writes `{ kind: 'fade-to-color', color: '<its key>' }`, and core never
// learns the word. The old kind is GONE from core, not aliased: core ships the
// mechanism, the brand supplies the colour.
//
// NO COLOUR MEANS NO DIP, and that is load-bearing rather than defensive: the
// renderer only builds this node when a colour actually resolved, and falls
// back to the plain `fade()` presentation otherwise. Core inventing a colour for
// a key the brand never declared — including a "neutral" default of its own —
// is the brand leak this programme exists to remove.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { TransitionNode, TransitionNodeProps } from '../../theming/transitions';
import { edgeInput } from '../edge-plate';

export type FadeToColorProps = {
  /** The colour dipped through, as a CSS colour (hex, `rgb()`, …). Already
   *  resolved: the SCHEMA carries a brand accent-slot key, and
   *  `lib/render/at-cut-transitions.tsx` turns it into this hex where the
   *  palette is in scope. */
  color: string;
};

/** The colour's opacity, and the incoming clip's, at `progress`. Two beats over
 *  one window, the shape every NLE's "dip to colour" uses:
 *
 *  - first half — the colour covers the outgoing clip (0 → 1);
 *  - second half — the colour holds at full, and the incoming clip resolves out
 *    of it (0 → 1).
 *
 *  Module-local: the curve is pinned through the DOM, on the opacities the node
 *  actually renders, rather than by calling this directly — "the number is
 *  right" and "the number reaches the picture" are the same assertion for a node
 *  that closes over its params. */
function fadeToColorOpacities(progress: number): { color: number; incoming: number } {
  return {
    color: Math.min(1, progress * 2),
    // Held at 0 until the colour has fully covered, so the midpoint IS the
    // colour and nothing of the outgoing clip bleeds through the second beat.
    incoming: Math.max(0, progress * 2 - 1),
  };
}

export const fadeToColor = ({ color }: FadeToColorProps): TransitionNode => {
  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress, background }) => {
    const opacity = fadeToColorOpacities(progress);
    return (
      <AbsoluteFill>
        <AbsoluteFill>{edgeInput(from, background)}</AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: color, opacity: opacity.color }} />
        <AbsoluteFill style={{ opacity: opacity.incoming }}>{edgeInput(to, background)}</AbsoluteFill>
      </AbsoluteFill>
    );
  };
  return { composite };
};
