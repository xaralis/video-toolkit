// The two SVG path builders the timeline's audio blocks draw with, split out of
// their components so they can be unit-tested directly — and, more to the point,
// so a test can MOCK this module and prove the components no longer rebuild
// these strings on every playback frame (see timeline-paths.test.tsx).
//
// WHY THIS EXISTS AT ALL (measured 2026-08-04, on a real project, Chrome at 4x
// CPU throttle): xzdarcy's Timeline re-renders when its time state changes, and
// the playhead is driven through `TimelineState.setTime` once per frame during
// playback — so its `getActionRender` callback re-ran for EVERY block, 30 times
// a second, rebuilding every one of these strings from scratch. Instrumented,
// that came to 219 Waveform renders/second emitting ~60,000 path segments/second
// on an 8-block reel, none of which can change while the playhead moves. It was
// the single largest application-level cost in the CPU profile (783 ms self time
// in a 22 s trace, ahead of every other non-idle app function), and turning the
// drawing off in a position-controlled A/B lifted playback from 6.1 to 9.6 fps.
//
// The components are wrapped in React.memo, which is what actually skips the
// work; keeping the maths here is what makes that skip observable in a test
// rather than a claim.

/** One vertical bar per peak, as a single `M…L…` path.
 *
 *  `startIdx` is the peak index the block's source in-point falls on and
 *  `count` how many peaks its visible span covers; peaks past the end of the
 *  array read as 0 (a block trimmed past its source draws a flat line rather
 *  than throwing). */
export function waveformPath(
  peaks: Float32Array,
  startIdx: number,
  count: number,
  width: number,
  height: number,
): string {
  const mid = height / 2;
  const step = width / count;
  let d = '';
  for (let i = 0; i < count; i++) {
    const p = peaks[startIdx + i] ?? 0;
    const x = i * step;
    const h = p * mid;
    d += `M${x.toFixed(1)},${(mid - h).toFixed(1)}L${x.toFixed(1)},${(mid + h).toFixed(1)}`;
  }
  return d;
}

/** Bar width follows the SPACING, so a short block and a long one read with the
 *  same weight. The viewBox is a fixed `width` units wide however many peaks go
 *  into it, so a hard-coded strokeWidth would make density a function of block
 *  length: a 3s bed (step 8.3) drew hairlines covering ~12% of the width while a
 *  54s music bed (step 0.46) drew overlapping strokes that merged into a solid
 *  mass. That difference reads as "the music is more visible" and no amount of
 *  opacity fixes it. 0.7 leaves a hairline gap between bars so the shape stays
 *  legible instead of becoming a filled block. */
export function waveformBarWidth(count: number, width: number): number {
  return Math.max(0.6, (width / count) * 0.7);
}

/** The derived music envelope as a STAIRCASE: horizontal at the previous level,
 *  then a vertical step to the new one at each boundary frame. */
export function envelopePath(
  points: ReadonlyArray<{ frame: number; gain: number }>,
  totalFrames: number,
  width: number,
  height: number,
  minDb: number,
  maxDb: number,
): string {
  const x = (f: number) => (f / totalFrames) * width;
  // linear gain → dB → the shared scale fraction (matches VolumeLine).
  const y = (g: number) => {
    const db = g <= 0 ? minDb : 20 * Math.log10(g);
    const frac = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
    return height - frac * 96 - 2;
  };
  let d = `M${x(points[0].frame).toFixed(1)},${y(points[0].gain).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += `L${x(points[i].frame).toFixed(1)},${y(points[i - 1].gain).toFixed(1)}`;
    d += `L${x(points[i].frame).toFixed(1)},${y(points[i].gain).toFixed(1)}`;
  }
  return d;
}
