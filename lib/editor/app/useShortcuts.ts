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
      const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable;
      for (const s of SHORTCUTS) {
        if (!s.match(e)) continue;
        if (typing && s.id !== 'save') return;
        const fn = ref.current[s.id];
        if (!fn) return;
        e.preventDefault();
        fn();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
