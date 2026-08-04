import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { EditorShell } from '../app/EditorShell';
import { LayeredTimeline, videoUrl, type Diagnostic, type LayeredTimelineHandle } from '../app/LayeredTimeline';
import { DiagnosticsBadge } from '../app/Diagnostics';
import { LayeredInspector } from '../app/LayeredInspector';
import { RenderButton } from '../app/RenderButton';
import { useHistory } from '../app/useHistory';
import { useSourceDurations } from '../app/useSourceDurations';
import { deleteItem, splitItem, duplicateItem } from '../src/timeline/layered-adapter';
import { useShortcuts } from '../app/useShortcuts';
import { ShortcutOverlay } from '../app/ShortcutOverlay';
import type { EditorMeta } from '../app/editor-meta';
import type { AccentSlot } from '../../theming/palette';
import type { LayeredReel } from '../../reel-config-base/layered-schema';
import { framesForReel } from './host-duration';
import { attachCropGestures, MAX_ZOOM, type CropGestureTarget } from './crop-gestures';
import { zoomByRef } from './zoom-by';
import { EDITOR_ACCENT, toggleBtnClass, zoomBtnClass } from './ui';
import { MagnifierIcon, Timecode } from './toolbar';
import { MediaLoadingOverlay, pendingSources } from './MediaLoading';
import { MagnetIcon, MusicIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, TrashIcon, WavesIcon } from '../app/icons';

export interface EditorHostOptions {
  /** The brand's composition, rendered in the preview Player. */
  component: ComponentType<{ reel: LayeredReel }>;
  /** Shown in the shell header. Usually the template name. */
  projectName: string;
  fps: number;
  width: number;
  height: number;
  /** The brand's accent palette, offered by the inspector's accent editor.
   *  Absent means NO palette — core never invents a brand's accents. */
  accentSlots?: readonly AccentSlot[];
  /** Brand-supplied editor vocabulary (lane colours, overlay labels, effects,
   *  video props). Optional; core's defaults are brand-neutral.
   *
   *  PASS A STABLE REFERENCE — a module-level constant, or `useMemo`.
   *  `LayeredTimeline` is `memo`ized with a shallow compare and re-renders on
   *  every playhead frame; an inline `meta={{ … }}` literal is a fresh object
   *  each render and defeats the memo entirely. */
  meta?: EditorMeta;
}

/**
 * The reel editor, whole. A brand's `.editor/main.tsx` is a `mountEditorHost`
 * call with its composition, dimensions and palette — nothing else.
 */
