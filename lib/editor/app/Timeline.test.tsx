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
    // Visible label is the 1-based index (or "outro"), not "type · index" —
    // see the "scene labels" describe block below for the rationale and the
    // accompanying title-tooltip coverage.
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
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
    // Selection now fires from the track's pointerdown hit-test (see
    // Timeline.tsx's startSeek), not from the block's onClick — a native
    // click never reliably reaches the block in a real browser once
    // setPointerCapture retargets it. A plain fireEvent.click wouldn't
    // exercise that path, so drive the real gesture instead.
    fireEvent.pointerDown(screen.getByRole('button', { name: '2' }));
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
    expect(screen.getByRole('button', { name: '1' }).className).toMatch(/selected/);
    expect(screen.getByRole('button', { name: '2' }).className).not.toMatch(/selected/);
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
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute(
      'data-duration-frames',
      '90'
    );
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute(
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

    const block = screen.getByRole('button', { name: '2' });

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

    const block = screen.getByRole('button', { name: '2' });
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

  describe('scene labels', () => {
    // A source on the clip so the title's "source" segment is exercised too.
    const labelSegments = [
      { id: 'x', type: 'clip', source: 'TH-01a_uvod-secap.mp4', trimIn: 0, trimOut: 2.3 },
      { id: 'y', type: 'broll', trimIn: 0, trimOut: 3 },
      { id: 'z', type: 'outro' },
    ];

    it('shows the scene index as the visible label, not a truncated type string', () => {
      render(
        <Timeline
          segments={labelSegments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      expect(screen.getByRole('button', { name: '1' }).textContent).toBe('1');
      expect(screen.getByRole('button', { name: '2' }).textContent).toBe('2');
      expect(screen.getByRole('button', { name: 'outro' }).textContent).toBe('outro');
    });

    it('sets a title tooltip with the scene number, type, source, and duration in seconds', () => {
      render(
        <Timeline
          segments={labelSegments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      const clipBlock = screen.getByRole('button', { name: '1' });
      expect(clipBlock.title).toContain('clip');
      expect(clipBlock.title).toContain('TH-01a_uvod-secap.mp4');
      expect(clipBlock.title).toContain('2.3s');
      expect(clipBlock.title).toMatch(/Scene 1/);
    });

    it('omits the source segment of the title when the segment has none', () => {
      render(
        <Timeline
          segments={labelSegments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      const brollBlock = screen.getByRole('button', { name: '2' });
      expect(brollBlock.title).toContain('broll');
      expect(brollBlock.title).toContain('3.0s');
      expect(brollBlock.title).toMatch(/Scene 2/);
    });
  });

  describe('time ruler', () => {
    // total = 90 + 90 + 180 = 360 frames = 12s @ 30fps

    it('renders a tick at 0:00 and at the final duration', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      const ruler = screen.getByTestId('ruler');
      expect(ruler).toBeInTheDocument();
      expect(screen.getByText('0:00')).toBeInTheDocument();
      expect(screen.getByText('0:12')).toBeInTheDocument();
    });

    it('renders no more than 8 ticks by default', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      const ruler = screen.getByTestId('ruler');
      expect(ruler.querySelectorAll('[data-testid^="tick-"]').length).toBeLessThanOrEqual(8);
    });
  });

  describe('seek transport', () => {
    // total = 90 + 90 + 180 = 360 frames; stub the TRACK's rect (not a
    // block's) so clientX maps to frames across the whole timeline.
    function stubTrackRect() {
      const track = screen.getByTestId('track');
      vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
        width: 360,
        height: 40,
        top: 0,
        left: 0,
        right: 360,
        bottom: 40,
        x: 0,
        y: 0,
        toJSON: () => {},
      } as DOMRect);
      return track;
    }

    it('calls onSeek with the frame under the pointer on pointerdown', () => {
      const onSeek = vi.fn();
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      const track = stubTrackRect();
      fireEvent.pointerDown(track, { clientX: 180 });
      expect(onSeek).toHaveBeenCalledWith(180);
    });

    it('continues calling onSeek on pointermove while pressed (scrub)', () => {
      const onSeek = vi.fn();
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      const track = stubTrackRect();
      fireEvent.pointerDown(track, { clientX: 180 });
      fireEvent.pointerMove(window, { clientX: 270 });
      expect(onSeek).toHaveBeenCalledWith(180);
      expect(onSeek).toHaveBeenCalledWith(270);
      fireEvent.pointerUp(window, { clientX: 270 });
    });

    it('stops calling onSeek after pointerup', () => {
      const onSeek = vi.fn();
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      const track = stubTrackRect();
      fireEvent.pointerDown(track, { clientX: 180 });
      fireEvent.pointerUp(window, { clientX: 180 });
      onSeek.mockClear();
      fireEvent.pointerMove(window, { clientX: 270 });
      expect(onSeek).not.toHaveBeenCalled();
    });

    it('still calls onSelect for the block clicked while seeking', () => {
      const onSeek = vi.fn();
      const onSelect = vi.fn();
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={onSelect}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      stubTrackRect();
      const block = screen.getByRole('button', { name: '2' });
      fireEvent.pointerDown(block, { clientX: 200 });
      expect(onSelect).toHaveBeenCalledWith('b');
      expect(onSeek).toHaveBeenCalledWith(200);
      fireEvent.pointerUp(window, { clientX: 200 });
    });

    it('selects the block and seeks from a single real pointer gesture (pointerdown, no move, pointerup)', () => {
      const onSeek = vi.fn();
      const onSelect = vi.fn();
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={onSelect}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      stubTrackRect();
      const block = screen.getByRole('button', { name: '1' });

      fireEvent.pointerDown(block, { clientX: 10 });
      fireEvent.pointerUp(window, { clientX: 10 });

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('a');
      expect(onSeek).toHaveBeenCalledTimes(1);
      expect(onSeek).toHaveBeenCalledWith(10);
    });

    it('works without onSeek (prop is optional)', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      const track = stubTrackRect();
      expect(() => fireEvent.pointerDown(track, { clientX: 180 })).not.toThrow();
    });

    it('does not call onSeek or onSelect when dragging a trim handle', () => {
      const onSeek = vi.fn();
      const onSelect = vi.fn();
      const onTrim = vi.fn();
      render(
        <Timeline
          segments={segments}
          selectedId="b"
          onSelect={onSelect}
          onTrim={onTrim}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      stubTrackRect();

      const block = screen.getByRole('button', { name: '2' });
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
      expect(onSeek).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('playhead', () => {
    // total = 90 (clip) + 90 (broll) + 180 (outro) = 360 frames

    it('renders no playhead when playheadFrame is omitted', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      expect(screen.queryByTestId('playhead')).not.toBeInTheDocument();
    });

    it('renders no playhead when playheadFrame is null', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
          playheadFrame={null as unknown as undefined}
        />
      );
      expect(screen.queryByTestId('playhead')).not.toBeInTheDocument();
    });

    it('positions the playhead at the percentage of total duration', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
          playheadFrame={180}
        />
      );
      const playhead = screen.getByTestId('playhead');
      expect(playhead).toHaveAttribute('data-left-pct', '50');
      expect(playhead.style.left).toBe('50%');
    });

    it('clamps a playheadFrame beyond total duration to 100%', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
          playheadFrame={9000}
        />
      );
      const playhead = screen.getByTestId('playhead');
      expect(playhead).toHaveAttribute('data-left-pct', '100');
      expect(playhead.style.left).toBe('100%');
    });

    it('clamps a negative playheadFrame to 0%', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
          playheadFrame={-50}
        />
      );
      const playhead = screen.getByTestId('playhead');
      expect(playhead).toHaveAttribute('data-left-pct', '0');
      expect(playhead.style.left).toBe('0%');
    });

    it('does not intercept pointer events', () => {
      render(
        <Timeline
          segments={segments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
          playheadFrame={180}
        />
      );
      expect(screen.getByTestId('playhead').style.pointerEvents).toBe('none');
    });
  });

  describe('transition junction indicators', () => {
    const junctionSegments = [
      { id: 'a', type: 'clip', trimIn: 0, trimOut: 3, transitionOut: { kind: 'dissolve', frames: 12 } },
      { id: 'b', type: 'broll', trimIn: 0, trimOut: 3 },
      { id: 'c', type: 'outro' },
    ];

    it('renders an effect badge (●) after a segment with a transition and a cut badge (◇) otherwise', () => {
      render(
        <Timeline
          segments={junctionSegments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      // 'a' has a dissolve → effect dot.
      expect(screen.getByTestId('junction-a').textContent).toBe('●');
      // 'b' has no transitionOut → outline cut diamond.
      expect(screen.getByTestId('junction-b').textContent).toBe('◇');
      // No junction after the last segment.
      expect(screen.queryByTestId('junction-c')).not.toBeInTheDocument();
    });

    it('gives the badge a title tooltip with the transition label', () => {
      render(
        <Timeline
          segments={junctionSegments}
          selectedId={null}
          onSelect={vi.fn()}
          fps={30}
          outroFrames={180}
        />
      );
      expect(screen.getByTestId('junction-a').title).toBe('Dissolve');
      expect(screen.getByTestId('junction-b').title).toBe('Cut');
    });

    it('selects the LEFT segment on click without seeking', () => {
      const onSelect = vi.fn();
      const onSeek = vi.fn();
      render(
        <Timeline
          segments={junctionSegments}
          selectedId={null}
          onSelect={onSelect}
          onSeek={onSeek}
          fps={30}
          outroFrames={180}
        />
      );
      fireEvent.pointerDown(screen.getByTestId('junction-a'), { clientX: 100 });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect).toHaveBeenCalledWith('a');
      expect(onSeek).not.toHaveBeenCalled();
    });
  });
});
