import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// GenericCard reads useCurrentFrame for its staggered line reveal, and draws
// pure CSS (no media elements) — so keep the REAL interpolate and mock only the
// frame hook. Assertions read the produced DOM, because the card IS its CSS.
const frameState = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return { ...actual, useCurrentFrame: () => frameState.frame, useVideoConfig: () => ({ fps: 30 }) };
});

import { GenericCard } from '@video-toolkit/lib/theming/generic/GenericCard';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { ThemeTokens } from '@video-toolkit/lib/theming';

const card = (over: Partial<Record<string, unknown>> = {}): VideoItem =>
  ({
    id: 'c1',
    kind: 'card',
    startMs: 0,
    endMs: 3000,
    cardKind: 'claim-plate',
    cardProps: { lines: ['One', 'Two'] },
    ...over,
  }) as VideoItem;

const draw = (it: VideoItem, tokens?: ThemeTokens) =>
  render(<GenericCard item={it} handles={{ inHalf: 0, outHalf: 0 }} tokens={tokens} />);

const lines = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-card-line]')) as HTMLElement[];

beforeEach(() => {
  frameState.frame = 0;
});

describe('GenericCard background', () => {
  it('always draws a background, whatever the cardKind', () => {
    const { container } = draw(card());
    const bg = container.querySelector('[data-card-bg]') as HTMLElement;
    expect(bg.style.backgroundColor).toBe('rgb(0, 0, 0)'); // neutral default #000000
  });

  it('draws NO pattern layer by default (pattern absent = none)', () => {
    const { container } = draw(card());
    expect(container.querySelector('[data-card-pattern]')).toBeNull();
  });

  it.each([
    ['pixels', 'radial-gradient', '36px 36px'],
    ['dots', 'radial-gradient', '60px 60px'],
    ['grid', 'radial-gradient', '60px 60px'],
    ['diagonals', 'repeating-linear-gradient', ''],
  ])('draws the %s pattern as a pure CSS gradient', (variant, fn, size) => {
    const { container } = draw(card({ pattern: variant }));
    const pat = container.querySelector('[data-card-pattern]') as HTMLElement;
    expect(pat.style.backgroundImage).toContain(fn);
    if (size) expect(pat.style.backgroundSize).toBe(size);
  });

  it('uses the accent token for pixels/dots and the plain colour token for grid/diagonals', () => {
    const tokens: ThemeTokens = { card: { pattern: { color: '#111111', accentColor: '#222222' } } };
    const dots = draw(card({ pattern: 'dots' }), tokens).container.querySelector('[data-card-pattern]') as HTMLElement;
    expect(dots.style.backgroundImage).toContain('#222222');
    const grid = draw(card({ pattern: 'grid' }), tokens).container.querySelector('[data-card-pattern]') as HTMLElement;
    expect(grid.style.backgroundImage).toContain('#111111');
  });

  it('treats an UNKNOWN pattern name as no pattern, without throwing', () => {
    const { container } = draw(card({ pattern: 'houndstooth' }));
    expect(container.querySelector('[data-card-pattern]')).toBeNull();
    expect(container.querySelector('[data-card-bg]')).not.toBeNull();
  });
});

describe('GenericCard cardKind dispatch stays OPEN', () => {
  it('renders the background and NOTHING else for an unregistered cardKind', () => {
    const { container } = draw(card({ cardKind: 'stats-plate', pattern: 'dots' }));
    expect(container.querySelector('[data-card-bg]')).not.toBeNull();
    expect(container.querySelector('[data-card-pattern]')).not.toBeNull();
    expect(lines(container)).toHaveLength(0);
  });

  it('does not throw for an unregistered cardKind', () => {
    expect(() => draw(card({ cardKind: 'whatever-plate' }))).not.toThrow();
  });

  it('renders nothing at all for a non-card item', () => {
    const notCard: VideoItem = { id: 'p', kind: 'photo', startMs: 0, endMs: 1000, source: 'a.jpg' };
    const { container } = draw(notCard);
    expect(container.firstChild).toBeNull();
  });
});

