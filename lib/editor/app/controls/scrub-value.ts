/** Pixels of horizontal travel per `step` of value change. Four is tuned so a
 *  0.05-step field crosses its usual 0–2 working range in a comfortable drag
 *  rather than a flick. */
export const PX_PER_STEP = 4;

/** The value a scrub gesture lands on.
 *
 *  Pure on purpose: jsdom delivers no pointer events, so this is where the
 *  gesture's correctness is actually pinned. The component around it only
 *  translates events into `dx`.
 *
 *  Snapping to the `step` grid is not cosmetic — it is what keeps
 *  `0.30000000000000004` out of the saved config. Clamping applies only where
 *  a bound is declared; an unbounded parameter is exactly the case a slider
 *  cannot serve and this control exists for. */
export function scrubValue(
  start: number,
  dx: number,
  step: number,
  opts: { min?: number; max?: number; fine?: boolean } = {},
): number {
  const rate = opts.fine ? PX_PER_STEP * 10 : PX_PER_STEP;
  const steps = Math.round(dx / rate);
  const raw = start + steps * step;
  // Snap to the grid the step defines, anchored at zero.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  let v = Number((Math.round(raw / step) * step).toFixed(decimals));
  if (opts.min !== undefined) v = Math.max(opts.min, v);
  if (opts.max !== undefined) v = Math.min(opts.max, v);
  return v;
}
