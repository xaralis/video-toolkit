import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from './Inspector';

const segments = [
  { id: 'a', type: 'clip', source: 'x.mp4', trimIn: 2, trimOut: 5 },
  { id: 'b', type: 'broll', source: 'y.mp4', trimIn: 0, trimOut: 4 },
  { id: 'c', type: 'multi-clip', durationMs: 6500 },
  { id: 'd', type: 'card', durationMs: 3000 },
  { id: 'e', type: 'outro' },
];

describe('Inspector', () => {
  it('renders the Reel section with the Topic input when nothing is selected', () => {
    render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText('Reel')).toBeInTheDocument();
    const input = screen.getByLabelText('Topic') as HTMLInputElement;
    expect(input.value).toBe('Our story');
  });

  it('calls onTopicChange with the new value when typing in the Topic input', () => {
    const onTopicChange = vi.fn();
    render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        onTopicChange={onTopicChange}
      />
    );
    const input = screen.getByLabelText('Topic');
    fireEvent.change(input, { target: { value: 'New topic' } });
    expect(onTopicChange).toHaveBeenCalledTimes(1);
    expect(onTopicChange).toHaveBeenCalledWith('New topic');
  });

  it('falls back to the Reel section when selectedId matches no segment', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="missing"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText('Reel')).toBeInTheDocument();
    expect(screen.getByLabelText('Topic')).toBeInTheDocument();
  });

  it('renders the Scene section for a selected clip with source and timing in seconds', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="a"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText('Scene')).toBeInTheDocument();
    expect(screen.getByText('clip')).toBeInTheDocument();
    expect(screen.getByText('x.mp4')).toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === '2.0s → 5.0s · 3.0s')).toBeInTheDocument();
  });

  it('renders broll timing in seconds', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="b"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText((_, node) => node?.textContent === '0.0s → 4.0s · 4.0s')).toBeInTheDocument();
  });

  it('renders multi-clip/card timing from durationMs in seconds', () => {
    const { rerender } = render(
      <Inspector
        segments={segments}
        selectedId="c"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText('6.5s')).toBeInTheDocument();

    rerender(
      <Inspector
        segments={segments}
        selectedId="d"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText('3.0s')).toBeInTheDocument();
  });

  it('renders outro with no timing line and no source', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="e"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    expect(screen.getByText('outro')).toBeInTheDocument();
  });

  it('contains no Czech strings', () => {
    const { container } = render(
      <Inspector
        segments={segments}
        selectedId="a"
        topic="Our story"
        onTopicChange={vi.fn()}
      />
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/[ěščřžýáíéúůňďťĚŠČŘŽÝÁÍÉÚŮŇĎŤ]/);
  });
});
