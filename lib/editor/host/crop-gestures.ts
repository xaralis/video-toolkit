/** How far a clip's crop may zoom in (zoom = 1 / crop.width). Lives in
 *  `lib/reel-config-base/framing.ts` now — the framing model's one source of
 *  truth — and is re-exported here so this file's own use below and its
 *  existing importers (incl. `crop-gestures.test.ts`) keep working unedited. */
export { MAX_ZOOM } from '../../reel-config-base/framing';
import { MAX_ZOOM } from '../../reel-config-base/framing';

/** The currently-adjustable clip, as the gesture layer needs to see it. One
 *  listener set serves BOTH framing modes — `mode` tells the same wheel/drag
 *  handlers which pair of fields to write, rather than a second
 *  `attachXGestures` competing with this one for the same element. */
export interface CropGestureTarget {
  mode: 'crop' | 'place';
  zoom: number;
  focalX: number;
  focalY: number;
  placeX: number;
  placeY: number;
  setZoom: (z: number) => void;
  setFocal: (x: number, y: number) => void;
  setPlace: (x: number, y: number) => void;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5);

/**
 * Trackpad + mouse framing control over the preview — crop (zoom + focal pan)
 * in `'crop'` mode, placement pan in `'place'` mode.
 *
 * The browser cannot tell two fingers from three, so the split uses the gestures
 * it CAN distinguish: a PINCH arrives as ctrl+wheel (zoom — `'crop'` mode only,
 * `'place'` mode has nothing to zoom and the user must switch modes), a
 * two-finger SCROLL as a plain wheel (pan), and a click-drag also pans, for
 * anyone without a trackpad. Listeners are non-passive so preventDefault stops
 * the browser's own page pan/zoom. `read()` returning undefined means the
 * control is off — the listeners stay attached but do nothing, so no drag is
 * ever dropped mid-gesture by a re-attach.
 *
 * The two modes' DRAG sign is deliberately opposite: `'crop'` drags the
 * WINDOW over the source (dragging right reveals what is on the left, so the
 * focal point travels opposite the pointer), `'place'` drags the PICTURE
 * itself (it follows the pointer, same sign as the drag). The wheel pan is
 * unchanged between modes — only the pointer drag flips.
 *
 * Returns a cleanup function; call it from the effect that attached this. The
 * element must already exist — on a caller's first render the reel/preview may
 * not be mounted yet, so key the calling effect on preview mount rather than a
 * bare `[]`, or nothing ever attaches and it never retries.
 */
export function attachCropGestures(el: HTMLElement, read: () => CropGestureTarget | undefined): () => void {
  // A wheel burst carries only deltas, so a pan run is accumulated here and
  // re-seeded after a short idle. Shared by both modes — re-seeded from
  // whichever pair of fields the current mode reads, so a mode switch mid-idle
  // never carries a stale accumulator into the other field pair.
  let pan: { x: number; y: number } | null = null;
  let panIdle: ReturnType<typeof setTimeout> | undefined;

  const onWheel = (e: WheelEvent) => {
    const t = read();
    if (!t) return;
    e.preventDefault();
    if (e.ctrlKey) {
      pan = null; // pinch → zoom
      if (t.mode === 'place') return; // nothing to zoom here — switch modes
      const next = t.zoom * (1 - e.deltaY * 0.01);
      t.setZoom(Math.min(MAX_ZOOM, Math.max(1, next)));
      return;
    }
    const r = el.getBoundingClientRect();
    if (t.mode === 'place') {
      if (!pan) pan = { x: t.placeX, y: t.placeY };
      pan = { x: clamp01(pan.x + e.deltaX / r.width), y: clamp01(pan.y + e.deltaY / r.height) };
      t.setPlace(pan.x, pan.y);
    } else {
      if (!pan) pan = { x: t.focalX, y: t.focalY };
      pan = { x: clamp01(pan.x + e.deltaX / r.width), y: clamp01(pan.y + e.deltaY / r.height) };
      t.setFocal(pan.x, pan.y);
    }
    clearTimeout(panIdle);
    panIdle = setTimeout(() => {
      pan = null;
    }, 200);
  };

  let last: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (!read()) return;
    // Capture phase + stop, so a pan doesn't reach the Player under the overlay.
    e.stopPropagation();
    e.preventDefault();
    last = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    const t = read();
    if (!last || !t) return;
    const r = el.getBoundingClientRect();
    const dfx = (e.clientX - last.x) / r.width;
    const dfy = (e.clientY - last.y) / r.height;
    last = { x: e.clientX, y: e.clientY };
    if (t.mode === 'place') {
      // Drag the picture itself — it follows the pointer.
      t.setPlace(clamp01(t.placeX + dfx), clamp01(t.placeY + dfy));
    } else {
      // Grab-and-move: dragging right reveals what is on the left, so the focal
      // point travels opposite the pointer.
      t.setFocal(clamp01(t.focalX - dfx), clamp01(t.focalY - dfy));
    }
  };
  const onUp = () => {
    last = null;
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  return () => {
    clearTimeout(panIdle);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
}
