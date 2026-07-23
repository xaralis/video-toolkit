import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Waveform } from './Waveform';

// A non-empty peaks buffer so the component renders (it returns null when empty).
const peaks = new Float32Array(64).fill(0.5);

describe('Waveform layout', () => {
  it('with pxPerSec renders at a FIXED px width anchored right (so a left-trim holds)', () => {
    const { container } = render(<Waveform peaks={peaks} sourceInMs={0} spanMs={3000} pxPerSec={80} anchor="right" />);
    const svg = container.querySelector('svg')!;
    // 3000ms @ 80px/s = 240px, stuck to the right edge, NOT stretched to 100%.
    expect(svg.style.width).toBe('240px');
    expect(svg.style.right).toBe('0px');
    expect(svg.style.left).toBe('');
  });

  it('anchors left when the right handle is the one being dragged', () => {
    const { container } = render(<Waveform peaks={peaks} sourceInMs={0} spanMs={2000} pxPerSec={80} anchor="left" />);
    const svg = container.querySelector('svg')!;
    expect(svg.style.width).toBe('160px'); // 2000ms @ 80px/s
    expect(svg.style.left).toBe('0px');
    expect(svg.style.right).toBe('');
  });

  it('falls back to stretch-to-fill (100%) when no pxPerSec is given', () => {
    const { container } = render(<Waveform peaks={peaks} sourceInMs={0} spanMs={3000} />);
    const svg = container.querySelector('svg')!;
    expect(svg.style.width).toBe('100%');
  });
});
