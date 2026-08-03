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
});

describe('SliderField', () => {
  it('renders a range input bounded by min and max', () => {
    render(<SliderField lbl="Opacity" value={0.8} min={0} max={1} step={0.05} onCommit={() => {}} />);
    const el = screen.getByLabelText('Opacity') as HTMLInputElement;
    expect(el.type).toBe('range');
    expect(el.min).toBe('0');
    expect(el.max).toBe('1');
  });

  it('commits as it is dragged', () => {
    const onCommit = vi.fn();
    render(<SliderField lbl="Opacity" value={0.8} min={0} max={1} step={0.05} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.5' } });
    expect(onCommit).toHaveBeenCalledWith(0.5);
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
