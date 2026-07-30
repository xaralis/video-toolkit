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
    // Split into entries rather than substring-matching the whole string: at
    // px >= 5 the offset `-10px 0px 0 ...` CONTAINS "0px 0px 0 ", so a
    // substring check passes today only because px is 2 and would false-fail
    // for whoever raises the default.
    for (const px of [1, 2, 5, 7]) {
      expect(strokeShadow(px, '#000000').split(', ')).not.toContain('0px 0px 0 #000000');
    }
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

  // The migration path for the brand shipping captions today rests on these
  // defaults already matching its live module constants, so pin them.
  it('defaults the pill to fontSize 52 (x1.04 in-pill) on a black background', () => {
    frameState.frame = 45;
    const pill = draw().container.querySelector('[data-caption-pill]') as HTMLElement;
    expect(pill.style.fontSize).toBe('54.08px'); // 52 * 1.04
    expect(pill.style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(pill.style.fontFamily).toBe('monospace');
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
    // A 200ms gap: under the 350ms default the words stay on one line; a
    // 100ms threshold splits them, leaving only the second line alive at 1500ms.
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

// ─────────────── Task 5.1: geometry tokens, proportional not absolute ───────────────
//
// The failure mode this task exists to fix: POP_PAD_X/POP_PAD_Y (and the
// highlight halo) used to be flat px against a token-driven `fontSize`, so
// raising `fontSize` shrank them proportionally instead of scaling them. The
// two tests marked MUTATION PIN below are the ones that actually defend that
// — a test that only sets the padding token directly would pass against the
// broken px version too (CONSTRAINTS.md's own warning).
describe('GenericCaptions — pop-focus pill padding is a RATIO of fontSize (Task 5.1)', () => {
  it('defaults to 10px/22px at fontSize 52 — the pre-Task-5.1 literal, exactly', () => {
    frameState.frame = 45;
    const pill = draw().container.querySelector('[data-caption-pill]') as HTMLElement;
    expect(pill.style.padding).toBe('10px 22px');
  });

  // MUTATION PIN #1 (CONSTRAINTS.md "pin the wiring"): a non-default token
  // value must change the rendered geometry. Breaking the line that reads
  // `t.popPadXEm`/`t.popPadYEm` (e.g. reverting to the DEFAULT_* constant
  // unconditionally) turns this red.
  it('honours popPadXEm / popPadYEm overrides directly', () => {
    frameState.frame = 45;
    const pill = draw({ tokens: { popPadXEm: 1, popPadYEm: 0.5 } }).container.querySelector(
      '[data-caption-pill]',
    ) as HTMLElement;
    // fontSize 52 (default) * 1 = 52, * 0.5 = 26.
    expect(pill.style.padding).toBe('26px 52px');
  });

  // MUTATION PIN #2, the one that matters (CONSTRAINTS.md + the brief: "change
  // fontSize and assert the padding scales with it" — this is the actual bug
  // being fixed). Reverting `popPadXPx`/`popPadYPx` in GenericCaptions.tsx back
  // to a flat `POP_PAD_X`/`POP_PAD_Y` px constant (ignoring `fontSize`) turns
  // this red: the padding would stay 22px/10px instead of doubling.
  it('SCALES the padding with fontSize — doubling fontSize doubles the padding', () => {
    frameState.frame = 45;
    const pill = draw({ tokens: { fontSize: 104 } }).container.querySelector(
      '[data-caption-pill]',
    ) as HTMLElement;
    expect(pill.style.padding).toBe('20px 44px'); // 10*2 / 22*2
  });

  it('at a THIRD fontSize the ratio still holds (not a fontSize=104 special case)', () => {
    frameState.frame = 45;
    const pill = draw({ tokens: { fontSize: 26 } }).container.querySelector(
      '[data-caption-pill]',
    ) as HTMLElement;
    expect(pill.style.padding).toBe('5px 11px'); // 10/2, 22/2
  });
});

describe('GenericCaptions — highlight halo is a RATIO of fontSize (Task 5.1)', () => {
  it('defaults to a 10px halo at fontSize 52 (the pre-Task-5.1 literal)', () => {
    frameState.frame = 45;
    const { container } = draw({ tokens: { mode: 'highlight' } });
    expect(spans(container)[1].style.textShadow).toContain('0 0 10px');
  });

  // MUTATION PIN: scaling proof, same shape as the padding pin above. Reverting
  // `highlightHaloMaxPx` to the flat `HIGHLIGHT_HALO_MAX_EM * fontSize` — i.e.
  // dropping the fontSize factor back to a constant 10 — turns this red.
  it('SCALES the halo with fontSize', () => {
    frameState.frame = 45;
    const { container } = draw({ tokens: { mode: 'highlight', fontSize: 104 } });
    expect(spans(container)[1].style.textShadow).toContain('0 0 20px');
  });

  it('honours a highlightHaloMaxEm override directly', () => {
    frameState.frame = 45;
    const { container } = draw({ tokens: { mode: 'highlight', highlightHaloMaxEm: 1 } });
    // fontSize 52 (default) * 1 = 52.
    expect(spans(container)[1].style.textShadow).toContain('0 0 52px');
  });
});

describe('GenericCaptions — the rest of the promoted geometry is token-driven, not constant', () => {
  it('pop-focus: popFontMultiplier, popTailMs, popLetterSpacing, popLineHeight all come from tokens', () => {
    frameState.frame = 45;
    const pill = draw({
      tokens: {
        popFontMultiplier: 2,
        popLetterSpacing: '0.5em',
        popLineHeight: 3,
      },
    }).container.querySelector('[data-caption-pill]') as HTMLElement;
    expect(pill.style.fontSize).toBe('104px'); // 52 * 2
    expect(pill.style.letterSpacing).toBe('0.5em');
    expect(pill.style.lineHeight).toBe('3');
  });

  it('popTailMs extends (or shortens) how long a chunk stays mounted past its last word', () => {
    // A single explicit line, generously long so the OUTER line-active window
    // (governed by lastLineGraceMs, a different token) never gates this —
    // isolating the chunk-level popTailMs boundary being tested.
    const explicitLine = {
      startMs: 0,
      endMs: 10000,
      text: 'a b',
      words: [
        { startMs: 0, endMs: 1000, word: 'a' },
        { startMs: 1000, endMs: 2000, word: 'b' },
      ],
    };
    frameState.frame = 62; // ≈2066.67ms — 66.67ms past word "b"'s 2000ms end.
    // Default 30ms tail: cutoff at 2030ms, which 2066.67ms is past → hidden.
    const short = draw({ lines: [explicitLine] });
    expect(short.container.querySelector('[data-caption-pill]')).toBeNull();
    // A 100ms tail: cutoff at 2100ms, which 2066.67ms is still inside → shown.
    const long = draw({ lines: [explicitLine], tokens: { popTailMs: 100 } });
    expect(long.container.querySelector('[data-caption-pill]')).not.toBeNull();
  });

  it('highlight: highlightOpacityInactive / highlightScaleBump / highlightHaloAlpha / highlightLetterSpacing / highlightLineHeight all come from tokens', () => {
    frameState.frame = 45; // "two" active
    const { container } = draw({
      tokens: {
        mode: 'highlight',
        highlightOpacityInactive: 0.2,
        highlightScaleBump: 1,
        highlightHaloAlpha: 1,
        highlightLetterSpacing: '0.9em',
        highlightLineHeight: 5,
        activeColor: '#00ff00',
      },
    });
    expect(spans(container)[0].style.opacity).toBe('0.2'); // inactive word
    expect(spans(container)[1].style.transform).toBe('scale(2)'); // 1 + 1*1
    expect(spans(container)[1].style.textShadow).toContain('0 0 10px #00ff00ff'); // alpha 1 -> ff
    const line = container.querySelector('[data-caption-line]') as HTMLElement;
    expect(line.style.letterSpacing).toBe('0.9em');
    expect(line.style.lineHeight).toBe('5');
  });

  // MUTATION PIN — this is the caption-lines.ts constant the brief calls out
  // by name (`DEFAULT_CAPTION_WORD_FADE_MS`, "has no token field while its
  // four siblings do"). Breaking the `wordFadeMs` thread (e.g. calling
  // `activeAmount(w.startMs, w.endMs, ms)` without the 4th argument, as the
  // code did before this task) turns this red: "two" would stay fully
  // inactive (opacity 0.55) at frame 28 regardless of the token.
  it('wordFadeMs threads through to BOTH modes\' activeAmount call — widening it activates a word earlier', () => {
    frameState.frame = 28; // ≈933.33ms — 66.67ms before "two" (1000-2000ms) starts.
    // Default 30ms ramp: 933ms is fully outside it → "two" untouched (0.55).
    const narrow = draw({ tokens: { mode: 'highlight' } });
    expect(spans(narrow.container)[1].style.opacity).toBe('0.55');
    // A 200ms ramp reaches back to 800ms, so 933ms is INSIDE it (partial).
    const wide = draw({ tokens: { mode: 'highlight', wordFadeMs: 200 } });
    expect(Number(spans(wide.container)[1].style.opacity)).toBeGreaterThan(0.55);
  });
});

// wordGap: reconciled to ONE value shared by both modes (Task 5.1) — pop-focus
// kept its 0.4em ('the shipping brand's LIVE mode'); highlight's former
// 0.45em is the pixel change this reconciliation makes, and it is unrendered
// today (highlight mode is "dead in that brand's code").
describe('GenericCaptions — wordGap is ONE token shared by pop-focus and highlight (Task 5.1 reconciliation)', () => {
  it('pop-focus defaults its inter-word margin to 0.4em, unchanged from before', () => {
    frameState.frame = 45;
    const { container } = draw();
    // 3-word chunk: first two spans get the gap, the last gets 0.
    const words = spans(container);
    expect(words[0].style.marginRight).toBe('0.4em');
    expect(words[1].style.marginRight).toBe('0.4em');
    expect(words[2].style.marginRight).toBe('0px');
  });

  it("highlight now defaults its inter-word margin to 0.4em too (was 0.45em — the reconciliation's pixel change)", () => {
    frameState.frame = 45;
    const { container } = draw({ tokens: { mode: 'highlight' } });
    const words = spans(container);
    expect(words[0].style.marginRight).toBe('0.4em');
    expect(words[words.length - 1].style.marginRight).toBe('0px');
  });

  it('a wordGap override moves BOTH modes together, proving it is one token not two', () => {
    frameState.frame = 45;
    const pop = draw({ tokens: { wordGap: '2em' } });
    expect(spans(pop.container)[0].style.marginRight).toBe('2em');
    const hl = draw({ tokens: { mode: 'highlight', wordGap: '2em' } });
    expect(spans(hl.container)[0].style.marginRight).toBe('2em');
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

  it('haloes the active word and nobody else', () => {
    frameState.frame = 45;
    const { container } = highlight();
    expect(spans(container)[1].style.textShadow).toContain('0 0 10px');
    expect(spans(container)[0].style.textShadow).not.toContain('0 0 10px');
  });

  // The halo COLOUR, pinned explicitly. This is the one place a brand literal
  // was neutralised — the ported implementation hardcoded `rgba(198,244,50, …)`,
  // one brand's accent — so it is the one place a regression would be silent:
  // the brand-leak grep matches the word `lime`, not a numeric rgba triple.
  it('draws the halo in activeColor, with the envelope as its alpha channel', () => {
    frameState.frame = 45; // "two" fully active → alpha 0.5 * 1 → hex 80
    const green = highlight({ activeColor: '#00ff00' });
    expect(spans(green.container)[1].style.textShadow).toContain('0 0 10px #00ff0080');

    // Tracks the token: a different activeColor gives a different halo, so a
    // hardcoded colour cannot satisfy both assertions.
    const blue = highlight({ activeColor: '#0000ff' });
    expect(spans(blue.container)[1].style.textShadow).toContain('0 0 10px #0000ff80');
  });

  it('ramps the halo alpha with the active envelope', () => {
    frameState.frame = 61; // ≈2033ms — 33ms past "two", inside the 30ms… past it
    const { container } = highlight({ activeColor: '#00ff00' });
    // "three" (2000–3000ms) is now the active word at full envelope.
    expect(spans(container)[2].style.textShadow).toContain('0 0 10px #00ff0080');
    // and "two" has dropped out of its ramp entirely.
    expect(spans(container)[1].style.textShadow).not.toContain('0 0 ');
  });

  it('leaves a non-hex activeColor untouched rather than mangling it', () => {
    frameState.frame = 45;
    const { container } = highlight({ activeColor: 'rgb(1, 2, 3)' });
    expect(spans(container)[1].style.textShadow).toContain('rgb(1, 2, 3)');
  });

  it('defaults maxWidthPct to 0.86', () => {
    frameState.frame = 45;
    const line = highlight().container.querySelector('[data-caption-line]') as HTMLElement;
    expect(line.style.maxWidth).toBe('86%');
  });

  it('defaults fontSize to 52 and fontFamily to monospace', () => {
    frameState.frame = 45;
    const line = highlight().container.querySelector('[data-caption-line]') as HTMLElement;
    expect(line.style.fontSize).toBe('52px');
    expect(line.style.fontFamily).toBe('monospace');
    expect(line.style.fontWeight).toBe('700');
  });

  it('honours maxWidthPct', () => {
    frameState.frame = 45;
    const { container } = highlight({ maxWidthPct: 0.5 });
    const line = container.querySelector('[data-caption-line]') as HTMLElement;
    expect(line.style.maxWidth).toBe('50%');
  });
});
