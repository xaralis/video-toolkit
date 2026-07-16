import { continueRender, delayRender, staticFile } from 'remotion';

let loadingHandle: number | null = null;

/**
 * Loads brand fonts (Geist Bold + JetBrains Mono Regular & Bold) at render
 * start. Must be called once per composition mount. Uses delayRender /
 * continueRender so Remotion blocks rendering until fonts are ready.
 *
 * JBM Bold is loaded explicitly (not synthesized) because the captions
 * render JBM at fontWeight 700 — synthesized bold reads fuzzy at 52px.
 */
export const loadBrandFonts = (): void => {
  if (typeof document === 'undefined') return; // SSR safety
  if (loadingHandle !== null) return; // already loading or loaded

  loadingHandle = delayRender('Loading brand fonts');

  const geist = new FontFace(
    'Geist',
    `url(${staticFile('fonts/Geist-Bold.ttf')})`,
    { weight: '700', style: 'normal', display: 'block' },
  );
  const jbm = new FontFace(
    'JetBrains Mono',
    `url(${staticFile('fonts/JetBrainsMono-Regular.ttf')})`,
    { weight: '400', style: 'normal', display: 'block' },
  );
  const jbmBold = new FontFace(
    'JetBrains Mono',
    `url(${staticFile('fonts/JetBrainsMono-Bold.ttf')})`,
    { weight: '700', style: 'normal', display: 'block' },
  );

  Promise.all([geist.load(), jbm.load(), jbmBold.load()])
    .then((faces) => {
      faces.forEach((f) => document.fonts.add(f));
      if (loadingHandle !== null) continueRender(loadingHandle);
    })
    .catch((err) => {
      console.error('Brand font load failed:', err);
      if (loadingHandle !== null) continueRender(loadingHandle);
    });
};
