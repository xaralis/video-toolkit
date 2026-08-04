// The ONE place a clip's two time domains are converted between.
//
// A video item carries a TIMELINE span (`startMs`/`endMs` — where it sits in the
// reel) and a SOURCE span (`sourceInMs`/`sourceOutMs` — what it plays from the
// file). Their ratio is the playback speed; see ./speed.ts. Both are plain
// numbers of milliseconds, which is exactly why they were added to each other in
// five different places: while every trim moved the two in lockstep the ratio
// was always 1 and the conflation was invisible.
//
// It stopped being invisible when speed became reachable. On a broll slowed to
// 0.5x the right trim handle stopped half way through the footage, and the
// commit rewrote `endMs` to the length the clip would have had at 1x — so
// dragging the edge outward made the clip SHORTER and reset its speed. Each
// retry converged it further toward 1x, which is why it read as flakiness.
//
// Callers should reach for the four derived quantities below rather than the two
// raw conversions: "how far may this edge travel" and "what source frame shows
// at this timeline position" are the questions the adapter actually asks, and
// naming them is what leaves no arithmetic to get wrong.
import { deriveSpeed } from './speed';

/** The four fields this module reads. Structural on purpose — every caller has
 *  a full `VideoItem`, but nothing here needs `kind`, `id` or the transitions,
 *  and a narrow parameter keeps the unit tests free of item fixtures. */
export type ClipSpans = {
  startMs: number;
  endMs: number;
  sourceInMs: number;
  sourceOutMs: number;
};

/** Source milliseconds → the timeline milliseconds they occupy. A slowed clip
 *  (speed < 1) stretches: less source fills more timeline. */
export function sourceToTimelineMs(item: ClipSpans, sourceMs: number): number {
  return sourceMs / deriveSpeed(item);
}

/** Timeline milliseconds → the source milliseconds they consume. */
export function timelineToSourceMs(item: ClipSpans, timelineMs: number): number {
  return timelineMs * deriveSpeed(item);
}

/** How far the LEFT edge may travel left before running out of source, in
 *  timeline ms. Never negative. */
export function headroomTimelineMs(item: ClipSpans): number {
  return sourceToTimelineMs(item, Math.max(0, item.sourceInMs));
}

/** How far the RIGHT edge may travel right before running out of source, in
 *  timeline ms.
 *
 *  `Infinity` when the footage length is unknown — the same contract
 *  `footageCapsById` and `slipVideoItem` already keep, and for the same reason:
 *  an unmeasured source must not clamp anything, because the only number
 *  available to guess with is the item's own out-point, which is where the
 *  out-point happens to sit and not how long the file is. An estimate must not
 *  masquerade as a limit.
 *
 *  Clamped at 0 rather than going negative for an out-point authored PAST the
 *  file (a real shape in these projects: file 10.042 s, authored 10.3 s). */
export function tailroomTimelineMs(item: ClipSpans, footageMs: number | undefined): number {
  if (!footageMs || footageMs <= 0) return Infinity;
  return sourceToTimelineMs(item, Math.max(0, footageMs - item.sourceOutMs));
}

/** The source position showing at an ABSOLUTE timeline position — the split
 *  point. `atMs` is in reel coordinates, not relative to the clip. */
export function sourceAtTimelineMs(item: ClipSpans, atMs: number): number {
  return item.sourceInMs + timelineToSourceMs(item, atMs - item.startMs);
}
