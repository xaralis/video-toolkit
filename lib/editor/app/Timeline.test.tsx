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

  it('calls onTrim with the dragged block id, edge, and a nonzero deltaFrames', () => {
    const onTrim = vi.fn();
    render(
      <Timeline
        segments={segments}
        selectedId="b"
        onSelect={vi.fn()}
        onTrim={onTrim}
        fps={30}
        outroFrames={180}
      />
    );

    const block = screen.getByRole('button', { name: 'broll · 2' });

    // jsdom performs no layout, so getBoundingClientRect() always reports
    // zeros. Stub the selected block's rect with a known pixel width so the
    // px-to-frames conversion (durationFrames / widthPx) is deterministic:
    // at 90 frames over 300px, 1px == 0.3 frames.
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 40,
      top: 0,
      left: 0,
      right: 300,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    const endHandle = screen.getByTestId('trim-handle-end-b');

    fireEvent.pointerDown(endHandle, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 130 });
    fireEvent.pointerUp(window, { clientX: 130 });

    expect(onTrim).toHaveBeenCalledTimes(1);
    const [id, edge, deltaFrames] = onTrim.mock.calls[0];
    expect(id).toBe('b');
    expect(edge).toBe('end');
    expect(deltaFrames).not.toBe(0);
    expect(deltaFrames).toBeCloseTo(9); // 30px * (90 frames / 300px)
  });

  it('does not call onSelect when dragging a trim handle', () => {
    const onSelect = vi.fn();
    const onTrim = vi.fn();
    render(
      <Timeline
        segments={segments}
        selectedId="b"
        onSelect={onSelect}
        onTrim={onTrim}
        fps={30}
        outroFrames={180}
      />
    );

    const block = screen.getByRole('button', { name: 'broll · 2' });
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue({
      width: 300,
      height: 40,
      top: 0,
      left: 0,
      right: 300,
      bottom: 40,
      x: 0,
      y: 0,
      toJSON: () => {},
    } as DOMRect);

    const startHandle = screen.getByTestId('trim-handle-start-b');
    fireEvent.pointerDown(startHandle, { clientX: 50 });
    fireEvent.pointerUp(window, { clientX: 50 });

    expect(onSelect).not.toHaveBeenCalled();

    // jsdom does not synthesize a `click` after pointerDown/pointerUp, so the
    // assertions above never actually exercise the handle's onClick
    // stopPropagation guard. Fire a real click on the handle to prove it:
    // without the guard, this click would bubble to the block button's
    // onClick and fire onSelect.
    fireEvent.click(startHandle);
    expect(onSelect).not.toHaveBeenCalled();

    // Control: clicking the block body (not the handle) DOES call onSelect,
    // so the assertion above can't pass merely because onSelect never fires.
    fireEvent.click(block);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('does not render trim handles on unselected blocks', () => {
    render(
      <Timeline
        segments={segments}
        selectedId="b"
        onSelect={vi.fn()}
        onTrim={vi.fn()}
        fps={30}
        outroFrames={180}
      />
    );
    expect(screen.queryByTestId('trim-handle-end-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trim-handle-end-b')).toBeInTheDocument();
  });
});
