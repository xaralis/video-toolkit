import { describe, it, expect } from 'vitest';
import { kenBurnsStyle } from '@video-toolkit/lib/theming/effects/ken-burns';

// The two shapes SegmentMedia supports today, per its own comment:
//  - roost's `direction` shorthand (was KenBurnsPhoto.tsx)
//  - campaign's explicit from/to fields (was BrollSegment/PhotoSegment)
//
// Every literal below was READ OUT OF THE RUNNING CODE before the extraction,
// never hand-computed — the point is byte-identical output, so nothing here may
// be rounded and nothing may use toBeCloseTo. A changed float is a defect.
describe('ken-burns math is preserved exactly', () => {
  it('direction:in — scale ramps 1.08 -> 1.20, no translate', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'in' }, 0, 100, undefined, undefined)).toEqual({
      transform: 'scale(1.08) translate(0px, 0px)',
    });
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'in' }, 100, 100, undefined, undefined)).toEqual({
      transform: 'scale(1.2000000000000002) translate(0px, 0px)',
    });
  });

  it('direction:left — scale ramps 1.08 -> 1.14 and translates to -60px', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'left' }, 100, 100, undefined, undefined)).toEqual({
      transform: 'scale(1.1400000000000001) translate(-60px, 0px)',
    });
  });

  it('direction:up — translates y to -60px', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'up' }, 100, 100, undefined, undefined)).toEqual({
      transform: 'scale(1.1400000000000001) translate(0px, -60px)',
    });
  });

  it('direction: mid-ramp is interpolated, not snapped', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', direction: 'left' }, 37, 100, undefined, undefined)).toEqual({
      transform: 'scale(1.1022) translate(-22.2px, 0px)',
    });
  });

  it('from/to: both endpoints omitted falls back to the item focal point', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', fromScale: 1, toScale: 1.2 }, 50, 100, 0.3, 0.8)).toEqual({
      transform: 'scale(1.1017078734893604)',
      objectPosition: '30% 80%',
      transformOrigin: '30% 80%',
    });
  });

  it('from/to: both endpoints omitted and no focal point centres at 50%', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', fromScale: 1, toScale: 1.2 }, 50, 100, undefined, undefined)).toEqual({
      transform: 'scale(1.1017078734893604)',
      objectPosition: '50% 50%',
      transformOrigin: '50% 50%',
    });
  });

  it('from/to: one endpoint omitted pans from the focal base', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', toX: 0.9, toY: 0.1 }, 50, 100, 0.3, 0.8)).toEqual({
      transform: 'scale(1)',
      objectPosition: '60.5123620468081% 44.40224427872389%',
      transformOrigin: '60.5123620468081% 44.40224427872389%',
    });
  });

  it('from/to: both endpoints present pans between them', () => {
    expect(
      kenBurnsStyle(
        { type: 'ken-burns', fromX: 0.2, toX: 0.8, fromY: 0.1, toY: 0.9, fromScale: 1.05, toScale: 1.35 },
        50,
        100,
        0.3,
        0.8,
      ),
    ).toEqual({
      transform: 'scale(1.2025618102340405)',
      objectPosition: '50.5123620468081% 50.68314939574413%',
      transformOrigin: '50.5123620468081% 50.68314939574413%',
    });
  });

  it('from/to: emits objectPosition and transformOrigin, which the direction branch does not', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', fromX: 0.2, toX: 0.8 }, 0, 100, undefined, undefined)).toEqual({
      transform: 'scale(1)',
      objectPosition: '20% 50%',
      transformOrigin: '20% 50%',
    });
    // durationInFrames-1 is the from/to branch's end anchor, so frame 99 of 100
    // is the fully-arrived endpoint — a detail the direction branch does NOT share.
    expect(kenBurnsStyle({ type: 'ken-burns', fromX: 0.2, toX: 0.8 }, 99, 100, undefined, undefined)).toEqual({
      transform: 'scale(1)',
      objectPosition: '80% 50%',
      transformOrigin: '80% 50%',
    });
  });

  it('from/to: easing is inOut, so the midpoint is not linear', () => {
    expect(kenBurnsStyle({ type: 'ken-burns', fromScale: 1, toScale: 2 }, 25, 101, undefined, undefined)).toEqual({
      transform: 'scale(1.1576784062862697)',
      objectPosition: '50% 50%',
      transformOrigin: '50% 50%',
    });
  });
});
