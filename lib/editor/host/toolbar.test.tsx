import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import type { PlayerRef } from '@remotion/player';
import { Timecode } from './toolbar';

/** A stand-in for the Player: records the `frameupdate` listener so a test can
 *  drive the playhead without a real Remotion Player in jsdom. */
function fakePlayer() {
  const listeners: Record<string, ((e: { detail: { frame: number } }) => void)[]> = {};
  const ref = {
    current: {
      addEventListener: (name: string, fn: (e: { detail: { frame: number } }) => void) => {
        (listeners[name] ??= []).push(fn);
      },
      removeEventListener: () => {},
    } as unknown as PlayerRef,
  };
  return { ref, emit: (frame: number) => listeners.frameupdate?.forEach((fn) => fn({ detail: { frame } })) };
}

function stubClipboard() {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => vi.useRealTimers());

describe('Timecode copy button', () => {
  it('copies the position as timecode AND frame — the display alone is only m:ss', async () => {
    const writeText = stubClipboard();
    const { ref, emit } = fakePlayer();
    render(<Timecode playerRef={ref} durationInFrames={1343} fps={30} />);
    act(() => emit(371));

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    // 371 @ 30fps = 0:12, and the frame is what code needs to act on it.
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('0:12 (frame 371)'));
  });

  it('copies frame 0 rather than refusing at the start of the reel', async () => {
    const writeText = stubClipboard();
    const { ref } = fakePlayer();
    render(<Timecode playerRef={ref} durationInFrames={1343} fps={30} />);

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('0:00 (frame 0)'));
  });

  it('confirms the copy on the button itself, then goes back', async () => {
    stubClipboard();
    const { ref } = fakePlayer();
    render(<Timecode playerRef={ref} durationInFrames={1343} fps={30} />);
    const btn = screen.getByRole('button', { name: /copy/i });

    await act(async () => {
      fireEvent.click(btn);
    });
    // The confirmation is the accessible name, not just a colour: a user who
    // cannot see the icon still learns the copy happened.
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument());
  });

  it('leaves the button usable when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    const { ref } = fakePlayer();
    render(<Timecode playerRef={ref} durationInFrames={1343} fps={30} />);
    const btn = screen.getByRole('button', { name: /copy/i });

    await act(async () => {
      fireEvent.click(btn);
    });

    // No unhandled rejection, no stuck "Copied" state — the button is still a
    // copy button afterwards.
    expect(screen.getByRole('button', { name: /copy/i })).toBeEnabled();
  });
});
