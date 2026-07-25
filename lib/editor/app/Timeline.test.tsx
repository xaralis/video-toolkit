import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Timeline } from './Timeline';

const segments = [
  { id: 'a', type: 'clip', trimIn: 0, trimOut: 3 },
  { id: 'b', type: 'broll', trimIn: 0, trimOut: 3 },
  { id: 'c', type: 'outro' },
];

describe('Timeline', () => {
  it('renders one block per segment', () => {
    render(
      <Timeline
        segments={segments}
        selectedId={null}
        onSelect={vi.fn()}
        fps={30}
        outroFrames={180}
      />
    );
    expect(screen.getByText('clip · 1')).toBeInTheDocument();
    expect(screen.getByText('broll · 2')).toBeInTheDocument();
    expect(screen.getByText('outro')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked segment id', () => {
    const onSelect = vi.fn();
    render(
      <Timeline
        segments={segments}
        selectedId={null}
        onSelect={onSelect}
        fps={30}
        outroFrames={180}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'broll · 2' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('marks the selected block', () => {
    render(
      <Timeline
        segments={segments}
        selectedId="a"
        onSelect={vi.fn()}
        fps={30}
        outroFrames={180}
      />
    );
    expect(screen.getByRole('button', { name: 'clip · 1' }).className).toMatch(/selected/);
    expect(screen.getByRole('button', { name: 'broll · 2' }).className).not.toMatch(/selected/);
  });

  it('sets data-duration-frames from segmentDurationFrames', () => {
    render(
      <Timeline
        segments={segments}
        selectedId={null}
        onSelect={vi.fn()}
        fps={30}
        outroFrames={180}
      />
    );
    expect(screen.getByRole('button', { name: 'clip · 1' })).toHaveAttribute(
      'data-duration-frames',
      '90'
    );
    expect(screen.getByRole('button', { name: 'broll · 2' })).toHaveAttribute(
      'data-duration-frames',
      '90'
    );
    expect(screen.getByRole('button', { name: 'outro' })).toHaveAttribute(
      'data-duration-frames',
      '180'
    );
  });
});