describe('GenericCard claim-plate line stack', () => {
  it('renders one element per line', () => {
    const { container } = draw(card({ cardProps: { lines: ['A', 'B', 'C'] } }));
    expect(lines(container).map((l) => l.textContent)).toEqual(['A', 'B', 'C']);
  });

  it('renders no lines (and does not throw) when cardProps has none', () => {
    const { container } = draw(card({ cardProps: {} }));
    expect(lines(container)).toHaveLength(0);
  });

  it('staggers the reveal: at frame 0 line 0 is starting and later lines are still hidden', () => {
    frameState.frame = 0;
    const { container } = draw(card({ cardProps: { lines: ['A', 'B'] } }));
    expect(lines(container)[0].style.opacity).toBe('0');
    expect(lines(container)[1].style.opacity).toBe('0');
    // Line 1 starts 6 frames later, so at its own start it is still hidden
    // while line 0 has been fully revealed (12-frame reveal window).
    frameState.frame = 12;
    const later = draw(card({ cardProps: { lines: ['A', 'B'] } })).container;
    expect(lines(later)[0].style.opacity).toBe('1');
    expect(Number(lines(later)[1].style.opacity)).toBeLessThan(1);
    expect(Number(lines(later)[1].style.opacity)).toBeGreaterThan(0);
  });

  it('rises each line into place, clamped at both ends', () => {
    frameState.frame = 0;
    const at0 = draw(card({ cardProps: { lines: ['A'] } })).container;
    expect(lines(at0)[0].style.transform).toBe('translateY(40px)');
    frameState.frame = 999;
    const atEnd = draw(card({ cardProps: { lines: ['A'] } })).container;
    expect(lines(atEnd)[0].style.transform).toBe('translateY(0px)');
    expect(lines(atEnd)[0].style.opacity).toBe('1');
  });

  it('takes the stagger timing from tokens', () => {
    frameState.frame = 5;
    const { container } = draw(card({ cardProps: { lines: ['A', 'B'] } }), {
      card: { stagger: { stepFrames: 100, revealFrames: 10, risePx: 4 } },
    });
    // Line 1 does not start until frame 100, so at frame 5 it is untouched.
    expect(lines(container)[1].style.opacity).toBe('0');
    expect(lines(container)[1].style.transform).toBe('translateY(4px)');
  });

  it('takes its typography from tokens, with neutral defaults', () => {
    const { container } = draw(card({ cardProps: { lines: ['A'] } }));
    const d = lines(container)[0];
    expect(d.style.fontFamily).toBe('sans-serif');
    expect(d.style.fontWeight).toBe('700');
    expect(d.style.fontSize).toBe('120px');
    expect(d.style.color).toBe('rgb(255, 255, 255)');

    const { container: c2 } = draw(card({ cardProps: { lines: ['A'] } }), {
      card: { text: { fontFamily: 'Georgia', fontWeight: 300, fontSize: 44, color: '#00ff00', paddingX: 12 } },
    });
    const styled = lines(c2)[0];
    expect(styled.style.fontFamily).toBe('Georgia');
    expect(styled.style.fontWeight).toBe('300');
    expect(styled.style.fontSize).toBe('44px');
    expect(styled.style.color).toBe('rgb(0, 255, 0)');
    expect((c2.querySelector('[data-card-lines]') as HTMLElement).style.padding).toBe('0px 12px');
  });
});

describe('GenericCard endpoint is OPT-IN', () => {
  it('draws no endpoint by default — it is a brand flourish, not a core default', () => {
    const { container } = draw(card({ cardProps: { lines: ['A', 'B'] } }));
    expect(container.querySelector('[data-card-endpoint]')).toBeNull();
  });

  it('draws the endpoint after the LAST line only, when tokens ask for it', () => {
    const { container } = draw(card({ cardProps: { lines: ['A', 'B'] } }), {
      card: { endpoint: { text: '.', color: '#2ad4c5' } },
    });
    const ends = container.querySelectorAll('[data-card-endpoint]');
    expect(ends).toHaveLength(1);
    expect(lines(container)[1].textContent).toBe('B.');
    expect((ends[0] as HTMLElement).style.color).toBe('rgb(42, 212, 197)');
  });
});
