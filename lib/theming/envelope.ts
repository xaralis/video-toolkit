// The shared appear/hold/disappear clock for timeline overlays.
//
// Every overlay mounted on the overlay track lives inside a Sequence spanning
// exactly its [startMs, endMs) window, and every one of them wants the same
// three things: a local frame counter, a trapezoid opacity envelope, and the
// two ramp progresses to key slides/scales off. Before this, each overlay
// hand-rolled it — with different ramp constants and, worse, two different
// latent bugs:
//
//   1. A fixed-length envelope (the campaign chevron's 12/60/18 = 90 frames)
//      ignores the item's own span, so a SHORT item is hard-cut mid-hold by its
//      Sequence and its fade-out never runs.
//   2. A span-relative envelope written as a bare 4-point interpolate throws
//      ("inputRange must be strictly monotonically increasing") as soon as the
//      span is shorter than fadeIn + fadeOut.
//
// This module fixes both by making the ramps span-aware: they are scaled down
// proportionally when they would not fit, so the envelope degrades smoothly
// instead of clipping or throwing.
//
// It is also the first real implementation of the `reveal` / `hide` knobs on
// OverlayRenderProps, which until now were declared and threaded but never
// honoured by anything shared.
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

/** Ramp lengths used when a caller doesn't specify — a quick, unobtrusive
 *  in and a slightly softer out (the asymmetry most overlays already used). */
export const DEFAULT_FADE_IN_FRAMES = 8;
export const DEFAULT_FADE_OUT_FRAMES = 12;

export interface OverlayEnvelopeOptions {
  /** The item's own span. Usually `item.endMs - item.startMs`. */
  durationMs: number;
  /** Offset of the appear point from the enclosing Sequence's start. Usually 0:
   *  core's overlay track already mounts each item in a Sequence that IS its
   *  window, so passing the item's absolute start here would double-gate it. */
  appearAtMs?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  /** OverlayRenderProps.reveal — 'none' shows the overlay instantly (no in-ramp). */
  reveal?: 'line' | 'all' | 'none';
  /** OverlayRenderProps.hide — 'none' cuts at the end (no out-ramp). */
  hide?: 'fade' | 'none';
}

export interface OverlayEnvelope {
  /** False outside [appearAt, appearAt + duration]; callers return null. */
  visible: boolean;
  /** Frames since the appear point (negative before it). */
  localFrame: number;
  /** The span in frames — the envelope's full length. */
  spanFrames: number;
  /** 0→1 across the in-ramp, then pinned at 1. Key entry slides/scales to this. */
  enterProgress: number;
  /** 0 until the out-ramp starts, then 0→1. Key exit slides to this. */
  exitProgress: number;
  /** The trapezoid: 0 → 1 over the in-ramp, 1 through the hold, → 0 over the out-ramp. */
  opacity: number;
  phase: 'before' | 'in' | 'hold' | 'out' | 'after';
}

const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Frame-math core, split out from the hook so it is callable from tests
 *  without a Remotion render context. */
export function overlayEnvelope(
  frame: number,
  fps: number,
  opts: OverlayEnvelopeOptions,
): OverlayEnvelope {
  const { durationMs, appearAtMs = 0, reveal, hide } = opts;

  const start = Math.round((appearAtMs / 1000) * fps);
  const spanFrames = Math.round((durationMs / 1000) * fps);
  const localFrame = frame - start;

  const empty: OverlayEnvelope = {
    visible: false, localFrame, spanFrames,
    enterProgress: 0, exitProgress: 0, opacity: 0, phase: 'before',
  };
  if (spanFrames <= 0) return empty;
  if (localFrame < 0) return empty;
  if (localFrame > spanFrames) return { ...empty, phase: 'after' };

  // 'none' switches a ramp off entirely; otherwise the caller's length wins.
  const wantIn = reveal === 'none' ? 0 : (opts.fadeInFrames ?? DEFAULT_FADE_IN_FRAMES);
  const wantOut = hide === 'none' ? 0 : (opts.fadeOutFrames ?? DEFAULT_FADE_OUT_FRAMES);

  // Span-aware: ramps that don't fit are scaled down proportionally rather than
  // overrunning the span (which is what produced the hard cut / the throw).
  const wanted = wantIn + wantOut;
  const overflows = wanted > spanFrames;
  const scale = overflows && wanted > 0 ? spanFrames / wanted : 1;
  const fadeIn = wantIn * scale;
  const fadeOut = wantOut * scale;

  // A switched-off ramp is pinned, not interpolated: with no in-ramp the
  // overlay is fully entered from frame 0, and with no out-ramp it never
  // starts exiting — it simply stops being visible past the span (a cut).
  const enterProgress = fadeIn > 0
    ? interpolate(localFrame, [0, fadeIn], [0, 1], CLAMP)
    : 1;
  const exitProgress = fadeOut > 0
    ? interpolate(localFrame, [spanFrames - fadeOut, spanFrames], [0, 1], CLAMP)
    : 0;

  // Two ramps that both exist and don't touch take the single 4-point
  // interpolate — the exact expression the per-overlay implementations used, so
  // converting an overlay to this hook is pixel-identical at its old ramp
  // constants. The degenerate cases (a zero-length ramp, or ramps scaled to meet
  // in the middle) would make that call's inputRange non-monotonic and throw, so
  // they take the product form, which is the same curve wherever both are defined.
  const separateRamps = fadeIn > 0 && fadeOut > 0 && fadeIn < spanFrames - fadeOut;
  const opacity = separateRamps
    ? interpolate(localFrame, [0, fadeIn, spanFrames - fadeOut, spanFrames], [0, 1, 1, 0], CLAMP)
    : enterProgress * (1 - exitProgress);

  const phase: OverlayEnvelope['phase'] =
    localFrame < fadeIn ? 'in'
    : localFrame >= spanFrames - fadeOut ? 'out'
    : 'hold';

  return { visible: true, localFrame, spanFrames, enterProgress, exitProgress, opacity, phase };
}

/** The hook form — reads the frame and fps from the enclosing Sequence. */
export function useOverlayEnvelope(opts: OverlayEnvelopeOptions): OverlayEnvelope {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return overlayEnvelope(frame, fps, opts);
}
