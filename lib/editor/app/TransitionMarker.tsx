/**
 * The transitions lane's marker — a bowtie.
 *
 * Two wedges meeting at the centre of the transition is the shape every NLE
 * uses for a dissolve, and it does two jobs the old near-white pill-on-a-bar
 * did separately and too loudly:
 *
 *   - it draws the transition's TRUE span itself — the glyph's own width IS
 *     the duration (`viewBox="0 0 100 100"` + `preserveAspectRatio="none"` +
 *     a 100%-of-container width, not a fixed one, so it stretches with the
 *     action box and the wedges always meet in the middle). There is no
 *     separate span bar or leg pair any more — the glyph carries that job.
 *   - it does it at rest-level volume: a dimmed `--color-transition-marker`
 *     fill and an unboxed, `ink-2`/`ink-3` label, so a half-second join stops
 *     being the highest-contrast thing on screen, louder than the shots it
 *     joins.
 *
 * The label sits beside the glyph — kind first (uppercase, tracked out, the
 * thing you scan for), then the frame count in the mono family (the thing
 * you check once you've found it) — and is allowed to overhang the action
 * box exactly as the old pill was: `.vt-transition-action` in
 * LayeredTimeline.tsx lifts the timeline library's own `overflow: hidden` on
 * the action box for this reason and must keep doing so.
 *
 * A transition is short by nature — 15 frames is half a second, ~12px at the
 * default zoom — so at real zoom levels the glyph itself will often be
 * thinner than the label next to it. `GLYPH_MIN_WIDTH_PX` keeps a very short
 * transition at a zoomed-out scale from disappearing outright; anything
 * shorter than that overhangs its own action box the same way the label does.
 */

/** Floor under the glyph's rendered width, in px, so a transition too short
 *  to draw at the current zoom still shows a wedge rather than nothing. */
const GLYPH_MIN_WIDTH_PX = 4;

export function TransitionMarker({
  kind,
  frames,
  selected,
  starvedMessage,
}: {
  kind: string;
  frames: number;
  /** Fills the glyph with the editor accent and brings the kind label to
   *  full brightness. No outline — a 12px glyph can't show one legibly. */
  selected?: boolean;
  /** Present when this transition cannot get the frames it asks for; its
   *  text is the diagnostic shown on hover, and the glyph + label both move
   *  to the `warn` token. */
  starvedMessage?: string;
}) {
  const title = starvedMessage ?? `${kind} · ${frames} frames`;
  const starved = Boolean(starvedMessage);

  const glyphCls = starved
    ? 'ed:fill-warn'
    : selected
      ? 'ed:fill-accent'
      : 'ed:fill-transition-marker ed:opacity-80';
  const kindCls = starved ? 'ed:text-warn' : selected ? 'ed:text-ink' : 'ed:text-ink-2';
  const frameCls = starved ? 'ed:text-warn' : 'ed:text-ink-3';

  return (
    <div className="ed:relative ed:h-full ed:w-full ed:flex ed:items-center" title={title}>
      {/* The glyph: two wedges meeting at the centre, drawn to the
          transition's true span. `flex: none` freezes its width at exactly
          the container's own width (the transition's real duration in px)
          instead of letting flexbox negotiate it down to share space with
          the label — the label overhangs instead. */}
      <svg
        data-testid="transition-glyph"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={`ed:block ed:self-end ed:mb-[2px] ${glyphCls}`}
        style={{ width: '100%', minWidth: GLYPH_MIN_WIDTH_PX, height: 11, flex: 'none' }}
      >
        <path d="M0 0 L100 100 L100 0 L0 100 Z" />
      </svg>
      {/* The label: unboxed, no pill, vertically centred in the lane
          (inherited from the row's own `items-center`, independent of the
          glyph's floor-anchored position). */}
      <div
        data-testid="transition-label"
        className="ed:flex ed:items-center ed:gap-[5px] ed:ml-1 ed:whitespace-nowrap ed:pointer-events-none"
        style={{ flex: 'none' }}
      >
        <span className={`ed:font-sans ed:text-[9px] ed:uppercase ed:tracking-[0.09em] ${kindCls}`}>{kind}</span>
        <span className={`ed:font-mono ed:text-[9px] ${frameCls}`}>{frames}f</span>
      </div>
    </div>
  );
}
