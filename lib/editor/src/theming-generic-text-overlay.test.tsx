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
});
