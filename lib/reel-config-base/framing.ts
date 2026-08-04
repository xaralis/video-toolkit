// A clip's framing used to be three tangled ideas wearing one enum:
// `fit: 'cover' | 'blur-pad'` decided both HOW THE SHOT MEETS THE FRAME and
// WHAT FILLS THE LEFTOVER SPACE. The insight that reshapes this: `blur-pad`
// was never a third fit — it is `contain` whose pad happens to be a blurred
// copy of the shot. The renderer already builds both the same way (one
// `objectFit:'contain'` foreground plus a backdrop node); only the backdrop
// differs. Splitting `fit`/`pad` into two independent axes is what gives
// placement and pad options somewhere to live. This module is the ONE place
// that resolves those axes — follows the `GRADE_DEFAULTS` precedent in
// grade.ts: one defaults object, one tolerant resolver, two change predicates
// the reel editor uses to decide what starts expanded/dirty.
export const FIT_MODES = ['cover', 'contain'] as const;
export const PAD_KINDS = ['blur', 'color', 'none'] as const;

// Every framing field's neutral value — what an unauthored item already
// renders as. `placeX`/`placeY` (where the shot sits in the leftover space
// under `contain`) and `focalX`/`focalY` (pan within the source, independent
// of fit) share the same numeric default (0.5, centred) but are DELIBERATELY
// separate fields — see the framing design spec for why they must not be
// unified onto one `object-position`-shaped field.
export const FRAMING_DEFAULTS = {
  fit: 'cover',
  pad: 'blur',
  backdropBlur: 32,
  backdropDim: 0.45,
  placeX: 0.5,
  placeY: 0.5,
  focalX: 0.5,
  focalY: 0.5,
  cropWidth: 1,
} as const;

/** How far a clip's crop may zoom in (zoom = 1 / crop.width). Moved here from
 *  `lib/editor/host/crop-gestures.ts` (re-exported there so its existing
 *  importers and its own test file's import stay green with no edit) — it
 *  belongs with the rest of the framing model, not with the gesture layer
 *  that happens to be its first consumer. */
export const MAX_ZOOM = 6;

/** Reads a numeric field tolerantly — same shape as the effect primitives'
 *  own reader (`num()` in `lib/theming/segment/SegmentMedia.tsx`), reimplemented
 *  here rather than imported: `lib/reel-config-base` must not depend on
 *  `lib/theming` (wrong dependency direction — theming depends on this
 *  layer, not the reverse), so the one-line tolerance helper is colocated
 *  instead of shared. A malformed value reads as `fallback`, never throws. */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** True when `raw` — read tolerantly, the same way `resolveFraming` reads it
 *  — differs numerically from `def`. Absent (`undefined`) and malformed
 *  values both resolve to `def` first, so both compare as "no change" — this
 *  is what makes the change predicates below agree with what actually
 *  renders (a malformed value renders as its default, so it must not be
 *  reported as a change either). */
function differsFromDefault(raw: unknown, def: number): boolean {
  return num(raw, def) !== def;
}

/**
 * Resolves an item's framing fields into exactly what the renderer needs.
 * Tolerant, never throwing — the current renderer already reads `fit`
 * permissively (`SegmentMedia.tsx:114`, anything but the literal `'blur-pad'`
 * falls back to `'cover'`), and that tolerance is deliberate and carries over
 * here: an unknown `fit` reads as `'cover'`, an unknown `pad` reads as
 * `'blur'`, and a non-finite `backdropBlur`/`backdropDim`/`placeX`/`placeY`
 * reads as its default.
 *
 * **ABSORBS THE LEGACY VALUE.** `fit === 'blur-pad'` — the only fit this
 * codebase shipped before this module existed — reads as
 * `{ fit: 'contain', pad: 'blur' }`, unconditionally. This is what lets every
 * existing config keep rendering without a data migration: `blur-pad` was
 * never a third fit, it was always `contain` with a blurred pad.
 *
 * `pad` is returned UNCONDITIONALLY, even when `fit` resolves to `'cover'`
 * (where padding has no leftover space to fill) — this function only
 * resolves what was authored; the renderer is what decides whether `pad`
 * matters for the resolved `fit`.
 */
