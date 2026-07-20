import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from './Inspector';

const segments = [
  {
    id: 'a',
    type: 'clip',
    source: 'x.mp4',
    trimIn: 2,
    trimOut: 5,
    audioMode: 'voice',
    overlays: [{ kind: 'quote-pull', text: 'Na papíře to dobře.' }],
  },
  { id: 'b', type: 'broll', source: 'y.mp4', trimIn: 0, trimOut: 4, audioMode: 'silent' },
  { id: 'c', type: 'multi-clip', durationMs: 6500, audioMode: 'mix' },
  { id: 'd', type: 'card', durationMs: 3000 },
  { id: 'e', type: 'outro' },
];

describe('Inspector', () => {
  it('renders the Reel section with the Topic and Chevron inputs when nothing is selected', () => {
    render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(screen.getByText('Reel')).toBeInTheDocument();
    const topicInput = screen.getByLabelText('Topic') as HTMLInputElement;
    expect(topicInput.value).toBe('Our story');
    const chevronInput = screen.getByLabelText('Chevron') as HTMLInputElement;
    expect(chevronInput.value).toBe('HOUSING');
  });

  it('calls onReelChange with the new topic when typing in the Topic input', () => {
    const onReelChange = vi.fn();
    render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        chevron="HOUSING"
        onReelChange={onReelChange}
        onSegmentChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Topic');
    fireEvent.change(input, { target: { value: 'New topic' } });
    expect(onReelChange).toHaveBeenCalledTimes(1);
    expect(onReelChange).toHaveBeenCalledWith({ topic: 'New topic' });
  });

  it('calls onReelChange with the new chevron when typing in the Chevron input', () => {
    const onReelChange = vi.fn();
    render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        chevron="HOUSING"
        onReelChange={onReelChange}
        onSegmentChange={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Chevron');
    fireEvent.change(input, { target: { value: 'JOBS' } });
    expect(onReelChange).toHaveBeenCalledTimes(1);
    expect(onReelChange).toHaveBeenCalledWith({ chevron: 'JOBS' });
  });

  it('falls back to the Reel section when selectedId matches no segment', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="missing"
        topic="Our story"
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
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
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
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
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
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
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(screen.getByText('6.5s')).toBeInTheDocument();

    rerender(
      <Inspector
        segments={segments}
        selectedId="d"
        topic="Our story"
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(screen.getByText('3.0s')).toBeInTheDocument();
  });

  it('renders outro with no timing line, no source, and a no-overlay-text note', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="e"
        topic="Our story"
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(screen.getByText('outro')).toBeInTheDocument();
    expect(screen.getByText('no overlay text')).toBeInTheDocument();
  });

  it('contains no Czech strings', () => {
    const { container } = render(
      <Inspector
        segments={segments}
        selectedId="a"
        topic="Our story"
        chevron="HOUSING"
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/[ěščřžýáíéúůňďťĚŠČŘŽÝÁÍÉÚŮŇĎŤ]/);
  });

  describe('overlay text editing', () => {
    it('shows the clip overlay text and emits an updated overlays array on edit', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const input = screen.getByDisplayValue('Na papíře to dobře.') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Updated text.' } });
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('a', {
        overlays: [{ kind: 'quote-pull', text: 'Updated text.' }],
      });
    });

    it('shows the broll overlay text and emits an updated overlay object on edit', () => {
      const brollSegments = [
        {
          id: 'b',
          type: 'broll',
          source: 'y.mp4',
          trimIn: 0,
          trimOut: 4,
          audioMode: 'silent',
          overlay: { kind: 'source-tag', text: 'Source: city archive' },
        },
      ];
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={brollSegments}
          selectedId="b"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const input = screen.getByDisplayValue('Source: city archive') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Source: updated' } });
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('b', {
        overlay: { kind: 'source-tag', text: 'Source: updated' },
      });
    });
  });

  describe('accent buttons', () => {
    it('clicking Lime wraps the current selection in {lime:...} and emits the updated overlays', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const input = screen.getByDisplayValue('Na papíře to dobře.') as HTMLInputElement;
      const text = input.value;
      const selStart = text.indexOf('papíře');
      const selEnd = selStart + 'papíře'.length;
      input.setSelectionRange(selStart, selEnd);

      fireEvent.click(screen.getByRole('button', { name: 'Lime' }));

      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      const [, patch] = onSegmentChange.mock.calls[0] as [string, { overlays: Array<{ text: string }> }];
      expect(patch.overlays[0].text).toBe('Na {lime:papíře} to dobře.');
    });

    it('clicking Teal wraps the current selection in {teal:...}', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const input = screen.getByDisplayValue('Na papíře to dobře.') as HTMLInputElement;
      const text = input.value;
      const selStart = text.indexOf('dobře');
      const selEnd = selStart + 'dobře'.length;
      input.setSelectionRange(selStart, selEnd);

      fireEvent.click(screen.getByRole('button', { name: 'Teal' }));

      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      const [, patch] = onSegmentChange.mock.calls[0] as [string, { overlays: Array<{ text: string }> }];
      expect(patch.overlays[0].text).toBe('Na papíře to {teal:dobře}.');
    });
  });

  describe('audioMode select', () => {
    it('offers voice/silent for a clip and emits onSegmentChange on change', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const select = screen.getByLabelText('Audio') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toEqual(['voice', 'silent']);

      fireEvent.change(select, { target: { value: 'silent' } });
      expect(onSegmentChange).toHaveBeenCalledWith('a', { audioMode: 'silent' });
    });

    it('offers the broll-specific audioMode options', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="b"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const select = screen.getByLabelText('Audio') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toEqual(['silent', 'extend-previous', 'inherit-from-clip']);

      fireEvent.change(select, { target: { value: 'inherit-from-clip' } });
      expect(onSegmentChange).toHaveBeenCalledWith('b', { audioMode: 'inherit-from-clip' });
    });

    it('offers the multi-clip-specific audioMode options', () => {
      render(
        <Inspector
          segments={segments}
          selectedId="c"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      const select = screen.getByLabelText('Audio') as HTMLSelectElement;
      const optionValues = Array.from(select.options).map((o) => o.value);
      expect(optionValues).toEqual(['first', 'mix', 'silent']);
    });

    it('does not render an Audio select for a card or outro segment', () => {
      render(
        <Inspector
          segments={segments}
          selectedId="d"
          topic="Our story"
          chevron="HOUSING"
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Audio')).not.toBeInTheDocument();
    });
  });
});
