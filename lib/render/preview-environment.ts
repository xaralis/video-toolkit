// ONE named, exported predicate for "are we inside an interactive Remotion
// surface" — the Player or Studio — as opposed to `renderMedia`/`renderStill`/
// a `<Still>` extracting frames off-thread.
//
// WHY THIS EXISTS (Task R1). Two fixes that live beside this file
// (`video-track.tsx`'s `ItemBody`, and the boundary Sequence's `premountFor`)
// exist ONLY to smooth a real `<video>` element's DOM lifecycle in a live
// browser tab — re-fetching and re-seeking on every transition boundary,
// which is invisible where frames are extracted independently of any DOM
// (render), but is a visible background-colour flash and a stall in the
// Player/Studio. THE CONTROLLER'S DECISION was to gate those two fixes on
// this predicate rather than ship them universally: the defect is
// preview-only BY CONSTRUCTION, so scoping the fix to preview is not a hack —
// it is what keeps every rendered pixel byte-identical to the pre-fix render
// path, by construction, with zero brand-migration cost (see
// docs/superpowers/sdd/2026-07-26-phase4-node-contract/task-R1-report.md).
//
// ONE PREDICATE, not an inline `getRemotionEnvironment().isPlayer ||
// .isStudio` at each call site: two checks that are supposed to say the same
// thing but drift apart is this programme's most-repeated defect shape (see
// CONSTRAINTS.md, "PIN THE WIRING, NOT JUST THE PURE FUNCTION" and the
// `two checks that should agree` framing in the Task R1 brief). One decider,
// one place, both call sites import it.
import { getRemotionEnvironment } from 'remotion';

/** True inside the Remotion `<Player>` or Remotion Studio; false during
 *  `renderMedia`/`renderStill`/a `<Still>`, and false in any environment
 *  Remotion has not stamped `window.remotion_isPlayer` /
 *  `window.remotion_isStudio` onto (e.g. a plain unit test, unless the test
 *  mocks `getRemotionEnvironment` itself). */
export function isPreviewEnvironment(): boolean {
  const env = getRemotionEnvironment();
  return env.isPlayer || env.isStudio;
}
