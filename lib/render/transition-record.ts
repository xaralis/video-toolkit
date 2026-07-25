// The "is this a real transition?" gate + its record type. Pure — no Remotion —
// so it can be unit-tested in core (which has no Remotion installed). The
// Remotion presentation mapping lives in ./at-cut-transitions.tsx.
//
// A transition, loosely typed to match the permissive `z.record(...)` shape
// `transitionOut`/`transitionIn` carry on the schema (lib/reel-config-base/
// layered-schema.ts) — mirrors lib/editor/app/transitions.ts's `Transition`.
export type TransitionRecord = Record<string, unknown> & {
  kind: string;
  frames?: number;
  direction?: string;
  from?: string;
  color?: string;
  softness?: number;
};

// A transitionOut/transitionIn field is only a REAL transition when it's
// present and not `cut` (the schema is permissive, so `undefined` and
// `{ kind: 'cut' }` both mean "no transition here" — same as today's default).
export function getTransitionRecord(raw: Record<string, unknown> | undefined): TransitionRecord | undefined {
  if (!raw) return undefined;
  const rec = raw as TransitionRecord;
  if (!rec.kind || rec.kind === 'cut') return undefined;
  return rec;
}
