// Brand font loading. Imports `remotion`, so it is NOT unit-tested in core (no
// remotion installed here) — everything decidable lives in ./fonts.ts, which is.
import { continueRender, delayRender, staticFile } from 'remotion';
import { fontFaceDescriptors, type FontSpec } from './fonts';

let handle: number | null = null;

export interface LoadBrandFontsOptions {
  /** Shown in Remotion's "delayRender was called but not cleared" diagnostics. */
  label?: string;
  timeoutInMilliseconds?: number;
  retries?: number;
}

/**
 * Registers a brand's fonts and blocks rendering until they are ready. Call once
 * at module scope of the brand's reel component — Studio, the editor Player and
 * a headless render all reach the fonts only by importing that module.
 *
 * The generous timeout and the retries are not padding. Under multi-tab render
 * concurrency Remotion spawns fresh browser contexts that each re-read the TTFs
 * from disk, and one can exceed the 28s default under I/O contention — the flake
 * that used to force `--concurrency=1`. 120s + 2 retries makes a full-concurrency
 * render reliable, and this default is the whole reason core owns this function:
 * the fix existed in exactly one of the three brand copies.
 */
export function loadBrandFonts(fonts: readonly FontSpec[], opts: LoadBrandFontsOptions = {}): void {
  if (typeof document === 'undefined') return; // SSR safety
  if (handle !== null) return; // already loading or loaded
  if (fonts.length === 0) return;

  handle = delayRender(opts.label ?? 'Loading brand fonts', {
    timeoutInMilliseconds: opts.timeoutInMilliseconds ?? 120_000,
    retries: opts.retries ?? 2,
  });

  const faces = fontFaceDescriptors(fonts).map(
    ({ family, file, descriptors }) => new FontFace(family, `url(${staticFile(file)})`, descriptors),
  );

  Promise.all(faces.map((f) => f.load()))
    .then((loaded) => {
      loaded.forEach((f) => document.fonts.add(f));
      if (handle !== null) continueRender(handle);
    })
    .catch((err) => {
      // Never leave the handle open: an unresolved delayRender hangs the whole
      // render. Losing a font is a cosmetic failure; hanging is a total one.
      console.error('Brand font load failed:', err);
      if (handle !== null) continueRender(handle);
    });
}
