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

// The reported bug, as data: the watermark's authored end (34000) outlives
// the content, which ends at 12000 — the outro runs 12000→15000 and brand
// marks must not draw over it. Shared by the load-path and edit-path tests
// below (`describe('EditorHost (child modules mocked at the boundary)')`).
const STALE_BRAND: LayeredReel = {
  ...REEL,
  meta: { ...REEL.meta, totalDurationMs: 15000 },
  tracks: {
    ...REEL.tracks,
    video: [
      { id: 'seg-001', kind: 'clip', startMs: 0, endMs: 12000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 12000 },
      { id: 'outro', kind: 'outro', startMs: 12000, endMs: 15000 },
    ],
    brand: [
      { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 34000 },
      { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: 41667 },
    ],
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

  it('names the PROJECT and its template, not the hardcoded mount option', async () => {
    // `projectName` is baked into each template's `.editor/main.tsx`, so every
    // project built from campaign-reels showed "campaign-reels" and its own
    // name appeared nowhere. project.json knows better — and wins.
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/props')) return { ok: true, json: async () => ({ reel: REEL }) };
      if (String(url).startsWith('/project-state'))
        return { ok: true, json: async () => ({ exists: true, name: 'pp-u-kamenne-vily', template: 'campaign-reels', phase: 'editing', phases: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    render(<EditorHost {...opts} />);

    await waitFor(() => expect(screen.getByText('pp-u-kamenne-vily')).toBeInTheDocument());
    expect(screen.getByTestId('template-name')).toHaveTextContent('campaign-reels');
    expect(screen.queryByText('test-reels')).not.toBeInTheDocument();
  });

  it('falls back to the mount option when there is no project.json', async () => {
    // Core's own examples and showcase have no project.json — they must still
    // show something rather than an empty header.
    (globalThis.fetch as any).mockImplementation(async (url: string) => {
      if (String(url).startsWith('/props')) return { ok: true, json: async () => ({ reel: REEL }) };
      if (String(url).startsWith('/project-state'))
        return { ok: true, json: async () => ({ exists: false, name: undefined, template: undefined, phase: null, phases: [] }) };
      return { ok: true, json: async () => ({}) };
    });
    render(<EditorHost {...opts} />);

    await waitFor(() => expect(screen.getByText('test-reels')).toBeInTheDocument());
    expect(screen.queryByTestId('template-name')).not.toBeInTheDocument();
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

  // The framing mode switch moved OUT of the inspector panel and onto the
  // preview: it acts on the picture, and in the panel nobody went looking for
  // it. These cover what the inspector's own tests used to, at its new home.
  // Selection has to come through the mocked timeline's `onSelect` — the real
  // one virtualizes its rows to zero height in jsdom, so a clip can never be
  // clicked.
  const selectClip = async (id = 'video:seg-001') => {
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    act(() => seenTimelineProps.at(-1).onSelect(id));
  };

  it('shows the framing mode switch on the preview once a clip is selected', async () => {
    await selectClip();
    const group = await screen.findByRole('group', { name: 'Adjust in preview' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Crop/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not show it with nothing selected — there is no clip to adjust', async () => {
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    expect(screen.queryByRole('group', { name: 'Adjust in preview' })).not.toBeInTheDocument();
  });

  it('arms a mode, and clicking the active tile turns it back off', async () => {
    await selectClip();
    const crop = await screen.findByRole('button', { name: /Crop/ });
    fireEvent.click(crop);
    expect(crop).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(crop);
    expect(crop).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables Position under fill-frame, stating why — there is no slack to position into', async () => {
    await selectClip();
    const place = await screen.findByRole('button', { name: /Position/ });
    expect(place).toBeDisabled();
    expect(place.getAttribute('title')).toMatch(/nothing to position/);
    // Only that one tile — Crop stays live.
    expect(screen.getByRole('button', { name: /Crop/ })).not.toBeDisabled();
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

  it('re-derives a stale brand span from the content end on load', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: STALE_BRAND }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);

    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([12000, 12000]);
  });

  it('re-derives the brand span on an EDIT too, not only on load (the wrapper is the choke point, not just the load path)', async () => {
    // REEL's own fixture has `brand: []`, so an edit through it can never
    // exercise `withDerivedBrandSpan` (identity on an empty array every time).
    // Load STALE_BRAND instead — it has real brand items — then push an edit
    // through the timeline's `onChange` (which IS `setReel`, per the other
    // onChange-based tests in this file) and prove the brand span follows the
    // NEW content end, not the one computed at load.
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: STALE_BRAND }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    // Sanity: brand already re-derived to the content end (12000) from load.
    expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([12000, 12000]);

    const current = seenTimelineProps.at(-1).reel as LayeredReel;
    const trimmed = {
      ...current,
      tracks: {
        ...current.tracks,
        video: [
          { ...current.tracks.video[0], endMs: 8000, sourceOutMs: 8000 },
          { ...current.tracks.video[1], startMs: 8000 },
        ],
      },
    } as LayeredReel;
    const onChange = seenTimelineProps.at(-1).onChange;
    act(() => onChange(trimmed));

    await waitFor(() =>
      expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([8000, 8000]),
    );
  });

  it('opens dirty when the loaded reel needed a brand-span correction — the fix is a pending change, savable in one click', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: STALE_BRAND }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);
    await screen.findByText('test-reels');

    // Established idiom for dirty in this file (see the Save-click test
    // below): the Save button's disabled state mirrors `dirty`.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());
  });

  // Discard means "go back to disk exactly" — it must use the RAW setter
  // (`setReelRaw`), not `setReel` (which would re-normalise `savedReel` and
  // mint a fresh, non-identical object even when nothing actually changed).
  // These two tests pin that: both go RED against `onDiscard={() =>
  // savedReel && setReel(savedReel)}`, because normalising a raw, stale
  // `savedReel` produces an object whose JSON differs from the already-
  // normalised current state (dirty never clears) while also throwing away
  // the raw brand span Discard is supposed to restore.
  it('Discard clears dirty after an edit on a project that opened with a stale brand span', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: STALE_BRAND }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);
    await screen.findByText('test-reels');
    // Opens dirty already (the brand-span correction is a pending change).
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());

    // Push a further edit through the timeline's onChange (== setReel).
    const current = seenTimelineProps.at(-1).reel as LayeredReel;
    const edited = {
      ...current,
      tracks: { ...current.tracks, video: [{ ...current.tracks.video[0], endMs: 5000, sourceOutMs: 5000 }, current.tracks.video[1]] },
    } as LayeredReel;
    const onChange = seenTimelineProps.at(-1).onChange;
    act(() => onChange(edited));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());

    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled());
  });

  it('Discard restores the on-disk (raw) brand span, not the derived one', async () => {
    (globalThis.fetch as any).mockImplementation(async (url: string) =>
      String(url).startsWith('/props') ? { ok: true, json: async () => ({ reel: STALE_BRAND }) } : { ok: true, json: async () => ({}) },
    );
    const { EditorHost: Host } = await import('../host/EditorHost');
    render(<Host {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));
    // Sanity: on load, the visible reel is the DERIVED one.
    expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([12000, 12000]);

    const current = seenTimelineProps.at(-1).reel as LayeredReel;
    const edited = {
      ...current,
      tracks: { ...current.tracks, video: [{ ...current.tracks.video[0], endMs: 5000, sourceOutMs: 5000 }, current.tracks.video[1]] },
    } as LayeredReel;
    const onChange = seenTimelineProps.at(-1).onChange;
    act(() => onChange(edited));
    await waitFor(() =>
      expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([5000, 5000]),
    );

    fireEvent.click(screen.getByRole('button', { name: /Discard/i }));

    // Back to exactly what was on disk — STALE_BRAND's own authored, un-derived span.
    await waitFor(() =>
      expect(seenTimelineProps.at(-1).reel.tracks.brand.map((b: { endMs: number }) => b.endMs)).toEqual([34000, 41667]),
    );
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

  it('routes framingMode from the preview mode switch into the crop-gesture target', async () => {
    // Proves the whole path for BOTH modes: preview button → host state → the
    // read() the gesture layer actually sees. Uses `fit: 'contain'` so 'place' mode is
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
    expect(attached[0][1]()).toBeUndefined();

    fireEvent.click(await screen.findByRole('button', { name: /Crop/ }));
    await waitFor(() => expect(attached[0][1]()).toMatchObject({ mode: 'crop', focalX: 0.5, focalY: 0.5, placeX: 0.5, placeY: 0.5, zoom: 1 }));

    fireEvent.click(screen.getByRole('button', { name: /Position/ }));
    await waitFor(() => expect(attached[0][1]()).toMatchObject({ mode: 'place' }));
  });

  it('resets framingMode to off when the selection changes, same as the old Focus/Zoom toggle did', async () => {
    const { EditorHost: MockedEditorHost } = await import('../host/EditorHost');
    render(<MockedEditorHost {...opts} />);
    await screen.findByText('test-reels');
    await waitFor(() => expect(seenTimelineProps.length).toBeGreaterThan(0));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect('video:seg-001'));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe('video:seg-001'));
    fireEvent.click(await screen.findByRole('button', { name: /Crop/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Crop/ })).toHaveAttribute('aria-pressed', 'true'));

    act(() => seenTimelineProps[seenTimelineProps.length - 1].onSelect(null));
    await waitFor(() => expect(seenInspectorProps[seenInspectorProps.length - 1].selectedId).toBe(null));
    // The switch itself goes with the selection; the mode underneath it is off.
    expect(screen.queryByRole('group', { name: 'Adjust in preview' })).not.toBeInTheDocument();
  });

  it("turns 'place' mode back off when the selected clip's fit changes to cover out from under it", async () => {
    // A mode must not stay stuck on a now-impossible one. Handled in the host
    // (see EditorHost.tsx's dedicated effect) — it already owns framingMode
    // and already reads `selVideo` for the gesture target, so the reaction
    // lives next to the state it corrects.
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
    fireEvent.click(await screen.findByRole('button', { name: /Position/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Position/ })).toHaveAttribute('aria-pressed', 'true'));

    const coverReel = {
      ...withContain,
      tracks: { ...withContain.tracks, video: [{ ...withContain.tracks.video[0], fit: undefined }] },
    } as LayeredReel;
    const onChange = seenTimelineProps[seenTimelineProps.length - 1].onChange;
    act(() => onChange(coverReel));

    await waitFor(() => expect(screen.getByRole('button', { name: /Position/ })).toHaveAttribute('aria-pressed', 'false'));
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
