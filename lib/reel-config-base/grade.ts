import type { Grade } from './base-types';

// How hard temperature / tint push the RGB channel gains at ±1. Kept gentle —
// this is clip-matching correction, not a look. The brand look is the LUT
// (rule #32) applied after render.
const TEMP_STRENGTH = 0.3; // temperature +1 → R×1.3, B×0.7 (warm)
const TINT_STRENGTH = 0.2; // tint +1 → G×0.8 (magenta), −1 → G×1.2 (green)

export function gradeNeedsWb(g?: Grade): boolean {
  return !!g && ((g.temperature ?? 0) !== 0 || (g.tint ?? 0) !== 0);
}

// White-balance channel gains for an feColorMatrix diagonal.
export function gradeWbGains(g: Grade): { r: number; gg: number; b: number } {
  const t = g.temperature ?? 0;
  const ti = g.tint ?? 0;
  return {
    r: 1 + t * TEMP_STRENGTH,
    gg: 1 - ti * TINT_STRENGTH,
    b: 1 - t * TEMP_STRENGTH,
  };
}

// The `values` string for the WB <feColorMatrix type="matrix">.
export function gradeWbMatrixValues(g: Grade): string {
  const { r, gg, b } = gradeWbGains(g);
  return `${r} 0 0 0 0  0 ${gg} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
}

// The CSS `filter` string. brightness/contrast/saturation are native CSS
// filter functions; white balance chains an SVG feColorMatrix referenced by
// `wbFilterId` (render <GradeDefs> with the same id). Returns undefined when
// nothing to apply.
export function gradeFilter(g: Grade | undefined, wbFilterId: string): string | undefined {
  if (!g) return undefined;
  const parts: string[] = [];
  const b = g.brightness ?? 1;
  const c = g.contrast ?? 1;
  const s = g.saturation ?? 1;
  if (b !== 1) parts.push(`brightness(${b})`);
  if (c !== 1) parts.push(`contrast(${c})`);
  if (s !== 1) parts.push(`saturate(${s})`);
  if (gradeNeedsWb(g)) parts.push(`url(#${wbFilterId})`);
  return parts.length ? parts.join(' ') : undefined;
}
