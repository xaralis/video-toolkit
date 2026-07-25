/**
 * Pure helper for formatting frame counts as timecodes. No React, no DOM —
 * easy to unit test in isolation and reuse across editor hosts.
 */

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
