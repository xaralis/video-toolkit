import { useEffect, useRef } from 'react';
import { SHORTCUTS } from './shortcuts';

/** One keydown listener for the whole editor, dispatching through the registry.
 *
 *  The typing guard lives here so no call site can forget it — except for
 *  `save`, which deliberately fires even while a field has focus (and always
 *  suppresses the browser's own save dialog). */
export function useShortcuts(handlers: Partial<Record<string, () => void>>): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // SELECT included alongside INPUT/TEXTAREA: a native <select> (e.g. the
      // transition-kind dropdown) has its own keyboard behaviour — type-ahead
      // jumps options, arrows/Home/End move the option list, Backspace can
      // reopen it — and every one of those keys doubles as a bare shortcut
      // here ('s' = split, ←/→/Home/End = playhead nav, ⌫ = delete). Without
      // this guard, typing "s" to type-ahead to "slide" in that dropdown also
      // razors the selected clip at the playhead.
      const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.tagName === 'SELECT' || t?.isContentEditable;
      for (const s of SHORTCUTS) {
        if (!s.match(e)) continue;
        if (typing && s.id !== 'save') return;
        // `save` always suppresses the browser's own save dialog, even when no
        // save handler is currently registered (e.g. the shortcut overlay is
        // open and handlers narrow to `{deselect, help}`) — preventDefault
        // BEFORE the handler-presence check below, unlike every other binding.
        if (s.id === 'save') e.preventDefault();
        const fn = ref.current[s.id];
        if (!fn) return;
        if (s.id !== 'save') e.preventDefault();
        fn();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
