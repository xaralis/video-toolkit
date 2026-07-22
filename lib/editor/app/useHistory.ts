import { useCallback, useRef, useState } from 'react';

// Multi-step undo/redo for a single piece of state (the reel). `set` records a
// new history entry; rapid successive edits (typing in a field, dragging a
// handle/volume line) within COALESCE_MS collapse into ONE undo step so undo
// isn't per-keystroke/per-tick. `set` accepts a value or an updater (like
// useState). History is capped to avoid unbounded growth.
const COALESCE_MS = 450;
const MAX = 200;

export interface History<T> {
  state: T;
  set: (next: T | ((prev: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  /** Replace the state AND clear history (e.g. on initial load). */
  reset: (value: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: T): History<T> {
  const [hist, setHist] = useState<{ stack: T[]; index: number }>({ stack: [initial], index: 0 });
  const lastAt = useRef(0);

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setHist((h) => {
      const cur = h.stack[h.index];
      const value = typeof next === 'function' ? (next as (p: T) => T)(cur) : next;
      if (value === cur) return h;
      const base = h.stack.slice(0, h.index + 1); // drop any redo tail
      const now = Date.now();
      const coalesce = now - lastAt.current < COALESCE_MS && base.length > 1;
      lastAt.current = now;
      const stack = coalesce ? [...base.slice(0, -1), value] : [...base, value];
      const capped = stack.length > MAX ? stack.slice(stack.length - MAX) : stack;
      return { stack: capped, index: capped.length - 1 };
    });
  }, []);

  const undo = useCallback(() => setHist((h) => (h.index > 0 ? { stack: h.stack, index: h.index - 1 } : h)), []);
  const redo = useCallback(
    () => setHist((h) => (h.index < h.stack.length - 1 ? { stack: h.stack, index: h.index + 1 } : h)),
    [],
  );
  const reset = useCallback((value: T) => {
    lastAt.current = 0;
    setHist({ stack: [value], index: 0 });
  }, []);

  return {
    state: hist.stack[hist.index],
    set,
    undo,
    redo,
    reset,
    canUndo: hist.index > 0,
    canRedo: hist.index < hist.stack.length - 1,
  };
}
