import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { Player } from '@remotion/player';
import type { PlayerRef } from '@remotion/player';
import { EditorShell } from '../app/EditorShell';
import { LayeredTimeline, videoUrl, type Diagnostic, type LayeredTimelineHandle } from '../app/LayeredTimeline';
import { StatusChip } from '../app/Diagnostics';
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
import { withDerivedBrandSpan } from '../../reel-config-base/content-end';
import { framesForReel } from './host-duration';
import { attachCropGestures, MAX_ZOOM, type CropGestureTarget } from './crop-gestures';
import { resolveFraming } from '../../reel-config-base/framing';
import { zoomByRef } from './zoom-by';
import { EDITOR_ACCENT, toggleBtnClass, zoomBtnClass } from './ui';
import { MagnifierIcon, Timecode } from './toolbar';
import { MediaLoadingOverlay, pendingSources } from './MediaLoading';
import { CropIcon, MagnetIcon, MoveIcon, MusicIcon, PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon, TrashIcon, WavesIcon } from '../app/icons';

// Applied to the preview wrapper whenever a framing gesture mode is active —
// the ONLY thing left saying "this is interactive" now that the preview has
// no button of its own (see the preview JSX in EditorHost below). Grab while
// idle, grabbing while actually held down (`active:`, a native pseudo-class,
// not a JS drag flag — see the comment at the call site for why that
// distinction matters here specifically), plus a visible accent outline.
const previewInteractiveCls =
  'ed:cursor-grab ed:active:cursor-grabbing ed:outline ed:outline-2 ed:outline-accent ed:-outline-offset-2';

/** The two framing gesture modes, as they appear on the preview.
 *
 *  Short labels with icons, not the sentences these started as ("Crop & zoom"
 *  / "Position in frame"): the row sits over the picture, where every pixel it
 *  covers is picture the user wanted to see. The icon carries the meaning and
 *  the word disambiguates it. */
