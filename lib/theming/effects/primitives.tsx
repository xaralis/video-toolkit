// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { gradeFilter, gradeNeedsWb, gradeWbMatrixValues } from '../../reel-config-base/grade';
import type { Grade } from '../../reel-config-base/base-types';
import type { EffectRenderProps } from './index';

// Core generic effect primitives. Every one is BRAND-NEUTRAL: each colour and
// each magnitude arrives from the effect entry on the item, never from a
// constant here. A brand look (a vintage stack, a blend layer) is a
// COMPOSITION of these with brand-side numbers, or its own registered renderer
// — it is never a special case baked into core.
//
// Two shapes, chosen so the media's own layout is never disturbed:
//  - ADDITIVE (grain/scanlines/vignette): render `children` unchanged and add a
//    sibling overlay layer on top. The media keeps its own position/inset.
//  - ENCLOSING (grade/transform): wrap `children` in an absolutely-filled div,
//    so an inset:0 media child still fills exactly the same box while the
//    wrapper's filter/transform applies to it.

/** Effect entries are `z.passthrough()` bags, so params arrive untyped. Reading
 *  them through this keeps a malformed config RENDERING (with the fallback)
 *  rather than throwing — the same tolerance unknown effect types get. */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Shared base for an additive overlay layer: covers the media, never eats input. */
const OVERLAY_BASE = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
} as const satisfies React.CSSProperties;

// ---------------------------------------------------------------- grain

/** SVG filter primitive for the frame-seeded noise tile. `tileSize` is the
 *  noise feature size in px, so baseFrequency is its reciprocal. */
export function grainTurbulenceAttrs(effect: Record<string, unknown>, frame: number): { baseFrequency: number; seed: number } {
  const tileSize = num(effect.tileSize, 2);
  return {
    baseFrequency: 1 / Math.max(1, tileSize),
    // Deterministic from the frame when the entry pins no seed — so grain
    // animates, and re-rendering the same frame gives the same grain.
    seed: num(effect.seed, frame),
  };
}

export function grainLayerStyle(effect: Record<string, unknown>, filterId: string): React.CSSProperties {
  return {
    ...OVERLAY_BASE,
    opacity: num(effect.amount, 0),
    mixBlendMode: 'overlay',
    filter: `url(#${filterId})`,
  };
}

export const GrainEffect: React.FC<EffectRenderProps> = ({ effect, index, item, children }) => {
  const frame = useCurrentFrame();
  const { baseFrequency, seed } = grainTurbulenceAttrs(effect, frame);
  // Keyed on the effect's INDEX as well as the item: the registry supports the
  // same type twice on one item, and two <filter> defs sharing an id would
  // silently collapse to whichever rendered last.
  const filterId = `grain-${item.id}-${index}`;
  return (
    <>
      {children}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id={filterId}>
            <feTurbulence type="fractalNoise" baseFrequency={baseFrequency} numOctaves={1} seed={seed} />
          </filter>
        </defs>
      </svg>
      <div style={grainLayerStyle(effect, filterId)} />
    </>
  );
};

// ------------------------------------------------------------ scanlines

