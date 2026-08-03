import { describe, it, expect } from 'vitest';
import { SHORTCUTS } from './shortcuts';

const ev = (init: Partial<KeyboardEvent>) => ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...init }) as KeyboardEvent;

describe('the shortcut registry', () => {
  it('gives every entry a unique id', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Checked across the WHOLE registry, not per group: grouping is a display
  // concern, and a Timeline binding shadowing an Editing one is exactly the
  // collision worth catching.
  it('has no two shortcuts matching the same event', () => {
    const probes = [
      ev({ key: 's', metaKey: true }), ev({ key: ' ' }), ev({ key: 'Escape' }),
      ev({ key: 'z', metaKey: true }), ev({ key: 'z', metaKey: true, shiftKey: true }),
      ev({ key: 'Delete' }), ev({ key: 'Backspace' }), ev({ key: 'ArrowLeft' }),
      ev({ key: 'ArrowRight' }), ev({ key: 'ArrowLeft', shiftKey: true }),
      ev({ key: 'ArrowRight', shiftKey: true }), ev({ key: 'Home' }), ev({ key: 'End' }),
      ev({ key: 's' }), ev({ key: 'd', metaKey: true }), ev({ key: '+' }), ev({ key: '-' }),
      ev({ key: '?' }),
    ];
    for (const e of probes) {
      const hits = SHORTCUTS.filter((s) => s.match(e)).map((s) => s.id);
      expect(hits.length, `${e.key} matched ${hits.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });

  it('registers the key that opens the overlay', () => {
    expect(SHORTCUTS.find((s) => s.id === 'help')).toBeDefined();
  });

  it('gives every entry a display form and a label', () => {
    for (const s of SHORTCUTS) {
      expect(s.keys.length, s.id).toBeGreaterThan(0);
      expect(s.label.length, s.id).toBeGreaterThan(0);
    }
  });
});
