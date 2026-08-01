import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GenericTextOverlay } from '@video-toolkit/lib/theming/generic/GenericTextOverlay';
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';

// Remotion hooks need a composition context; the generic renderer must not call
// any (it is static), so it renders fine bare.
const SLOTS: AccentSlot[] = [{ key: 'gold', label: 'Gold', color: '#f6aa1c' }];

describe('GenericTextOverlay', () => {
  it('renders plain text with accents stripped and no animation', () => {
    const { container } = render(
      <GenericTextOverlay
        text={'Hello {gold:World}.'}
        placement="center"
        palette={SLOTS}
        appearAtMs={0}
        durationMs={2000}
      />,
    );
    // Accent braces gone, no colored span — just the plain concatenated text.
    expect(container.textContent).toBe('Hello World.');
    expect(container.querySelector('[data-accent]')).toBeNull();
  });

  it('renders the hardcoded defaults byte-identically when no tokens are given', () => {
    const { container } = render(
      <GenericTextOverlay text={'plain'} placement="center" palette={SLOTS} appearAtMs={0} durationMs={2000} />,
    );
    const style = (container.firstChild as HTMLElement).style;
    expect(style.color).toBe('rgb(255, 255, 255)'); // #ffffff
    expect(style.fontFamily).toBe('sans-serif');
    expect(style.fontWeight).toBe('700');
    expect(style.lineHeight).toBe('1.3');
  });

  it('lets a brand re-colour the generic via a NON-default token — the added capability', () => {
    // Mutation pin: revert `color: t?.color ?? '#ffffff'` to the bare literal
    // and this goes red. A test that only exercises the default value proves
    // nothing about whether tokens are actually read.
    const { container } = render(
      <GenericTextOverlay
        text={'plain'}
        placement="center"
        palette={SLOTS}
        appearAtMs={0}
        durationMs={2000}
        tokens={{ text: { color: '#123456', fontFamily: 'Georgia, serif', fontWeight: 400, lineHeight: 2 } }}
      />,
    );
    const style = (container.firstChild as HTMLElement).style;
    expect(style.color).toBe('rgb(18, 52, 86)'); // #123456
    expect(style.fontFamily).toBe('Georgia, serif');
    expect(style.fontWeight).toBe('400');
    expect(style.lineHeight).toBe('2');
  });
});
