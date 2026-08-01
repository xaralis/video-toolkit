// The per-instance ENABLE toggle every node carries — ONE declaration for BOTH
// axes, because Phase 4's premise is that an effect and a transition are the
// same kind of thing: a node with a type, params, and a switch.
//
// WHY IT LIVES HERE AND HAS NO IMPORTS BEYOND ZOD. `lib/reel-config-base` is the
// floor: `layered-schema.ts` (the effect axis) and `transition-schema.ts` (the
// transition axis) are siblings, neither imports the other, and lib/theming and
// lib/render both sit ABOVE them. A toggle shared by both axes therefore cannot
// live on either side — same reasoning as `param-field.ts` in Task 1.1.
//
// ABSENT MEANS ENABLED. That is a hard parity requirement, not a convenience:
// every baked `defaultProps` literal in every brand repo omits the field, so
// `undefined` has to be indistinguishable from `true`. Only the LITERAL `false`
// disables — a truthiness test would make `enabled: 0` or `enabled: ''` (both
// reachable from a hand-edited Root.tsx) silently drop a node that the author
// never disabled.
import { z } from 'zod';

/** The schema fragment. Optional, so no existing literal changes shape. */
export const NodeEnabledSchema = z
  .boolean()
  .optional()
  .describe('Set false to skip this node entirely, keeping its authored parameters. Absent means enabled.');

/** THE one place that decides whether a node runs. Both axes' skip sites read
 *  it (`applyEffects` in lib/theming/effects/index.ts for effects,
 *  `getTransitionRecord` in lib/render/transition-record.ts for transitions),
 *  so "disabled" can never come to mean two different things.
 *
 *  Deliberately `!== false` rather than `=== true` or a truthiness test — see
 *  the note at the top of this file. */
export function isNodeEnabled(node: unknown): boolean {
  return (node as { enabled?: unknown } | null | undefined)?.enabled !== false;
}
