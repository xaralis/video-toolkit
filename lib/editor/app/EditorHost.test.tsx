import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('⌘S POSTs the reel to /save under a `props` key even though the button path is covered elsewhere', async () => {
    render(<EditorHost {...opts} />);
    await screen.findByText('test-reels');

    // ⌘S is the shell's other save control and is not dirty-gated.
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

// The timeline library virtualizes its rows to zero height in jsdom, so a real
// clip can never be selected/edited through it directly. Mocking the child
// components at the module boundary sidesteps that: it lets these tests prove
// what actually reaches LayeredTimeline/LayeredInspector (meta, guidesMs) and
// what the crop-gesture effect actually attaches to, without touching
// EditorHost.tsx itself. Scoped to its own describe (vi.doMock + resetModules
// + a fresh dynamic import per test) so the plain-render tests above keep
// exercising the real LayeredTimeline/LayeredInspector/crop-gestures.
describe('EditorHost (child modules mocked at the boundary)', () => {
  let seenTimelineProps: any[];
  let seenInspectorProps: any[];
  let attached: Array<[HTMLElement, () => unknown]>;

  beforeEach(() => {
    vi.resetModules();
    seenTimelineProps = [];
    seenInspectorProps = [];
    attached = [];

    // importOriginal so EditorHost's other named imports from this module
    // (`videoUrl`, used to decode which URLs to feed `useSourceDurations`)
    // keep resolving — only the component itself is swapped for the probe.
    vi.doMock('../app/LayeredTimeline', async (importOriginal) => {
      const actual = (await importOriginal()) as any;
      return {
        ...actual,
        LayeredTimeline: (p: any) => {
          seenTimelineProps.push(p);
          return null;
        },
      };
    });
    vi.doMock('../app/LayeredInspector', () => ({
      LayeredInspector: (p: any) => {
        seenInspectorProps.push(p);
        return null;
      },
    }));
    vi.doMock('../host/crop-gestures', async (importOriginal) => {
      const actual = (await importOriginal()) as any;
      return {
        ...actual,
        attachCropGestures: (el: HTMLElement, read: () => unknown) => {
          attached.push([el, read]);
          return () => {};
        },
      };
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).startsWith('/props')) return { ok: true, json: async () => ({ reel: REEL }) } as any;
        return { ok: true, json: async () => ({}) } as any;
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('../app/LayeredTimeline');
    vi.doUnmock('../app/LayeredInspector');
    vi.doUnmock('../host/crop-gestures');
  });

  it('passes the same `meta` reference to LayeredTimeline and LayeredInspector', async () => {
    // Identity, not just deep-equality: this task's whole point is a stable
    // reference reaching the memoized timeline (see EditorHostOptions.meta).
    const META = { laneColors: {}, overlayLabels: {} } as any; // stand-in for a brand's editor vocabulary
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} meta={META} />);

    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    await waitFor(() => expect(seenInspectorProps.length).toBeGreaterThan(0));

    expect(seenTimelineProps[seenTimelineProps.length - 1].meta).toBe(META);
    expect(seenInspectorProps[seenInspectorProps.length - 1].meta).toBe(META);
  });

  it('passes reel.meta.guidesMs through to LayeredTimeline', async () => {
    const withGuides = { ...REEL, meta: { ...REEL.meta, guidesMs: [0, 800] } } as LayeredReel;
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: withGuides }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);

    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    expect(seenTimelineProps[seenTimelineProps.length - 1].guidesMs).toEqual([0, 800]);
  });

  it('attaches the crop-gesture listener to a real element once the preview mounts, gated off by default', async () => {
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);

    // The effect is keyed on `previewMounted`, not `[]`: on the first render
    // (reel === null, loading screen) the preview <div> isn't in the DOM yet,
    // so it must re-run once the reel loads and previewRef actually mounts —
    // otherwise it attaches nothing and never retries.
    await screen.findByText('test-reels');
    await waitFor(() => expect(attached.length).toBe(1));

    const [el, read] = attached[0];
    expect(el).toBeInstanceOf(HTMLElement);
    // No clip selected and framingMode 'off' — the activation gate is the
    // caller's, and `undefined` means "the control is off".
    expect(read()).toBeUndefined();
  });

  it('routes framingMode from the inspector toggle row into the crop-gesture target', async () => {
    // Both framing modes now start from LayeredInspector's toggle row
    // (onFramingModeChange), not a preview button — this proves the whole
    // path: inspector callback → host state → the read() the gesture layer
    // actually sees, for BOTH modes. Uses `fit: 'contain'` so 'place' mode is
    // actually legitimate here (under 'cover', the stuck-mode guard tested
    // separately below would immediately revert it to 'off').
    const withContain = { ...REEL, tracks: { ...REEL.tracks, video: [{ ...REEL.tracks.video[0], fit: 'contain' }] } } as LayeredReel;
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: withContain }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    await waitFor(() => expect(attached.length).toBe(1));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect('video:seg-001'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001'));
    expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('off');
    expect(attached[0][1]()).toBeUndefined();

    act(() => seenInspectorProps[seenInspectorProps.length - 1].onFramingModeChange('crop'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('crop'));
    expect(attached[0][1]()).toMatchObject({ mode: 'crop', focalX: 0.5, focalY: 0.5, placeX: 0.5, placeY: 0.5, zoom: 1 });

    act(() => seenInspectorProps[seenInspectorProps.length - 1].onFramingModeChange('place'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('place'));
    expect(attached[0][1]()).toMatchObject({ mode: 'place' });
  });

  it('resets framingMode to off when the selection changes, same as the old Focus/Zoom toggle did', async () => {
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect('video:seg-001'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001'));
    act(() => seenInspectorProps[seenInspectorProps.length - 1].onFramingModeChange('crop'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('crop'));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect(null));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe(null));
    expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('off');
  });

  it("turns 'place' mode back off when the selected clip's fit changes to cover out from under it", async () => {
    // Task 5b's requirement: a mode must not stay stuck on a now-impossible
    // mode. Handled here in the host (see EditorHost.tsx's dedicated effect),
    // not in the inspector — the host already owns framingMode and already
    // reads `selVideo` for the gesture target, so the reaction lives next to
    // the state it corrects rather than being pushed down into a panel that
    // only renders it.
    const withContain = { ...REEL, tracks: { ...REEL.tracks, video: [{ ...REEL.tracks.video[0], fit: 'contain' }] } } as LayeredReel;
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: withContain }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect('video:seg-001'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001'));
    act(() => seenInspectorProps[seenInspectorProps.length - 1].onFramingModeChange('place'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('place'));

    const coverReel = {
      ...withContain,
      tracks: { ...withContain.tracks, video: [{ ...withContain.tracks.video[0], fit: undefined }] },
    } as LayeredReel;
    const onChange = seenTimelineProps[seenTimelineProps.length - 1].onChange;
    act(() => onChange(coverReel));

    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].framingMode).toBe('off'));
  });

  it('Escape closes the shortcut overlay instead of clearing the selection underneath it', async () => {
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect('video:seg-001'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001'));

    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('shortcut-backdrop')).toBeInTheDocument();

    // A ternary flip here (`!helpOpen ? setHelpOpen(false) : setSelectedId(null)`)
    // would leave the overlay open AND wipe the selection — the opposite of
    // both assertions below.
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('shortcut-backdrop')).not.toBeInTheDocument();
    expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001');
  });

  it('suppresses other shortcuts while the overlay is open (⌫ does not delete the selection behind it)', async () => {
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect('video:seg-001'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001'));

    fireEvent.keyDown(window, { key: '?' });
    expect(screen.getByTestId('shortcut-backdrop')).toBeInTheDocument();

    // ⌫ would normally delete the selected clip and clear the selection
    // (handleDelete sets selectedId to null). With the overlay open, only
    // `help`/`deselect` are wired, so this must be a no-op.
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('shortcut-backdrop')).toBeInTheDocument();
    expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001');
  });

  it('proves dirty tracking (button disabled → enabled) and POSTs the edited reel on a real Save click', async () => {
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    // LayeredTimeline's `onChange` prop *is* `setReel` — with the timeline
    // mocked out, invoking it directly is how an edit reaches EditorHost
    // without needing a real (jsdom-unreachable) timeline selection.
    const editedReel: LayeredReel = {
      ...REEL,
      tracks: { ...REEL.tracks, video: [{ ...REEL.tracks.video[0], endMs: 3500 }] },
    } as LayeredReel;
    const onChange = seenTimelineProps[seenTimelineProps.length - 1].onChange;
    expect(typeof onChange).toBe('function');
    act(() => onChange(editedReel));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const call = (globalThis.fetch as any).mock.calls.find((c: unknown[]) => String(c[0]) === '/save');
      expect(call).toBeDefined();
      const init = call[1] as RequestInit;
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ props: { reel: editedReel } }));
    });
  });
});
