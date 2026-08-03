import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrubField } from './ScrubField';
import { SliderField } from './SliderField';
import { TimecodeField } from './TimecodeField';
import { SegmentedField } from './SegmentedField';

describe('ScrubField', () => {
  it('commits a typed value on every valid keystroke', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '1.5' } });
    expect(onCommit).toHaveBeenCalledWith(1.5);
  });

  it('ignores an unparseable entry instead of committing zero', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: 'abc' } });
    expect(onCommit).not.toHaveBeenCalled();
  });

  // Exercises the drag gesture itself (pointerdown/move/up on the label) —
  // the whole reason `scrubValue` exists. jsdom has no `setPointerCapture`,
  // which is why the component optional-calls it rather than relying on it.
  it('commits scrubbed values as the label is dragged', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    const label = screen.getByText('Zoom');
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 108, pointerId: 1 });
    expect(onCommit).toHaveBeenCalledWith(1.1);
    fireEvent.pointerUp(label, { clientX: 108, pointerId: 1 });
  });

  it('a press-and-release with zero travel commits nothing', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    const label = screen.getByText('Zoom');
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(label, { clientX: 100, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not strand the field in drag mode after pointer-up', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    const label = screen.getByText('Zoom');
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(label, { clientX: 108, pointerId: 1 });
    fireEvent.pointerUp(label, { clientX: 108, pointerId: 1 });
    onCommit.mockClear();
    // A stray pointermove after release (no button held) must not commit —
    // this is exactly the "stranded in drag mode" regression fix 2 guards.
    fireEvent.pointerMove(label, { clientX: 200, pointerId: 1 });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('SliderField', () => {
  it('renders a range input bounded by min and max', () => {
    render(<SliderField lbl="Opacity" value={0.8} min={0} max={1} step={0.05} fallback={1} onCommit={() => {}} />);
    const el = screen.getByLabelText('Opacity') as HTMLInputElement;
    expect(el.type).toBe('range');
    expect(el.min).toBe('0');
    expect(el.max).toBe('1');
  });

  it('commits as it is dragged', () => {
    const onCommit = vi.fn();
    render(<SliderField lbl="Opacity" value={0.8} min={0} max={1} step={0.05} fallback={1} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.5' } });
    expect(onCommit).toHaveBeenCalledWith(0.5);
  });

  // The regression this prop exists to fix: an unset value must show the
  // RENDERER's default, not the control's floor. `min` here (-60) is what
  // the deleted-then-restored bug would show — fully muted — for a value
  // that actually plays at unity (`fallback`, 0dB).
  it('shows `fallback`, not `min`, when value is undefined', () => {
    render(<SliderField lbl="Volume (dB)" value={undefined} min={-60} max={12} step={0.5} fallback={0} onCommit={() => {}} />);
    const el = screen.getByLabelText('Volume (dB)') as HTMLInputElement;
    expect(el.value).toBe('0');
    expect(screen.getByText('0')).toBeInTheDocument(); // the mono readout
  });

  it('still shows `value` when it is explicitly set, ignoring `fallback`', () => {
    render(<SliderField lbl="Volume (dB)" value={-12} min={-60} max={12} step={0.5} fallback={0} onCommit={() => {}} />);
    expect((screen.getByLabelText('Volume (dB)') as HTMLInputElement).value).toBe('-12');
  });
});

describe('TimecodeField', () => {
  it('shows milliseconds as mm:ss.ff', () => {
    render(<TimecodeField lbl="Fade in" ms={62_500} fps={30} onCommit={() => {}} />);
    expect((screen.getByLabelText('Fade in') as HTMLInputElement).value).toBe('1:02.15');
  });

  it('commits milliseconds parsed from what was typed', () => {
    const onCommit = vi.fn();
    render(<TimecodeField lbl="Fade in" ms={0} fps={30} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Fade in'), { target: { value: '0:02.00' } });
    expect(onCommit).toHaveBeenCalledWith(2000);
  });

  // The whole point of parseTimecode returning null.
  it('does not commit while the entry is still nonsense', () => {
    const onCommit = vi.fn();
    render(<TimecodeField lbl="Fade in" ms={5000} fps={30} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Fade in'), { target: { value: 'x' } });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('SegmentedField', () => {
  it('renders one button per option and marks the active one', () => {
    render(<SegmentedField lbl="Fit" value="cover" options={['cover', 'blur-pad']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'cover' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'blur-pad' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the option that was clicked', () => {
    const onChange = vi.fn();
    render(<SegmentedField lbl="Fit" value="cover" options={['cover', 'blur-pad']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'blur-pad' }));
    expect(onChange).toHaveBeenCalledWith('blur-pad');
  });
});