export function resolveFraming(item: unknown): {
  fit: (typeof FIT_MODES)[number];
  pad: (typeof PAD_KINDS)[number];
  padColor?: string;
  blur: number;
  dim: number;
  placeX: number;
  placeY: number;
} {
  const rec = isRecord(item) ? item : {};
  const fitRaw = rec.fit;

  let fit: (typeof FIT_MODES)[number];
  let pad: (typeof PAD_KINDS)[number];
  if (fitRaw === 'blur-pad') {
    // The legacy alias — see the doc comment above.
    fit = 'contain';
    pad = 'blur';
  } else {
    fit = fitRaw === 'contain' ? 'contain' : FRAMING_DEFAULTS.fit;
    const padRaw = rec.pad;
    pad = (PAD_KINDS as readonly unknown[]).includes(padRaw)
      ? (padRaw as (typeof PAD_KINDS)[number])
      : FRAMING_DEFAULTS.pad;
  }

  // `padColor` has no numeric default to fall back to — its default is
  // ABSENCE, which the renderer reads as transparent, not black. A malformed
  // (non-string) value is tolerated the same way every other field here is:
  // it reads as if the field were never authored.
  const padColor = typeof rec.padColor === 'string' ? rec.padColor : undefined;

  return {
    fit,
    pad,
    ...(padColor !== undefined ? { padColor } : {}),
    blur: num(rec.backdropBlur, FRAMING_DEFAULTS.backdropBlur),
    dim: num(rec.backdropDim, FRAMING_DEFAULTS.backdropDim),
    placeX: num(rec.placeX, FRAMING_DEFAULTS.placeX),
    placeY: num(rec.placeY, FRAMING_DEFAULTS.placeY),
  };
}

/** Whether an item's SOURCE WINDOW (crop zoom/pan, independent of fit)
 *  differs from doing nothing at all — used by the reel editor to decide
 *  whether its "Crop & zoom" section starts open. Compares against
 *  `FRAMING_DEFAULTS` NUMERICALLY, field by field — NOT by key presence: a
 *  `crop` explicitly stored at `{ width: 1, x: 0.5, y: 0.5 }` is not a
 *  change, only a value that actually differs is (same distinction
 *  `hasGradeChanges` in grade.ts gets right and a naive
 *  `Object.keys(...).length > 0` check gets wrong). */
export function hasCropChanges(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const crop = isRecord(item.crop) ? item.crop : undefined;
  return (
    (crop !== undefined && differsFromDefault(crop.width, FRAMING_DEFAULTS.cropWidth)) ||
    (crop !== undefined && differsFromDefault(crop.x, FRAMING_DEFAULTS.focalX)) ||
    (crop !== undefined && differsFromDefault(crop.y, FRAMING_DEFAULTS.focalY)) ||
    differsFromDefault(item.focalX, FRAMING_DEFAULTS.focalX) ||
    differsFromDefault(item.focalY, FRAMING_DEFAULTS.focalY)
  );
}

/** Whether an item's FIT/PAD/PLACEMENT differs from doing nothing at all —
 *  used by the reel editor to decide whether its "Fit & pad" section starts
 *  open. Same numeric-against-default comparison as `hasCropChanges` (see
 *  there for why key presence alone is the wrong check) for every field that
 *  has a numeric default; `fit`/`pad` compare against their own default
 *  literal, and `padColor` — whose default is ABSENCE, not a particular
 *  string — counts as changed whenever it is present at all. */
export function hasFitChanges(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const fitRaw = item.fit;
  const padRaw = item.pad;
  return (
    (fitRaw !== undefined && fitRaw !== FRAMING_DEFAULTS.fit) ||
    (padRaw !== undefined && padRaw !== FRAMING_DEFAULTS.pad) ||
    item.padColor !== undefined ||
    differsFromDefault(item.placeX, FRAMING_DEFAULTS.placeX) ||
    differsFromDefault(item.placeY, FRAMING_DEFAULTS.placeY) ||
    differsFromDefault(item.backdropBlur, FRAMING_DEFAULTS.backdropBlur) ||
    differsFromDefault(item.backdropDim, FRAMING_DEFAULTS.backdropDim)
  );
}
