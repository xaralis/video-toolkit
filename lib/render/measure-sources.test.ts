import { describe, it, expect, vi, beforeEach } from 'vitest';

// measure-sources.ts imports `staticFile` from 'remotion' and `getVideoMetadata` from
// '@remotion/media-utils' — both mocked so this stays a pure unit test with no real
// video decode. `vi.hoisted` because `vi.mock` factories run before this file's own
// top-level `const`s would otherwise be initialised.
const mocks = vi.hoisted(() => ({
  getVideoMetadata: vi.fn(),
  staticFile: vi.fn((p: string) => {
    if (p.startsWith('http')) throw new Error('staticFile must never be called on an absolute URL');
    return `/static/${p}`;
  }),
}));

vi.mock('remotion', () => ({ staticFile: mocks.staticFile }));
vi.mock('@remotion/media-utils', () => ({ getVideoMetadata: mocks.getVideoMetadata }));

import { measureSourceDurationsMs } from './measure-sources';

beforeEach(() => {
  mocks.getVideoMetadata.mockReset();
  mocks.staticFile.mockClear();
});

describe('measureSourceDurationsMs', () => {
  it('measures a clip, keyed by its RESOLVED path (folder-prefixed), not the raw bare filename', async () => {
    mocks.getVideoMetadata.mockResolvedValue({ durationInSeconds: 10 });
    const out = await measureSourceDurationsMs([{ kind: 'clip', source: 'a.mp4' }]);
    expect(out).toEqual({ 'recordings/a.mp4': 10000 });
    // staticFile was called on the RESOLVED path, not the raw source — the
    // exact bug CRITICAL 1 of the review named (staticFile on the raw source
    // 404s for the bare-filename convention).
    expect(mocks.staticFile).toHaveBeenCalledWith('recordings/a.mp4');
    expect(mocks.getVideoMetadata).toHaveBeenCalledWith('/static/recordings/a.mp4');
  });

  it('measures broll under its own folder', async () => {
    mocks.getVideoMetadata.mockResolvedValue({ durationInSeconds: 4 });
    const out = await measureSourceDurationsMs([{ kind: 'broll', source: 'b.mp4' }]);
    expect(out).toEqual({ 'broll/b.mp4': 4000 });
  });

  it('never calls staticFile on an absolute URL — it throws on one', async () => {
    mocks.getVideoMetadata.mockResolvedValue({ durationInSeconds: 6 });
    const out = await measureSourceDurationsMs([{ kind: 'clip', source: 'https://cdn.example/x.mp4' }]);
    expect(out).toEqual({ 'https://cdn.example/x.mp4': 6000 });
    expect(mocks.staticFile).not.toHaveBeenCalled();
    expect(mocks.getVideoMetadata).toHaveBeenCalledWith('https://cdn.example/x.mp4');
  });

  it('skips photo/card/outro/multi-clip — never even queues them', async () => {
    const out = await measureSourceDurationsMs([
      { kind: 'photo', source: 'a.jpg' },
      { kind: 'card' },
      { kind: 'outro' },
      { kind: 'multi-clip' },
    ]);
    expect(out).toEqual({});
    expect(mocks.getVideoMetadata).not.toHaveBeenCalled();
  });

  it('de-duplicates two items that resolve to the same source', async () => {
    mocks.getVideoMetadata.mockResolvedValue({ durationInSeconds: 5 });
    await measureSourceDurationsMs([
      { kind: 'clip', source: 'a.mp4' },
      { kind: 'clip', source: 'a.mp4' },
    ]);
    expect(mocks.getVideoMetadata).toHaveBeenCalledTimes(1);
  });

  it('leaves a failed measurement ABSENT rather than defaulting it to 0', async () => {
    mocks.getVideoMetadata.mockRejectedValue(new Error('unsupported format'));
    const out = await measureSourceDurationsMs([{ kind: 'clip', source: 'a.mp4' }]);
    expect(out).toEqual({});
  });

  it('leaves a stalled (never-settling) measurement ABSENT once the timeout fires', async () => {
    vi.useFakeTimers();
    try {
      mocks.getVideoMetadata.mockReturnValue(new Promise(() => {})); // never settles
      const p = measureSourceDurationsMs([{ kind: 'clip', source: 'a.mp4' }]);
      await vi.advanceTimersByTimeAsync(6000);
      await expect(p).resolves.toEqual({});
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores an item with no source', async () => {
    const out = await measureSourceDurationsMs([{ kind: 'clip' }]);
    expect(out).toEqual({});
    expect(mocks.getVideoMetadata).not.toHaveBeenCalled();
  });
});
