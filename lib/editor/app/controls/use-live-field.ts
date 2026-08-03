import { useEffect, useRef, useState } from 'react';

// Live-commit field state: controlled local text that commits on every valid
// keystroke (preview updates immediately, not on blur), and resyncs from the
// external `value` only while UNFOCUSED (external edit / undo / item switch) so
// typing never fights the caret and a no-op commit reverts cleanly on blur.
export function useLiveField(external: string) {
  const [text, setText] = useState<string>(external);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);
  return {
    text,
    setText,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      setText(external);
    },
  };
}
