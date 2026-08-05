import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { BlockReason } from './block-reason';
import { parseActionId, type LaneId } from './action-id';

/** Predicates for the refusals a command can hit, one function per command.
 *  Each command's early exit DELEGATES to its predicate (wired in Task 2) so
 *  the reason shown and the refusal applied come from one computation and
 *  cannot drift apart. A refusal is a value (`BlockReason`), never a sentence
 *  — see `app/block-reason-copy.ts` for the wording.
 *
 *  Naming: a code names the CONSTRAINT, not the gesture that hit it. `move`,
 *  `split`, and `duplicate` all refuse a non-video selection for the same
 *  reason (`video-only`) — one code, not three. The two exceptions both earn
 *  their split the way `slip-head-exhausted` / `footage-head-exhausted` did:
 *  `linked-audio` (a MOVE-only concern — split/duplicate/delete never see a
 *  standalone audio selection distinct from its clip) and
 *  `music-bed-undeletable` (delete's refusal is about deletability, not
 *  position — reusing `timeline-start`, which is about the pinned start
 *  edge, would say something false: the music bed's END is perfectly
 *  deletable-in-spirit via trimming, it's the ITEM that can't go away). The
 *  music bed's MOVE refusal, by contrast, reuses `timeline-start` on
 *  purpose — its existing copy ("The music bed is pinned to the start of the
 *  reel.") already says exactly the right thing for that gesture, and a
 *  second code for the same fact is the duplication this module exists to
 *  prevent. */

// Display-only lanes: their content is derived (brand marks, transition
// markers), never dragged by hand. Task 3 pointed the app layer's own
// `LayeredTimeline.tsx` at this single definition (`flexible`, trim-grip
// rendering, and `onActionMoving` all import it from here now) instead of
// keeping a second copy — see that file's `git blame` on the deleted local
// `LOCKED_LANES` for the one-task intermediate state this replaces.
export const LOCKED_LANES: ReadonlySet<LaneId> = new Set(['brand', 'transitions']);

/** Move/drag refusal. This is where the rule lives: `onActionMoving`
 *  (`LayeredTimeline.tsx`) delegates to it rather than carrying its own
 *  early exit, so there is exactly one place a move can be refused from. */
export function moveRefusal(args: { lane: LaneId; actionId: string; linkedAudioIds: ReadonlySet<string> }): BlockReason | null {
  const { lane, actionId, linkedAudioIds } = args;
  if (LOCKED_LANES.has(lane)) return 'locked-lane';
  // Music can be end-trimmed but never moved (it's pinned at 0) — reuses
  // `timeline-start`, see the module doc comment above.
  if (lane === 'music') return 'timeline-start';
  if (linkedAudioIds.has(actionId)) return 'linked-audio';
  return null;
}

// The kinds `splitItem` knows how to cut. Exported (not just inlined into
// splitRefusal) so `splitItem` can narrow `VideoItem` to this same union
// AT THE TYPE LEVEL after calling `splitRefusal` — the runtime check lives
// here exactly once; `splitItem` asserts it rather than re-checking it (see
// the cast site in layered-adapter.ts). If this ever disagreed with
// `splitRefusal`'s own check they could drift apart silently, which is why
// `splitRefusal` calls this function too instead of repeating the condition.
export function isSplittableKind(v: VideoItem): v is Extract<VideoItem, { kind: 'clip' | 'broll' }> {
  return v.kind === 'clip' || v.kind === 'broll';
}

/** Split (razor) refusal — mirrors `splitItem`'s early exits in
 *  `layered-adapter.ts:968,972,974`. An unresolvable `selectedId` (stale
 *  selection, item already gone) is not itself a named refusal: the command
 *  no-ops on it the same way, but there is nothing to tell the user beyond
 *  "there's nothing there", which is out of this plan's audited surface. */
export function splitRefusal(reel: LayeredReel, selectedId: string, atFrame: number, fps: number): BlockReason | null {
  const { lane, id } = parseActionId(selectedId);
  if (lane !== 'video') return 'video-only';
  const v = reel.tracks.video.find((x) => x.id === id);
  if (!v) return null;
  if (!isSplittableKind(v)) return 'unsplittable-kind';
  const atMs = Math.round((atFrame / fps) * 1000);
  // Matches the adapter's own boundary EXACTLY — a 1ms tolerance either side.
  if (atMs <= v.startMs + 1 || atMs >= v.endMs - 1) return 'playhead-outside-clip';
  return null;
}

/** Duplicate refusal — mirrors `duplicateItem`'s early exit in
 *  `layered-adapter.ts:1008`. Same `video-only` code as `splitRefusal`: both
 *  commands refuse a non-video selection for the identical reason. */
export function duplicateRefusal(reel: LayeredReel, selectedId: string): BlockReason | null {
  const { lane } = parseActionId(selectedId);
  if (lane !== 'video') return 'video-only';
  return null;
}

/** Delete refusal — mirrors `deleteItem`'s early exit in
 *  `layered-adapter.ts:908`. The reel is threaded through even though today
 *  only the lane matters, to keep the four predicates' signatures uniform
 *  for their callers and leave room for a future condition that needs it. */
export function deleteRefusal(reel: LayeredReel, selectedId: string): BlockReason | null {
  void reel;
  const { lane } = parseActionId(selectedId);
  if (lane === 'music') return 'music-bed-undeletable';
  return null;
}
