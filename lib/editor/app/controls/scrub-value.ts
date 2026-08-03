/** Pixels of horizontal travel per `step` of value change. Four is tuned so a
 *  0.05-step field crosses its usual 0–2 working range in a comfortable drag
 *  rather than a flick. */
export const PX_PER_STEP = 4;

/** Number of decimal digits `step` itself carries, e.g. 3 for `0.125`. Used to
 *  pick a `toFixed` precision that actually matches the step's own grid — the
 *  `-log10(step)` shortcut this replaced silently truncated any step with
 *  three or more significant digits (`0.125` rounded to `0.13`). */
function decimalPlaces(n: number): number {
  const s = Math.abs(n).toString();
  const eIndex = s.indexOf('e-');
  if (eIndex !== -1) {
    const [mantissa, exp] = s.split('e-');
    const mantissaDecimals = mantissa.includes('.') ? mantissa.split('.')[1].length : 0;
    return Number(exp) + mantissaDecimals;
  }
  const dotIndex = s.indexOf('.');
  return dotIndex === -1 ? 0 : s.length - dotIndex - 1;
}

/** The value a scrub gesture lands on.
 *
 *  Pure on purpose: jsdom delivers no pointer events, so this is where the
 *  gesture's correctness is actually pinned. The component around it only
 *  translates events into `dx`.
 *
 *  It is the *delta* that gets snapped, not the absolute value: `start` is
 *  taken as already valid — it came from the config, or from a previous call
 *  to this same function — so only `steps * step` needs the `toFixed`
 *  float-dust cleanup (`0.1 + 0.2` is `0.30000000000000004` in raw float
 *  maths). Snapping the *absolute* result onto a grid anchored at zero
 *  instead would drag any off-grid `start` onto the nearest gridline on
 *  every call, including on zero travel — a press-and-release on a 42px
 *  font-size field (grid step 4) would silently commit 44. Clamping applies
 *  only where a bound is declared; an unbounded parameter is exactly the
 *  case a slider cannot serve and this control exists for. */
export function scrubValue(
  start: number,
  dx: number,
  step: number,
  opts: { min?: number; max?: number; fine?: boolean } = {},
): number {
  if (!Number.isFinite(start)) {
    if (opts.min !== undefined) return opts.min;
    if (opts.max !== undefined) return opts.max;
    return start;
  }
  if (!Number.isFinite(step) || step === 0) {
    // A zero (or non-finite) step has no grid to snap to; a `log10` of it
    // would previously throw. Fall through as an unquantised, still-clampable
    // no-op.
    let v = start;
    if (opts.min !== undefined) v = Math.max(opts.min, v);
    if (opts.max !== undefined) v = Math.min(opts.max, v);
    return v;
  }
  const rate = opts.fine ? PX_PER_STEP * 10 : PX_PER_STEP;
  const steps = Math.round(dx / rate);
  const decimals = Math.min(10, decimalPlaces(step) + 1);
  let v = Number((start + steps * step).toFixed(decimals));
  if (opts.min !== undefined) v = Math.max(opts.min, v);
  if (opts.max !== undefined) v = Math.min(opts.max, v);
  return v;
}
