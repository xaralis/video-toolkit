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
import { isCoreTransitionKind, type Transition } from '../reel-config-base/transition-schema';
import { warnOnce, type WarnOnceOptions } from './warn-once';

/** A transition that actually renders something — everything except `cut`.
 *  Includes BRAND kinds since Phase 4: they are exactly what must reach the
 *  renderer rather than be dropped here. */
export type TransitionRecord = Exclude<Transition, { kind: 'cut' }>;

/** The set of kinds this gate should treat as "known" beyond core's catalog —
 *  a brand's own registry keys. Task 1.2 wires `BrandTheme.transitions` in here;
 *  until then every non-core kind is unrecognised and warns. */
export interface TransitionRecordOptions extends WarnOnceOptions {
  brandKinds?: Iterable<string>;
}

/**
 * A transitionOut/transitionIn field is only a REAL transition when it's present
 * and not `cut` (`undefined` and `{ kind: 'cut' }` both mean "no transition
 * here"). The parameter stays loose because a rendered literal is not
 * necessarily schema-validated: a project's Root.tsx is hand-edited, so this
 * gate is the last line before the renderer.
 *
 * PHASE 4 — WHERE THE TYPO GUARANTEE LIVES NOW. `TransitionSchema` used to be a
 * closed discriminated union, so a typo'd kind (`'disolve'`) failed to parse.
 * Opening it to brand-authored kinds means a typo is structurally
 * indistinguishable from a kind core has simply never heard of, so the schema
 * cannot tell them apart and no longer tries. This gate re-establishes the
 * signal instead: it sees EVERY record on its way to the renderer, so an
 * unrecognised kind gets one dev-only warning naming it, rather than the silent
 * degrade-to-hard-cut that `presentationFor` produced before (and still
 * produces, only now with something on stderr saying why).
 *
 * What it catches: any kind that is neither a core catalog kind nor a declared
 * brand kind. What it lets through unremarked: a brand kind (by design), and a
 * MISSPELLED BRAND kind that happens to collide with another declared brand
 * kind. What it can never catch: a typo that is itself a valid kind.
 */
export function getTransitionRecord(
  raw: Transition | Record<string, unknown> | undefined,
  opts: TransitionRecordOptions = {},
): TransitionRecord | undefined {
  if (!raw) return undefined;
  const kind = (raw as { kind?: unknown }).kind;
  if (!kind || kind === 'cut') return undefined;
  if (typeof kind === 'string' && !isCoreTransitionKind(kind) && !declaredByBrand(kind, opts.brandKinds)) {
    warnOnce(
      `transition-kind:${kind}`,
      `[video-toolkit] Unrecognised transition kind "${kind}". Core does not declare it and no brand ` +
        'transition registry claims it, so this boundary will render as a hard cut. ' +
        'If it is a typo, fix the kind; if it is a brand transition, register it on the brand theme. ' +
        '(Warning only; nothing is blocked, and this is reported once per kind.)',
      opts,
    );
  }
  return raw as TransitionRecord;
}

// Deliberately allocation-free for the two hot cases (no brand kinds at all, or
// a `Set` handed in): this runs once per rendered frame per boundary, and the
// obvious `new Set(kinds ?? [])` would allocate on every one of them.
function declaredByBrand(kind: string, kinds: Iterable<string> | undefined): boolean {
  if (!kinds) return false;
  if (kinds instanceof Set) return kinds.has(kind);
  for (const k of kinds) if (k === kind) return true;
  return false;
}
