import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { useShortcuts } from './useShortcuts';

// The hook's whole reason to exist is "the typing guard lives here so no call
// site can forget it" (see useShortcuts.ts) — but nothing pinned that claim.
// Flipping the `s.id !== 'save'` condition, or dropping the isContentEditable
// check, previously passed every test in the repo. These tests make both a
// real regression.

function Harness({ handlers }: { handlers: Partial<Record<string, () => void>> }) {
  useShortcuts(handlers);
  return null;
}

afterEach(cleanup);

describe('useShortcuts — the typing guard', () => {
  it('suppresses a non-save binding while an <input> has focus, and leaves the event unprevented', () => {
    const deselect = vi.fn();
    render(createElement(Harness, { handlers: { deselect } }));
    const input = document.createElement('input');
    document.body.appendChild(input);

    const notPrevented = fireEvent.keyDown(input, { key: 'Escape' });

    expect(deselect).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true); // event.preventDefault() was NOT called
    document.body.removeChild(input);
  });

  it('fires `save` anyway while an <input> has focus, and still preventDefaults (so the browser save dialog never appears)', () => {
    const save = vi.fn();
    render(createElement(Harness, { handlers: { save } }));
    const input = document.createElement('input');
    document.body.appendChild(input);

    const notPrevented = fireEvent.keyDown(input, { key: 's', metaKey: true });

    expect(save).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false); // event.preventDefault() WAS called
    document.body.removeChild(input);
  });

  it('suppresses a non-save binding while a <select> has focus (native type-ahead must not double as a shortcut)', () => {
    // A native <select> (e.g. the transition-kind dropdown) has its own
    // keyboard behaviour: typing "s" jumps its type-ahead to an option
    // starting with "s" without moving the select's own value anywhere near
    // "split". Before this guard, the SAME keystroke also fired the bare `s`
    // shortcut and razored the selected clip at the playhead.
    const split = vi.fn();
    render(createElement(Harness, { handlers: { split } }));
    const select = document.createElement('select');
    document.body.appendChild(select);

    const notPrevented = fireEvent.keyDown(select, { key: 's' });

    expect(split).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
    document.body.removeChild(select);
  });

  it('treats a contentEditable element as typing, same as <input>/<textarea>', () => {
    const deselect = vi.fn();
    render(createElement(Harness, { handlers: { deselect } }));
    const div = document.createElement('div');
    // jsdom does not compute `isContentEditable` from the `contenteditable`
    // attribute (it has no editing-host implementation), so the property is
    // set directly here to stand in for a real contentEditable element —
    // this is exactly the property the hook itself reads.
    (div as unknown as { isContentEditable: boolean }).isContentEditable = true;
    document.body.appendChild(div);

    const notPrevented = fireEvent.keyDown(div, { key: 'Escape' });

    expect(deselect).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
    document.body.removeChild(div);
  });

  it('preventDefaults ⌘S even with no save handler registered, so the browser save dialog never appears', () => {
    // Reproduces the shortcut-overlay-open case: handlers narrow to
    // `{deselect, help}` (see EditorHost.tsx), so there is no `save` entry in
    // `ref.current` at all. The doc comment above claims save "always
    // suppresses the browser's own save dialog" — this is what makes that
    // true rather than aspirational.
    render(createElement(Harness, { handlers: { deselect: vi.fn() } }));

    const notPrevented = fireEvent.keyDown(window, { key: 's', metaKey: true });

    expect(notPrevented).toBe(false); // preventDefault() WAS called
  });

  it('fires a bare binding normally when nothing is focused', () => {
    const deselect = vi.fn();
    render(createElement(Harness, { handlers: { deselect } }));

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(deselect).toHaveBeenCalledOnce();
  });
});
