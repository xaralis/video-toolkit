import '@testing-library/jest-dom/vitest';

// jsdom does not implement PointerEvent (see https://github.com/jsdom/jsdom/issues/2527),
// so `new window.PointerEvent(...)` — which is what @testing-library/dom's
// fireEvent.pointerDown/Move/Up construct under the hood — silently falls
// back to a bare `Event` that drops init fields like `clientX`. Tests that
// simulate pointer drags (e.g. Timeline's trim handles) need `clientX` to
// reach the handler, so polyfill a minimal PointerEvent on top of
// MouseEvent (which jsdom implements fully, including `clientX`/`clientY`).
if (typeof window !== 'undefined' && typeof (window as any).PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    public pointerId: number;
    public pointerType: string;
    public isPrimary: boolean;

    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  (window as any).PointerEvent = PointerEventPolyfill;
}
