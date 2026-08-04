import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import * as paths from './timeline-paths';
import { Waveform } from './Waveform';
import { MusicEnvelope } from './MusicEnvelope';

// The path builders are spied on rather than mocked out: the components keep
// drawing real output (so nothing here depends on a stub's shape), and the spy
// counts how often the work is actually done. That count IS the regression this
// file exists for — see the header of ./timeline-paths.ts for the measurement
// that motivated it.
vi.mock('./timeline-paths', async (importOriginal) => {
  const real = await importOriginal<typeof paths>();
  return {
    ...real,
    waveformPath: vi.fn(real.waveformPath),
    envelopePath: vi.fn(real.envelopePath),
  };
});

const peaks = new Float32Array(64).fill(0.5);
const envelopePoints = [
  { frame: 0, gain: 0.4 },
  { frame: 30, gain: 1 },
  { frame: 90, gain: 0.4 },
];

beforeEach(() => {
  vi.mocked(paths.waveformPath).mockClear();
  vi.mocked(paths.envelopePath).mockClear();
});

describe('waveformPath', () => {
  it('draws one vertical bar per peak, centred on the mid-line', () => {
    const d = paths.waveformPath(new Float32Array([1, 0]), 0, 2, 100, 100);
    // peak 1.0 spans the full half-height either side of mid (50); peak 0 is a
    // zero-length mark at mid, which is what draws the flat line through silence.
    expect(d).toBe('M0.0,0.0L0.0,100.0M50.0,50.0L50.0,50.0');
  });

  it('reads peaks past the end of the buffer as silence rather than throwing', () => {
    // A block trimmed past its source: `count` runs off the end of `peaks`.
    expect(() => paths.waveformPath(new Float32Array([1]), 0, 3, 30, 100)).not.toThrow();
    expect(paths.waveformPath(new Float32Array([1]), 0, 3, 30, 100)).toContain('M10.0,50.0L10.0,50.0');
  });

  it('offsets into the buffer by the block’s source in-point', () => {
    const buf = new Float32Array([0, 1]);
    expect(paths.waveformPath(buf, 1, 1, 100, 100)).toBe('M0.0,0.0L0.0,100.0');
  });
});

describe('waveformBarWidth', () => {
  it('follows the bar SPACING so long and short blocks read with the same weight', () => {
    expect(paths.waveformBarWidth(100, 1000)).toBeCloseTo(7);
  });

  it('never goes below a visible hairline, however dense the block', () => {
    // A 54s music bed at 40 peaks/s: step is well under a unit.
    expect(paths.waveformBarWidth(2160, 1000)).toBe(0.6);
  });
});

describe('envelopePath', () => {
  it('steps as a staircase — horizontal at the old level, then vertical to the new', () => {
    const d = paths.envelopePath([{ frame: 0, gain: 1 }, { frame: 50, gain: 1 }], 100, 1000, 100, -24, 6);
    // 0dB on a -24…+6 scale: two verts at the same y, so the run is flat.
    expect(d).toBe('M0.0,21.2L500.0,21.2L500.0,21.2');
  });

  it('floors a zero gain at the bottom of the scale instead of taking log10(0)', () => {
    const d = paths.envelopePath([{ frame: 0, gain: 0 }, { frame: 10, gain: 1 }], 10, 1000, 100, -24, 6);
    expect(d).not.toContain('NaN');
    expect(d.startsWith('M0.0,98.0')).toBe(true);
  });
});

// The regression these two blocks pin. xzdarcy's Timeline re-renders whenever
// its time state changes, and the playhead drives that once per frame during
// playback — so a parent re-render with UNCHANGED props is exactly what happened
// 30 times a second, on every block in the reel.
describe('the audio block drawings survive a parent re-render without redrawing', () => {
  const Parent = ({ child }: { child: (n: number) => React.ReactNode }) => {
    const [n, setN] = useState(0);
    return (
      <div>
        <button onClick={() => setN((v) => v + 1)}>tick</button>
        {child(n)}
      </div>
    );
  };

  it('Waveform does not rebuild its path when the playhead moves', () => {
    const { getByText } = render(
      <Parent child={() => <Waveform peaks={peaks} sourceInMs={0} spanMs={3000} pxPerSec={80} />} />,
    );
    expect(paths.waveformPath).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) fireEvent.click(getByText('tick'));
    expect(paths.waveformPath).toHaveBeenCalledTimes(1);
  });

  it('…but still redraws when the block itself changes', () => {
    // Guards against the memo being mistaken for correct because it never
    // updates: a trim changes spanMs and the path MUST be rebuilt.
    const { getByText } = render(
      <Parent child={(n) => <Waveform peaks={peaks} sourceInMs={0} spanMs={3000 + n * 100} pxPerSec={80} />} />,
    );
    expect(paths.waveformPath).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('tick'));
    expect(paths.waveformPath).toHaveBeenCalledTimes(2);
  });

  it('MusicEnvelope does not rebuild its staircase when the playhead moves', () => {
    const { getByText } = render(
      <Parent child={() => <MusicEnvelope points={envelopePoints} totalFrames={120} />} />,
    );
    expect(paths.envelopePath).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) fireEvent.click(getByText('tick'));
    expect(paths.envelopePath).toHaveBeenCalledTimes(1);
  });

  it('…but still redraws when the envelope changes', () => {
    const { getByText } = render(
      <Parent child={(n) => <MusicEnvelope points={envelopePoints} totalFrames={120 + n} />} />,
    );
    expect(paths.envelopePath).toHaveBeenCalledTimes(1);
    fireEvent.click(getByText('tick'));
    expect(paths.envelopePath).toHaveBeenCalledTimes(2);
  });
});
