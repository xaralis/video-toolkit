import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { forwardRef, useImperativeHandle, type Ref } from 'react';
import { EditorHost } from '../host/EditorHost';
import type { LayeredTimelineHandle } from './LayeredTimeline';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

// The toolbar-zoom regression (review findings 3): the zoom-in/zoom-out/reset
// buttons used to change `scaleWidth` directly, never calling
// `LayeredTimelineHandle.zoomAtCenter` — so the most discoverable zoom
// control kept the left-edge drift the anchor exists to remove, and (at the
// clamp boundary) could leave a stale `pendingZoom` for a LATER zoom to
// misapply. `LayeredTimeline` itself is mocked out here (real timeline
// geometry is meaningless in jsdom — every layout metric reads 0) so this
// file tests EEDGE ONE thing in isolation: does clicking each toolbar button
// call `zoomAtCenter`, and with the ACHIEVED ratio, not the requested one.
const zoomAtCenter = vi.fn();

vi.mock('./LayeredTimeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./LayeredTimeline')>();
  const MockTimeline = forwardRef(function MockTimeline(_props: unknown, ref: Ref<LayeredTimelineHandle>) {
    useImperativeHandle(ref, () => ({ zoomAtCenter }));
    return <div data-testid="mock-timeline" />;
  });
  return { ...actual, LayeredTimeline: MockTimeline };
});

const REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Demo', totalDurationMs: 6000 },
  tracks: {
    video: [{ id: 'seg-001', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 }],
    audio: [],
    music: { baseVolumeDb: 0 },
    overlays: [],
    brand: [],
  },
} as unknown as LayeredReel;

const Stub: React.FC<{ reel: LayeredReel }> = () => <div data-testid="stub-composition" />;

const opts = {
  component: Stub,
  projectName: 'test-reels',
  fps: 30,
  width: 1080,
  height: 1920,
};

beforeEach(() => {
  zoomAtCenter.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).startsWith('/props')) return { ok: true, json: async () => ({ reel: REEL }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('EditorHost — toolbar zoom routes through zoomAtCenter', () => {
  it('zoom-in calls zoomAtCenter with the ACHIEVED ratio (unclamped: exactly the requested 1.4)', async () => {
    render(<EditorHost {...opts} />);
    await screen.findByText('test-reels');

    fireEvent.click(screen.getByTitle('Zoom timeline in (⌘/Ctrl + scroll)'));

    expect(zoomAtCenter).toHaveBeenCalledTimes(1);
    expect(zoomAtCenter.mock.calls[0][0]).toBeCloseTo(1.4, 6);
    // The readout is the OTHER observable half of the same click — both must
    // move together, not just one. scaleWidth 80 -> 112 is 140% of the 80px/s
    // = 100% baseline.
    expect(await screen.findByText('140%')).toBeInTheDocument();
  });

  it('zoom-out calls zoomAtCenter with the achieved ratio too', async () => {
    render(<EditorHost {...opts} />);
    await screen.findByText('test-reels');

    fireEvent.click(screen.getByTitle('Zoom timeline out (⌘/Ctrl + scroll)'));

    expect(zoomAtCenter).toHaveBeenCalledTimes(1);
    expect(zoomAtCenter.mock.calls[0][0]).toBeCloseTo(1 / 1.4, 6);
  });

  it('reset-to-100% calls zoomAtCenter with the ratio back to 80px/s, computed from wherever zoom currently sits', async () => {
    render(<EditorHost {...opts} />);
    await screen.findByText('test-reels');

    fireEvent.click(screen.getByTitle('Zoom timeline in (⌘/Ctrl + scroll)')); // 80 -> 112
    zoomAtCenter.mockClear();
    fireEvent.click(screen.getByTitle('Reset zoom to 100%'));

    expect(zoomAtCenter).toHaveBeenCalledTimes(1);
    expect(zoomAtCenter.mock.calls[0][0]).toBeCloseTo(80 / 112, 6);
    expect(await screen.findByText('100%')).toBeInTheDocument();
  });

  it('clamps at the zoom ceiling and reports the achieved ratio, not the request — the exact overshoot bug', async () => {
    render(<EditorHost {...opts} />);
    await screen.findByText('test-reels');

    const zoomInBtn = screen.getByTitle('Zoom timeline in (⌘/Ctrl + scroll)');
    // 80 -> 400 takes 7 clicks of x1.4 (80*1.4^7 ≈ 601, clamped well before
    // that — walk it until the readout hits the ceiling).
    for (let i = 0; i < 20 && screen.queryByText('500%') === null; i++) {
      fireEvent.click(zoomInBtn);
    }
    expect(await screen.findByText('500%')).toBeInTheDocument(); // 400/80 = 500%

    zoomAtCenter.mockClear();
    fireEvent.click(zoomInBtn); // now a genuine no-op: already at the ceiling

    expect(zoomAtCenter).toHaveBeenCalledTimes(1);
    // ratio 1 — NOT the requested 1.4 — is what tells zoomAtCenter to clear
    // any pending anchor instead of scheduling a stale one.
    expect(zoomAtCenter.mock.calls[0][0]).toBe(1);
  });
});
