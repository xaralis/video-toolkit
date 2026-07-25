/**
 * Pure helpers backing the Timeline's time ruler and click/drag-to-seek
 * transport. No React, no DOM — easy to unit test in isolation and reuse
 * from both the ruler renderer and the pointer-event handlers.
 */

/** "Nice" second intervals to choose from when spacing ruler ticks. */
const NICE_INTERVALS_SECONDS = [1, 2, 5, 10, 15, 30, 60];

/**
 * Formats a frame count as an `m:ss` timecode string, flooring to whole
 * seconds (never rounds up — a frame mid-second stays in that second).
 */
export function formatTimecode(frame: number, fps: number): string {
  const totalSeconds = Math.floor(frame / fps);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Maps a pointer's clientX to a frame position within a track, given the
 * track's left edge and width (from `getBoundingClientRect()`). Clamped to
 * `[0, totalFrames]` so drags outside the track bounds still resolve to a
 * valid frame instead of over/undershooting.
 */
export function frameFromClientX(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  totalFrames: number
): number {
  if (trackWidth <= 0) return 0;
  const ratio = (clientX - trackLeft) / trackWidth;
  const frame = Math.round(ratio * totalFrames);
  return Math.min(Math.max(frame, 0), totalFrames);
}

/**
 * Computes evenly spaced ruler tick positions across `totalFrames`, choosing
 * the smallest "nice" second interval (1, 2, 5, 10, 15, 30, 60s) that keeps
 * the tick count at or under `maxTicks`. Always includes a tick at frame 0;
 * the last tick never exceeds `totalFrames`.
 */
export function rulerTicks(
  totalFrames: number,
  fps: number,
  maxTicks = 8
): { frame: number; label: string }[] {
  if (totalFrames <= 0 || fps <= 0) {
    return [{ frame: 0, label: formatTimecode(0, fps) }];
  }

  const totalSeconds = totalFrames / fps;
  const minIntervalSeconds = totalSeconds / maxTicks;
  const intervalSeconds =
    NICE_INTERVALS_SECONDS.find((s) => s >= minIntervalSeconds) ??
    NICE_INTERVALS_SECONDS[NICE_INTERVALS_SECONDS.length - 1];
  const intervalFrames = intervalSeconds * fps;

  const ticks: { frame: number; label: string }[] = [];
  for (let frame = 0; frame <= totalFrames; frame += intervalFrames) {
    const rounded = Math.round(frame);
    ticks.push({ frame: rounded, label: formatTimecode(rounded, fps) });
  }
  return ticks;
}
