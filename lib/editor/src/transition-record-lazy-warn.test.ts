// Pins ONE line: `getTransitionRecord` must hand `warnOnce` a THUNK, not an
// already-built string.
//
// Why this needs its own file and a module mock: the cost being avoided is a
// string allocation on a call that then throws the string away, and no
// observable behaviour distinguishes eager from lazy — the warning text, the
// once-per-kind de-duplication and the return value are identical either way.
// The only honest pin is to look at what the call site actually passes. This
// file therefore mocks `warn-once` wholesale, which is why it can't live
// alongside the tests that exercise the real one.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const spy = vi.hoisted(() => vi.fn());
vi.mock('@video-toolkit/lib/render/warn-once', () => ({
  warnOnce: spy,
  resetWarnOnce: () => {},
  isDevEnvironment: () => true,
}));

import { getTransitionRecord } from '@video-toolkit/lib/render/transition-record';

beforeEach(() => spy.mockClear());

describe('getTransitionRecord’s unrecognised-kind warning', () => {
  it('passes a thunk, so the message is not built on frames that drop it', () => {
    getTransitionRecord({ kind: 'never-heard-of-it', frames: 20 }, { dev: true });
    expect(spy).toHaveBeenCalledTimes(1);
    const [key, message] = spy.mock.calls[0];
    expect(key).toBe('transition-kind:never-heard-of-it');
    expect(typeof message, 'message must be a () => string, not a prebuilt string').toBe('function');
    // …and the thunk still produces the real text when it IS invoked.
    const text = (message as () => string)();
    expect(text).toContain('never-heard-of-it');
    expect(text).toContain('hard cut');
  });

  it('does not even reach warnOnce for a core kind or a declared brand kind', () => {
    getTransitionRecord({ kind: 'dissolve', frames: 20 }, { dev: true });
    getTransitionRecord({ kind: 'brandy', frames: 20 }, { dev: true, brandKinds: ['brandy'] });
    expect(spy).not.toHaveBeenCalled();
  });
});
