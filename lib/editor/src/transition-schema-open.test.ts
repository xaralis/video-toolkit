// Phase 4, task 1.0 — the transition schema is OPEN to brand-authored kinds,
// and the "is this kind real?" guarantee moved rather than vanished.
//
// This file pins the CAPABILITY the split adds (a brand kind parses, keeps its
// own parameters, and arrives at the renderer's resolution point) and the
// GUARANTEE it must not lose (a core kind is still validated field by field;
// an unrecognised kind is still called out, now as a dev warning instead of a
// parse failure). The two halves are inseparable — either one alone is the
// wrong trade — so they live in one file.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TransitionSchema,
  CoreTransitionSchema,
  BrandTransitionSchema,
  isCoreTransitionKind,
  TRANSITION_CATALOG,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import { VideoItemSchema } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { getTransitionRecord } from '@video-toolkit/lib/render/transition-record';
import { warnOnce, resetWarnOnce } from '@video-toolkit/lib/render/warn-once';

const clip = {
  id: 'seg-001', kind: 'clip', startMs: 0, endMs: 2000,
  source: 'a.mp4', sourceInMs: 0, sourceOutMs: 2000,
};

/** Collects what `getTransitionRecord` warns, with the dev gate forced on so the
 *  test doesn't depend on how the runner sets NODE_ENV. */
function withWarnings() {
  const warnings: string[] = [];
  return { warnings, opts: { warn: (m: string) => warnings.push(m), dev: true } };
}

beforeEach(() => resetWarnOnce());

// ---------------------------------------------------------------------------
// THE CAPABILITY: a brand-authored kind survives validation and reaches the renderer.
// ---------------------------------------------------------------------------

