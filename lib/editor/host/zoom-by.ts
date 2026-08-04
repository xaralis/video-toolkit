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

/** Ref-backed wrapper around `zoomByClamped` so that several calls landing in
 *  the SAME tick (a fast trackpad pinch, or a burst of ⌘/Ctrl+wheel notches —
 *  see `zoomFactorFor`) compound against each other instead of against a
 *  stale value.
 *
 *  A React `useState` value read from a render closure does not change until
 *  the next commit, so a callback that reads it directly sees the SAME base
 *  for every call in a burst: `setScaleWidth(base*f1)`, then
 *  `setScaleWidth(base*f2)` — last write wins, and every factor before the
 *  final one is silently dropped. `ref` holds the live value instead and is
 *  read AND written synchronously here, so N calls in one tick move it (and
 *  `commit`'s target, once React actually renders) by the PRODUCT of their
 *  achieved ratios. This is the invariant `accumulateZoom`
 *  (`LayeredTimeline.tsx`) depends on: it multiplies each capture's factor
 *  into the pending anchor correction on the assumption that the underlying
 *  scale actually moved by that same product — an assumption this function is
 *  what makes true.
 *
 *  Returns the ACHIEVED ratio for this one step (post-clamp), same contract
 *  as `zoomByClamped` — callers anchoring a zoom need the number that
 *  actually happened, not the request. */
export function zoomByRef(
  ref: { current: number },
  factor: number,
  min: number,
  max: number,
  commit: (next: number) => void,
): number {
  const { next, ratio } = zoomByClamped(ref.current, factor, min, max);
  if (next !== ref.current) {
    ref.current = next;
    commit(next);
  }
  return ratio;
}
