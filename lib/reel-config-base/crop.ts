import { focalObjectPosition } from './focal';

// `Crop`'s one declaration is CropSchema in segment-base-schemas.ts (this
// module infers from it); re-exported here so existing imports of `Crop`
// from this module keep working.
export type { Crop } from './segment-base-schemas';
import type { Crop } from './segment-base-schemas';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Build the CSS needed to render `crop` on top of an `objectFit: 'cover'`
// video/image. Returns objectPosition alone when there's no crop (identical to
// the plain focal behaviour), or objectPosition + transform scale + matching
// transformOrigin when a crop is set. Falls back to focalX/focalY for the pan
// centre when the crop omits x/y.
export function cropCoverStyle(
  crop: Crop | undefined,
  focalX?: number,
  focalY?: number,
): { objectPosition: string; transform?: string; transformOrigin?: string } {
  if (!crop) return { objectPosition: focalObjectPosition(focalX, focalY) };
  const x = clamp01(crop.x ?? focalX ?? 0.5);
  const y = clamp01(crop.y ?? focalY ?? 0.5);
  const w = Math.min(1, Math.max(0.05, crop.width));
  const pos = `${x * 100}% ${y * 100}%`;
  return { objectPosition: pos, transform: `scale(${1 / w})`, transformOrigin: pos };
}
