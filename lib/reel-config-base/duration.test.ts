import { describe, expect, it } from 'vitest';
import { segmentDurationFrames, totalDurationFrames } from './duration';

// Local test shape — segmentDurationFrames accepts a structural shape, so
// we can include card/outro variants (which live in template-specific types)
// alongside the base clip/broll/multi-clip kinds.
type TestSegment =
  | { id: string; type: 'clip'; source: string; trimIn: number; trimOut: number }
  | { id: string; type: 'broll'; source: string; trimIn: number; trimOut: number; audioMode: 'silent' }
  | { id: string; type: 'multi-clip'; layout: 'split-h'; sources: []; durationMs: number; audioMode: 'first' }
  | { id: string; type: 'card'; kind: 'claim-plate'; props: Record<string, unknown>; durationMs: number }
  | { id: string; type: 'outro' };

const FPS = 30;
const OUTRO_FRAMES = 180;

describe('segmentDurationFrames', () => {
  it('clip: derived from trim range in seconds', () => {
    const seg: TestSegment = { id: 's1', type: 'clip', source: 'a.mp4', trimIn: 2.0, trimOut: 7.5 };
    expect(segmentDurationFrames(seg, FPS, OUTRO_FRAMES)).toBe(165);
  });

  it('broll: derived from trim range', () => {
    const seg: TestSegment = { id: 's1', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 4, audioMode: 'silent' };
    expect(segmentDurationFrames(seg, FPS, OUTRO_FRAMES)).toBe(120);
  });

  it('clip: half-frame trim endpoints do not add a trailing (black) frame', () => {
    // trimIn 12.75 → 382.5 rounds UP to 383; trimOut 15.9 → 477. The trimmed
    // video provides 477-383 = 94 frames, so the Sequence MUST be 94 — not
    // round((15.9-12.75)*30) = round(94.5) = 95, which would leave one black
    // frame at the cut (regression guard for the lib duration fix).
    const seg: TestSegment = { id: 's1', type: 'clip', source: 'a.mp4', trimIn: 12.75, trimOut: 15.9 };
    expect(segmentDurationFrames(seg, FPS, OUTRO_FRAMES)).toBe(94);
  });

  it('multi-clip: explicit durationMs', () => {
    const seg: TestSegment = {
      id: 's1',
      type: 'multi-clip',
      layout: 'split-h',
      sources: [],
      durationMs: 5000,
      audioMode: 'first',
    };
    expect(segmentDurationFrames(seg, FPS, OUTRO_FRAMES)).toBe(150);
  });

  it('card: explicit durationMs', () => {
    const seg: TestSegment = { id: 's1', type: 'card', kind: 'claim-plate', props: {}, durationMs: 3000 };
    expect(segmentDurationFrames(seg, FPS, OUTRO_FRAMES)).toBe(90);
  });

  it('outro: outroFrames argument', () => {
    expect(segmentDurationFrames({ id: 's1', type: 'outro' }, FPS, OUTRO_FRAMES)).toBe(180);
  });
});

describe('totalDurationFrames', () => {
  it('sums all segments', () => {
    const segments: TestSegment[] = [
      { id: 's1', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 5 },
      { id: 's2', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent' },
      { id: 's3', type: 'outro' },
    ];
    expect(totalDurationFrames(segments, FPS, OUTRO_FRAMES)).toBe(420);
  });
});
