/**
 * Structural segment shape — mirrors Timeline's `Segment`. Deliberately not
 * importing the full reel-config-base segment union so this module stays
 * decoupled from any one template's segment variants.
 */
export type Segment = {
  id: string;
  type: string;
  source?: string;
  trimIn?: number;
  trimOut?: number;
  durationMs?: number;
};

export type TrimEdge = 'start' | 'end';

export interface ApplyTrimOptions {
  fps: number;
}

/** Minimum effective duration (trimOut - trimIn), in seconds, per segment type. */
const MIN_TRIM_DURATION_SEC: Record<'clip' | 'broll', number> = {
  clip: 0.5,
  broll: 3.0,
};

/** Minimum `durationMs` for multi-clip/card segments. */
const MIN_DURATION_MS = 1000;

/**
 * applyTrim — pure reducer for a single drag-to-trim gesture.
 *
 * Converts `deltaFrames` (the incremental pixel-delta of a drag, already
 * translated to frames by the caller) to seconds via
 * `deltaFrames / opts.fps`, then returns a NEW segment object with the
 * relevant field adjusted:
 *
 *  - clip / broll: dragging the `end` handle adjusts `trimOut` by +Δsec;
 *    dragging `start` adjusts `trimIn` by +Δsec. The effective duration
 *    (`trimOut - trimIn`) is floored (broll ≥ 3.0s, clip ≥ 0.5s) — the
 *    moved edge stops at the floor rather than crossing it (dragging the
 *    end shorter stops at `trimIn + floor`; dragging the start later stops
 *    at `trimOut - floor`). `trimIn` is additionally never allowed below 0.
 *  - multi-clip / card: dragging `end` adjusts `durationMs` by +Δsec*1000,
 *    clamped to a minimum of 1000ms. Dragging `start` is a no-op — these
 *    segment types have no in-point to trim.
 *  - outro and any other/unknown segment type: returned unchanged.
 *
 * Never mutates `seg`.
 */
export function applyTrim(
  seg: Segment,
  edge: TrimEdge,
  deltaFrames: number,
  opts: ApplyTrimOptions
): Segment {
  const deltaSec = deltaFrames / opts.fps;

  if (seg.type === 'clip' || seg.type === 'broll') {
    const floor = MIN_TRIM_DURATION_SEC[seg.type];
    const trimIn = seg.trimIn ?? 0;
    const trimOut = seg.trimOut ?? 0;

    if (edge === 'end') {
      const trimOutFloor = trimIn + floor;
      return { ...seg, trimOut: Math.max(trimOut + deltaSec, trimOutFloor) };
    }

    const trimInCeiling = trimOut - floor;
    const nextTrimIn = Math.min(trimIn + deltaSec, trimInCeiling);
    return { ...seg, trimIn: Math.max(nextTrimIn, 0) };
  }

  if (seg.type === 'multi-clip' || seg.type === 'card') {
    if (edge === 'end') {
      const durationMs = seg.durationMs ?? 0;
      return {
        ...seg,
        durationMs: Math.max(durationMs + deltaSec * 1000, MIN_DURATION_MS),
      };
    }
    return { ...seg };
  }

  return { ...seg };
}
