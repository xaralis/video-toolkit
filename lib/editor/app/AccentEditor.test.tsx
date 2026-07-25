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

describe('AccentEditor', () => {
  it('renders accented runs as colored spans with NO braces visible', () => {
    render(<AccentEditor value="Řízená {lime:péče}." onChange={vi.fn()} />);
    const box = screen.getByRole('textbox');
    // No literal braces anywhere in the visible text.
    expect(box.textContent).toBe('Řízená péče.');
    // The accented phrase is a span tagged with its accent color.
    const span = box.querySelector('[data-accent="lime"]');
    expect(span).not.toBeNull();
    expect(span!.textContent).toBe('péče');
  });

  it('renders default Lime/Teal + Clear toolbar buttons', () => {
    render(<AccentEditor value="plain" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Lime' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Teal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
  });

  it('supports a custom data-driven color palette', () => {
    render(
      <AccentEditor
        value="plain"
        onChange={vi.fn()}
        colors={[
          { key: 'lime', label: 'Green' },
          { key: 'teal', label: 'Blue' },
        ]}
      />
    );
    expect(screen.getByRole('button', { name: 'Green' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blue' })).toBeInTheDocument();
  });

  it('clicking Lime accents the current selection and emits the encoded string', () => {
    const onChange = vi.fn();
    render(<AccentEditor value="Snížíme nájmy" onChange={onChange} />);
    const box = screen.getByRole('textbox');
    const start = 'Snížíme nájmy'.indexOf('nájmy');
    selectPlainRange(box, start, start + 'nájmy'.length);

    fireEvent.click(screen.getByRole('button', { name: 'Lime' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Snížíme {lime:nájmy}');
  });

  it('clicking Clear removes the accent from the selection', () => {
    const onChange = vi.fn();
    render(<AccentEditor value="Řízená {teal:péče}." onChange={onChange} />);
    const box = screen.getByRole('textbox');
    const plain = 'Řízená péče.';
    const start = plain.indexOf('péče');
    selectPlainRange(box, start, start + 'péče'.length);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenCalledWith('Řízená péče.');
  });

  it('re-accenting a selection that already contains an accent does not nest', () => {
    const onChange = vi.fn();
    render(<AccentEditor value="Řízená {teal:péče}." onChange={onChange} />);
    const box = screen.getByRole('textbox');
    selectPlainRange(box, 0, 'Řízená péče'.length);

    fireEvent.click(screen.getByRole('button', { name: 'Lime' }));

    expect(onChange).toHaveBeenCalledWith('{lime:Řízená péče}.');
    const arg = onChange.mock.calls[0][0] as string;
    expect(arg).not.toContain('{teal:');
  });

  it('prevents Enter from inserting a newline', () => {
    render(<AccentEditor value="plain" onChange={vi.fn()} />);
    const box = screen.getByRole('textbox');
    const evt = fireEvent.keyDown(box, { key: 'Enter' });
    // fireEvent returns false when preventDefault was called.
    expect(evt).toBe(false);
  });
});
