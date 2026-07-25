import { useEffect, useState, type RefObject } from 'react';
import type { PlayerRef } from '@remotion/player';
import { formatTimecode } from '../app/timeline-util';

/** Magnifier with a + / − inside, for the zoom controls. */
export function MagnifierIcon({ sign }: { sign: 'plus' | 'minus' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
      <line x1="8" y1="11" x2="14" y2="11" />
      {sign === 'plus' && <line x1="11" y1="8" x2="11" y2="14" />}
    </svg>
  );
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
    <span style={{ fontSize: 12, color: '#7a7d85', fontVariantNumeric: 'tabular-nums' }}>
      {formatTimecode(frame, fps)} / {formatTimecode(durationInFrames, fps)}
    </span>
  );
}
