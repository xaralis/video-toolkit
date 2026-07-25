import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransitionPicker } from './TransitionPicker';

describe('TransitionPicker', () => {
  it('renders a button for every one of the 8 transition kinds', () => {
    render(<TransitionPicker fps={30} onChange={vi.fn()} />);
    for (const label of [
      'Cut',
      'Dissolve',
      'Fade to black',
      'Glitch',
      'Whip pan',
      'Zoom',
      'Wipe',
      'Gradient wipe',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('defaults to Cut (highlighted) with no frames/sub-options when value is omitted', () => {
    render(<TransitionPicker fps={30} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cut' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText(/frames ·/)).not.toBeInTheDocument();
  });

  it('selecting Wipe emits a fully valid wipe object with frames, color, and direction', () => {
    const onChange = vi.fn();
    render(<TransitionPicker fps={30} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Wipe' }));
    expect(onChange).toHaveBeenCalledWith({
      kind: 'wipe',
      frames: 15,
      color: 'teal',
      direction: 'left',
    });
  });

  it('carries over the current frames when switching between two frame-bearing kinds', () => {
    const onChange = vi.fn();
    render(
      <TransitionPicker
        value={{ kind: 'dissolve', frames: 30 }}
        fps={30}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Glitch' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'glitch', frames: 30 });
  });

  it('shows the duration presets and a frames/seconds readout for a frame-bearing kind', () => {
    render(<TransitionPicker value={{ kind: 'dissolve', frames: 15 }} fps={30} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Short' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medium' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Long' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('15 frames · 0.5s')).toBeInTheDocument();
  });

  it('changing the duration preset updates frames and preserves other fields', () => {
    const onChange = vi.fn();
    render(
      <TransitionPicker
        value={{ kind: 'wipe', frames: 15, color: 'lime', direction: 'right' }}
        fps={30}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Long' }));
    expect(onChange).toHaveBeenCalledWith({
      kind: 'wipe',
      frames: 30,
      color: 'lime',
      direction: 'right',
    });
  });

  it('changing a sub-option (direction) preserves the rest of the transition', () => {
    const onChange = vi.fn();
    render(
      <TransitionPicker
        value={{ kind: 'wipe', frames: 15, color: 'lime', direction: 'left' }}
        fps={30}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    expect(onChange).toHaveBeenCalledWith({
      kind: 'wipe',
      frames: 15,
      color: 'lime',
      direction: 'right',
    });
  });

  it('renders whip-pan direction sub-options and emits the chosen direction', () => {
    const onChange = vi.fn();
    render(<TransitionPicker value={{ kind: 'whip-pan', frames: 15, direction: 'left' }} fps={30} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Up' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Down' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Down' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'whip-pan', frames: 15, direction: 'down' });
  });

  it('renders a softness slider for gradient-wipe and emits a numeric change', () => {
    const onChange = vi.fn();
    render(
      <TransitionPicker
        value={{ kind: 'gradient-wipe', frames: 15, direction: 'tl-br', softness: 40 }}
        fps={30}
        onChange={onChange}
      />
    );
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '70' } });
    expect(onChange).toHaveBeenCalledWith({
      kind: 'gradient-wipe',
      frames: 15,
      direction: 'tl-br',
      softness: 70,
    });
  });

  it('shows no frames row and no sub-options for cut', () => {
    render(<TransitionPicker value={{ kind: 'cut' }} fps={30} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Short' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
