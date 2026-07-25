/** How far a clip's crop may zoom in (zoom = 1 / crop.width). */
export const MAX_ZOOM = 6;

/** The currently-croppable clip, as the gesture layer needs to see it. */
export interface CropGestureTarget {
  zoom: number;
  focalX: number;
  focalY: number;
  setZoom: (z: number) => void;
  setFocal: (x: number, y: number) => void;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Trackpad + mouse crop control over the preview.
 *
 * The browser cannot tell two fingers from three, so the split uses the gestures
 * it CAN distinguish: a PINCH arrives as ctrl+wheel (zoom), a two-finger SCROLL
 * as a plain wheel (pan), and a click-drag also pans, for anyone without a
 * trackpad. Listeners are non-passive so preventDefault stops the browser's own
 * page pan/zoom. `read()` returning undefined means the control is off — the
 * listeners stay attached but do nothing, so no drag is ever dropped mid-gesture
 * by a re-attach.
 *
 * Returns a cleanup function; call it from the effect that attached this.
 */
export function attachCropGestures(el: HTMLElement, read: () => CropGestureTarget | undefined): () => void {
  // A wheel burst carries only deltas, so a pan run is accumulated here and
  // re-seeded after a short idle.
  let pan: { x: number; y: number } | null = null;
  let panIdle: ReturnType<typeof setTimeout> | undefined;

  const onWheel = (e: WheelEvent) => {
    const t = read();
    if (!t) return;
    e.preventDefault();
    if (e.ctrlKey) {
      pan = null; // pinch → zoom
      const next = t.zoom * (1 - e.deltaY * 0.01);
      t.setZoom(Math.min(MAX_ZOOM, Math.max(1, next)));
      return;
    }
    const r = el.getBoundingClientRect();
    if (!pan) pan = { x: t.focalX, y: t.focalY };
    pan = { x: clamp01(pan.x + e.deltaX / r.width), y: clamp01(pan.y + e.deltaY / r.height) };
    t.setFocal(pan.x, pan.y);
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
    // Grab-and-move: dragging right reveals what is on the left, so the focal
    // point travels opposite the pointer.
    t.setFocal(clamp01(t.focalX - dfx), clamp01(t.focalY - dfy));
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
