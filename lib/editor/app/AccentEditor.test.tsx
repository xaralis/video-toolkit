import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccentEditor } from './AccentEditor';

/** Selects a plain-text range inside the editor's contenteditable. */
function selectPlainRange(root: HTMLElement, start: number, end: number) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let n = walker.nextNode();
  while (n) {
    const len = (n.textContent ?? '').length;
    if (!startNode && start <= acc + len) {
      startNode = n;
      startOffset = start - acc;
    }
    if (end <= acc + len) {
      endNode = n;
      endOffset = end - acc;
      break;
    }
    acc += len;
    n = walker.nextNode();
  }
  const sel = window.getSelection()!;
  const range = document.createRange();
  range.setStart(startNode!, startOffset);
  range.setEnd(endNode!, endOffset);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Core declares NO accent values of its own — every palette below is a test
// brand's, handed in exactly as a real brand host hands in its theme slots.
const PALETTE = [
  { key: 'primary', label: 'Primary', color: '#c6f432' },
  { key: 'secondary', label: 'Secondary', color: '#2ad4c5' },
];

describe('AccentEditor', () => {
  it('renders accented runs as colored spans with NO braces visible', () => {
    render(<AccentEditor value="Řízená {primary:péče}." onChange={vi.fn()} colors={PALETTE} />);
    const box = screen.getByRole('textbox');
    // No literal braces anywhere in the visible text.
    expect(box.textContent).toBe('Řízená péče.');
    // The accented phrase is a span tagged with its accent color.
    const span = box.querySelector('[data-accent="primary"]');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('péče');
  });

  it('renders one toolbar button per supplied slot, plus Clear', () => {
    render(<AccentEditor value="plain" onChange={vi.fn()} colors={PALETTE} />);
    expect(screen.getByRole('button', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secondary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  // Core has no accent vocabulary of its own, so with no brand palette the
  // toolbar offers no accent buttons at all — only Clear, which still strips
  // accents from text that already carries them.
  it('offers only Clear when no brand palette is supplied', () => {
    render(<AccentEditor value="plain" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute('data-accent-button', 'clear');
  });

  it('still renders an existing accent span with no palette in scope', () => {
    render(<AccentEditor value="a {gold:b}" onChange={vi.fn()} />);
    const box = screen.getByRole('textbox');
    expect(box.textContent).toBe('a b');
    expect(box.querySelector('[data-accent="gold"]')).not.toBeNull();
  });

  it('clicking an accent button accents the current selection and emits the encoded string', () => {
    const onChange = vi.fn();
    render(<AccentEditor value="Snížíme nájmy" onChange={onChange} colors={PALETTE} />);
    const box = screen.getByRole('textbox');
    const start = 'Snížíme nájmy'.indexOf('nájmy');
    selectPlainRange(box, start, start + 'nájmy'.length);

    fireEvent.click(screen.getByRole('button', { name: 'Primary' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Snížíme {primary:nájmy}');
  });

  it('clicking Clear removes the accent from the selection', () => {
    const onChange = vi.fn();
    render(<AccentEditor value="Řízená {secondary:péče}." onChange={onChange} colors={PALETTE} />);
    const box = screen.getByRole('textbox');
    const plain = 'Řízená péče.';
    const start = plain.indexOf('péče');
    selectPlainRange(box, start, start + 'péče'.length);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith('Řízená péče.');
  });

  it('re-accenting a selection that already contains an accent does not nest', () => {
    const onChange = vi.fn();
    render(<AccentEditor value="Řízená {secondary:péče}." onChange={onChange} colors={PALETTE} />);
    const box = screen.getByRole('textbox');
    selectPlainRange(box, 0, 'Řízená péče'.length);

    fireEvent.click(screen.getByRole('button', { name: 'Primary' }));

    expect(onChange).toHaveBeenCalledWith('{primary:Řízená péče}.');
    const arg = onChange.mock.calls[0][0] as string;
    expect(arg).not.toContain('{secondary:');
  });

  it('prevents Enter from inserting a newline', () => {
    render(<AccentEditor value="plain" onChange={vi.fn()} colors={PALETTE} />);
    const box = screen.getByRole('textbox');
    const evt = fireEvent.keyDown(box, { key: 'Enter' });
    // fireEvent returns false when preventDefault was called.
    expect(evt).toBe(false);
  });
});

describe('AccentEditor brand palette', () => {
  it('renders one button per supplied slot with its label', () => {
    render(
      <AccentEditor
        value="Kavárna Nota"
        onChange={() => {}}
        colors={[
          { key: 'gold', label: 'Gold', color: '#f6aa1c' },
          { key: 'rust', label: 'Rust', color: '#7b190a' },
        ]}
      />,
    );
    expect(screen.getByRole('button', { name: /Gold/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Rust/ })).toBeTruthy();
    // Only the supplied slots (plus Clear) — core contributes no accent button.
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('colors an accent span with the slot hex', () => {
    const { container } = render(
      <AccentEditor
        value={'a {gold:b}'}
        onChange={() => {}}
        colors={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    const span = container.querySelector('[data-accent="gold"]') as HTMLElement;
    expect(span).toBeTruthy();
    expect(span.style.color).toBe('rgb(246, 170, 28)'); // #f6aa1c
  });
});
