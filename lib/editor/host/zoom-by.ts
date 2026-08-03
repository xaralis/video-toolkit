// lib/editor/host/zoom-by.ts — the pure clamp-and-report-what-happened maths
// behind EditorHost's `zoomBy`. Pulled out of the component so the achieved-
// ratio behaviour (the fix for the toolbar-zoom overshoot/stale-anchor bugs)
// is unit-testable without mounting the whole editor.

/** Multiplies `current` by `factor`, clamped to `[min, max]`, and reports the
 *  ACHIEVED ratio — `next / current` — not the requested `factor`.
 *
 *  The two differ exactly at the clamp boundary: at `current = 350`, `factor
 *  = 1.25` requests 437.5 but clamps to 400, an achieved ratio of ~1.143, not
 *  1.25. A caller that anchors a zoom (`LayeredTimelineHandle.zoomAtCenter`)
 *  on the REQUESTED factor overshoots — roughly 200px of drift was measured
 *  on a 2000px content offset from exactly this gap. `ratio === 1` is the
 *  no-op case (already at `min`/`max`, or `factor` is 1) — callers should
 *  treat that as "clear any pending anchor", not "anchor at a same-value
 *  zoom". */
export function zoomByClamped(
  current: number,
  factor: number,
  min: number,
  max: number,
): { next: number; ratio: number } {
  const next = Math.min(max, Math.max(min, current * factor));
  return { next, ratio: current !== 0 ? next / current : 1 };
}
