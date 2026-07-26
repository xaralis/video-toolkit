import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Rest-param signatures here are a typing-only accommodation for the spread wrapper
// below (TS2556) — runtime behaviour and asserted values are unchanged from the brief.
const delayRender = vi.fn((..._args: unknown[]) => 42);
const continueRender = vi.fn((..._args: unknown[]) => undefined);

vi.mock('remotion', () => ({
  delayRender: (...a: unknown[]) => delayRender(...a),
  continueRender: (...a: unknown[]) => continueRender(...a),
  staticFile: (p: string) => `/static/${p}`,
}));

// A FontFace test double: records construction and resolves/rejects load() on demand.
class FakeFontFace {
  static made: Array<{ family: string; src: string; desc: unknown }> = [];
  static mode: 'resolve' | 'reject' = 'resolve';
  constructor(public family: string, public src: string, public desc: unknown) {
    FakeFontFace.made.push({ family, src, desc });
  }
  load() {
    return FakeFontFace.mode === 'resolve' ? Promise.resolve(this) : Promise.reject(new Error('boom'));
  }
}

const load = async () => (await import('@video-toolkit/lib/render/load-fonts')).loadBrandFonts;

beforeEach(() => {
  vi.resetModules();
  delayRender.mockClear();
  continueRender.mockClear();
  FakeFontFace.made = [];
  FakeFontFace.mode = 'resolve';
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('document', { ...document, fonts: { add: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

const FONTS = [{ family: 'Geist', file: 'fonts/Geist-Bold.ttf', weight: '700' }];

describe('loadBrandFonts', () => {
  it('passes the render-concurrency hardening to delayRender', async () => {
    // THE headline claim of the task that introduced this function: the timeout+retries
    // fix that existed in one of three brand copies is now everyone's default. Under
    // multi-tab render concurrency, fresh browser contexts re-reading TTFs can exceed
    // Remotion's 28s default — the flake that used to force --concurrency=1.
    (await load())(FONTS);
    expect(delayRender).toHaveBeenCalledWith('Loading brand fonts', {
      timeoutInMilliseconds: 120_000,
      retries: 2,
    });
  });

  it('lets the caller override the label, timeout and retries', async () => {
    (await load())(FONTS, { label: 'X', timeoutInMilliseconds: 1, retries: 0 });
    expect(delayRender).toHaveBeenCalledWith('X', { timeoutInMilliseconds: 1, retries: 0 });
  });

  it('builds one FontFace per spec, through staticFile, with the normalised descriptors', async () => {
    (await load())([...FONTS, { family: 'JBM', file: 'fonts/JBM.ttf' }]);
    expect(FakeFontFace.made).toEqual([
      { family: 'Geist', src: 'url(/static/fonts/Geist-Bold.ttf)', desc: { weight: '700', style: 'normal', display: 'block' } },
      { family: 'JBM', src: 'url(/static/fonts/JBM.ttf)', desc: { weight: '400', style: 'normal', display: 'block' } },
    ]);
  });

  it('registers the faces and clears the handle once they load', async () => {
    const fn = await load();
    fn(FONTS);
    await vi.waitFor(() => expect(continueRender).toHaveBeenCalledWith(42));
  });

  it('ALWAYS clears the handle, even when a font fails to load', async () => {
    // An unresolved delayRender hangs the entire render. Losing a font is cosmetic;
    // hanging is total — so the catch path must still continueRender.
    FakeFontFace.mode = 'reject';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (await load())(FONTS);
    await vi.waitFor(() => expect(continueRender).toHaveBeenCalledWith(42));
  });

  it('does not call delayRender for an empty font list', async () => {
    (await load())([]);
    expect(delayRender).not.toHaveBeenCalled();
  });

  it('is a no-op under SSR, where there is no document', async () => {
    vi.stubGlobal('document', undefined);
    (await load())(FONTS);
    expect(delayRender).not.toHaveBeenCalled();
  });

  it('ignores a second call — the module-level guard is per-realm, NOT per-composition', async () => {
    // Documented hazard: Studio can mount several compositions in one realm, and a second
    // brand's fonts would then silently never load. This test pins the CURRENT behaviour
    // so the limitation is visible in the suite rather than only in prose.
    const fn = await load();
    fn(FONTS);
    fn([{ family: 'Other', file: 'other.ttf' }]);
    expect(delayRender).toHaveBeenCalledTimes(1);
    expect(FakeFontFace.made.map((f) => f.family)).toEqual(['Geist']);
  });
});
