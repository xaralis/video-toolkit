import { useCallback, useEffect, useRef, useState } from 'react';
import type { HintMessage } from './block-reason-copy';

/** Transient message state for the timeline bar.
 *
 *  Two properties are load-bearing:
 *  - IDENTITY: re-publishing the same text keeps the SAME object, so a drag
 *    held against a bound (which fires on every pointer move) does not
 *    re-render the memoized timeline dozens of times per second.
 *  - LATCH: the message stays up while the gesture continues and only starts
 *    its countdown on `release`, so it cannot blink between move events. */
export function useTransientHint(clearAfterMs = 1500) {
  const [hint, setHint] = useState<HintMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  const publish = useCallback((next: HintMessage | null) => {
    cancel();
    setHint((cur) => {
      if (next === null) return null;
      if (cur && cur.text === next.text && cur.severity === next.severity) return cur; // identity
      return next;
    });
  }, []);

  const hold = useCallback(cancel, []);

  const release = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => setHint(null), clearAfterMs);
  }, [clearAfterMs]);

  return { hint, publish, hold, release };
}
