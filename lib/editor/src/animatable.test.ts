import { describe, it, expect } from 'vitest';
import { isKeyframes, sampleAnimatable, type Animatable, type Keyframe } from '@video-toolkit/lib/reel-config-base/animatable';

// `Animatable` ships as a mechanism with no caller in core yet (Phase 4 Task
// 1.1 deliberately does NOT migrate ken-burns onto it). An unexercised code
// path that ships is a liability, so BOTH branches are covered here — the
// constant short-circuit especially, since an always-take-the-slow-path bug
// would be invisible to a correctness-only test.

describe('isKeyframes', () => {
  it('says no to every constant, including ones that are arrays', () => {
    expect(isKeyframes(1)).toBe(false);
    expect(isKeyframes('a')).toBe(false);
    expect(isKeyframes(false)).toBe(false);
    expect(isKeyframes(null as unknown as number)).toBe(false);
    expect(isKeyframes(undefined as unknown as number)).toBe(false);
    expect(isKeyframes({ t: 0 } as unknown as number)).toBe(false); // an object, not a list
    // The ambiguous cases `Array.isArray` alone gets wrong:
    expect(isKeyframes([] as unknown as number[])).toBe(false); // empty carries no curve
    expect(isKeyframes(['a', 'b'] as unknown as string[])).toBe(false); // Animatable<string[]>
    expect(isKeyframes([{ v: 1 }] as unknown as number)).toBe(false); // no `t`
    expect(isKeyframes([{ t: '0', v: 1 }] as unknown as number)).toBe(false); // `t` not a number
  });

  it('says yes to a keyframe list', () => {
    expect(isKeyframes([{ t: 0, v: 1 }])).toBe(true);
    expect(isKeyframes([{ t: 0, v: 'a' }, { t: 1, v: 'b' }])).toBe(true);
  });
});

describe('sampleAnimatable — the constant case', () => {
  it('returns the value itself for every scalar', () => {
    expect(sampleAnimatable(5, 0.5)).toBe(5);
    expect(sampleAnimatable('a-string', 0.5)).toBe('a-string');
    expect(sampleAnimatable(false, 0.5)).toBe(false);
  });

  // THE SHORT-CIRCUIT, pinned by identity and by ignoring `t`. Both assertions
  // fail the moment the constant case starts going through the keyframe path:
  // that path reads `t`, scans, and (for a two-element array) returns an
  // ELEMENT rather than the array.
  it('short-circuits: same reference back, and `t` is not read at all', () => {
    const obj = { scale: 1.08 };
    expect(sampleAnimatable(obj, 0.5)).toBe(obj);
    expect(sampleAnimatable(obj, NaN)).toBe(obj);
    expect(sampleAnimatable(obj, -99)).toBe(obj);

    const arr = ['a', 'b'];
    expect(sampleAnimatable(arr as unknown as string[], 0.5)).toBe(arr);

    const empty: never[] = [];
    expect(sampleAnimatable(empty as unknown as never[], 0.5)).toBe(empty);
  });
});

describe('sampleAnimatable — the keyframe case', () => {
  const ramp: Animatable<number> = [
    { t: 0, v: 0 },
    { t: 1, v: 10 },
  ];

  it('interpolates numbers linearly between two stops', () => {
    expect(sampleAnimatable(ramp, 0)).toBe(0);
    expect(sampleAnimatable(ramp, 0.25)).toBeCloseTo(2.5, 10);
    expect(sampleAnimatable(ramp, 0.5)).toBeCloseTo(5, 10);
    expect(sampleAnimatable(ramp, 1)).toBe(10);
  });

  it('holds flat outside the outermost stops, and clamps t', () => {
    const inner: Animatable<number> = [
      { t: 0.25, v: 4 },
      { t: 0.75, v: 8 },
    ];
    expect(sampleAnimatable(inner, 0)).toBe(4);
    expect(sampleAnimatable(inner, -5)).toBe(4);
    expect(sampleAnimatable(inner, 1)).toBe(8);
    expect(sampleAnimatable(inner, 99)).toBe(8);
    expect(sampleAnimatable(inner, 0.5)).toBeCloseTo(6, 10);
  });

  it('walks a multi-stop curve and picks the right leg', () => {
    const three: Animatable<number> = [
      { t: 0, v: 0 },
      { t: 0.5, v: 100 },
      { t: 1, v: 0 },
    ];
    expect(sampleAnimatable(three, 0.25)).toBeCloseTo(50, 10);
    expect(sampleAnimatable(three, 0.5)).toBe(100);
    expect(sampleAnimatable(three, 0.75)).toBeCloseTo(50, 10);
  });

  it('eases the leg by the LATER stop’s ease, and linear is the default', () => {
    const easeIn: Animatable<number> = [
      { t: 0, v: 0 },
      { t: 1, v: 100, ease: 'ease-in' },
    ];
    // ease-in is cubic: 0.5³ = 0.125.
    expect(sampleAnimatable(easeIn, 0.5)).toBeCloseTo(12.5, 10);
    expect(sampleAnimatable(ramp, 0.5)).toBeCloseTo(5, 10); // no ease → linear
    const easeOut: Animatable<number> = [
      { t: 0, v: 0 },
      { t: 1, v: 100, ease: 'ease-out' },
    ];
    expect(sampleAnimatable(easeOut, 0.5)).toBeCloseTo(87.5, 10);
    const easeInOut: Animatable<number> = [
      { t: 0, v: 0 },
      { t: 1, v: 100, ease: 'ease-in-out' },
    ];
    expect(sampleAnimatable(easeInOut, 0.5)).toBeCloseTo(50, 10);
    expect(sampleAnimatable(easeInOut, 0.25)).toBeCloseTo(6.25, 10);
  });

  // Core cannot know how to blend an arbitrary T, and inventing a blend is
  // worse than holding — a half-crossfaded enum value is not a value.
  it('STEPS a non-numeric parameter instead of inventing a blend', () => {
    const modes: Animatable<string> = [
      { t: 0, v: 'film' },
      { t: 1, v: 'vhs' },
    ];
    expect(sampleAnimatable(modes, 0)).toBe('film');
    expect(sampleAnimatable(modes, 0.99)).toBe('film');
    expect(sampleAnimatable(modes, 1)).toBe('vhs');
  });

  it('tolerates a duplicated t rather than dividing by zero', () => {
    const dup: Animatable<number> = [
      { t: 0, v: 1 },
      { t: 0.5, v: 2 },
      { t: 0.5, v: 9 },
      { t: 1, v: 9 },
    ];
    expect(Number.isFinite(sampleAnimatable(dup, 0.5))).toBe(true);
    expect(sampleAnimatable(dup, 0.25)).toBeCloseTo(1.5, 10);
  });

  it('returns the single stop’s value for a one-keyframe list', () => {
    const one: ReadonlyArray<Keyframe<number>> = [{ t: 0.4, v: 3 }];
    expect(sampleAnimatable(one, 0)).toBe(3);
    expect(sampleAnimatable(one, 0.4)).toBe(3);
    expect(sampleAnimatable(one, 1)).toBe(3);
  });
});
