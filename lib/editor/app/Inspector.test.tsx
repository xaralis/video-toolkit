import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from './Inspector';

/** Selects a plain-text range inside an AccentEditor's contenteditable box. */
function selectPlainRange(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let n = walker.nextNode();
  while (n) {
    const len = (n.textContent ?? '').length;
    if (!startNode && start <= acc + len) {
      startNode = n;
      startOffset = start - acc;
    }
    if (end <= acc + len) {
      endNode = n;
      endOffset = end - acc;
      break;
    }
    acc += len;
    n = walker.nextNode();
  }
  const sel = window.getSelection()!;
  const range = document.createRange();
  range.setStart(startNode!, startOffset);
  range.setEnd(endNode!, endOffset);
  sel.removeAllRanges();
  sel.addRange(range);
}

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
        fps={30}
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

  it('shows Chevron before Topic, each with clarifying helper text', () => {
    const { container } = render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        chevron="HOUSING"
        fps={30}
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(
      screen.getByText('Category badge shown on screen (once, at the start).')
    ).toBeInTheDocument();
    expect(screen.getByText('Internal label — not shown in the video.')).toBeInTheDocument();

    const text = container.textContent ?? '';
    expect(text.indexOf('Chevron')).toBeLessThan(text.indexOf('Topic'));
  });

  it('calls onReelChange with the new topic when typing in the Topic input', () => {
    const onReelChange = vi.fn();
    render(
      <Inspector
        segments={segments}
        selectedId={null}
        topic="Our story"
        chevron="HOUSING"
        fps={30}
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
        fps={30}
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
        fps={30}
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
        fps={30}
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(screen.getByText('Scene')).toBeInTheDocument();
    expect(screen.getByText('clip')).toBeInTheDocument();
    expect((screen.getByLabelText('Source') as HTMLSelectElement).value).toBe('x.mp4');
    expect(screen.getByText((_, node) => node?.textContent === '2.0s → 5.0s · 3.0s')).toBeInTheDocument();
  });

  it('renders broll timing in seconds', () => {
    render(
      <Inspector
        segments={segments}
        selectedId="b"
        topic="Our story"
        chevron="HOUSING"
        fps={30}
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
        fps={30}
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
        fps={30}
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
        fps={30}
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    expect(screen.getByText('outro')).toBeInTheDocument();
    expect(screen.getByText('no overlay text')).toBeInTheDocument();
  });

  it('contains no Czech strings in its own UI chrome (labels, buttons, headings)', () => {
    // The AccentEditor now renders overlay *content* as real DOM text (that's
    // the point of WYSIWYG) — and that content is legitimately Czech for this
    // brand. Scope the check to chrome only by excluding the editor's own
    // contenteditable box(es) from the text we inspect.
    const { container } = render(
      <Inspector
        segments={segments}
        selectedId="a"
        topic="Our story"
        chevron="HOUSING"
        fps={30}
        onReelChange={vi.fn()}
        onSegmentChange={vi.fn()}
      />
    );
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[role="textbox"]').forEach((box) => box.remove());
    const text = clone.textContent ?? '';
    expect(text).not.toMatch(/[ěščřžýáíéúůňďťĚŠČŘŽÝÁÍÉÚŮŇĎŤ]/);
  });

  describe('overlay text editing via AccentEditor', () => {
    it('renders the clip overlay text in an AccentEditor and emits an updated overlays array on change', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const box = screen.getByRole('textbox');
      expect(box.textContent).toBe('Na papíře to dobře.');

      // Simulate the child AccentEditor emitting an edited value.
      box.textContent = 'Updated text.';
      fireEvent.input(box);

      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('a', {
        overlays: [{ kind: 'quote-pull', text: 'Updated text.' }],
      });
    });

    it('renders the broll overlay text in an AccentEditor and emits an updated overlay object on change', () => {
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
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const box = screen.getByRole('textbox');
      expect(box.textContent).toBe('Source: city archive');

      box.textContent = 'Source: updated';
      fireEvent.input(box);

      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('b', {
        overlay: { kind: 'source-tag', text: 'Source: updated' },
      });
    });

    it('shows accented runs with no visible braces, and clicking Lime on a selection emits the encoded overlays with no braces exposed elsewhere', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const box = screen.getByRole('textbox');
      const plain = box.textContent ?? '';
      expect(plain).not.toMatch(/[{}]/);
      const selStart = plain.indexOf('papíře');
      selectPlainRange(box, selStart, selStart + 'papíře'.length);

      fireEvent.click(screen.getByRole('button', { name: 'Lime' }));

      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      const [id, patch] = onSegmentChange.mock.calls[0] as [string, { overlays: Array<{ text: string }> }];
      expect(id).toBe('a');
      expect(patch.overlays[0].text).toBe('Na {lime:papíře} to dobře.');
    });

    it('applying Teal to an already-accented run replaces the accent instead of nesting it', () => {
      const accentedSegments = [
        {
          id: 'a',
          type: 'clip',
          source: 'x.mp4',
          trimIn: 2,
          trimOut: 5,
          audioMode: 'voice',
          overlays: [{ kind: 'quote-pull', text: 'Na papíře to {lime:vypadá dobře}.' }],
        },
      ];
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={accentedSegments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const box = screen.getByRole('textbox');
      const plain = box.textContent ?? '';
      expect(plain).toBe('Na papíře to vypadá dobře.');
      selectPlainRange(box, 0, plain.length - 1); // exclude the trailing period

      fireEvent.click(screen.getByRole('button', { name: 'Teal' }));

      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      const [, patch] = onSegmentChange.mock.calls[0] as [string, { overlays: Array<{ text: string }> }];
      expect(patch.overlays[0].text).toBe('{teal:Na papíře to vypadá dobře}.');
      expect(patch.overlays[0].text).not.toContain('{lime:');
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
          fps={30}
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
          fps={30}
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
          fps={30}
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
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Audio')).not.toBeInTheDocument();
    });
  });

  describe('source picker', () => {
    const availableSources = { recordings: ['a.mp4', 'b.mp4'], broll: ['c.mp4', 'd.mp4'] };

    it('renders a Source select for a clip from the recordings list, selecting the current source', () => {
      const clipSegments = [
        { id: 'a', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3, audioMode: 'voice' },
      ];
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={clipSegments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
          sources={availableSources}
        />
      );
      const select = screen.getByLabelText('Source') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['a.mp4', 'b.mp4']);
      expect(select.value).toBe('a.mp4');

      fireEvent.change(select, { target: { value: 'b.mp4' } });
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('a', { source: 'b.mp4' });
    });

    it('renders a Source select for a broll from the broll list, selecting the current source', () => {
      const brollSegments = [
        { id: 'b', type: 'broll', source: 'c.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent' },
      ];
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={brollSegments}
          selectedId="b"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
          sources={availableSources}
        />
      );
      const select = screen.getByLabelText('Source') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['c.mp4', 'd.mp4']);
      expect(select.value).toBe('c.mp4');

      fireEvent.change(select, { target: { value: 'd.mp4' } });
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('b', { source: 'd.mp4' });
    });

    it('keeps the current source as a selected option even when absent from the provided list', () => {
      const clipSegments = [
        { id: 'a', type: 'clip', source: 'missing.mp4', trimIn: 0, trimOut: 3, audioMode: 'voice' },
      ];
      render(
        <Inspector
          segments={clipSegments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
          sources={availableSources}
        />
      );
      const select = screen.getByLabelText('Source') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual([
        'a.mp4',
        'b.mp4',
        'missing.mp4',
      ]);
      expect(select.value).toBe('missing.mp4');
    });

    it('shows the current source as the only option when sources is not provided', () => {
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      const select = screen.getByLabelText('Source') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['x.mp4']);
      expect(select.value).toBe('x.mp4');
    });

    it('does not render a Source select for multi-clip, card, or outro segments', () => {
      render(
        <Inspector
          segments={segments}
          selectedId="c"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
          sources={availableSources}
        />
      );
      expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();

      const { rerender } = render(
        <Inspector
          segments={segments}
          selectedId="d"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
          sources={availableSources}
        />
      );
      expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();

      rerender(
        <Inspector
          segments={segments}
          selectedId="e"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
          sources={availableSources}
        />
      );
      expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();
    });
  });

  describe('multi-clip editing', () => {
    const multiClipSegments = [
      {
        id: 'm',
        type: 'multi-clip',
        layout: 'split-h',
        durationMs: 4100,
        audioMode: 'silent',
        sources: [
          { source: 'recordings/seg01a.MP4', trimIn: 3, trimOut: 7.5 },
          { source: 'recordings/seg01b.MP4', trimIn: 0, trimOut: 5.4, zoom: 3 },
        ],
      },
      { id: 'z', type: 'outro' },
    ];

    it('shows the layout switcher with the current layout pressed', () => {
      render(
        <Inspector
          segments={multiClipSegments}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      const splitH = screen.getByRole('button', { name: 'Split H' });
      const splitV = screen.getByRole('button', { name: 'Split V' });
      expect(screen.getByRole('button', { name: 'PiP' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Quad' })).toBeInTheDocument();
      expect(splitH).toHaveAttribute('aria-pressed', 'true');
      expect(splitV).toHaveAttribute('aria-pressed', 'false');
    });

    it('fires onSegmentChange with the new layout when a layout button is clicked', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={multiClipSegments}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Split V' }));
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('m', { layout: 'split-v' });
    });

    it('offers the multi-clip audio options (first/mix/silent)', () => {
      render(
        <Inspector
          segments={multiClipSegments}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      const select = screen.getByLabelText('Audio') as HTMLSelectElement;
      expect(Array.from(select.options).map((o) => o.value)).toEqual(['first', 'mix', 'silent']);
      expect(select.value).toBe('silent');
    });

    it('renders one sub-clip row per source with its source, trims, and label', () => {
      render(
        <Inspector
          segments={multiClipSegments}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      const srcInputs = screen.getAllByLabelText(/^Source \d+$/) as HTMLInputElement[];
      expect(srcInputs.map((i) => i.value)).toEqual([
        'recordings/seg01a.MP4',
        'recordings/seg01b.MP4',
      ]);
      const trimIns = screen.getAllByLabelText('Trim in') as HTMLInputElement[];
      const trimOuts = screen.getAllByLabelText('Trim out') as HTMLInputElement[];
      expect(trimIns).toHaveLength(2);
      expect(trimOuts.map((i) => i.value)).toEqual(['7.5', '5.4']);
    });

    it('does not render the clip/broll Source select for multi-clip', () => {
      render(
        <Inspector
          segments={multiClipSegments}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();
    });

    it('emits an updated sources array (preserving siblings + extra fields) when a sub-clip trimOut changes', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={multiClipSegments}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const trimOuts = screen.getAllByLabelText('Trim out') as HTMLInputElement[];
      fireEvent.change(trimOuts[0], { target: { value: '9' } });
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('m', {
        sources: [
          { source: 'recordings/seg01a.MP4', trimIn: 3, trimOut: 9 },
          { source: 'recordings/seg01b.MP4', trimIn: 0, trimOut: 5.4, zoom: 3 },
        ],
      });
    });

    it('edits the multi-clip single overlay text through the AccentEditor', () => {
      const withOverlay = [
        {
          ...multiClipSegments[0],
          overlay: { kind: 'title', text: 'Spojili jsme síly.' },
        },
      ];
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={withOverlay}
          selectedId="m"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      const box = screen.getByLabelText('Caption text');
      expect(box.textContent).toBe('Spojili jsme síly.');
      box.textContent = 'Updated title.';
      fireEvent.input(box);
      expect(onSegmentChange).toHaveBeenCalledWith('m', {
        overlay: { kind: 'title', text: 'Updated title.' },
      });
    });
  });

  describe('transition to next scene', () => {
    it('shows the transition section for a non-last segment', () => {
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      expect(screen.getByText('Transition to next scene')).toBeInTheDocument();
      // The picker's kind gallery is present.
      expect(screen.getByRole('button', { name: 'Dissolve' })).toBeInTheDocument();
    });

    it('emits a valid transitionOut object when a transition kind is picked', () => {
      const onSegmentChange = vi.fn();
      render(
        <Inspector
          segments={segments}
          selectedId="a"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={onSegmentChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Dissolve' }));
      expect(onSegmentChange).toHaveBeenCalledTimes(1);
      expect(onSegmentChange).toHaveBeenCalledWith('a', {
        transitionOut: { kind: 'dissolve', frames: 15 },
      });
    });

    it('does not show the transition section for the last segment (outro)', () => {
      render(
        <Inspector
          segments={segments}
          selectedId="e"
          topic="Our story"
          chevron="HOUSING"
          fps={30}
          onReelChange={vi.fn()}
          onSegmentChange={vi.fn()}
        />
      );
      expect(screen.queryByText('Transition to next scene')).not.toBeInTheDocument();
    });
  });
});
