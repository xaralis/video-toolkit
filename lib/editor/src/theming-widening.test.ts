import { describe, it, expect } from 'vitest';
import { resolveVideoRenderer } from '@video-toolkit/lib/theming';
import type { CompositionTheme, VideoRenderer } from '@video-toolkit/lib/theming';

const Dummy: VideoRenderer = () => null;

describe('widened video kinds', () => {
  it('unregistered non-footage kind resolves to undefined (no generic)', () => {
    expect(resolveVideoRenderer({ accentSlots: [] }, 'outro')).toBeUndefined();
    expect(resolveVideoRenderer({ accentSlots: [] }, 'card')).toBeUndefined();
  });
  it('registered outro renderer wins', () => {
    const theme: CompositionTheme = { accentSlots: [], background: '#000', video: { outro: { renderer: Dummy } } };
    expect(resolveVideoRenderer(theme, 'outro')).toBe(Dummy);
  });
  it('footage kinds keep their core generic fallback', () => {
    expect(resolveVideoRenderer({ accentSlots: [] }, 'clip')).toBeDefined();
  });
});
