import type { LayeredReel } from '../../../reel-config-base/layered-schema';

/** How much footage each clip/broll item actually has, keyed by item id.
 *
 *  The one place this is decided. It used to be computed twice — the timeline
 *  from `max(decoded, authored)`, the inspector from the decoded duration
 *  alone — and the two disagreed in both directions:
 *
 *  - A clip authored slightly PAST its file (a real case in these projects:
 *    seg-002, file 10.042s, authored 10.3s) could be extended to 10.3s by
 *    dragging its edge but not by the inspector, which stopped at 10.042s.
 *  - A clip added THIS SESSION has no decoded duration yet. The timeline fell
 *    back to the item's own `sourceOutMs`; the inspector left it UNCAPPED —
 *    the dangerous direction, since an uncapped edit can run past the end of
 *    the file and that only shows up as black frames in the finished render.
 *
 *  `max(decoded, authored)` is deliberate, not sloppy: `decoded` is what the
 *  file really holds and `authored` is what a human already committed to. A
 *  clip authored past its file can be trimmed and restored to that authored
 *  length; a normally-trimmed clip can be extended out to reveal its full real
 *  footage. Never past either.
 *
 *  An item with neither reading is ABSENT from the map rather than present
 *  with a zero — absence is `slipVideoItem`'s own contract for "footage length
 *  unknown, do not clamp", and a 0 would read as "no footage at all".
 *
 *  Deliberately NOT falling back to the item's CURRENT `sourceOutMs`. The
 *  timeline used to, for a clip added this session with nothing decoded yet —
 *  but that number is where the out-point happens to sit, not how long the
 *  file is. On a clip sped up to 200% it is half the real footage, so treating
 *  it as the ceiling makes resetting the speed back to 100% impossible: the
 *  restore wants source the guess says does not exist. An estimate must not
 *  masquerade as a limit. It never surfaced on the timeline because trimming
 *  an edge does not come back up from underneath; it surfaced the moment the
 *  same cap was handed to an operation that WIDENS the source window. */
export function footageCapsById(
  reel: LayeredReel,
  savedReel: LayeredReel | null | undefined,
  sourceDurations: Record<string, number> | undefined,
  // Typed by what the resolver NEEDS, not by the full item union: `videoUrl`
  // is declared over a structural `{ kind, source? }` and passing the union
  // through unchanged trips a weak-type check on the `multi-clip` member,
  // which has `sources` rather than `source`.
  videoUrl: (item: { kind: string; source?: string }) => string | null | undefined,
): Record<string, number> {
  const durations = sourceDurations ?? {};
  const savedOut = (id: string): number => {
    const s = savedReel?.tracks.video.find((v) => v.id === id);
    return s && (s.kind === 'clip' || s.kind === 'broll') ? s.sourceOutMs : 0;
  };
  const caps: Record<string, number> = {};
  for (const v of reel.tracks.video) {
    if (v.kind !== 'clip' && v.kind !== 'broll') continue;
    const url = videoUrl(v);
    const decoded = (url ? durations[url] : 0) || 0;
    const authored = savedOut(v.id);
    const cap = Math.max(decoded, authored);
    if (cap > 0) caps[v.id] = cap;
  }
  return caps;
}
