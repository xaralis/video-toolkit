import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EditorHost } from '../host/EditorHost';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).startsWith('/props')) return { ok: true, json: async () => ({ reel: REEL }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('EditorHost', () => {
  it('shows a loading state before /props resolves', () => {
    render(<EditorHost {...opts} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('loads the reel from /props and shows the project name', async () => {
    render(<EditorHost {...opts} />);
    await waitFor(() => expect(screen.getByText('test-reels')).toBeInTheDocument());
  });

  it('renders the beats-snap toggle unconditionally, disabled without guides', async () => {
    // Core ships the feature for every brand; the absence of guidesMs is what
    // turns it off, not a per-brand flag.
    render(<EditorHost {...opts} />);
    const btn = await screen.findByTitle(/beat/i);
    expect(btn).toBeDisabled();
  });

  it('enables the beats-snap toggle when the reel carries guides', async () => {
    const withGuides = { ...REEL, meta: { ...REEL.meta, guidesMs: [0, 800, 1600] } } as LayeredReel;
    (globalThis.fetch as any).mockImplementation(async () => ({ ok: true, json: async () => ({ reel: withGuides }) }));
    render(<EditorHost {...opts} />);
    const btn = await screen.findByTitle(/beat/i);
    expect(btn).not.toBeDisabled();
  });

  it('POSTs the reel to /save under a `props` key when Save is invoked', async () => {
    render(<EditorHost {...opts} />);
    await screen.findByText('test-reels');

    // The shell's Save control is dirty-gated — with a freshly loaded, unedited
    // reel there is nothing to save, so the button is inert by design.
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect((globalThis.fetch as any).mock.calls.some((c: unknown[]) => String(c[0]) === '/save')).toBe(false);

    // ⌘S is the shell's other save control and is not dirty-gated; it is the
    // only save path reachable in jsdom (the timeline virtualizes its rows to
    // zero height, so no clip can be selected and edited here).
    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() => {
      const call = (globalThis.fetch as any).mock.calls.find((c: unknown[]) => String(c[0]) === '/save');
      expect(call).toBeDefined();
      const init = call[1] as RequestInit;
      expect(init.method).toBe('POST');
      // The reel must be wrapped as { props: { reel } }: that shape is what the
      // save spine writes into defaultProps.
      expect(init.body).toBe(JSON.stringify({ props: { reel: REEL } }));
    });
  });
});
