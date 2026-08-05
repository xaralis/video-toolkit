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
 *     fill and an unboxed `ink-2` label (both parts — kind AND frame count,
 *     see below), so a half-second join stops being the highest-contrast
 *     thing on screen, louder than the shots it joins.
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
  // Same token as the kind, not `ink-3`: the frame count is read, not merely
  // decorative ("the length is what you check once you have found it" still
  // means it gets READ), and `ink-3` on `shell` measures 3.48:1 — under the
  // 4.5:1 AA floor. The scan hierarchy is carried by typeface and tracking
  // (mono digits vs. uppercase tracked-out sans) and the 5px gap, not by a
  // second, dimmer colour — the colour axis here is already spoken for by
  // state (accent selected / warn starved), and doubling it as emphasis is
  // what produced the sub-AA value in the first place.
  const frameCls = starved ? 'ed:text-warn' : 'ed:text-ink-2';

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
        className={`ed:block ed:self-end ed:mb-[2px] ed:cursor-pointer ${glyphCls}`}
        style={{ width: '100%', minWidth: GLYPH_MIN_WIDTH_PX, height: 11, flex: 'none' }}
      >
        <path d="M0 0 L100 100 L100 0 L0 100 Z" />
      </svg>
      {/* The label: unboxed, no pill, vertically centred in the lane
          (inherited from the row's own `items-center`, independent of the
          glyph's floor-anchored position). Deliberately NOT
          `pointer-events-none`: a click on the label text must select the
          transition exactly as a click on the glyph does. xzdarcy's action
          wrapper attaches `onClick` to the action's own root div and this
          label renders as a normal DOM descendant of it (via
          `getActionRender` in LayeredTimeline.tsx), so the click bubbles up
          and reaches `onClickAction` even though the label visually
          overhangs the action's own box (`.vt-transition-action` lifts
          `overflow: hidden` for exactly this reason) — DOM hit-testing and
          bubbling follow the element's own rendered position, not the
          ancestor's clipped box, so no geometric hit-test in the library is
          involved.
          Trade-off accepted: the label now swallows clicks anywhere in the
          strip of lane it overhangs, so clicking there selects the
          transition instead of scrubbing the playhead (`onClickTimeArea`).
          That's the point of this change. It also means two transitions
          placed closer together than their labels are wide will have
          overlapping labels — already-accepted behaviour — and the
          topmost (later-rendered) one wins the click. */}
      <div
        data-testid="transition-label"
        className="ed:flex ed:items-center ed:gap-[5px] ed:ml-1 ed:whitespace-nowrap ed:cursor-pointer"
        style={{ flex: 'none' }}
      >
        <span className={`ed:font-sans ed:text-[9px] ed:uppercase ed:tracking-[0.09em] ${kindCls}`}>{kind}</span>
        <span className={`ed:font-mono ed:text-[9px] ${frameCls}`}>{frames}f</span>
      </div>
    </div>
  );
}