// `lineWidthPx` and `lineColor` were hardcoded before Phase 4 Task 2.7 — a 50%
// duty cycle in opaque black. Neither was a design choice; they were core's own
// ceiling, and the reason a 1-in-4 duty cycle at a non-black line (the VHS
// look a brand ships) could not be expressed as a core `scanlines`. Naming the
// brand is deliberately avoided: the brand-leak gate is a COUNT over lib/ and
// this file is inside it. Defaults reproduce the
// pre-2.7 string EXACTLY: `spacing / 2` and `rgba(0,0,0,1)`.
//
// The transparent stop stays literal `rgba(0,0,0,0)` rather than following
// `lineColor` — the two stops sit at the SAME position, so it is a hard stop
// with no interpolated region, and keeping it literal keeps every pre-2.7
// string byte-identical.
export function scanlinesLayerStyle(effect: Record<string, unknown>): React.CSSProperties {
  const spacing = Math.max(1, num(effect.spacingPx, 1));
  const blend = typeof effect.blend === 'string' ? effect.blend : undefined;
  // Clamped into [0, spacing]: a line wider than the period would emit
  // out-of-order gradient stops, which browsers silently repair differently.
  const lineWidth = Math.min(spacing, Math.max(0, num(effect.lineWidthPx, spacing / 2)));
  const lineColor = typeof effect.lineColor === 'string' ? effect.lineColor : 'rgba(0,0,0,1)';
  return {
    ...OVERLAY_BASE,
    opacity: num(effect.opacity, 0),
    ...(blend ? { mixBlendMode: blend as React.CSSProperties['mixBlendMode'] } : {}),
    backgroundImage: `repeating-linear-gradient(to bottom, ${lineColor} 0px, ${lineColor} ${lineWidth}px, rgba(0,0,0,0) ${lineWidth}px, rgba(0,0,0,0) ${spacing}px)`,
  };
}

export const ScanlinesEffect: React.FC<EffectRenderProps> = ({ effect, children }) => (
  <>
    {children}
    <div style={scanlinesLayerStyle(effect)} />
  </>
);

// ------------------------------------------------------------- vignette

export function vignetteLayerStyle(effect: Record<string, unknown>): React.CSSProperties {
  // radiusPct is where the darkening STARTS (100% = the frame edge). 50 is the
  // geometrically neutral default — the inscribed circle — not a look choice.
  const radiusPct = num(effect.radiusPct, 50);
  return {
    ...OVERLAY_BASE,
    background: `radial-gradient(ellipse at center, rgba(0,0,0,0) ${radiusPct}%, rgba(0,0,0,${num(effect.strength, 0)}) 100%)`,
  };
}

export const VignetteEffect: React.FC<EffectRenderProps> = ({ effect, children }) => (
  <>
    {children}
    <div style={vignetteLayerStyle(effect)} />
  </>
);

// ---------------------------------------------------------------- grade

/** The effect entry AS a Grade: every field but the `type` discriminant.
 *  Keeps one grade implementation (reel-config-base/grade.ts) behind both the
 *  `grade` field on VideoContainerBase and this effect. */
export function gradeFromEffect(effect: Record<string, unknown>): Grade {
  const { type: _type, ...rest } = effect;
  return rest as Grade;
}

export const GradeEffect: React.FC<EffectRenderProps> = ({ effect, index, item, children }) => {
  const grade = gradeFromEffect(effect);
  // Index-keyed for the same reason as grain's — see there.
  const filterId = `grade-effect-${item.id}-${index}`;
  const filter = gradeFilter(grade, filterId);
  return (
    <div style={{ position: 'absolute', inset: 0, ...(filter ? { filter } : {}) }}>
      {gradeNeedsWb(grade) ? (
        <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={gradeWbMatrixValues(grade)} />
            </filter>
          </defs>
        </svg>
      ) : null}
      {children}
    </div>
  );
};

// ------------------------------------------------------------ transform

/** Static CSS transform. Parts are emitted only when the entry carries them,
 *  in a fixed order (translate, rotate, scale) so the string is stable. */
export function transformString(effect: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const tx = effect.translateXPct;
  const ty = effect.translateYPct;
  if (typeof tx === 'number' || typeof ty === 'number') {
    parts.push(`translate(${num(tx, 0)}%, ${num(ty, 0)}%)`);
  }
  if (typeof effect.rotateDeg === 'number') parts.push(`rotate(${effect.rotateDeg}deg)`);
  if (typeof effect.scale === 'number') parts.push(`scale(${effect.scale})`);
  return parts.length ? parts.join(' ') : undefined;
}

export function transformLayerStyle(effect: Record<string, unknown>): React.CSSProperties {
  const transform = transformString(effect);
  return { position: 'absolute', inset: 0, ...(transform ? { transform } : {}) };
}

export const TransformEffect: React.FC<EffectRenderProps> = ({ effect, children }) => (
  <div style={transformLayerStyle(effect)}>{children}</div>
);
