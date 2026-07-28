// lib/transitions/presentations/wipe.tsx
//
// A NATIVE TWO-INPUT NODE (Phase 4 Task 2.1), not a one-sided
// `TransitionPresentation`. `wipe` is the clearest case in core's defect family
// that the model, not the code, was wrong: it is a TWO-BEAT design — a coloured
// sheet sweeps IN over the outgoing clip, then sweeps OUT to reveal the incoming
// one — and the two beats are SEQUENTIAL. Asked to draw itself one side at a
// time, both beats ran over the same window with the entering half on top, so
// its sheet already sat at translateX(0%) at progress 0: the frame flashed to
// the accent colour on the transition's first frame and the outgoing clip's own
// half of the sweep was never seen at all.
//
// With both inputs in hand there is nothing to reconcile. One window, one
// continuous sheet motion, and the swap happens behind the sheet at the
// midpoint where nothing is visible.
import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type { TransitionNode, TransitionNodeProps } from '../../theming/transitions';

export type WipeProps = {
  /** The sweeping sheet's colour, as a CSS colour (hex, rgb(), …). This used to
   *  be a three-value enum over one brand's palette, with a name→hex map right
   *  here in the shared presentation; the schema now carries a brand
   *  ACCENT-SLOT KEY and `lib/render/at-cut-transitions.tsx` resolves it
   *  against the brand's own palette before calling in. */
  color?: string;
  direction?: 'left' | 'right';
};

/** Used when no colour is supplied (or the brand's palette has no slot under
 *  the configured key). Pure black, not a near-black brand tint: it reads as a
 *  wipe against almost any footage without asserting a brand colour, and has
 *  no provenance beyond "black". */
const DEFAULT_COLOR = '#000';

export const wipe = (props: WipeProps = {}): TransitionNode => {
  const color = props.color ?? DEFAULT_COLOR;
  const dir = props.direction ?? 'left';

  const composite: React.FC<TransitionNodeProps> = ({ from, to, progress }) => {
    // ONE continuous sheet motion across the whole window, passing through full
    // cover at the midpoint. `dir === 'left'` means the sheet travels leftwards:
    // it enters from the right (+100% → 0%), then continues left off-frame
    // (0% → -100%), so it covers and uncovers from the same edge.
    //
    // THIS IS THE SEQUENCING. A single interpolate with a midpoint knot is what
    // makes the two beats consecutive rather than simultaneous.
    const offsetPct = interpolate(
      progress,
      [0, 0.5, 1],
      dir === 'left' ? [100, 0, -100] : [-100, 0, 100],
    );
    // The swap is hidden: at progress 0.5 the sheet covers the frame exactly, so
    // switching inputs there is invisible. A null input simply leaves the
    // composition background showing for its own beat — a reel edge needs no
    // special case.
    return (
      <AbsoluteFill>
        <AbsoluteFill>{progress < 0.5 ? from : to}</AbsoluteFill>
        <AbsoluteFill style={{ backgroundColor: color, transform: `translateX(${offsetPct}%)` }} />
      </AbsoluteFill>
    );
  };

  return { composite };
};
