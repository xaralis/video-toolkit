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
    const { el, target, cleanup } = harness();
    cleanup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    expect(target.setFocal).not.toHaveBeenCalled();
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
});
