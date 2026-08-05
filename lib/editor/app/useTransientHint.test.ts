import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTransientHint } from './useTransientHint';

const MSG = { text: 'End of the source.', severity: 'info' as const };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTransientHint', () => {
  it('holds the message until released, then clears after the delay', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    expect(result.current.hint).toEqual(MSG);

    // A drag that keeps pushing must not blink the message off.
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.hint).toEqual(MSG);

    act(() => result.current.release());
    act(() => vi.advanceTimersByTime(1499));
    expect(result.current.hint).toEqual(MSG);
    act(() => vi.advanceTimersByTime(2));
    expect(result.current.hint).toBeNull();
  });

  it('re-publishing the same text does not re-set state', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    const first = result.current.hint;
    act(() => result.current.publish({ ...MSG }));
    // Same content ⇒ same object identity, so a memoized consumer does not
    // re-render on every pointer move of a drag held at the bound.
    expect(result.current.hint).toBe(first);
  });

  it('publishing null clears immediately — a freed handle owes no message', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    act(() => result.current.publish(null));
    expect(result.current.hint).toBeNull();
  });

  it('a new message replaces the old one and restarts the countdown', () => {
    const { result } = renderHook(() => useTransientHint(1500));
    act(() => result.current.publish(MSG));
    act(() => result.current.release());
    act(() => vi.advanceTimersByTime(1000));
    const NEXT = { text: 'Minimum clip length reached.', severity: 'info' as const };
    act(() => result.current.publish(NEXT));
    act(() => vi.advanceTimersByTime(1400));
    expect(result.current.hint).toEqual(NEXT); // the old countdown did not kill it
  });
});