describe('a brand-authored transition kind', () => {
  it('parses through TransitionSchema', () => {
    const r = TransitionSchema.safeParse({ kind: 'my-brand-thing', frames: 20 });
    expect(r.success).toBe(true);
  });

  it('keeps its OWN parameters — core cannot enumerate them, so they must pass through', () => {
    const t = { kind: 'my-brand-thing', frames: 20, swirl: 0.4, palette: ['a', 'b'], nested: { deep: true } };
    const r = TransitionSchema.parse(t);
    expect(r).toEqual(t);
  });

  it('parses on a layered video item, on both edges', () => {
    const r = VideoItemSchema.parse({
      ...clip,
      transitionIn: { kind: 'brand-in', frames: 10, hue: 12 },
      transitionOut: { kind: 'brand-out', frames: 20 },
    });
    expect(r.transitionIn).toEqual({ kind: 'brand-in', frames: 10, hue: 12 });
    expect(r.transitionOut).toEqual({ kind: 'brand-out', frames: 20 });
  });

  it('ARRIVES AT THE RENDERER rather than being dropped at the gate', () => {
    const t = { kind: 'my-brand-thing', frames: 20, swirl: 0.4 };
    // The record survives with every field intact — task 1.2's registry
    // resolution reads exactly this object.
    expect(getTransitionRecord(t, { dev: false })).toEqual(t);
  });

  it('does not warn once the brand declares the kind', () => {
    const { warnings, opts } = withWarnings();
    getTransitionRecord({ kind: 'my-brand-thing', frames: 20 }, { ...opts, brandKinds: ['my-brand-thing'] });
    expect(warnings).toEqual([]);
  });

  it('still needs a valid shape — frames is not optional and is still range-checked', () => {
    expect(TransitionSchema.safeParse({ kind: 'my-brand-thing' }).success).toBe(false);
    expect(TransitionSchema.safeParse({ kind: 'my-brand-thing', frames: 0 }).success).toBe(false);
    expect(TransitionSchema.safeParse({ kind: 'my-brand-thing', frames: 61 }).success).toBe(false);
    expect(TransitionSchema.safeParse({ kind: 42, frames: 20 }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE GUARANTEE, HALF ONE: core kinds keep FULL per-field validation.
// ---------------------------------------------------------------------------

describe('core kinds are still judged by their own member', () => {
  it('never falls through to the permissive branch when the core member fails', () => {
    // Each of these has the {kind, frames} shape BrandTransitionSchema accepts,
    // and would parse if the union simply tried the next branch on failure.
    const shapeValidButCoreInvalid = [
      { kind: 'slide', frames: 15 }, // missing `direction`
      { kind: 'slide', frames: 15, direction: 'sideways' }, // bad enum
      { kind: 'zoom-through', frames: 15 }, // missing `from`
      { kind: 'wipe', frames: 15, color: 42, direction: 'left' }, // wrong type
      { kind: 'fade', frames: 0 }, // out of range
    ];
    for (const t of shapeValidButCoreInvalid) {
      expect(TransitionSchema.safeParse(t).success, JSON.stringify(t)).toBe(false);
    }
  });

  it('BrandTransitionSchema itself refuses every core kind', () => {
    for (const { kind } of TRANSITION_CATALOG) {
      expect(BrandTransitionSchema.safeParse({ kind, frames: 15 }).success, kind).toBe(false);
    }
  });

  it('accepts every core kind exactly as CoreTransitionSchema does', () => {
    const t = { kind: 'wipe', frames: 15, color: 'gold', direction: 'left' };
    expect(TransitionSchema.parse(t)).toEqual(CoreTransitionSchema.parse(t));
  });

  it('isCoreTransitionKind agrees with the catalog', () => {
    for (const { kind } of TRANSITION_CATALOG) expect(isCoreTransitionKind(kind), kind).toBe(true);
    expect(isCoreTransitionKind('my-brand-thing')).toBe(false);
    expect(isCoreTransitionKind('disolve')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// THE GUARANTEE, HALF TWO: a typo is caught at getTransitionRecord instead.
// ---------------------------------------------------------------------------

describe('the typo guarantee, relocated to getTransitionRecord', () => {
  it('a typo’d CORE kind now PARSES — this is the cost of opening the schema', () => {
    // Recorded, not celebrated: `disolve` is structurally indistinguishable
    // from a brand kind core has never heard of. The next test is the other
    // half of the trade.
    expect(TransitionSchema.safeParse({ kind: 'disolve', frames: 20 }).success).toBe(true);
  });

  it('…and the dev warning fires for it, naming the kind', () => {
    const { warnings, opts } = withWarnings();
    getTransitionRecord({ kind: 'disolve', frames: 20 }, opts);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('disolve');
    expect(warnings[0]).toContain('hard cut');
  });

  it('warns ONCE per distinct kind, not once per frame', () => {
    const { warnings, opts } = withWarnings();
    // A transition record is resolved on every rendered frame of the boundary.
    for (let frame = 0; frame < 200; frame++) getTransitionRecord({ kind: 'disolve', frames: 20 }, opts);
    expect(warnings).toHaveLength(1);
    getTransitionRecord({ kind: 'wipeee', frames: 20 }, opts);
    expect(warnings).toHaveLength(2);
  });

  it('never throws — a suspicious kind must not stop a render', () => {
    expect(() => getTransitionRecord({ kind: 'disolve', frames: 20 }, { dev: true, warn: () => {} })).not.toThrow();
  });

  it('is silent in production', () => {
    const { warnings } = withWarnings();
    getTransitionRecord({ kind: 'disolve', frames: 20 }, { warn: (m) => warnings.push(m), dev: false });
    expect(warnings).toEqual([]);
  });

  it('says nothing about core kinds, absent transitions, or cut', () => {
    const { warnings, opts } = withWarnings();
    for (const { kind } of TRANSITION_CATALOG) getTransitionRecord({ kind, frames: 15 }, opts);
    getTransitionRecord(undefined, opts);
    expect(warnings).toEqual([]);
  });

  it('still treats cut and absent as "no transition here"', () => {
    expect(getTransitionRecord(undefined)).toBeUndefined();
    expect(getTransitionRecord({ kind: 'cut' })).toBeUndefined();
    expect(getTransitionRecord({})).toBeUndefined();
  });
});

describe('warnOnce', () => {
  it('reports whether it actually warned', () => {
    expect(warnOnce('k', 'm', { dev: true, warn: () => {} })).toBe(true);
    expect(warnOnce('k', 'm', { dev: true, warn: () => {} })).toBe(false);
  });

  it('is a no-op outside dev', () => {
    expect(warnOnce('k2', 'm', { dev: false, warn: () => {} })).toBe(false);
  });
});
