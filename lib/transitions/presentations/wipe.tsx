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
// PHASE 5 TASK 2.2 — `composite` → `plan` (the single-mount contract). Both
// inputs are ALREADY MOUNTED; this styles them rather than instantiating them.
// The sheet is no longer a JSX sibling drawn between two `AbsoluteFill`s — it is
// a media-free `over` PLATE, the SAME single `interpolate` computing its
// position it always did (`wipe.tsx:48-52` in the pre-migration file). The
// occlusion argument that made the old from/to MOUNT-SWAP safe (design §3 row
// 17: "the occluded side is fully covered by the sheet at every `p` where it is
// hidden") is exactly what makes an OPACITY swap pixel-identical to it now: at
// any progress, exactly one of `from`/`to` is visible and the sheet fully
// covers the frame at the swap instant (`p === 0.5`), so switching which side
// is opacity-1 there is invisible, precisely as switching which side was MOUNTED
// there was invisible before.
//
// AT A REEL EDGE (Task 2.2 fix round, Important 3) — this node does NOT force
// a null side's opacity to a flat `0` the way `pixelate.tsx` (same task, same
// mechanism otherwise) does. That is a deliberate difference, not an
// oversight, and it turns on ONE property: `from`/`to` here are STRICTLY
// COMPLEMENTARY — at every progress exactly one of them is `1` and the other
// `0` — never both visible at once. So when a null side (materialised by core
// as an `EdgePlate`, design §2.5) is asked to rise to opacity 1, it only ever
// does so at the exact instant the REAL side has already dropped to `0`, and
// that swap instant sits behind the sheet's own full coverage
// (`translateX(0%)` at progress 0.5, the SAME frame `to`'s opacity flips) —
// so the materialised plate steps into the missing clip's role exactly the
// way the seven lifted one-sided presentations' own trailing-edge test
// already exercises ("the background plate follows the entering curve, same
// as a real clip would"), not a premature reveal.
//
// `pixelate`'s curves are NOT complementary — both sides can be `1`
// simultaneously (a genuine cross-dissolve/blend), and nothing covers the
// swap — so applying the same treatment there composited a flat colour
// directly against still-fully-visible real content, which was Task 2.2's
// actual defect. `wipe` was never at risk of that class of bug: forcing a
// flat `0` here would be an unforced change to a picture that is already
// correct (and is asserted so — see `at-cut-transitions.test.tsx`'s
// "wipe reveals the theme background behind the departing sheet at the
// trailing edge, not before").
import type { TransitionNode, TransitionPlanProps, TransitionComposite } from '../../theming/transitions';
import { interpolate } from 'remotion';

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

  // NO HOOKS — a `plan` is a plain function (design's contract), never a
  // component. `interpolate` is a pure Remotion helper, not a hook, so this
  // needed no change to become plan-legal.
  const plan = ({ progress }: TransitionPlanProps): TransitionComposite => {
    // ONE continuous sheet motion across the whole window, passing through full
    // cover at the midpoint — BYTE-IDENTICAL arithmetic to the pre-migration
    // composite. `dir === 'left'` means the sheet travels leftwards: it enters
    // from the right (+100% → 0%), then continues left off-frame (0% → -100%),
    // so it covers and uncovers from the same edge.
    const offsetPct = interpolate(
      progress,
      [0, 0.5, 1],
      dir === 'left' ? [100, 0, -100] : [-100, 0, 100],
    );
    return {
      // The swap is hidden exactly as it always was: at progress 0.5 the sheet
      // covers the frame exactly, so which side is opaque there is invisible.
      from: { style: { opacity: progress < 0.5 ? 1 : 0 } },
      to: { style: { opacity: progress < 0.5 ? 0 : 1 } },
      // A single `over` plate — above BOTH clips, the same stacking the old
      // composite's trailing `<AbsoluteFill style={{backgroundColor,...}}/>`
      // sibling had (drawn after both inputs in tree order).
      layers: [
        {
          key: 'sheet',
          z: 'over',
          style: { backgroundColor: color, transform: `translateX(${offsetPct}%)` },
        },
      ],
    };
  };

  return { plan };
};
