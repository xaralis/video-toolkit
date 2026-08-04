import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PlayerRef } from '@remotion/player';
import { formatTimecode } from '../app/timeline-util';
import { CheckIcon, CopyIcon, ZoomInIcon, ZoomOutIcon } from '../app/icons';
import { zoomBtnClass } from './ui';

/** Magnifier for the zoom controls — `+` (zoom in) or `−` (zoom out). */
export function MagnifierIcon({ sign }: { sign: 'plus' | 'minus' }) {
  return sign === 'plus' ? <ZoomInIcon size={14} /> : <ZoomOutIcon size={14} />;
}

/** Isolated so the per-frame playback tick re-renders ONLY this tiny span, not
 *  the whole editor (which would churn the Player + timeline and stutter). */
export function Timecode({ playerRef, durationInFrames, fps }: { playerRef: RefObject<PlayerRef | null>; durationInFrames: number; fps: number }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    player.addEventListener('frameupdate', onFrame);
    player.addEventListener('seeked', onFrame);
    return () => {
      player.removeEventListener('frameupdate', onFrame);
      player.removeEventListener('seeked', onFrame);
    };
  }, [playerRef]);
  return (
    <>
      <span className="ed:text-xs ed:text-ink-2 ed:font-mono ed:tabular-nums">
        {formatTimecode(frame, fps)} / {formatTimecode(durationInFrames, fps)}
      </span>
      <CopyPosition frame={frame} fps={fps} />
    </>
  );
}

/** What the copy button puts on the clipboard. The visible readout is only
 *  `m:ss` — deliberately, it has to stay legible at a glance while playing —
 *  but the reason to copy a position is to hand it to someone (or something)
 *  that will act on it, and a frame is the only unambiguous handle for that:
 *  `m:ss` alone is 30 frames wide. Exported so a test states the format once. */
export function positionForClipboard(frame: number, fps: number): string {
  return `${formatTimecode(frame, fps)} (frame ${frame})`;
}

/** Copies the playhead position. Lives inside <Timecode> rather than beside it
 *  in the toolbar because the frame lives here — hoisting it so a sibling
 *  button could read it would re-render the whole editor on every playback
 *  tick, which is the exact thing <Timecode>'s isolation exists to prevent. */
function CopyPosition({ frame, fps }: { frame: number; fps: number }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(positionForClipboard(frame, fps));
    } catch {
      // A denied or missing clipboard is not worth an error state the user
      // cannot act on — the button simply doesn't confirm, and stays a copy
      // button. (Non-secure contexts have no navigator.clipboard at all.)
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1200);
  }, [frame, fps]);

  return (
    <button
      type="button"
      onClick={copy}
      className={zoomBtnClass}
      // The confirmation is the accessible name, not only the icon swap.
      aria-label={copied ? 'Copied' : 'Copy position'}
      title={copied ? 'Copied' : `Copy the playhead position (${positionForClipboard(frame, fps)})`}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
    </button>
  );
}
