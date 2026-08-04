import { useEffect, useState, type RefObject } from 'react';
import type { PlayerRef } from '@remotion/player';
import { formatTimecode } from '../app/timeline-util';
import { ZoomInIcon, ZoomOutIcon } from '../app/icons';

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
    <span className="ed:text-xs ed:text-ink-2 ed:font-mono ed:tabular-nums">
      {formatTimecode(frame, fps)} / {formatTimecode(durationInFrames, fps)}
    </span>
  );
}
