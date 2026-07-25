import { describe, expect, it } from 'vitest';
import { fontFaceDescriptors, type FontSpec } from '@video-toolkit/lib/render/fonts';

describe('fontFaceDescriptors', () => {
  it('keeps family and file, and passes an explicit weight through', () => {
    const fonts: FontSpec[] = [{ family: 'Geist', file: 'fonts/Geist-Bold.ttf', weight: '700' }];
    expect(fontFaceDescriptors(fonts)).toEqual([
      {
        family: 'Geist',
        file: 'fonts/Geist-Bold.ttf',
        descriptors: { weight: '700', style: 'normal', display: 'block' },
      },
    ]);
  });

  it('defaults weight to 400 and style to normal', () => {
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf' }])[0].descriptors).toEqual({
      weight: '400',
      style: 'normal',
      display: 'block',
    });
  });

  it('supports a variable-font weight range verbatim', () => {
    // Roost ships FamiljenGrotesk-Variable at "400 600"; a range must survive
    // untouched or the variable axis collapses to a single instance.
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf', weight: '400 600' }])[0].descriptors.weight)
      .toBe('400 600');
  });

  it('forces display:block unless overridden', () => {
    // `block` is what makes text render in the FINAL font in frame 1 instead of
    // flashing a fallback — invisible in Studio, baked into an MP4 forever.
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf' }])[0].descriptors.display).toBe('block');
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf', display: 'swap' }])[0].descriptors.display)
      .toBe('swap');
  });

  it('preserves declaration order', () => {
    const out = fontFaceDescriptors([
      { family: 'A', file: 'a.ttf' },
      { family: 'B', file: 'b.ttf' },
    ]);
    expect(out.map((f) => f.family)).toEqual(['A', 'B']);
  });
});
