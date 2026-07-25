// Pure font-spec normalisation. No `remotion` import — see load-fonts.ts for
// the loading shell and lib/render/README.md for why the split exists.

/** One font file a brand wants available to its compositions. `file` is a path
 *  inside the project's `public/` (it goes through Remotion's staticFile). */
export interface FontSpec {
  family: string;
  file: string;
  /** CSS weight or a variable-font range, e.g. '700' or '400 600'. Default '400'. */
  weight?: string;
  /** Default 'normal'. */
  style?: string;
  /** Default 'block' — the render must never bake a fallback-font frame. */
  display?: FontDisplay;
}

export interface FontFaceDescriptorSet {
  family: string;
  file: string;
  descriptors: FontFaceDescriptors;
}

/** Fills in the defaults every reel wants, without reordering. A bold face must
 *  be declared explicitly rather than synthesized: synthesized bold reads fuzzy
 *  at caption sizes. */
export function fontFaceDescriptors(fonts: readonly FontSpec[]): FontFaceDescriptorSet[] {
  return fonts.map(({ family, file, weight, style, display }) => ({
    family,
    file,
    descriptors: {
      weight: weight ?? '400',
      style: style ?? 'normal',
      display: display ?? 'block',
    },
  }));
}