export function EditorHost({ component, projectName, fps, width, height, accentSlots, meta }: EditorHostOptions) {
  const { state: reel, set: setReel, undo, redo, reset: resetHistory, canUndo, canRedo } = useHistory<LayeredReel | null>(null);
  const [savedReel, setSavedReel] = useState<LayeredReel | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null); // action id `${lane}:${itemId}`
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [playing, setPlaying] = useState(false);
  const [showFocus, setShowFocus] = useState(false);
  const [ripple, setRipple] = useState(false);
  const [snapping, setSnapping] = useState(true);
  const [snapToBeats, setSnapToBeats] = useState(false);
  const [scaleWidth, setScaleWidth] = useState(80); // timeline zoom, px per second (80 = 100%)
  const [helpOpen, setHelpOpen] = useState(false);
  const playerRef = useRef<PlayerRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<LayeredTimelineHandle>(null);

  // Stable across playback re-renders so the Player + memoized timeline don't churn.
  const inputProps = useMemo(() => ({ reel }), [reel]);
  // Decoded clip/broll durations, threaded to the inspector the same way `reel`
  // and `fps` already are — it needs them (alongside `reel`) to bound a
  // transition's length field at what its neighbours can actually lend (see
  // `handleRoomFrames`/`maxTransitionFrames`, Task 7). `LayeredTimeline` decodes
  // its own copy for the same URLs (capMsById, grip muting, diagnostics); this
  // is a second, independent decode rather than a shared cache — an accepted
  // duplication, not a correctness issue (a URL decodes to the same duration
  // either way).
  const videoUrls = useMemo(
    () => (reel ? reel.tracks.video.map(videoUrl).filter((u): u is string => !!u) : []),
    [reel],
  );
  const sourceDurations = useSourceDurations(videoUrls);
  // Media readiness, for the preview's loading indicator. The probe count is the
  // startup case (the editor opens before any video element has data, so the
  // preview would otherwise just be black); `buffering` is the Player's own
  // waiting/resume pair, for a seek into media the browser has not fetched.
  const pendingMedia = pendingSources(videoUrls, sourceDurations).length;
  const [buffering, setBuffering] = useState(false);
  const handleSelect = useCallback((id: string | null) => setSelectedId((cur) => (cur === id ? null : id)), []);
  // Focus/Zoom is per-clip — switching selection turns it back off.
  useEffect(() => setShowFocus(false), [selectedId]);
  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    setReel((r) => (r ? deleteItem(r, selectedId, { ripple }) : r));
    setSelectedId(null);
  }, [selectedId, ripple, setReel]);
  // Split/duplicate both mint a new item and hand back the `selectedId` it
  // belongs under (see layered-adapter.ts) — moved onto here so the author is
  // left working on the new piece, not the shrunk original. Repeat-invoking
  // either one WITHOUT a selection change (e.g. two fast `⌘D` presses) is
  // safe even so: `duplicateItem`/`splitItem` uniquify the id they mint
  // against every id already in the reel they're given, so the second call
  // — reading `reel`, not a functional-update snapshot — still lands a
  // distinct id rather than colliding with the first call's.
  const handleSplit = useCallback(() => {
    if (!reel || !selectedId) return;
    const { reel: next, selectedId: sel } = splitItem(reel, selectedId, playerRef.current?.getCurrentFrame() ?? 0, fps);
    setReel(next);
    setSelectedId(sel);
  }, [reel, selectedId, fps, setReel]);
  const handleDuplicate = useCallback(() => {
    if (!reel || !selectedId) return;
    const { reel: next, selectedId: sel } = duplicateItem(reel, selectedId);
    setReel(next);
    setSelectedId(sel);
  }, [reel, selectedId, setReel]);
  // Timeline zoom (px/s). 80 px/s = 100%; the readout is shown as a percentage.
  const ZOOM_MIN = 16;
  const ZOOM_MAX = 400;
  // NOT rounded to whole px/s: a trackpad pinch arrives as many small factors
  // (see zoomFactorFor), and rounding each one would quantise a 0.5% step back
  // to zero at low zoom levels — the gesture would simply stop working there.
  // The readout rounds for display instead.
  //
  // Returns the ACHIEVED ratio (next / current), not the requested `factor` —
  // every caller that anchors a zoom (`LayeredTimelineHandle.zoomAtCenter`)
  // needs the number that actually happened, because at the clamp boundary
  // the two differ (a requested ×1.25 at scaleWidth 350 only ever reaches
  // 400, i.e. ×1.143) and anchoring on the request overshoots.
  //
  // Backed by `scaleWidthRef`, not the `scaleWidth` render closure: several
  // wheel/pinch events can land in the SAME tick, before React ever commits a
  // render, and a closure read would see the same stale base for all of them
  // (last write wins, every intermediate step lost). `zoomByRef` reads AND
  // writes the ref synchronously, so N calls in one tick compound by the
  // PRODUCT of their achieved ratios — this is what makes the premise
  // `accumulateZoom` (`LayeredTimeline.tsx`) depends on actually true, rather
  // than merely asserted. `scaleWidthRef` is the only writer of `scaleWidth`
  // in this component (grepped) — if another one is ever added, it must keep
  // the ref in step too, or route through this same helper.
  const scaleWidthRef = useRef(scaleWidth);
  const zoomBy = useCallback(
    (factor: number): number => zoomByRef(scaleWidthRef, factor, ZOOM_MIN, ZOOM_MAX, setScaleWidth),
    [],
  );

  useEffect(() => {
    fetch('/props')
      .then((res) => res.json())
      .then((data) => {
        const r = (data as { reel: LayeredReel }).reel;
        resetHistory(r);
        setSavedReel(r);
      })
      .catch((err) => console.error('Failed to load /props', err));
  }, []);

  const dirty = useMemo(() => {
    if (!reel || !savedReel) return false;
    return JSON.stringify(reel) !== JSON.stringify(savedReel);
  }, [reel, savedReel]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Only play/pause re-renders the app (for the ▶/⏸ button); the per-frame tick
  // is handled by the isolated <Timecode> and the timeline's own cursor sync, so
  // playback does NOT re-render the editor (no stutter).
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener('play', onPlay);
    player.addEventListener('pause', onPause);
    return () => {
      player.removeEventListener('play', onPlay);
      player.removeEventListener('pause', onPause);
    };
  }, [reel]);

  const handleSave = () => {
    if (!reel || saving) return;
    setSaving(true);
    fetch('/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ props: { reel } }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: 'Save failed' }));
          throw new Error(data.error || 'Save failed');
        }
        setSavedReel(reel);
      })
      .catch((err) => {
        console.error('Failed to save', err);
        alert(err instanceof Error ? err.message : 'Save failed');
      })
      .finally(() => setSaving(false));
  };

  // Selected clip/broll → drives the focal-point + zoom controls. Computed
  // (with the crop-gesture effect) BEFORE the early return so hook order is
  // stable (reel can be null on first render). `reel &&` guards the null case.
  const selVideo =
    reel && selectedId && selectedId.startsWith('video:')
      ? reel.tracks.video.find((v) => `video:${v.id}` === selectedId)
      : undefined;

  const setFocal = (fx: number, fy: number) =>
    selVideo &&
    setReel((r) =>
      r
        ? {
            ...r,
            tracks: {
              ...r.tracks,
              video: r.tracks.video.map((v) =>
                v.id === selVideo.id ? { ...v, focalX: Number(fx.toFixed(3)), focalY: Number(fy.toFixed(3)) } : v,
              ),
            },
          }
        : r,
    );

  // Zoom the selected clip via crop.width (zoom = 1 / crop.width; z=1 → no crop).
  const setZoom = (z: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, z));
    if (!selVideo) return;
    setReel((r) =>
      r
        ? {
            ...r,
            tracks: {
              ...r.tracks,
              video: r.tracks.video.map((v) =>
                v.id === selVideo.id
                  ? { ...v, crop: clamped > 1 ? { ...((v.crop as object) ?? {}), width: Number((1 / clamped).toFixed(6)) } : undefined }
                  : v,
              ),
            },
          }
        : r,
    );
  };

  // Trackpad crop control while Focus/Zoom is active (pinch = zoom, two-finger
  // scroll or drag = pan; see attachCropGestures). State is read through a ref
  // so the listeners attach once and never drop a drag mid-gesture.
  const cropRef = useRef<{ selVideo?: typeof selVideo; showFocus: boolean; setZoom: (z: number) => void; setFocal: (x: number, y: number) => void }>({
    showFocus,
    setZoom,
    setFocal,
  });
  cropRef.current = { selVideo, showFocus, setZoom, setFocal };
  // Re-run once the preview element exists: on the very first render `reel` is
  // null (loading screen) so previewRef isn't mounted yet — a bare [] effect
  // would attach nothing and never retry. Keyed on mount so it attaches then.
  const previewMounted = reel !== null;
  // Same mount key as the crop gestures below, and for the same reason: on the
  // first render `reel` is null, so there is no Player to subscribe to yet.
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const wait = () => setBuffering(true);
    const resume = () => setBuffering(false);
    player.addEventListener('waiting', wait);
    player.addEventListener('resume', resume);
    return () => {
      player.removeEventListener('waiting', wait);
      player.removeEventListener('resume', resume);
    };
  }, [previewMounted]);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    return attachCropGestures(el, (): CropGestureTarget | undefined => {
      // The activation gate is the caller's: only clip/broll are croppable, and
      // only while Focus/Zoom is on. `undefined` = the control is off.
      const { selVideo: sv, showFocus: sf, setZoom: sz, setFocal: sf2 } = cropRef.current;
      if (!sf || (sv?.kind !== 'clip' && sv?.kind !== 'broll')) return undefined;
      return {
        // Derived live on every read — caching it would let the gesture act on
        // a stale zoom for the rest of a wheel burst.
        zoom: 1 / ((sv.crop as { width?: number } | undefined)?.width ?? 1),
        focalX: sv.focalX ?? 0.5,
        focalY: sv.focalY ?? 0.5,
        setZoom: sz,
        setFocal: sf2,
      };
    });
  }, [previewMounted]);

  // Guarded so the hook (below) can be called unconditionally — `reel` is
  // still null on the very first render, before /props answers.
  const durationInFrames = reel ? framesForReel(reel, fps) : 0;

  // One listener for every editor shortcut (see `shortcuts.ts`). Called
  // unconditionally, before the early return below, so hook order never
  // varies between the loading render and every one after it.
  const shortcutHandlers = {
    deselect: () => (helpOpen ? setHelpOpen(false) : setSelectedId(null)),
    play: () => playerRef.current?.toggle(),
    undo,
    redo,
    delete: () => selectedId && handleDelete(),
    stepBack: () => playerRef.current?.seekTo(Math.max(0, (playerRef.current?.getCurrentFrame() ?? 0) - 1)),
    stepFwd: () => playerRef.current?.seekTo(Math.min(durationInFrames - 1, (playerRef.current?.getCurrentFrame() ?? 0) + 1)),
    jumpBack: () => playerRef.current?.seekTo(Math.max(0, (playerRef.current?.getCurrentFrame() ?? 0) - 10)),
    jumpFwd: () => playerRef.current?.seekTo(Math.min(durationInFrames - 1, (playerRef.current?.getCurrentFrame() ?? 0) + 10)),
    toStart: () => playerRef.current?.seekTo(0),
    toEnd: () => playerRef.current?.seekTo(Math.max(0, durationInFrames - 1)),
    split: handleSplit,
    duplicate: handleDuplicate,
    // No cursor to anchor a keyboard zoom on, so the viewport centre stands
    // in for it — captured synchronously, before scaleWidth changes, via the
    // timeline's own imperative hook (see LayeredTimelineHandle). `zoomBy`
    // runs FIRST so `zoomAtCenter` gets the ACHIEVED ratio, not the request —
    // calling it first only schedules the state update, it doesn't re-layout,
    // so the anchor is still captured against the pre-zoom DOM either way.
    zoomIn: () => timelineRef.current?.zoomAtCenter(zoomBy(1.25)),
    zoomOut: () => timelineRef.current?.zoomAtCenter(zoomBy(1 / 1.25)),
    save: () => !saving && handleSave(),
    help: () => setHelpOpen((v) => !v),
  };
  // While the shortcut overlay is open, only `help` (to close it) and
  // `deselect` (Esc) may fire — every other binding would act invisibly
  // behind the modal backdrop (e.g. ⌫ deleting the very clip whose row the
  // user is reading in the overlay at that moment). `useShortcuts` stays a
  // dumb dispatcher; the overlay-awareness lives here.
  useShortcuts(
    helpOpen ? { deselect: shortcutHandlers.deselect, help: shortcutHandlers.help } : shortcutHandlers,
  );

  // Before /props answers there is no reel and so no shell at all. Same
  // vocabulary as the preview's own indicator, so the two stages of startup read
  // as one thing rather than two unrelated screens.
  if (!reel) {
    return (
      <div style={{ position: 'relative', width: '100vw', height: '100vh', background: '#161719' }}>
        <MediaLoadingOverlay loaded={0} total={0} buffering label="Loading project…" />
      </div>
    );
  }

  const hasGuides = Boolean(reel.meta.guidesMs?.length);

  return (
    <>
      <EditorShell
        projectName={projectName}
        aspectRatio={`${width} / ${height}`}
        renderControls={<RenderButton />}
        onSave={handleSave}
        onDiscard={() => savedReel && setReel(savedReel)}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        saving={saving}
        dirty={dirty}
        diagnostics={<DiagnosticsBadge items={diagnostics} onSelect={handleSelect} />}
        preview={
          <div ref={previewRef} style={{ position: 'relative' }}>
            <Player
              ref={playerRef}
              component={component}
              inputProps={inputProps}
              durationInFrames={durationInFrames}
              compositionWidth={width}
              compositionHeight={height}
              fps={fps}
              style={{ width: '100%' }}
            />
            <MediaLoadingOverlay
              loaded={videoUrls.length - pendingMedia}
              total={videoUrls.length}
              buffering={buffering}
            />
            {(selVideo?.kind === 'clip' || selVideo?.kind === 'broll') && (
              <>
                <button
                  type="button"
                  onClick={() => setShowFocus((s) => !s)}
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    background: showFocus ? EDITOR_ACCENT : 'rgba(20,21,25,0.8)',
                    color: showFocus ? '#17181c' : '#e8e8ea',
                    border: '1px solid #34363e',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Focus/Zoom
                </button>
                {showFocus && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 8,
                      left: 8,
                      right: 8,
                      background: 'rgba(20,21,25,0.85)',
                      color: '#c8cbd2',
                      border: '1px solid #34363e',
                      borderRadius: 4,
                      padding: '4px 8px',
                      fontSize: 10.5,
                      lineHeight: 1.3,
                      textAlign: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    {1 / (((selVideo?.crop as { width?: number } | undefined)?.width) ?? 1) >= MAX_ZOOM - 0.01
                      ? `Max zoom reached (${MAX_ZOOM}×)`
                      : 'Pinch = zoom · Two-finger scroll or drag = move'}
                  </div>
                )}
              </>
            )}
          </div>
        }
        timeline={
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', flex: 'none' }}>
              {/* LEFT: jump-to-start, playback, jump-to-end, ripple, delete, timecode */}
              <button type="button" onClick={() => playerRef.current?.seekTo(0)} className={zoomBtnClass} title="Jump to start">
                <SkipBackIcon size={14} />
              </button>
              <button type="button" onClick={() => playerRef.current?.toggle()} className={zoomBtnClass} title={playing ? 'Pause' : 'Play'}>
                {playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
              </button>
              <button type="button" onClick={() => playerRef.current?.seekTo(Math.max(0, durationInFrames - 1))} className={zoomBtnClass} title="Jump to end">
                <SkipForwardIcon size={14} />
              </button>
              <button type="button" onClick={() => setRipple((r) => !r)} className={toggleBtnClass(ripple)} title="Ripple: resizing a clip shifts everything after it (and before it) to keep the timeline butted; dragging carries everything behind it too. Off: only what you grab moves.">
                <WavesIcon size={14} /> Ripple {ripple ? 'on' : 'off'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!selectedId}
                className={`${zoomBtnClass} ed:w-auto ed:px-2`}
                style={{ opacity: selectedId ? 1 : 0.4 }}
                title="Delete the selected clip (⌫)"
              >
                <TrashIcon size={14} /> Delete
              </button>
              <Timecode playerRef={playerRef} durationInFrames={durationInFrames} fps={fps} />

              {/* RIGHT: snapping, snap-to-beats, then zoom */}
              <button type="button" onClick={() => setSnapping((s) => !s)} className={`${toggleBtnClass(snapping)} ed:ml-auto`} title="Snap edges and moves to the grid">
                <MagnetIcon size={14} /> Snap {snapping ? 'on' : 'off'}
              </button>
              {/* Shipped for every brand — a reel without beat guides disables it
                  by itself, so no per-brand flag is needed. */}
              <button
                type="button"
                onClick={() => setSnapToBeats((s) => !s)}
                disabled={!snapping || !hasGuides}
                className={toggleBtnClass(snapping && snapToBeats)}
                style={{ opacity: snapping && hasGuides ? 1 : 0.4 }}
                title={snapping ? 'Snap edges and moves to the nearest beat (on release)' : 'Enable Snap first'}
              >
                <MusicIcon size={14} /> Beats snap {snapping && snapToBeats ? 'on' : 'off'}
              </button>
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {/* All three route through `zoomAtCenter` with the ACHIEVED
                    ratio, same as the keyboard shortcuts — this is the most
                    discoverable zoom control, so it's the one place the
                    left-edge-drift regression these controls exist to fix
                    would be most visible if it were skipped here. */}
                <button
                  type="button"
                  onClick={() => timelineRef.current?.zoomAtCenter(zoomBy(1 / 1.4))}
                  className={zoomBtnClass}
                  title="Zoom timeline out (⌘/Ctrl + scroll)"
                >
                  <MagnifierIcon sign="minus" />
                </button>
                <button
                  type="button"
                  // The target ratio is computed from `scaleWidthRef`, not the
                  // `scaleWidth` render closure — the two only ever differ
                  // mid-burst (see zoomBy's doc comment), but this button reads
                  // the same authoritative value zoomBy itself compounds
                  // against, rather than a second, possibly-stale source.
                  onClick={() => timelineRef.current?.zoomAtCenter(zoomBy(80 / scaleWidthRef.current))}
                  title="Reset zoom to 100%"
                  className="ed:text-xs ed:text-ink-2 ed:font-mono ed:tabular-nums"
                  style={{ background: 'none', border: 'none', minWidth: 44, textAlign: 'center', cursor: 'pointer', padding: 0 }}
                >
                  {Math.round((scaleWidth / 80) * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => timelineRef.current?.zoomAtCenter(zoomBy(1.4))}
                  className={zoomBtnClass}
                  title="Zoom timeline in (⌘/Ctrl + scroll)"
                >
                  <MagnifierIcon sign="plus" />
                </button>
              </div>
            </div>
            <div style={{ flex: '1 1 auto', minHeight: 0 }}>
              <LayeredTimeline
                ref={timelineRef}
                reel={reel}
                onChange={setReel}
                selectedId={selectedId}
                onSelect={handleSelect}
                playerRef={playerRef}
                fps={fps}
                ripple={ripple}
                scaleWidth={scaleWidth}
                snapping={snapping}
                snapToBeats={snapping && snapToBeats}
                onZoom={zoomBy}
                savedReel={savedReel}
                guidesMs={reel.meta.guidesMs}
                meta={meta}
                onDiagnostics={setDiagnostics}
              />
            </div>
          </div>
        }
        inspector={
          <LayeredInspector
            reel={reel}
            selectedId={selectedId}
            onChange={setReel}
            onSeek={(f) => playerRef.current?.seekTo(f)}
            fps={fps}
            width={width}
            height={height}
            accentSlots={accentSlots}
            meta={meta}
            sourceDurations={sourceDurations}
          />
        }
      />
      <ShortcutOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  );
}
