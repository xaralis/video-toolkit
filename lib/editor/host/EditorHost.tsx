import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { EditorShell } from '../app/EditorShell';
import { LayeredTimeline, videoUrl, type Diagnostic } from '../app/LayeredTimeline';
import { DiagnosticsBadge } from '../app/Diagnostics';
import { LayeredInspector } from '../app/LayeredInspector';
import { RenderButton } from '../app/RenderButton';
import { useHistory } from '../app/useHistory';
import { useSourceDurations } from '../app/useSourceDurations';
import { deleteItem } from '../src/timeline/layered-adapter';
import type { EditorMeta } from '../app/editor-meta';
import type { AccentSlot } from '../../theming/palette';
import type { LayeredReel } from '../../reel-config-base/layered-schema';
import { framesForReel } from './host-duration';
import { attachCropGestures, MAX_ZOOM, type CropGestureTarget } from './crop-gestures';
import { EDITOR_ACCENT, toggleBtnClass, zoomBtnClass } from './ui';
import { MagnifierIcon, Timecode } from './toolbar';
import { MediaLoadingOverlay, pendingSources } from './MediaLoading';

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
  const playerRef = useRef<PlayerRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);

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
  // Timeline zoom (px/s). 80 px/s = 100%; the readout is shown as a percentage.
  const ZOOM_MIN = 16;
  const ZOOM_MAX = 400;
  // NOT rounded to whole px/s: a trackpad pinch arrives as many small factors
  // (see zoomFactorFor), and rounding each one would quantise a 0.5% step back
  // to zero at low zoom levels — the gesture would simply stop working there.
  // The readout rounds for display instead.
  const zoomBy = useCallback(
    (factor: number) => setScaleWidth((w) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, w * factor))),
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable;
      if (typing) return;
      if (e.key === 'Escape') {
        setSelectedId(null);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault(); // don't scroll the page
        playerRef.current?.toggle();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDelete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, selectedId, handleDelete]);

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

  const durationInFrames = framesForReel(reel, fps);
  const hasGuides = Boolean(reel.meta.guidesMs?.length);

  return (
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
              ⏮
            </button>
            <button type="button" onClick={() => playerRef.current?.toggle()} className={zoomBtnClass} title={playing ? 'Pause' : 'Play'}>
              {playing ? '⏸' : '▶'}
            </button>
            <button type="button" onClick={() => playerRef.current?.seekTo(Math.max(0, durationInFrames - 1))} className={zoomBtnClass} title="Jump to end">
              ⏭
            </button>
            <button type="button" onClick={() => setRipple((r) => !r)} className={toggleBtnClass(ripple)} title="Ripple: resizing a clip shifts everything after it (and before it) to keep the timeline butted">
              ⇹ Ripple {ripple ? 'on' : 'off'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedId}
              className={`${zoomBtnClass} ed:w-auto ed:px-2`}
              style={{ opacity: selectedId ? 1 : 0.4 }}
              title="Delete the selected clip (⌫)"
            >
              ⌫ Delete
            </button>
            <Timecode playerRef={playerRef} durationInFrames={durationInFrames} fps={fps} />

            {/* RIGHT: snapping, snap-to-beats, then zoom */}
            <button type="button" onClick={() => setSnapping((s) => !s)} className={`${toggleBtnClass(snapping)} ed:ml-auto`} title="Snap edges and moves to the grid">
              ⊹ Snap {snapping ? 'on' : 'off'}
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
              ♪ Beats snap {snapping && snapToBeats ? 'on' : 'off'}
            </button>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <button type="button" onClick={() => zoomBy(1 / 1.4)} className={zoomBtnClass} title="Zoom timeline out (⌘/Ctrl + scroll)">
                <MagnifierIcon sign="minus" />
              </button>
              <button
                type="button"
                onClick={() => setScaleWidth(80)}
                title="Reset zoom to 100%"
                className="ed:text-xs ed:text-ink-3 ed:font-mono ed:tabular-nums"
                style={{ background: 'none', border: 'none', minWidth: 44, textAlign: 'center', cursor: 'pointer', padding: 0 }}
              >
                {Math.round((scaleWidth / 80) * 100)}%
              </button>
              <button type="button" onClick={() => zoomBy(1.4)} className={zoomBtnClass} title="Zoom timeline in (⌘/Ctrl + scroll)">
                <MagnifierIcon sign="plus" />
              </button>
            </div>
          </div>
          <div style={{ flex: '1 1 auto', minHeight: 0 }}>
            <LayeredTimeline
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
          accentSlots={accentSlots}
          meta={meta}
          sourceDurations={sourceDurations}
        />
      }
    />
  );
}
