import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorShell } from './EditorShell';

describe('EditorShell', () => {
  it('renders the preview node, project name, and placeholders', () => {
    render(<EditorShell preview={<div data-testid="pv">PREVIEW</div>} projectName="my-reel" />);
    expect(screen.getByTestId('pv')).toBeInTheDocument();
    expect(screen.getByText('my-reel')).toBeInTheDocument();
    expect(screen.getByText(/Inspector/i)).toBeInTheDocument();
    expect(screen.getByText(/Timeline/i)).toBeInTheDocument();
  });

  it('calls onSave when Save is clicked (dirty), and disables while saving or clean', () => {
    const onSave = vi.fn();
    const { rerender } = render(<EditorShell preview={null} onSave={onSave} dirty />);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalledOnce();
    rerender(<EditorShell preview={null} onSave={onSave} dirty saving />);
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
    rerender(<EditorShell preview={null} onSave={onSave} />); // clean
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
  });

  it('always shows Save and Discard; both disabled when there are no changes', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<EditorShell preview={null} onSave={onSave} onDiscard={onDiscard} />); // clean
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Discard/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));
    expect(onDiscard).not.toHaveBeenCalled(); // disabled → no-op
  });

  it('enables Save and Discard when dirty', () => {
    const onDiscard = vi.fn();
    render(<EditorShell preview={null} onSave={vi.fn()} onDiscard={onDiscard} dirty />);
    const discard = screen.getByRole('button', { name: /Discard/i });
    expect(discard).not.toBeDisabled();
    fireEvent.click(discard);
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it('renders inspector and timeline slots when provided', () => {
    render(
      <EditorShell
        preview={null}
        inspector={<div>INSP</div>}
        timeline={<div>TL</div>}
      />
    );
    expect(screen.getByText('INSP')).toBeInTheDocument();
    expect(screen.getByText('TL')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('falls back to placeholders when inspector/timeline are omitted', () => {
    render(<EditorShell preview={null} />);
    expect(screen.getByText('Inspector (coming soon)')).toBeInTheDocument();
    expect(screen.getByText('Timeline (coming soon)')).toBeInTheDocument();
  });
});

// The shell was built for 9:16 reels and hard-coded that on the preview frame,
// which letterboxed a 1920x1080 web-program-intro into a portrait box. The
// stage must take its shape from the composition, whatever that shape is.
describe('EditorShell — preview aspect ratio', () => {
  const frame = (container: HTMLElement) => container.querySelector('[class*="stageFrame"]') as HTMLElement;

  it('takes a landscape aspect ratio from the caller', () => {
    const { container } = render(<EditorShell preview={<div />} aspectRatio="1920 / 1080" />);
    expect(frame(container).style.aspectRatio).toBe('1920 / 1080');
  });

  it('takes a square one just as happily — no orientation is privileged', () => {
    const { container } = render(<EditorShell preview={<div />} aspectRatio="1 / 1" />);
    expect(frame(container).style.aspectRatio).toBe('1 / 1');
  });

  it('falls back to 9 / 16 when the caller says nothing', () => {
    const { container } = render(<EditorShell preview={<div />} />);
    expect(frame(container).style.aspectRatio).toBe('9 / 16');
  });
});
