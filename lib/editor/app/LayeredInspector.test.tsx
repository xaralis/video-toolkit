import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { LayeredInspector } from './LayeredInspector';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const base: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
              effects: [{ type: 'vintage', mode: 'film' }] }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

describe('LayeredInspector effect add/remove', () => {
  it('adds a ken-burns effect to a clip that has none of it', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByText('+ Add effect'));
    fireEvent.click(getByText('ken-burns'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects).toHaveLength(2);
    expect(next.tracks.video[0].effects!.some((e) => e.type === 'ken-burns')).toBe(true);
  });

  it('removes an existing effect', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByLabelText('remove effect vintage'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects ?? []).toHaveLength(0);
  });
});
