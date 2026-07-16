// Structural parameter (not SegmentBase) so this function can also accept
// card / outro segments that live in individual templates without coupling
// lib/ to template-specific segment types. Templates pass `outroFrames`
// separately; clip/broll/multi-clip/card durations come from the segment.
export function segmentDurationFrames(
  seg: { type: string; trimIn?: number; trimOut?: number; durationMs?: number },
  fps: number,
  outroFrames: number,
): number {
  switch (seg.type) {
    case 'clip':
    case 'broll':
      // Match the Sequence length EXACTLY to OffthreadVideo's trimmed frame
      // count. ClipSegment/BrollSegment trim via trimBefore=round(trimIn*fps)
      // and trimAfter=round(trimOut*fps), so the video provides
      // round(trimOut*fps) - round(trimIn*fps) frames. Computing
      // round((trimOut-trimIn)*fps) can yield ONE MORE frame when the trim
      // endpoints straddle a half-frame (e.g. trimIn .75s → 382.5 rounds up),
      // leaving a trailing BLACK frame at the cut. Round each endpoint first.
      return Math.round((seg.trimOut ?? 0) * fps) - Math.round((seg.trimIn ?? 0) * fps);
    case 'multi-clip':
    case 'card':
      return Math.round(((seg.durationMs ?? 0) / 1000) * fps);
    case 'outro':
      return outroFrames;
  }
  throw new Error(`Unknown segment type: ${seg.type}`);
}

export function totalDurationFrames(
  segments: Array<{ type: string; trimIn?: number; trimOut?: number; durationMs?: number }>,
  fps: number,
  outroFrames: number,
): number {
  return segments.reduce((sum, s) => sum + segmentDurationFrames(s, fps, outroFrames), 0);
}
