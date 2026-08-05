// Leaf primitives shared by layered-adapter.ts, refusal.ts, and
// block-reason.ts. Deliberately import-free of all three (and of anything
// else under src/timeline) so none of them can form a cycle through this
// module — that's the whole reason it exists.
//
// Task 2 fix-round: layered-adapter.ts and refusal.ts had grown a genuine
// import cycle (refusal.ts importing `parseActionId`/`LaneId` from
// layered-adapter.ts, then layered-adapter.ts importing the refusal
// predicates back to delegate to them). It worked today only because
// neither side touches the other's bindings at module-eval time — but
// refusal.ts DOES have module-level code (`LOCKED_LANES`), and the moment
// that set is rewritten to derive from `LANES` instead of string literals,
// the cycle becomes a real TDZ hazard that a bundler-driven dev server can
// hit even where a test runner's more forgiving module graph does not. This
// module removes the cycle mechanically — no behaviour change, no relocation
// of any rule.

// Display order, top → bottom (NLE convention): overlays highest, then video
// and its audio directly stacked, then the music bed, then brand marks.
// Transitions sit ABOVE video so the video track and its (linked) audio stay
// adjacent as one visual group.
export const LANES = ['overlays', 'transitions', 'video', 'audio', 'music', 'brand'] as const;
export type LaneId = (typeof LANES)[number];

// Exported: layered-adapter.ts's `layeredToTimeline` mints these same ids on
// the way IN (deriving a transitions-lane action from a video item), while
// `parseActionId` below parses them back on the way out — both must agree on
// the literal prefix, so there is exactly one definition.
export const TRANSITION_PREFIX = 'transition:';
export const TRANSITION_IN_PREFIX = 'transition-in:';

export function parseActionId(actionId: string): { lane: LaneId; id: string; edge?: 'in' | 'out' } {
  // Check transition-in: first — it's a distinct prefix (not a suffix
  // extension of transition:), but ordering here keeps the intent explicit.
  if (actionId.startsWith(TRANSITION_IN_PREFIX)) {
    return { lane: 'transitions', id: actionId.slice(TRANSITION_IN_PREFIX.length), edge: 'in' };
  }
  if (actionId.startsWith(TRANSITION_PREFIX)) {
    return { lane: 'transitions', id: actionId.slice(TRANSITION_PREFIX.length), edge: 'out' };
  }
  const i = actionId.indexOf(':');
  return { lane: actionId.slice(0, i) as LaneId, id: actionId.slice(i + 1) };
}

// Minimum TIMELINE length (ms) a clip/broll can be trimmed, resized, or split
// down to. Shared by layered-adapter.ts's resize/split logic and
// block-reason.ts's edge-block predicate, which must agree on the same floor.
export const MIN_CLIP_MS = 100;
