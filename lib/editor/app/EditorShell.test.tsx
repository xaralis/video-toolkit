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

  it('Discard is always rendered — disabled (not hidden) while clean', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<EditorShell preview={null} onSave={onSave} onDiscard={onDiscard} />); // clean
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
    const discard = screen.getByRole('button', { name: /Discard/i });
    expect(discard).toBeInTheDocument();
    expect(discard).toBeDisabled();
    fireEvent.click(discard);
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

// Header restructure: identity on the left (project name, phase — no more
// diagnostics badge there, it folded into the status chip on the right).
describe('EditorShell — header zones', () => {
  it('places the phase control beside the project name, outside the action zone', () => {
    const { container } = render(
      <EditorShell preview={null} projectName="my-reel" phaseControl={<span data-testid="phase">editing</span>} />,
    );
    const header = container.querySelector('header') as HTMLElement;
    const phase = screen.getByTestId('phase');
    const actionZone = screen.getByTestId('action-zone');

    expect(header).toContainElement(phase);
    expect(actionZone).not.toContainElement(phase);

    const left = phase.parentElement as HTMLElement;
    const order = Array.from(left.children).map((el) => el.getAttribute('data-testid') ?? el.textContent);
    expect(order.indexOf('my-reel')).toBeLessThan(order.indexOf('phase'));
  });

  it('omits the phase control entirely when not provided', () => {
    render(<EditorShell preview={null} projectName="my-reel" />);
    expect(screen.queryByTestId('phase')).not.toBeInTheDocument();
  });

  it('places the status chip in the action zone, immediately before Discard', () => {
    const { container } = render(
      <EditorShell preview={null} onSave={vi.fn()} onDiscard={vi.fn()} statusChip={<button type="button" data-testid="chip">chip</button>} />,
    );
    const actionZone = container.querySelector('[data-testid="action-zone"]') as HTMLElement;
    const buttons = Array.from(actionZone.querySelectorAll('button'));
    const labels = buttons.map((b) => b.getAttribute('data-testid') ?? b.textContent);
    const chipIdx = labels.indexOf('chip');
    const discardIdx = labels.findIndex((l) => l === 'Discard');
    const saveIdx = labels.findIndex((l) => l === 'Save');
    expect(chipIdx).toBeGreaterThanOrEqual(0);
    expect(chipIdx).toBeLessThan(discardIdx);
    expect(discardIdx).toBeLessThan(saveIdx);
  });
});

// The dirty-state layout regression this whole header went through twice:
// the action zone must be width-STABLE across dirty state. This round makes
// that trivial by construction — Discard is now always rendered (disabled,
// not hidden) and the status chip is fixed-size in every state — so nothing
// in the action zone is ever added, removed, or reordered by dirty/health
// state; only individual controls' own disabled/colour attributes change.
describe('EditorShell — action zone is stable across dirty state', () => {
  const renderBoth = (dirty: boolean) =>
    render(
      <EditorShell
        preview={null}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        canUndo
        canRedo
        renderControls={
          <>
            <button type="button">Render</button>
          </>
        }
        statusChip={<button type="button" aria-label={dirty ? 'Unsaved changes' : 'Saved'}>chip</button>}
        dirty={dirty}
      />,
    );

  const actionZoneControlTypes = (container: HTMLElement) => {
    const zone = container.querySelector('[data-testid="action-zone"]') as HTMLElement;
    // Identity by ROLE/POSITION, not by label — Save/Discard/the chip all
    // change their own attributes with dirty state; what must NOT change is
    // how many controls there are and in what order.
    return Array.from(zone.querySelectorAll('button')).map((b, i) => `${i}:${b.tagName}`);
  };

  it('renders the exact same number of controls, in the same order, whether clean or dirty', () => {
    const clean = renderBoth(false);
    const cleanShape = actionZoneControlTypes(clean.container);
    clean.unmount();

    const dirtyRender = renderBoth(true);
    const dirtyShape = actionZoneControlTypes(dirtyRender.container);

    expect(dirtyShape).toEqual(cleanShape);
  });

  it('Render, Undo, Redo, the status chip, Discard, and Save each keep the same index whether clean or dirty', () => {
    const clean = renderBoth(false);
    const cleanZone = clean.container.querySelector('[data-testid="action-zone"]') as HTMLElement;
    const cleanButtons = Array.from(cleanZone.querySelectorAll('button'));
    const cleanIndexOf = (name: RegExp) => cleanButtons.findIndex((b) => name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));
    const indices = {
      render: cleanIndexOf(/^Render$/),
      undo: cleanIndexOf(/Undo/),
      redo: cleanIndexOf(/Redo/),
      chip: cleanIndexOf(/Saved/),
      discard: cleanIndexOf(/Discard/),
      save: cleanIndexOf(/^Save$/),
    };
    clean.unmount();

    const dirtyRender = renderBoth(true);
    const dirtyZone = dirtyRender.container.querySelector('[data-testid="action-zone"]') as HTMLElement;
    const dirtyButtons = Array.from(dirtyZone.querySelectorAll('button'));
    const dirtyIndexOf = (name: RegExp) => dirtyButtons.findIndex((b) => name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''));

    expect(dirtyIndexOf(/^Render$/)).toBe(indices.render);
    expect(dirtyIndexOf(/Undo/)).toBe(indices.undo);
    expect(dirtyIndexOf(/Redo/)).toBe(indices.redo);
    expect(dirtyIndexOf(/Unsaved changes/)).toBe(indices.chip); // same slot, new label
    expect(dirtyIndexOf(/Discard/)).toBe(indices.discard);
    expect(dirtyIndexOf(/^Save$/)).toBe(indices.save);
    for (const v of Object.values(indices)) expect(v).toBeGreaterThanOrEqual(0); // sanity: all found
  });

  it('Discard is present in both states — never conditionally removed', () => {
    const clean = renderBoth(false);
    expect(clean.getByRole('button', { name: /Discard/i })).toBeDisabled();
    clean.unmount();

    const dirtyRender = renderBoth(true);
    expect(dirtyRender.getByRole('button', { name: /Discard/i })).not.toBeDisabled();
  });
});
