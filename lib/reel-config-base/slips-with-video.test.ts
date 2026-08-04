import { describe, it, expect } from 'vitest';
import { bedIsOwnSoundOf, resolveSlipsWithVideo } from './slips-with-video';

describe('bedIsOwnSoundOf', () => {
  it('the real talking-head pair: TH-01_t4.mp4 vs TH-01_t4.eq.m4a → true', () => {
    expect(bedIsOwnSoundOf({ source: 'TH-01_t4.mp4' }, { source: 'TH-01_t4.eq.m4a' })).toBe(true);
  });

  it('the real b-roll-with-narration pair: BR-trida-miru_01_upright.mp4 vs TH-01_t4.eq.m4a → false', () => {
    expect(bedIsOwnSoundOf({ source: 'BR-trida-miru_01_upright.mp4' }, { source: 'TH-01_t4.eq.m4a' })).toBe(false);
  });

  it('matches on the stem up to the FIRST dot, not the last (a processing suffix does not break identity)', () => {
    expect(bedIsOwnSoundOf({ source: 'clip.mp4' }, { source: 'clip.eq.normalized.m4a' })).toBe(true);
  });

  it('matches on basename, ignoring any directory prefix', () => {
    expect(bedIsOwnSoundOf({ source: 'public/recordings/clip.mp4' }, { source: 'public/audio/clip.eq.m4a' })).toBe(true);
  });

  it('a video item with no source (e.g. multi-clip/card/outro) is never its own sound', () => {
    expect(bedIsOwnSoundOf({}, { source: 'clip.m4a' })).toBe(false);
    expect(bedIsOwnSoundOf(undefined, { source: 'clip.m4a' })).toBe(false);
  });

  it('different stems entirely → false', () => {
    expect(bedIsOwnSoundOf({ source: 'a.mp4' }, { source: 'b.m4a' })).toBe(false);
  });
});

describe('resolveSlipsWithVideo', () => {
  it('explicit true wins over the fallback, even when sources differ', () => {
    expect(resolveSlipsWithVideo({ source: 'a.mp4' }, { source: 'b.m4a', slipsWithVideo: true })).toBe(true);
  });

  it('explicit false wins over the fallback, even when sources match', () => {
    expect(resolveSlipsWithVideo({ source: 'a.mp4' }, { source: 'a.eq.m4a', slipsWithVideo: false })).toBe(false);
  });

  it('absent + same-stem sources ⇒ true (legacy talking-head configs keep slipping)', () => {
    expect(resolveSlipsWithVideo({ source: 'TH-01_t4.mp4' }, { source: 'TH-01_t4.eq.m4a' })).toBe(true);
  });

  it('absent + different sources ⇒ false (legacy narration-under-b-roll configs stop slipping)', () => {
    expect(resolveSlipsWithVideo({ source: 'BR-trida-miru_01_upright.mp4' }, { source: 'TH-01_t4.eq.m4a' })).toBe(false);
  });
});
