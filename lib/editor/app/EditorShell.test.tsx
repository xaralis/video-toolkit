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
