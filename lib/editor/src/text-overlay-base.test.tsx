import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('remotion', () => ({
  useCurrentFrame: () => 10,           // inside [0, durationMs] window
  useVideoConfig: () => ({ fps: 30 }),
}));

import { TextOverlayBase, type TextRenderCtx } from '@video-toolkit/lib/components/TextOverlay';
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';

const SLOTS: AccentSlot[] = [{ key: 'gold', label: 'Gold', color: '#f6aa1c' }];

function capture(palette?: AccentSlot[]): TextRenderCtx {
  let captured!: TextRenderCtx;
  render(
    <TextOverlayBase
      text={'a {gold:b}'}
      appearAtMs={0}
      durationMs={2000}
      applyEndpoint={false}
      palette={palette}
      render={(ctx) => { captured = ctx; return null; }}
    />,
  );
  return captured;
}

describe('TextOverlayBase palette resolution', () => {
  it('resolves token accent keys to hex when a palette is passed', () => {
    expect(capture(SLOTS).tokens.find((t) => t.text === 'b')?.color).toBe('#f6aa1c');
  });
  it('leaves the accent key as-is when no palette is passed (back-compat)', () => {
    expect(capture(undefined).tokens.find((t) => t.text === 'b')?.color).toBe('gold');
  });
});
