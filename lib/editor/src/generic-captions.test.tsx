import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// GenericCaptions reads only the frame hooks; everything else about it is pure
// logic + CSS, so mock the two hooks and assert on the produced DOM.
const frameState = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => frameState.frame,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

import {
  linesFromWords,
  activeAmount,
  chunkWords,
  strokeShadow,
  type CaptionSourceWord,
} from '@video-toolkit/lib/theming/generic/caption-lines';
import { GenericCaptions } from '@video-toolkit/lib/theming/generic/GenericCaptions';
import type { CaptionTokens } from '@video-toolkit/lib/theming';

const w = (start: number, end: number, word: string): CaptionSourceWord => ({ start, end, word });

beforeEach(() => {
  frameState.frame = 0;
});

// ─────────────────────────── pure: linesFromWords ───────────────────────────

describe('linesFromWords', () => {
  it('returns no lines for an empty word list', () => {
    expect(linesFromWords([])).toEqual([]);
  });

  it('returns one line for a single word', () => {
    const lines = linesFromWords([w(0, 1, 'hello')]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('hello');
  });

  it('keeps words on ONE line when gaps are short and the line is short', () => {
    const lines = linesFromWords([w(0, 1, 'aa'), w(1.1, 2, 'bb'), w(2.1, 3, 'cc')]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('aa bb cc');
  });

  it('BREAKS on an inter-word gap longer than gapBreakMs', () => {
    // 0.5s of silence between "aa" and "bb" — over the 350ms default.
    const lines = linesFromWords([w(0, 1, 'aa'), w(1.5, 2, 'bb')]);
    expect(lines.map((l) => l.text)).toEqual(['aa', 'bb']);
    // the broken line ends at the PREVIOUS word's end, not the next word's start
    expect(lines[0].endMs).toBe(1000);
  });

  it('does NOT break on a gap at or below gapBreakMs', () => {
    const lines = linesFromWords([w(0, 1, 'aa'), w(1.3, 2, 'bb')]);
    expect(lines).toHaveLength(1);
  });

  it('honours a custom gapBreakMs', () => {
    const words = [w(0, 1, 'aa'), w(1.3, 2, 'bb')];
    expect(linesFromWords(words, { gapBreakMs: 250 })).toHaveLength(2);
    expect(linesFromWords(words, { gapBreakMs: 400 })).toHaveLength(1);
  });

  it('BREAKS when the candidate line would exceed maxChars', () => {
    // 3x "aaaaaaaaaa" (10 chars) joined = 32 chars > the 28 default.
    const lines = linesFromWords([
      w(0, 1, 'aaaaaaaaaa'),
      w(1, 2, 'bbbbbbbbbb'),
      w(2, 3, 'cccccccccc'),
    ]);
    expect(lines.map((l) => l.text)).toEqual(['aaaaaaaaaa bbbbbbbbbb', 'cccccccccc']);
  });

  it('honours a custom maxChars', () => {
    const words = [w(0, 1, 'aaaa'), w(1, 2, 'bbbb')];
    expect(linesFromWords(words, { maxChars: 5 })).toHaveLength(2);
    expect(linesFromWords(words, { maxChars: 40 })).toHaveLength(1);
  });

  it("adds the grace period to the LAST line's endMs", () => {
    const lines = linesFromWords([w(0, 1, 'aa'), w(1.5, 2, 'bb')]);
    expect(lines[0].endMs).toBe(1000); // untouched
    expect(lines[1].endMs).toBe(2000 + 600); // graced
  });

  it("adds the grace period to the LAST WORD's endMs as well (separate from the line's)", () => {
    const lines = linesFromWords([w(0, 1, 'aa'), w(1.1, 2, 'bb')]);
    const words = lines[0].words!;
    expect(words[0].endMs).toBe(1000); // untouched
    expect(words[words.length - 1].endMs).toBe(2000 + 600); // graced
  });

  it('honours a custom lastLineGraceMs on BOTH the line and its last word', () => {
    const lines = linesFromWords([w(0, 1, 'aa')], { lastLineGraceMs: 100 });
    expect(lines[0].endMs).toBe(1100);
    expect(lines[0].words![0].endMs).toBe(1100);
  });

  it('trims each word and carries ms timings through', () => {
    const lines = linesFromWords([w(0, 0.5, ' hi '), w(0.6, 1, ' yo ')]);
    expect(lines[0].text).toBe('hi yo');
    expect(lines[0].startMs).toBe(0);
    expect(lines[0].words![1].word).toBe('yo');
    expect(lines[0].words![1].startMs).toBe(600);
  });
});

// ──────────────────────────── pure: activeAmount ────────────────────────────

describe('activeAmount', () => {
  it('is 0 well before the word', () => {
    expect(activeAmount(1000, 2000, 900)).toBe(0);
  });

  it('is 1 inside the word', () => {
    expect(activeAmount(1000, 2000, 1500)).toBe(1);
  });

  it('is 1 exactly at both edges', () => {
    expect(activeAmount(1000, 2000, 1000)).toBe(1);
    expect(activeAmount(1000, 2000, 2000)).toBe(1);
  });

  it('is 0 well after the word', () => {
    expect(activeAmount(1000, 2000, 2100)).toBe(0);
  });

  // The RAMP, not the plateau: removing the ±30ms ramp makes these two 0.
  it('ramps linearly UP across the 30ms before the word (0.5 at the midpoint)', () => {
    expect(activeAmount(1000, 2000, 985)).toBeCloseTo(0.5, 10);
    expect(activeAmount(1000, 2000, 977.5)).toBeCloseTo(0.25, 10);
    expect(activeAmount(1000, 2000, 970)).toBeCloseTo(0, 10);
  });

  it('ramps linearly DOWN across the 30ms after the word (0.5 at the midpoint)', () => {
    expect(activeAmount(1000, 2000, 2015)).toBeCloseTo(0.5, 10);
    expect(activeAmount(1000, 2000, 2022.5)).toBeCloseTo(0.25, 10);
  });

  it('honours a custom fade width', () => {
    expect(activeAmount(1000, 2000, 950, 100)).toBeCloseTo(0.5, 10);
    expect(activeAmount(1000, 2000, 950)).toBe(0); // default 30ms ramp is long past
  });
});

// ────────────────────────────── pure: chunkWords ─────────────────────────────

describe('chunkWords', () => {
  const sizes = (n: number, max?: number) =>
    chunkWords(Array.from({ length: n }, (_, i) => i), max).map((c) => c.length);

  it('returns nothing for an empty list', () => {
    expect(chunkWords([])).toEqual([]);
  });

  // The even-distribution rule: a naive greedy split would give [4,1] / [4,4,1].
  it.each([
    [1, [1]],
    [4, [4]],
    [5, [3, 2]],
    [7, [4, 3]],
    [9, [3, 3, 3]],
  ])('splits %i words as %j — never a 1-word micro-chunk', (n, expected) => {
    expect(sizes(n)).toEqual(expected);
  });

  it('never exceeds the chunk cap', () => {
    for (let n = 1; n <= 40; n++) {
      expect(Math.max(...sizes(n))).toBeLessThanOrEqual(4);
    }
  });

  it('preserves order and every element', () => {
    expect(chunkWords([1, 2, 3, 4, 5])).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('honours a custom maxWordsPerChunk', () => {
    expect(sizes(5, 2)).toEqual([2, 2, 1]);
    expect(sizes(6, 3)).toEqual([3, 3]);
  });
});

// ────────────────────────────── pure: strokeShadow ───────────────────────────

describe('strokeShadow', () => {
  it('emits (2px+1)^2 - 1 offsets — 80 at the default width of 4', () => {
    expect(strokeShadow(4, '#000000').split(', ')).toHaveLength(80);
    expect(strokeShadow(1, '#000000').split(', ')).toHaveLength(8);
  });

  it('excludes the centre offset', () => {
    expect(strokeShadow(2, '#000000')).not.toContain('0px 0px 0 ');
  });

  it('uses the colour it is given', () => {
    expect(strokeShadow(1, '#123456')).toContain('#123456');
  });
});

// ───────────────────────────── component rendering ───────────────────────────

const LINE_WORDS = [w(0, 1, 'one'), w(1, 2, 'two'), w(2, 3, 'three'), w(3, 4, 'four'), w(4, 5, 'five')];

const draw = (props: Partial<React.ComponentProps<typeof GenericCaptions>> = {}) =>
  render(<GenericCaptions words={LINE_WORDS} {...props} />);

const spans = (c: HTMLElement) => Array.from(c.querySelectorAll('[data-caption-word]')) as HTMLElement[];

describe('GenericCaptions — line selection', () => {
  it('renders nothing when no line is active at the current frame', () => {
    frameState.frame = 300; // 10s, past the line + grace
    const { container } = draw();
    expect(container.querySelector('[data-captions-root]')).toBeNull();
  });

  it('renders nothing when there are neither words nor lines', () => {
    frameState.frame = 0;
    const { container } = render(<GenericCaptions />);
    expect(container.firstChild).toBeNull();
  });

  it('an explicit `lines` prop SKIPS the grouper entirely', () => {
    frameState.frame = 45; // 1500ms
    // The grouper would have produced "one two three four five" from `words`;
    // the explicit line wins and its own text is drawn.
    const { container } = draw({
      lines: [{ startMs: 0, endMs: 5000, text: 'hand written' }],
    });
    expect(container.textContent).toBe('hand written');
  });

  it('draws a plain single span for an explicit line with no word timings', () => {
    frameState.frame = 45;
    const { container } = draw({ lines: [{ startMs: 0, endMs: 5000, text: 'no timings' }] });
    expect(spans(container)).toHaveLength(1);
    expect(container.querySelector('[data-caption-pill]')).toBeNull();
  });
});

describe('GenericCaptions — lift windows', () => {
  it('sits at the base 20% when outside every lift window', () => {
    frameState.frame = 45;
    const { container } = draw({ liftWindows: [{ startMs: 3000, endMs: 4000 }] });
    const root = container.querySelector('[data-captions-root]') as HTMLElement;
    expect(root.style.bottom).toBe('20%');
  });

  it('LIFTS to 42% while inside a lift window — never suppressed', () => {
    frameState.frame = 45; // 1500ms
    const { container } = draw({ liftWindows: [{ startMs: 1000, endMs: 2000 }] });
    const root = container.querySelector('[data-captions-root]') as HTMLElement;
    expect(root.style.bottom).toBe('42%');
    expect(container.textContent).not.toBe(''); // still drawn
  });

  it('honours bottomPct / liftBottomPct tokens', () => {
    frameState.frame = 45;
    const tokens: CaptionTokens = { bottomPct: 0.1, liftBottomPct: 0.6 };
    const out = draw({ tokens });
    expect((out.container.querySelector('[data-captions-root]') as HTMLElement).style.bottom).toBe('10%');
    const lifted = draw({ tokens, liftWindows: [{ startMs: 0, endMs: 5000 }] });
    expect((lifted.container.querySelector('[data-captions-root]') as HTMLElement).style.bottom).toBe('60%');
  });
});

describe('GenericCaptions — pop-focus mode (the default)', () => {
  it('draws a nowrap pill holding ONLY the active chunk', () => {
    frameState.frame = 45; // 1500ms → chunk [one two three] of [3,2]
    const { container } = draw();
    const pill = container.querySelector('[data-caption-pill]') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.whiteSpace).toBe('nowrap');
    expect(spans(container).map((s) => s.textContent)).toEqual(['one', 'two', 'three']);
  });

  it('advances to the NEXT chunk as time passes', () => {
    frameState.frame = 105; // 3500ms → chunk [four five]
    const { container } = draw();
    expect(spans(container).map((s) => s.textContent)).toEqual(['four', 'five']);
  });

  it('flips ONLY the active word to activeColor', () => {
    frameState.frame = 45; // 1500ms → "two" is active
    const { container } = draw();
    const colors = spans(container).map((s) => s.style.color);
    expect(colors).toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 0)', 'rgb(255, 255, 255)']);
  });

  it('honours colour / typography / background tokens', () => {
    frameState.frame = 45;
    const { container } = draw({
      tokens: {
        color: '#112233',
        activeColor: '#445566',
        background: '#778899',
        fontFamily: 'Courier',
        fontSize: 100,
        fontWeight: 400,
      },
    });
    const pill = container.querySelector('[data-caption-pill]') as HTMLElement;
    expect(pill.style.backgroundColor).toBe('rgb(119, 136, 153)');
    expect(pill.style.fontFamily).toBe('Courier');
    expect(pill.style.fontSize).toBe('104px'); // 100 * the 1.04 pop multiplier
    expect(pill.style.fontWeight).toBe('400');
    expect(spans(container)[1].style.color).toBe('rgb(68, 85, 102)');
    expect(spans(container)[0].style.color).toBe('rgb(17, 34, 51)');
  });

  it('threads maxWordsPerChunk through to the chunker', () => {
    frameState.frame = 45; // 1500ms
    const { container } = draw({ tokens: { maxWordsPerChunk: 2 } });
    // 5 words at cap 2 → [2,2,1]; 1500ms lands in the FIRST chunk.
    expect(spans(container).map((s) => s.textContent)).toEqual(['one', 'two']);
  });

  it('threads maxChars through to the grouper', () => {
    frameState.frame = 45;
    const { container } = draw({ tokens: { maxChars: 7 } });
    // "one two" is 7 chars; adding "three" breaks → the active line is just that.
    expect(spans(container).map((s) => s.textContent)).toEqual(['one', 'two']);
  });

  it('threads gapBreakMs through to the grouper', () => {
    frameState.frame = 45;
    // Zero-gap words: only a gapBreakMs below 0 could split them, so instead
    // use words with a 200ms gap and a 100ms threshold.
    const gapped = [w(0, 1, 'one'), w(1.2, 3, 'two')];
    const joined = draw({ words: gapped, tokens: {} });
    expect(spans(joined.container).map((s) => s.textContent)).toEqual(['one', 'two']);
    const split = draw({ words: gapped, tokens: { gapBreakMs: 100 } });
    expect(spans(split.container).map((s) => s.textContent)).toEqual(['two']);
  });

  it('threads lastLineGraceMs through to the grouper', () => {
    // 5000ms is the raw end of the last word; the default 600ms grace keeps the
    // line alive there, a 0ms grace does not.
    frameState.frame = 152; // ≈5066ms
    expect(draw().container.querySelector('[data-captions-root]')).not.toBeNull();
    expect(
      draw({ tokens: { lastLineGraceMs: 0 } }).container.querySelector('[data-captions-root]'),
    ).toBeNull();
  });

  it('applies the stacked-shadow stroke to every span, at the token width', () => {
    frameState.frame = 45;
    const wide = draw();
    expect(spans(wide.container)[0].style.textShadow.split(', ')).toHaveLength(80);
    const thin = draw({ tokens: { strokeWidthPx: 1, strokeColor: '#123456' } });
    const shadow = spans(thin.container)[0].style.textShadow;
    expect(shadow.split(', ')).toHaveLength(8);
    expect(shadow).toContain('#123456');
  });
});

describe('GenericCaptions — highlight mode', () => {
  const highlight = (over: CaptionTokens = {}) =>
    draw({ tokens: { mode: 'highlight', ...over } });

  it('draws the WHOLE line, not one chunk', () => {
    frameState.frame = 45;
    const { container } = highlight();
    expect(container.querySelector('[data-caption-pill]')).toBeNull();
    expect(spans(container).map((s) => s.textContent)).toEqual([
      'one',
      'two',
      'three',
      'four',
      'five',
    ]);
  });

  it('recedes inactive words to 0.55 opacity and holds the active one at 1', () => {
    frameState.frame = 45; // "two" active
    const { container } = highlight();
    const opacities = spans(container).map((s) => s.style.opacity);
    expect(opacities).toEqual(['0.55', '1', '0.55', '0.55', '0.55']);
  });

  it('scales the active word up by 1.08 and leaves the rest at 1', () => {
    frameState.frame = 45;
    const { container } = highlight();
    expect(spans(container)[1].style.transform).toBe('scale(1.08)');
    expect(spans(container)[0].style.transform).toBe('scale(1)');
  });

  it('haloes the active word in activeColor and nobody else', () => {
    frameState.frame = 45;
    const { container } = highlight({ activeColor: '#00ff00' });
    // The halo alpha rides the active envelope, so the colour is emitted with
    // an alpha channel — never a hardcoded brand rgba().
    expect(spans(container)[1].style.textShadow).toContain('0 0 10px');
    expect(spans(container)[0].style.textShadow).not.toContain('0 0 10px');
  });

  it('honours maxWidthPct', () => {
    frameState.frame = 45;
    const { container } = highlight({ maxWidthPct: 0.5 });
    const line = container.querySelector('[data-caption-line]') as HTMLElement;
    expect(line.style.maxWidth).toBe('50%');
  });
});
