import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutOverlay } from './ShortcutOverlay';
import { SHORTCUTS } from './shortcuts';

describe('ShortcutOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutOverlay open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  // The anti-drift guarantee, asserted rather than promised: the overlay is
  // generated FROM the registry, so a shortcut cannot exist unlisted.
  it('lists every registered shortcut', () => {
    render(<ShortcutOverlay open onClose={() => {}} />);
    for (const s of SHORTCUTS) {
      expect(screen.getByText(s.label), s.id).toBeInTheDocument();
    }
  });

  it('shows the key for each one', () => {
    render(<ShortcutOverlay open onClose={() => {}} />);
    for (const s of SHORTCUTS) {
      expect(screen.getAllByText(s.keys).length, s.id).toBeGreaterThan(0);
    }
  });

  it('closes on a backdrop click', () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('shortcut-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
