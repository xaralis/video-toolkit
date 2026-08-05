// An audio item's media must be MOUNTED BEFORE its sequence's first frame,
// exactly like a video item — see video-track-premount.test.tsx for the
// video-side defect this mirrors.
//
// THE DEFECT. Every audio Sequence was emitted with no `premountFor` at all,
// so an <Audio> element first existed exactly when its sequence began — only
// then does it open the file, seek to `startFrom`, and start decoding. That
// open+seek time is time the audio plays LATE relative to the timeline, and
// because the sequence still ends at its authored frame, what gets cut off is
// the TAIL — the last word of a line. Worst on L-cut segments, where the
// audio's source file is different from the picture's and so is cold in a way
// nothing else has warmed.
//
// THE FIX mirrors the video track exactly: premount the Sequence, clamped so
// it never reaches before frame 0. Both tracks now derive the window from the
// SAME exported constant (`ITEM_PREMOUNT_SECONDS` in media-sync.ts) so a
// future change to it cannot silently desynchronise the two tracks — these
// tests import the constant rather than hard-coding 1.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { buildAudioNodes } from '@video-toolkit/lib/render/audio-track';
import { ITEM_PREMOUNT_SECONDS } from '@video-toolkit/lib/render/media-sync';
import type { AudioItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const FPS = 30;
const WINDOW_FRAMES = Math.round(FPS * ITEM_PREMOUNT_SECONDS);

const audio = (over: Partial<AudioItem> = {}): AudioItem => ({
  id: 'a1',
  source: 'take.mp4',
  startMs: 0,
  endMs: 2000,
  sourceInMs: 0,
  ...over,
});

describe('audio nodes premount before their sequence starts', () => {
  it('carries a premount equal to the shared window when there is room for it', () => {
    // startMs 5000ms → frame 150 at 30fps, well clear of the window.
    const [node] = buildAudioNodes([audio({ startMs: 5000, endMs: 7000 })], {
      fps: FPS,
    }) as React.ReactElement[];
    expect((node.props as { premountFor?: number }).premountFor).toBe(WINDOW_FRAMES);
  });

  it('clamps the premount at its own `from` — an item starting at frame 0 must not premount into negative frames', () => {
    const [node] = buildAudioNodes([audio({ startMs: 0, endMs: 2000 })], {
      fps: FPS,
    }) as React.ReactElement[];
    // from=0, so Math.min(0, WINDOW_FRAMES) === 0.
    expect((node.props as { premountFor?: number }).premountFor).toBe(0);
  });

  it('clamps to the exact `from` value when `from` is smaller than the window', () => {
    // startMs 500ms → frame 15 at 30fps, smaller than the 1s/30-frame window.
    const [node] = buildAudioNodes([audio({ startMs: 500, endMs: 2500 })], {
      fps: FPS,
    }) as React.ReactElement[];
    expect((node.props as { premountFor?: number }).premountFor).toBe(15);
  });

  it('stays on every audio item, not just the first', () => {
    const nodes = buildAudioNodes(
      [audio({ startMs: 5000, endMs: 7000 }), audio({ id: 'a2', startMs: 8000, endMs: 10000 })],
      { fps: FPS },
    ) as React.ReactElement[];
    expect(nodes).toHaveLength(2);
    for (const node of nodes) {
      expect((node.props as { premountFor?: number }).premountFor).toBe(WINDOW_FRAMES);
    }
  });

  it('derives its window from the same constant the video track uses', () => {
    // Not a duplicated literal: if ITEM_PREMOUNT_SECONDS changes, this
    // expectation moves with it and so does the video track's.
    const [node] = buildAudioNodes([audio({ startMs: 5000, endMs: 7000 })], {
      fps: FPS,
    }) as React.ReactElement[];
    expect((node.props as { premountFor?: number }).premountFor).toBe(
      Math.round(FPS * ITEM_PREMOUNT_SECONDS),
    );
  });
});
