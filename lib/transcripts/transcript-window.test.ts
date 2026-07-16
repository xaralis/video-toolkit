import { describe, expect, it } from 'vitest';
import { transcriptWindow } from './transcript-window';

const TRANSCRIPT = {
  language: 'cs',
  duration: 10,
  segments: [
    { id: 0, start: 0, end: 4, text: 'První věta.',
      words: [
        { start: 0,   end: 0.5, word: 'První' },
        { start: 0.6, end: 1.0, word: 'věta.' },
      ]
    },
    { id: 1, start: 4, end: 8, text: 'Druhá věta.',
      words: [
        { start: 4.0, end: 4.5, word: 'Druhá' },
        { start: 4.6, end: 5.0, word: 'věta.' },
      ]
    },
  ],
};

describe('transcriptWindow', () => {
  it('returns words within [trimIn, trimOut], remapped to start at 0', () => {
    const out = transcriptWindow(TRANSCRIPT, 4, 8);
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ start: 0,   end: 0.5, word: 'Druhá' });
    expect(out[1].word).toBe('věta.');
    expect(out[1].start).toBeCloseTo(0.6, 5);
    expect(out[1].end).toBeCloseTo(1.0, 5);
  });
  it('partial-overlap words are included', () => {
    const out = transcriptWindow(TRANSCRIPT, 0.4, 1.0);
    expect(out.length).toBe(2);
  });
  it('empty when range outside all segments', () => {
    expect(transcriptWindow(TRANSCRIPT, 20, 30)).toEqual([]);
  });
});