const FRAMING_MODES = [
  { key: 'crop' as const, label: 'Crop', Icon: CropIcon },
  { key: 'place' as const, label: 'Position', Icon: MoveIcon },
];

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
  const {
    state: reel,
    set: setReelRaw,
    undo,
    redo,
    reset: resetHistory,
    canUndo,
    canRedo,
  } = useHistory<LayeredReel | null>(null);
  // THE choke point for the derived brand lane. Every reel mutation in the
  // editor — adapter ops, inspector patches, delete/split/duplicate — funnels
  // through this setter, so normalising here means no individual operation has
  // to know brand items exist (and none of them carry `fps` anyway). Identity
  // is preserved by `withDerivedBrandSpan`, so a no-op edit still short-circuits
  // in `useHistory` instead of minting an undo step.
  const setReel = useCallback(
    (next: LayeredReel | null | ((prev: LayeredReel | null) => LayeredReel | null)) =>
      setReelRaw((prev) => {
        const value = typeof next === 'function' ? next(prev) : next;
        return value ? withDerivedBrandSpan(value, fps) : value;
      }),
    [setReelRaw, fps],
  );
  const [savedReel, setSavedReel] = useState<LayeredReel | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null); // action id `${lane}:${itemId}`
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [playing, setPlaying] = useState(false);
  // Both framing gesture modes now start from the clip inspector's toggle
  // row, never a preview button (that button is gone — see the preview JSX
  // below). The state still lives here, not in the inspector, because this
  // is what owns the gesture attachment (`attachCropGestures` below).
  const [framingMode, setFramingMode] = useState<'off' | 'crop' | 'place'>('off');
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
  // The framing gesture mode is per-clip — switching selection turns it back off.
  useEffect(() => setFramingMode('off'), [selectedId]);
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

  // Project identity for the header. `projectName` (the mount option) is baked
  // into each TEMPLATE's `.editor/main.tsx`, so it names the template, not the
  // project — every campaign-reels project called itself "campaign-reels" and
  // its own name appeared nowhere. project.json knows both, so it wins; the
  // mount option stays as the fallback for a project without one (core's
  // examples and showcase).
  //
  // This re-fetches `/project-state`, which `RenderButton` also reads for the
  // phase chip. A deliberate, cheap duplication rather than threading state
  // through: the two consumers are independent, and the endpoint is a local
  // file read.
  const [identity, setIdentity] = useState<{ name?: string; template?: string }>({});
  useEffect(() => {
    fetch('/project-state')
      .then((res) => res.json())
      .then((d) => setIdentity({ name: (d as { name?: string }).name, template: (d as { template?: string }).template }))
      .catch(() => setIdentity({})); // no endpoint (or no project.json) — fall back to the mount option
  }, []);

  useEffect(() => {
    fetch('/props')
      .then((res) => res.json())
      .then((data) => {
        // Normalise on load as well as on change: a Root.tsx literal written
        // before the brand span was derived carries a stale end, and the user
        // would otherwise see the old span until their first unrelated edit.
        //
        // RULING (overrides an earlier draft of this comment, which argued the
        // opposite): `savedReel` keeps the RAW loaded reel, not the normalised
        // one. The correction IS a change relative to what is on disk — the
        // render still reads the stale `defaultProps` literal until it's
        // written back — so the editor must open dirty and let one Save
        // persist it. Normalising `savedReel` too would make `dirty` false at
        // open (both sides of the compare would be the same object) and Save
        // would stay disabled, leaving the on-disk literal stale forever: the
        // exact preview/render divergence this plan exists to remove.
        const raw = (data as { reel: LayeredReel }).reel;
        const r = withDerivedBrandSpan(raw, fps);
        resetHistory(r);
        setSavedReel(raw);
      })
      .catch((err) => console.error('Failed to load /props', err));
    // `fps` is a mount-time prop, handed down once by the brand's own
    // `.editor/main.tsx` (see EditorHostOptions) and never expected to change
    // for the lifetime of this component. That's what makes it safe to depend
    // on here: this effect wipes the undo stack and any unsaved edits
    // (`resetHistory`) with no confirmation prompt, so if `fps` ever became
    // dynamic, a refetch mid-session would silently discard work. Making it
    // dynamic would need this effect reworked first — a ref to read the
    // latest `fps` without re-running the fetch, or an explicit guard that
    // only refetches on the initial mount — not just adding it to the deps
    // as-is.
  }, [fps]);

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

  // Same shape as setFocal, writing placeX/placeY instead — the 'place' mode
  // gesture target.
  const setPlace = (px: number, py: number) =>
    selVideo &&
    setReel((r) =>
      r
        ? {
            ...r,
            tracks: {
              ...r.tracks,
              video: r.tracks.video.map((v) =>
                v.id === selVideo.id ? { ...v, placeX: Number(px.toFixed(3)), placeY: Number(py.toFixed(3)) } : v,
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

  // "Position in frame" (place mode) is impossible once fit is 'cover' — no
  // leftover space to place the shot in (see the inspector's toggle row,
  // which greys that tile out for the same reason via `resolveFraming`). If
  // the fit changes to 'cover' out from under an active 'place' mode — e.g.
  // the user flips the Fit segmented field while the preview gesture is still
  // live — the mode must not stay stuck on a now-impossible mode. Handled
  // HERE, not in the inspector: the inspector only RENDERS `framingMode`, the
  // host OWNS it, and this is a reaction to a value the host already reads
  // (`selVideo`) for the gesture target below.
  useEffect(() => {
    if (framingMode === 'place' && selVideo && resolveFraming(selVideo).fit === 'cover') {
      setFramingMode('off');
    }
  }, [framingMode, selVideo]);

  // Trackpad framing control while a mode is active (pinch = zoom in 'crop'
  // mode only; two-finger scroll or drag pans focal in 'crop' mode, place in
  // 'place' mode — see attachCropGestures). State is read through a ref so
  // the listeners attach once and never drop a drag mid-gesture.
  const cropRef = useRef<{
    selVideo?: typeof selVideo;
    framingMode: 'off' | 'crop' | 'place';
    setZoom: (z: number) => void;
    setFocal: (x: number, y: number) => void;
    setPlace: (x: number, y: number) => void;
  }>({
    framingMode,
    setZoom,
    setFocal,
    setPlace,
  });
  cropRef.current = { selVideo, framingMode, setZoom, setFocal, setPlace };
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
      // The activation gate is the caller's: only clip/broll are croppable,
      // and only while a mode is on. `undefined` = the control is off.
      const { selVideo: sv, framingMode: fm, setZoom: sz, setFocal: sf2, setPlace: sp } = cropRef.current;
      if (fm === 'off' || (sv?.kind !== 'clip' && sv?.kind !== 'broll')) return undefined;
      return {
        mode: fm,
        // Derived live on every read — caching it would let the gesture act on
        // a stale zoom for the rest of a wheel burst.
        zoom: 1 / ((sv.crop as { width?: number } | undefined)?.width ?? 1),
        focalX: sv.focalX ?? 0.5,
        focalY: sv.focalY ?? 0.5,
        placeX: sv.placeX ?? 0.5,
        placeY: sv.placeY ?? 0.5,
        setZoom: sz,
        setFocal: sf2,
        setPlace: sp,
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
    <RenderButton>
      {({ phaseControl, renderControls }) => (
        <>
          <EditorShell
            projectName={identity.name ?? projectName}
            templateName={identity.template}
            aspectRatio={`${width} / ${height}`}
            phaseControl={phaseControl}
            renderControls={renderControls}
            onSave={handleSave}
            // Discard means "go back to disk exactly" — deliberately the RAW
            // setter (`setReelRaw`), not `setReel`. `savedReel` is the raw
            // reel as loaded (see the `/props` effect above); running it
            // through `setReel` would re-normalise it, producing a new object
            // whose brand span is the DERIVED one, not what's on disk. Two
            // consequences that made this a real bug, not a style nit:
            // `dirty` compares `JSON.stringify(reel)` against
            // `JSON.stringify(savedReel)` — if `reel` ends up normalised and
            // `savedReel` stays raw, those strings never match again, so
            // Discard could never clear `dirty`. And `useHistory.set` only
            // short-circuits on reference equality, so a fresh normalised
            // object (even with identical content to the current state)
            // mints a spurious undo entry on every Discard. Using the raw
            // setter restores `reel === savedReel` by reference, so `dirty`
            // goes false and no undo entry is pushed. The brand-span
            // correction isn't lost — it simply re-appears, exactly as it did
            // on load, the moment the user makes their next edit through
            // `setReel`. Do not "fix" this back to `setReel`.
            onDiscard={() => savedReel && setReelRaw(savedReel)}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            saving={saving}
            dirty={dirty}
            statusChip={<StatusChip items={diagnostics} dirty={dirty} onSelect={handleSelect} />}
            preview={
            <div
              ref={previewRef}
              // Discoverability, paid for moving both modes' entry point off
              // the preview and into the inspector: with no button here
              // announcing "this is interactive", the grab cursor + accent
              // outline are the only things left saying so. `active:` (not a
              // JS drag flag) drives the grabbing cursor — the gesture
              // listener below stops pointerdown from bubbling to the Player,
              // but `:active` is a native browser state keyed on the pointer
              // being physically down over this element, unaffected by that.
              className={framingMode !== 'off' ? previewInteractiveCls : undefined}
              style={{ position: 'relative' }}
            >
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
              {/* The mode switch lives HERE, on the preview, not in the
                  inspector panel. It was in the panel first, on the reasoning
                  that every other clip property is edited there — but the
                  thing it acts on is this picture, and in the panel nobody
                  went looking for it. A control belongs next to its effect.
                  Only shown for the kinds whose framing is adjustable. */}
              {(selVideo?.kind === 'clip' || selVideo?.kind === 'broll') && (
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    display: 'flex',
                    gap: 4,
                    background: 'rgba(20,21,25,0.85)',
                    border: '1px solid #34363e',
                    borderRadius: 6,
                    padding: 3,
                  }}
                  role="group"
                  aria-label="Adjust in preview"
                >
                  {FRAMING_MODES.map(({ key, label, Icon }) => {
                    const on = framingMode === key;
                    // Placement has no slack under `cover` — the shot already
                    // fills the frame. `resolveFraming`, not the raw `fit`, so
                    // a legacy `blur-pad` item counts as contain.
                    const off = key === 'place' && selVideo && resolveFraming(selVideo).fit === 'cover';
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        disabled={!!off}
                        title={off ? 'The shot fills the frame — there is nothing to position.' : `${label} in the preview`}
                        onClick={() => setFramingMode(on ? 'off' : key)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          border: 0,
                          borderRadius: 4,
                          padding: '4px 8px',
                          fontSize: 11,
                          font: 'inherit',
                          fontWeight: on ? 600 : 400,
                          cursor: off ? 'default' : 'pointer',
                          opacity: off ? 0.4 : 1,
                          background: on ? EDITOR_ACCENT : 'transparent',
                          color: on ? '#fff' : '#c8cbd2',
                        }}
                      >
                        <Icon size={13} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {framingMode !== 'off' && (selVideo?.kind === 'clip' || selVideo?.kind === 'broll') && (
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
                  {framingMode === 'place'
                    ? 'Drag = move the shot in the frame · switch to Crop & zoom to zoom'
                    : 1 / (((selVideo?.crop as { width?: number } | undefined)?.width) ?? 1) >= MAX_ZOOM - 0.01
                      ? `Max zoom reached (${MAX_ZOOM}×)`
                      : 'Pinch = zoom · scroll or drag = choose what shows'}
                </div>
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
              savedReel={savedReel}
              selectedId={selectedId}
              onChange={setReel}
              onSeek={(f) => playerRef.current?.seekTo(f)}
              fps={fps}
              width={width}
              height={height}
              accentSlots={accentSlots}
              meta={meta}
              sourceDurations={sourceDurations}
              ripple={ripple}
            />
          }
          />
          <ShortcutOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
        </>
      )}
    </RenderButton>
  );
}
