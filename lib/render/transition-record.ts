// The "is this a real transition?" gate. Pure — no Remotion — so it unit-tests
// with no mock at all. (Remotion-importing modules ARE testable in core too, via
// `vi.mock('remotion')` — see at-cut-transitions.test.tsx; being pure is a
// convenience here, not a necessity.) The Remotion presentation mapping lives in
// ./at-cut-transitions.tsx.
//
// This file used to carry its OWN structural copy of the transition shape,
// "mirroring" lib/editor/app/transitions.ts. It no longer does: the vocabulary
// has one home (lib/reel-config-base/transition-schema.ts) and this module just
// narrows it.
import type { Transition } from '../reel-config-base/transition-schema';

/** A transition that actually renders something — everything except `cut`. */
export type TransitionRecord = Exclude<Transition, { kind: 'cut' }>;

// A transitionOut/transitionIn field is only a REAL transition when it's
// present and not `cut` (`undefined` and `{ kind: 'cut' }` both mean "no
// transition here" — same as today's default). The parameter stays loose
// because a rendered literal is not necessarily schema-validated: a project's
// Root.tsx is hand-edited, so this gate is the last line before the renderer.
export function getTransitionRecord(raw: Transition | Record<string, unknown> | undefined): TransitionRecord | undefined {
  if (!raw) return undefined;
  const kind = (raw as { kind?: unknown }).kind;
  if (!kind || kind === 'cut') return undefined;
  return raw as TransitionRecord;
}
