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

  it('always shows Save, disabled when there are no changes; Discard and the unsaved dot render nothing at all while clean', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<EditorShell preview={null} onSave={onSave} onDiscard={onDiscard} />); // clean
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Discard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Unsaved/i)).not.toBeInTheDocument();
  });

  it('shows the unsaved dot and an enabled Discard once dirty', () => {
    render(<EditorShell preview={null} onSave={vi.fn()} onDiscard={vi.fn()} dirty />);
    expect(screen.getByText(/Unsaved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Discard/i })).not.toBeDisabled();
  });

  it("Save's position in the action cluster does not depend on dirty — the dirty controls grow leftwards, nothing to Save's right moves", () => {
    // jsdom has no layout, so this is asserted structurally: Save is the
    // last child of the dirty cluster whether or not Discard/Unsaved render
    // alongside it.
    const { container, rerender } = render(<EditorShell preview={null} onSave={vi.fn()} onDiscard={vi.fn()} />); // clean
    const cluster = () => container.querySelector('[data-testid="dirty-cluster"]') as HTMLElement;
    expect(cluster().lastElementChild).toHaveTextContent('Save');
    expect(cluster().children).toHaveLength(1); // just Save

    rerender(<EditorShell preview={null} onSave={vi.fn()} onDiscard={vi.fn()} dirty />);
    expect(cluster().lastElementChild).toHaveTextContent('Save');
    expect(cluster().children).toHaveLength(3); // unsaved dot, Discard, Save
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
  const frame = (container: HTMLElement) => container.querySelector('[data-testid="stage-frame"]') as HTMLElement;

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

// Undo/Redo dropped their text labels (icon-only, header restructure) — each
// button's `title` becomes its computed accessible name once the icon (which
// is aria-hidden) is the only content, but that is exactly the kind of thing
// that's worth proving rather than assuming, so an explicit `aria-label` was
// added too. Both are asserted here.
describe('EditorShell — Undo/Redo are icon-only but keep an accessible name', () => {
  it('Undo is reachable by accessible name, with no visible text label', () => {
    render(<EditorShell preview={null} onUndo={vi.fn()} onRedo={vi.fn()} canUndo />);
    const undo = screen.getByRole('button', { name: /Undo/i });
    expect(undo).toHaveAttribute('title', 'Undo (⌘Z)');
    expect(undo).toHaveAttribute('aria-label', 'Undo');
    expect(undo.textContent).toBe(''); // icon only — no "Undo" text node
  });

  it('Redo is reachable by accessible name, with no visible text label', () => {
    render(<EditorShell preview={null} onUndo={vi.fn()} onRedo={vi.fn()} canRedo />);
    const redo = screen.getByRole('button', { name: /Redo/i });
    expect(redo).toHaveAttribute('title', 'Redo (⌘⇧Z)');
    expect(redo).toHaveAttribute('aria-label', 'Redo');
    expect(redo.textContent).toBe('');
  });

  it('are disabled when canUndo/canRedo are false, and omitted entirely without handlers', () => {
    const { rerender } = render(<EditorShell preview={null} onUndo={vi.fn()} onRedo={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Redo/i })).toBeDisabled();

    rerender(<EditorShell preview={null} />);
    expect(screen.queryByRole('button', { name: /Undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Redo/i })).not.toBeInTheDocument();
  });
});

// Header restructure: identity + health on the left (project name, phase,
// diagnostics), actions on the right.
describe('EditorShell — header zones', () => {
  it('places the phase control beside the project name, ahead of diagnostics, both outside the action zone', () => {
    const { container } = render(
      <EditorShell
        preview={null}
        projectName="my-reel"
        phaseControl={<span data-testid="phase">editing</span>}
        diagnostics={<span data-testid="diag">⚠ 1</span>}
      />,
    );
    const header = container.querySelector('header') as HTMLElement;
    const phase = screen.getByTestId('phase');
    const diag = screen.getByTestId('diag');
    const actionZone = screen.getByTestId('action-zone');

    expect(header).toContainElement(phase);
    expect(header).toContainElement(diag);
    expect(actionZone).not.toContainElement(phase);
    expect(actionZone).not.toContainElement(diag);

    // Order: name, then phase, then diagnostics.
    const left = phase.parentElement as HTMLElement;
    const order = Array.from(left.children).map((el) => el.getAttribute('data-testid') ?? el.textContent);
    expect(order.indexOf('my-reel')).toBeLessThan(order.indexOf('phase'));
    expect(order.indexOf('phase')).toBeLessThan(order.indexOf('diag'));
  });

  it('omits the phase control entirely when not provided', () => {
    render(<EditorShell preview={null} projectName="my-reel" />);
    expect(screen.queryByTestId('phase')).not.toBeInTheDocument();
  });
});

// The render toast (finished render / error) overlays the editor body, never
// the header, and must not block controls underneath it except its own.
describe('EditorShell — render status overlay', () => {
  it('renders nothing extra when renderStatus is omitted', () => {
    const { container } = render(<EditorShell preview={null} />);
    expect(container.querySelectorAll('.ed\\:pointer-events-none').length).toBe(0);
  });

  it('overlays renderStatus outside the header, in a pointer-events-none layer with an auto inner box', () => {
    const { container } = render(
      <EditorShell preview={null} renderStatus={<button type="button">Show in Finder</button>} />,
    );
    const header = container.querySelector('header') as HTMLElement;
    const toastBtn = screen.getByRole('button', { name: 'Show in Finder' });
    expect(header).not.toContainElement(toastBtn);

    // The full-bleed positioning layer must not swallow clicks; only the
    // toast's own box (and its buttons) should be interactive.
    const bleedLayer = toastBtn.closest('.ed\\:pointer-events-none') as HTMLElement;
    expect(bleedLayer).toBeTruthy();
    const innerBox = toastBtn.closest('.ed\\:pointer-events-auto') as HTMLElement;
    expect(innerBox).toBeTruthy();
    expect(bleedLayer).toContainElement(innerBox);
  });
});
