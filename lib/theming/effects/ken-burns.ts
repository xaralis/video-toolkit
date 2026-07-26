import { interpolate, Easing } from 'remotion';

// Ken Burns effect params, as found on a VideoItem's `effects` array (permissive
// passthrough per EffectSchema). Two shapes are supported, mirroring the two
// per-brand originals this primitive unifies:
//  - roost's `direction` shorthand (KenBurnsPhoto.tsx)
//  - campaign's explicit from/to fields (PhotoSegment.tsx / BrollSegment.tsx)
export interface KenBurnsEffect {
  type: 'ken-burns';
  direction?: 'in' | 'left' | 'up';
  fromScale?: number;
  toScale?: number;
  fromX?: number;
  toX?: number;
  fromY?: number;
  toY?: number;
}

export function findKenBurns(effects: Array<{ type: string }> | undefined): KenBurnsEffect | undefined {
  return effects?.find((e): e is KenBurnsEffect => e.type === 'ken-burns');
}

// Ken Burns transform for the current frame.
//  - `direction` shorthand: replicates KenBurnsPhoto's exact math — scale
//    1.08 + p*(in?0.12:0.06), translate up to -60px for left/up. Pure
//    transform, no objectPosition opinion (composes with a static crop).
//  - explicit from/to shorthand: replicates BrollSegment/PhotoSegment's eased
//    pan+zoom across normalized focal points (falling back to the item's own
//    focalX/focalY as the pan base when a from/to endpoint is omitted). This
//    shape drives its own objectPosition/transformOrigin because the pan
//    point is itself animated — a moving pan point supersedes the crop's
//    fixed one — but the SCALE still composes with the crop's zoom (via
//    transform string concatenation in the caller), so a brand can crop-zoom
//    AND ken-burns zoom at once.
//
// EXTRACTED VERBATIM from SegmentMedia.tsx in Phase 3 Task 2. The math is
// pinned byte-identical by lib/editor/src/ken-burns-parity.test.ts — do not
// simplify, reformat or "improve" any expression here without re-deriving
// every literal in that test from a fresh run.
export function kenBurnsStyle(
  kb: KenBurnsEffect,
  frame: number,
  durationInFrames: number,
  focalX: number | undefined,
  focalY: number | undefined,
): { transform: string; objectPosition?: string; transformOrigin?: string } {
  if (kb.direction) {
    const p = interpolate(frame, [0, Math.max(1, durationInFrames)], [0, 1], { extrapolateRight: 'clamp' });
    const scale = 1.08 + p * (kb.direction === 'in' ? 0.12 : 0.06);
    const x = kb.direction === 'left' ? interpolate(p, [0, 1], [0, -60]) : 0;
    const y = kb.direction === 'up' ? interpolate(p, [0, 1], [0, -60]) : 0;
    return { transform: `scale(${scale}) translate(${x}px, ${y}px)` };
  }
  const e = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease),
  });
  const lerp = (a: number, b: number) => a + (b - a) * e;
  const baseX = focalX ?? 0.5;
  const baseY = focalY ?? 0.5;
  const x = lerp(kb.fromX ?? baseX, kb.toX ?? baseX);
  const y = lerp(kb.fromY ?? baseY, kb.toY ?? baseY);
  const scale = lerp(kb.fromScale ?? 1, kb.toScale ?? 1);
  const pos = `${x * 100}% ${y * 100}%`;
  return { transform: `scale(${scale})`, objectPosition: pos, transformOrigin: pos };
}
