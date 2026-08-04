import { EDITOR_ACCENT } from '../host/ui';

/**
 * The transitions lane's marker.
 *
 * A transition is short by nature — 15 frames is half a second, ~12px at the
 * default zoom — so a label clipped to the marker's own width read "gra…" at
 * every zoom level anyone actually edits at, and the KIND (the one thing you
 * need to recognise a cut by) was invisible.
 *
 * So the two jobs are split:
 *
 *   ┌───────────────┐
 *   │ gradient-wipe │  ← the label floats free of the span, centered on the
 *   └───┬───────┬───┘    cut, sized to its text and allowed to overhang
 *       │       │      ← a leg at each end marks where the transition really
 *       └───────┘        starts and ends, and the bar is its true width
 *
 * The overhang is deliberate and is why the parent must not clip this node
 * (`.vt-transition-action` in GRIP_CSS lifts the timeline library's own
 * `overflow: hidden` on the action box). Two transitions closer together than
 * their labels are wide will overlap; that is accepted — an overlap is
 * legible and tells you they are close, whereas truncation told you nothing.
 */
export function TransitionMarker({
  kind,
  frames,
  selected,
  starvedMessage,
}: {
  kind: string;
  frames: number;
  /** Draws the selection outline on the label — the span is too thin to show one. */
  selected?: boolean;
  /** Present when this transition cannot get the frames it asks for; its text
   *  is the diagnostic shown on hover, and the label gets the muted-grip hatch. */
  starvedMessage?: string;
}) {
  const title = starvedMessage ?? `${kind} · ${frames} frames`;
  return (
    <div className="ed:relative ed:h-full ed:w-full" title={title}>
      {/* The true span: full width of the action, pinned to the row's floor so
          the label has the space above it. */}
      <div
        data-testid="transition-span"
        className="ed:absolute ed:left-0 ed:right-0 ed:bottom-0 ed:h-[3px] ed:bg-transition-marker ed:rounded-full"
      />
      {/* The legs. Same colour as the span, standing at its two ends — this is
          the only thing that still states the transition's actual duration
          once the label stops matching its width. */}
      <div
        data-testid="transition-leg"
        className="ed:absolute ed:left-0 ed:bottom-0 ed:w-[2px] ed:h-[7px] ed:bg-transition-marker ed:rounded-full"
      />
      <div
        data-testid="transition-leg"
        className="ed:absolute ed:right-0 ed:bottom-0 ed:w-[2px] ed:h-[7px] ed:bg-transition-marker ed:rounded-full"
      />
      {/* The label, centered on the cut and sized to its own text. */}
      <div
        data-testid="transition-label"
        className="ed:absolute ed:left-1/2 ed:-translate-x-1/2 ed:top-0 ed:flex ed:items-center ed:gap-1 ed:px-1.5 ed:rounded-full ed:bg-transition-marker ed:text-transition-marker-ink ed:font-sans ed:text-[10px] ed:leading-[11px] ed:py-[1px] ed:whitespace-nowrap"
        style={{ outline: selected ? `2px solid ${EDITOR_ACCENT}` : undefined, outlineOffset: -2 }}
      >
        {/* Same hatch vocabulary as a muted trim grip ("nothing more to take
            this way"): an opaque pill can't show `.vt-grip-muted` through its
            own background, so the rule rides on top as an overlay. */}
        {starvedMessage && <div className="vt-grip-muted ed:absolute ed:inset-0 ed:rounded-full" />}
        <span className="ed:relative">{kind}</span>
        {/* Muted, because the kind is what you scan for; the length is what you
            check once you have found it. */}
        <span className="ed:relative ed:opacity-70">{frames}f</span>
      </div>
    </div>
  );
}
