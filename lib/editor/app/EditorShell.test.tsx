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

  it('calls onSave when Save is clicked, and disables while saving', () => {
    const onSave = vi.fn();
    const { rerender } = render(<EditorShell preview={null} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalledOnce();
    rerender(<EditorShell preview={null} onSave={onSave} saving />);
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
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
