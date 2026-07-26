import { describe, it, expect } from 'vitest';
import {
  withTransitionOverrides,
  TransitionSchema,
  type Transition,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import { VideoItemSchema, type VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

// `withTransitionOverrides` exists because `transitionIn`/`transitionOut` now
// carry TransitionSchema instead of `z.record(z.string(), z.unknown())`.
// Spreading a `Transition | undefined` by hand — `{ ...it.transitionOut, mask }`
// — makes EVERY property optional, including the `kind` discriminant, so the
// result no longer satisfies `VideoItem['transitionOut']`. This helper is the
// supported replacement: it preserves the discriminant and passes `undefined`
// straight through.
describe('withTransitionOverrides', () => {
  it('returns undefined for undefined — the "no transition on this edge" case', () => {
    expect(withTransitionOverrides(undefined, { frames: 20 })).toBeUndefined();
  });

  it('preserves the discriminant', () => {
    const before: Transition = { kind: 'dissolve', frames: 15 };
    const t = withTransitionOverrides(before, { frames: 30 });
    expect(t.kind).toBe('dissolve');
    expect(t).toEqual({ kind: 'dissolve', frames: 30 });
  });

  it('overrides only the named fields and leaves the rest alone', () => {
    const before: Transition = { kind: 'gradient-wipe', frames: 15, direction: 'tl-br', softness: 40 };
    const after = withTransitionOverrides(before, { softness: 80 });
    expect(after).toEqual({ kind: 'gradient-wipe', frames: 15, direction: 'tl-br', softness: 80 });
  });

  it('does not mutate the input', () => {
    const before: Transition = { kind: 'dissolve', frames: 15 };
    const after = withTransitionOverrides(before, { frames: 30 });
    expect(before).toEqual({ kind: 'dissolve', frames: 15 });
    expect(after).not.toBe(before);
  });

  // TYPE-LEVEL PINS. Rejecting a key the transition does not have is the ONLY
  // thing this helper does that `{ ...t, … }` doesn't, and nothing pinned it
  // until Phase 4 quietly took it away: `BrandTransitionSchema` is
  // `.passthrough()`, so `BrandTransition` infers with a string index signature,
  // and once that arm joined `TransitionOverrides`' distribution the union
  // accepted any key at all. `@ts-expect-error` is itself an error when the line
  // COMPILES, so this fails loudly if the guarantee is lost again — which a
  // runtime assertion could never do.
  it('rejects a key the transition does not have (compile-time)', () => {
    // PARAMETERS, not initialised consts: a `const x: Transition = {kind:'burn',…}`
    // is narrowed to the `burn` member by control flow, which would test a
    // narrowing the roost call site never has. `it.transitionOut` there is the
    // full `Transition | undefined`, and that is the path that lost the check.
    const widened = (t: Transition) =>
      // @ts-expect-error `glowColour` is a typo for `glowColor` and must not compile.
      withTransitionOverrides(t, { mask: 'm.png', glowColour: '#fff' });
    const optional = (t: Transition | undefined) =>
      // @ts-expect-error same typo, reached through the roost call site's exact type.
      withTransitionOverrides(t, { glowColour: '#fff' });

    expect(widened({ kind: 'burn', frames: 20 })).toBeTruthy();
    expect(optional({ kind: 'burn', frames: 20 })).toBeTruthy();
  });

  // The flip side, pinned so the boundary is recorded rather than rediscovered:
  // when the argument DOES narrow to one member, the accepted keys narrow with
  // it — `softness` belongs to gradient-wipe, not burn.
  it('rejects another member’s key once the argument narrows (compile-time)', () => {
    const burn: Transition = { kind: 'burn', frames: 20 };
    // @ts-expect-error `softness` is gradient-wipe's, and `burn` is narrowed here.
    const wrongMember = withTransitionOverrides(burn, { softness: 40 });
    expect(wrongMember).toBeTruthy();
  });

  it('accepts the correctly-spelled key it rejected the typo of', () => {
    const burn: Transition = { kind: 'burn', frames: 20 };
    expect(withTransitionOverrides(burn, { mask: 'm.png', glowColor: '#fff' })).toEqual({
      kind: 'burn', frames: 20, mask: 'm.png', glowColor: '#fff',
    });
  });

  it('produces something TransitionSchema still accepts', () => {
    const t = withTransitionOverrides<Transition>({ kind: 'wipe', frames: 15, color: 'gold', direction: 'left' }, {
      color: 'rust',
    });
    const parsed = TransitionSchema.safeParse(t);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ kind: 'wipe', frames: 15, color: 'rust', direction: 'left' });
  });

  // THE roost case: LayeredRoostReel injects its own brand-owned burn look
  // (cloud mask + hot-edge glow colour) onto the burn transition the derivation
  // emits brand-agnostically as `{ kind: 'burn', frames }`.
  describe('the roost burn-look injection', () => {
    const PAPER = '#f4ece0';
    const withBurnLook = (items: VideoItem[]): VideoItem[] =>
      items.map((it) =>
        it.transitionOut?.kind === 'burn'
          ? {
              ...it,
              transitionOut: withTransitionOverrides(it.transitionOut, {
                mask: 'brand/burn-mask.png',
                glowColor: PAPER,
              }),
            }
          : it,
      );

    const clip = (over: Partial<VideoItem>): VideoItem =>
      VideoItemSchema.parse({
        id: 'seg-001',
        kind: 'clip',
        startMs: 0,
        endMs: 2000,
        source: 'a.mp4',
        sourceInMs: 0,
        sourceOutMs: 2000,
        ...over,
      });

    it('adds mask + glowColor to a burn while keeping kind and frames', () => {
      const [out] = withBurnLook([clip({ transitionOut: { kind: 'burn', frames: 20 } })]);
      expect(out.transitionOut).toEqual({
        kind: 'burn',
        frames: 20,
        mask: 'brand/burn-mask.png',
        glowColor: PAPER,
      });
    });

    it('leaves the injected result parseable as a VideoItem', () => {
      const [out] = withBurnLook([clip({ transitionOut: { kind: 'burn', frames: 20 } })]);
      const parsed = VideoItemSchema.safeParse(out);
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.transitionOut).toEqual(out.transitionOut);
    });

    it('keeps burn’s other optional knobs when they were already set', () => {
      const [out] = withBurnLook([
        clip({ transitionOut: { kind: 'burn', frames: 20, edgeContrast: 9, glowBand: 0.25 } }),
      ]);
      expect(out.transitionOut).toEqual({
        kind: 'burn',
        frames: 20,
        edgeContrast: 9,
        glowBand: 0.25,
        mask: 'brand/burn-mask.png',
        glowColor: PAPER,
      });
    });

    it('touches neither a non-burn transition nor an item with none', () => {
      const items = [
        clip({ id: 'a', transitionOut: { kind: 'dissolve', frames: 15 } }),
        clip({ id: 'b' }),
      ];
      const out = withBurnLook(items);
      expect(out[0].transitionOut).toEqual({ kind: 'dissolve', frames: 15 });
      expect(out[1].transitionOut).toBeUndefined();
    });
  });
});
