// lib/reel-config-base/animatable.ts — a parameter that may vary over its
// node's span, and the sampler that reads it.
//
// The motivation is concrete rather than speculative. Core already ships THREE
// hand-rolled two-keyframe animations pretending to be static parameters:
// ken-burns' `fromScale`/`toScale`, `fromX`/`toX`, `fromY`/`toY`. That is a
// curve with the generality removed — you cannot add a third stop, you cannot
// ease one leg differently, and every effect that wants the same thing has to
// re-invent the pair.
//
// SCOPE, deliberately narrow: Phase 4 ships the TYPE and the SAMPLER. Keyframe
// editing UI is explicitly out of scope; the editor exposes constants only, and
// `ParamField.animatable` is the flag a later phase reads. Nothing in core is
// migrated onto this yet — in particular `kenBurnsStyle` keeps its exact current
// signature and body, so `lib/editor/src/ken-burns-parity.test.ts` stays green
// by construction. Ship the mechanism; leave the callers alone.
//
// Zero imports, same as `./param-field.ts` — this is read by the render path.

/** The easing applied on the leg ENDING at a keyframe. `linear` is the default
 *  and the only one with no cost. */
export type EaseName = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

/** One stop on a parameter's curve. `t` is normalized 0..1 over the node's own
 *  span, so a keyframe list survives the node being retimed. */
export type Keyframe<T> = { t: number; v: T; ease?: EaseName };

/** A parameter that is either a constant (overwhelmingly the common case, and
 *  the ONLY case today) or a keyframe list. */
export type Animatable<T> = T | ReadonlyArray<Keyframe<T>>;

const EASES: Record<EaseName, (x: number) => number> = {
  linear: (x) => x,
  'ease-in': (x) => x * x * x,
  'ease-out': (x) => 1 - (1 - x) ** 3,
  'ease-in-out': (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
};

/**
 * True when the value is a keyframe LIST rather than a constant.
 *
 * Shape, not just `Array.isArray`: `Animatable<T>` is ambiguous when `T` is
 * itself an array type (`Animatable<string[]>`), and an empty `[]` carries no
 * curve at all. Both are resolved here, in one place, by requiring a non-empty
 * array whose first element is a `{t: number, v}` record. So an empty array and
 * an array of plain values are CONSTANTS — which is the only total answer
 * `sampleAnimatable` can give for them.
 */
export function isKeyframes<T>(value: Animatable<T>): value is ReadonlyArray<Keyframe<T>> {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first: unknown = value[0];
  return typeof first === 'object' && first !== null && typeof (first as Keyframe<T>).t === 'number' && 'v' in first;
}

/**
 * The value of an animatable parameter at normalized time `t` (0..1 over the
 * node's span).
 *
 * The constant case SHORT-CIRCUITS on the first line and returns the very same
 * reference — no allocation, no scan, no arithmetic, and `t` is not even read.
 * That is not an optimisation detail to be refactored away: every use in core
 * today is constant, and a sampler that costs something on the case that never
 * animates is a tax on every frame of every render.
 *
 * On the keyframe path: `t` is clamped, values before the first stop and after
 * the last hold flat, and a leg between two stops is eased by the LATER stop's
 * `ease` (the ease describes the approach to that keyframe). Numbers
 * interpolate; anything else STEPS — holding the earlier stop until the later
 * one is reached — because core cannot know how to blend an arbitrary `T`, and
 * inventing a blend is worse than holding.
 */
export function sampleAnimatable<T>(value: Animatable<T>, t: number): T {
  if (!isKeyframes(value)) return value as T;

  const keys = value;
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  if (clamped <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (clamped >= last.t) return last.v;

  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t <= clamped) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.t - a.t;
  if (span <= 0) return b.v;

  const local = (clamped - a.t) / span;
  if (typeof a.v !== 'number' || typeof b.v !== 'number') return a.v;
  const eased = EASES[b.ease ?? 'linear'](local);
  return ((a.v as number) + ((b.v as number) - (a.v as number)) * eased) as unknown as T;
}
