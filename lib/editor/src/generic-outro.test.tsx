import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

// GenericOutro renders Remotion elements (OffthreadVideo/Audio) that don't work
// outside a real composition. Mock them and assert on the RECORDED CALLS, not a
// DOM snapshot — the contract is "which Remotion element, with which src/props".
const captured = vi.hoisted(() => ({ video: [] as any[], audio: [] as any[] }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    staticFile: (s: string) => `/static/${s}`,
    useVideoConfig: () => ({ fps: 30 }),
    OffthreadVideo: (props: any) => {
      captured.video.push(props);
      return null;
    },
    Audio: (props: any) => {
      captured.audio.push(props);
      return null;
    },
  };
});

import { GenericOutro } from '@video-toolkit/lib/theming/generic/GenericOutro';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const outro = (props?: Record<string, unknown>): VideoItem => ({
  id: 'o1',
  kind: 'outro',
  startMs: 6000,
  endMs: 9000,
  ...(props ? { props } : {}),
});

beforeEach(() => {
  captured.video.length = 0;
  captured.audio.length = 0;
});

describe('GenericOutro', () => {
  it('renders a MUTED OffthreadVideo for props.video and a separate Audio for props.audio', () => {
    render(<GenericOutro item={outro({ video: 'brand/outro.mp4', audio: 'brand/outro.mp3' })} handles={{ inHalf: 0, outHalf: 0 }} />);

    expect(captured.video).toHaveLength(1);
    expect(captured.video[0].src).toBe('/static/brand/outro.mp4');
    // The video is muted and the sound comes from the separate <Audio>. An
    // unmuted video would DOUBLE-PLAY for any brand whose outro mp4 carries
    // audio — see GenericOutro's own comment. This assertion is the pin.
    expect(captured.video[0].muted).toBe(true);

    expect(captured.audio).toHaveLength(1);
    expect(captured.audio[0].src).toBe('/static/brand/outro.mp3');
  });

  it('renders nothing and does not throw for an item with no props', () => {
    expect(() => render(<GenericOutro item={outro()} handles={{ inHalf: 0, outHalf: 0 }} />)).not.toThrow();
    expect(captured.video).toHaveLength(0);
    expect(captured.audio).toHaveLength(0);
  });

  it('renders video without audio, and audio without video', () => {
    render(<GenericOutro item={outro({ video: 'brand/outro.mp4' })} handles={{ inHalf: 0, outHalf: 0 }} />);
    expect(captured.video).toHaveLength(1);
    expect(captured.audio).toHaveLength(0);

    captured.video.length = 0;
    render(<GenericOutro item={outro({ audio: 'brand/outro.mp3' })} handles={{ inHalf: 0, outHalf: 0 }} />);
    expect(captured.video).toHaveLength(0);
    expect(captured.audio).toHaveLength(1);
  });

  it('passes an http(s) source through untouched instead of through staticFile', () => {
    render(
      <GenericOutro
        item={outro({ video: 'https://cdn.example.com/outro.mp4', audio: 'http://cdn.example.com/outro.mp3' })}
        handles={{ inHalf: 0, outHalf: 0 }}
      />,
    );
    expect(captured.video[0].src).toBe('https://cdn.example.com/outro.mp4');
    expect(captured.audio[0].src).toBe('http://cdn.example.com/outro.mp3');
  });
});
