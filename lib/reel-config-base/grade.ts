import type { Grade } from './base-types';

// How hard temperature / tint push the RGB channel gains at ±1. Kept gentle —
// this is clip-matching correction, not a look. The brand look is the LUT
// (rule #32) applied after render.
const TEMP_STRENGTH = 0.3; // temperature +1 → R×1.3, B×0.7 (warm)
const TINT_STRENGTH = 0.2; // tint +1 → G×0.8 (magenta), −1 → G×1.2 (green)

// Every Grade field's NEUTRAL value — what a renderer treats as "no
// correction", and therefore what an unset field (`g.x ?? default`) already
// renders as. Multipliers (brightness/contrast/saturation) are neutral at 1;
// white balance/sepia/hue rotation are neutral at 0. This used to be
// duplicated: inlined as `?? 1`/`?? 0` in every function below AND,
// separately, as the reel editor's own `GRADE_NEUTRAL_ZERO` set and its
// `GradeFields` sliders' `?? 1`/`?? 0` fallbacks (LayeredInspector.tsx) — the
// same drift risk this module's other re-exports (`Crop`, `Transition`) exist
// to prevent. One object now; the editor's grade-cleaning logic, its sliders'
// `fallback`/reset-to-default value, and `hasGradeChanges` below all read
// from it instead of carrying their own copy.
export const GRADE_DEFAULTS = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  tint: 0,
  sepia: 0,
  hueRotateDeg: 0,
} as const satisfies Required<Grade>;

// Whether a Grade differs from doing nothing at all — used by the reel editor
// to decide whether its Color section has anything to show (an untouched
// grade starts the section collapsed). Compares against GRADE_DEFAULTS
// NUMERICALLY, field by field — NOT by key presence: a field explicitly
// stored AT its default (`{ brightness: 1 }`) is not a change, only a value
// that actually differs from GRADE_DEFAULTS is. A naive `Object.keys(g).length
// > 0` check would wrongly call that a change.
export function hasGradeChanges(g?: Grade): boolean {
  if (!g) return false;
  return (Object.keys(GRADE_DEFAULTS) as (keyof typeof GRADE_DEFAULTS)[]).some(
    (k) => (g[k] ?? GRADE_DEFAULTS[k]) !== GRADE_DEFAULTS[k],
  );
}

export function gradeNeedsWb(g?: Grade): boolean {
  return (
    !!g &&
    ((g.temperature ?? GRADE_DEFAULTS.temperature) !== GRADE_DEFAULTS.temperature ||
      (g.tint ?? GRADE_DEFAULTS.tint) !== GRADE_DEFAULTS.tint)
  );
}

// White-balance channel gains for an feColorMatrix diagonal.
export function gradeWbGains(g: Grade): { r: number; gg: number; b: number } {
  const t = g.temperature ?? GRADE_DEFAULTS.temperature;
  const ti = g.tint ?? GRADE_DEFAULTS.tint;
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

// The CSS `filter` string. brightness/contrast/saturation/sepia/hue-rotate are
// native CSS filter functions; white balance chains an SVG feColorMatrix
// referenced by `wbFilterId` (render <GradeDefs> with the same id). Returns
// undefined when nothing to apply.
//
// ORDER IS PART OF THE CONTRACT. `url(#wb)` stays LAST (pinned by
// segment-media-merge-baseline.test.tsx), and sepia/hue-rotate slot after
// saturate — appended at the end of the native run, so no grade authored before
// they existed emits a different string. Both are neutral at 0, which is also
// the CSS no-op, so an omitted field costs nothing and moves no pixel.
export function gradeFilter(g: Grade | undefined, wbFilterId: string): string | undefined {
  if (!g) return undefined;
  const parts: string[] = [];
  const b = g.brightness ?? GRADE_DEFAULTS.brightness;
  const c = g.contrast ?? GRADE_DEFAULTS.contrast;
  const s = g.saturation ?? GRADE_DEFAULTS.saturation;
  const sep = g.sepia ?? GRADE_DEFAULTS.sepia;
  const hue = g.hueRotateDeg ?? GRADE_DEFAULTS.hueRotateDeg;
  if (b !== GRADE_DEFAULTS.brightness) parts.push(`brightness(${b})`);
  if (c !== GRADE_DEFAULTS.contrast) parts.push(`contrast(${c})`);
  if (s !== GRADE_DEFAULTS.saturation) parts.push(`saturate(${s})`);
  if (sep !== GRADE_DEFAULTS.sepia) parts.push(`sepia(${sep})`);
  if (hue !== GRADE_DEFAULTS.hueRotateDeg) parts.push(`hue-rotate(${hue}deg)`);
  if (gradeNeedsWb(g)) parts.push(`url(#${wbFilterId})`);
  return parts.length ? parts.join(' ') : undefined;
}
