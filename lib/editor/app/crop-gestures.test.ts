import { describe, expect, it, vi, beforeEach } from 'vitest';
import { attachCropGestures, MAX_ZOOM, type CropGestureTarget } from '../host/crop-gestures';

function harness(active = true) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  // jsdom gives every element a zero-size rect; the handler divides by it.
  el.getBoundingClientRect = () => ({ width: 100, height: 200, left: 0, top: 0, right: 100, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const target: CropGestureTarget = {
    zoom: 1,
    focalX: 0.5,
    focalY: 0.5,
    setZoom: vi.fn(),
    setFocal: vi.fn(),
  };
  const cleanup = attachCropGestures(el, () => (active ? target : undefined));
  return { el, target, cleanup };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('attachCropGestures', () => {
  it('treats a ctrl+wheel (trackpad pinch) as zoom', () => {
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, cancelable: true }));
    expect(target.setZoom).toHaveBeenCalled();
    expect(target.setFocal).not.toHaveBeenCalled();
    // deltaY -10 → factor (1 - -10*0.01) = 1.1
    expect((target.setZoom as any).mock.calls[0][0]).toBeCloseTo(1.1, 5);
  });

  it('treats a plain wheel (two-finger scroll) as a focal pan', () => {
    // The browser cannot distinguish 2 from 3 fingers, so the gesture split is
    // exactly the one it CAN report: ctrlKey means pinch.
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 20, cancelable: true }));
    expect(target.setZoom).not.toHaveBeenCalled();
    expect(target.setFocal).toHaveBeenCalledWith(0.6, 0.6);
  });

  it('accumulates a pan across a wheel burst', () => {
    // Each wheel event carries only a delta, so the run must be accumulated or
    // the focal point snaps back to the start value on every tick.
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
    expect((target.setFocal as any).mock.calls.at(-1)[0]).toBeCloseTo(0.7, 5);
  });

  it('clamps the focal point into [0,1]', () => {
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: -1000, deltaY: -1000, cancelable: true }));
    expect(target.setFocal).toHaveBeenCalledWith(0, 0);
  });

  it('pans opposite the drag, so dragging right reveals what is on the left', () => {
    const { el, target } = harness();
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 0 }));
    expect(target.setFocal).toHaveBeenCalledWith(0.4, 0.5);
  });

  it('stops panning after pointerup', () => {
    const { el, target } = harness();
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    expect(target.setFocal).not.toHaveBeenCalled();
  });

  it('does nothing at all when no target is active', () => {
    const { el, target } = harness(false);
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true, ctrlKey: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    expect(target.setZoom).not.toHaveBeenCalled();
    expect(target.setFocal).not.toHaveBeenCalled();
  });

  it('removes every listener on cleanup', () => {
    // A dispatch-based assertion alone can't catch a dropped pointerup removal:
    // onMove bails out early when `last` is null regardless of whether the
    // listener is still attached, so it stays green even if that removal is
    // deleted. Spy on the removal calls themselves instead.
    const { el, cleanup } = harness();
    const elSpy = vi.spyOn(el, 'removeEventListener');
    const winSpy = vi.spyOn(window, 'removeEventListener');
    cleanup();
    expect(elSpy).toHaveBeenCalledWith('wheel', expect.any(Function));
    expect(elSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(winSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
    expect(winSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
  });

  it('caps zoom at MAX_ZOOM and never below 1', () => {
    const { el, target } = harness();
    target.zoom = MAX_ZOOM;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }));
    expect((target.setZoom as any).mock.calls.at(-1)[0]).toBe(MAX_ZOOM);
    target.zoom = 1;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true }));
    expect((target.setZoom as any).mock.calls.at(-1)[0]).toBe(1);
  });

  it('stops a pointerdown pan from reaching the Player mounted underneath the overlay', () => {
    // The Player is a DOM descendant of the overlay `el`; a click physically
    // targets the Player node first, then bubbles up through el. Only a
    // CAPTURE-phase listener on el (top-down, before the event reaches its
    // real target) can intercept it before the Player's own listener runs —
    // a bubble-phase listener on el would fire too late. So this needs a
    // child target dispatch, not a dispatch directly on el.
    const { el } = harness();
    const player = document.createElement('div');
    el.appendChild(player);
    const playerHandler = vi.fn();
    player.addEventListener('pointerdown', playerHandler);
    player.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    expect(playerHandler).not.toHaveBeenCalled();
  });

  it('lets pointerdown reach the Player when no target is active', () => {
    const { el } = harness(false);
    const player = document.createElement('div');
    el.appendChild(player);
    const playerHandler = vi.fn();
    player.addEventListener('pointerdown', playerHandler);
    player.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    expect(playerHandler).toHaveBeenCalled();
  });

  it('prevents the default browser action on a pan wheel and on pointerdown', () => {
    const { el } = harness();
    const wheelEvt = new WheelEvent('wheel', { deltaX: 10, cancelable: true });
    el.dispatchEvent(wheelEvt);
    expect(wheelEvt.defaultPrevented).toBe(true);

    const downEvt = new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true });
    el.dispatchEvent(downEvt);
    expect(downEvt.defaultPrevented).toBe(true);
  });

  it('re-seeds the pan accumulator from the clip after an idle gap, instead of continuing stale', () => {
    vi.useFakeTimers();
    try {
      const { el, target } = harness();
      el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
      vi.advanceTimersByTime(250); // > the 200ms idle window: accumulator resets
      target.focalX = 0.9; // a separate, later gesture starts from the clip's current focal point
      el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
      // Seeded from the fresh 0.9, not from the earlier accumulator (which would give 0.7 again).
      expect((target.setFocal as any).mock.calls.at(-1)[0]).toBeCloseTo(1, 5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a non-finite seed focal point as the midpoint instead of propagating NaN', () => {
    // clamp01(NaN) must not stay NaN: an adapter forwarding an absent optional
    // focal without `?? 0.5` would otherwise silently write NaN focals.
    const { el, target } = harness();
    target.focalX = NaN;
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 0, cancelable: true }));
    expect((target.setFocal as any).mock.calls.at(-1)[0]).toBe(0.5);
  });
});
