import { useEffect, useRef, useState } from 'react';

// Decodes the intrinsic duration (ms) of each video URL once and caches it, so a
// clip's RIGHT handle can be bounded at the end of its footage (you can't extend
// a clip past what the source has). A URL whose metadata fails to load resolves
// to 0 → treated as "unknown" (no bound), degrading gracefully.
export function useSourceDurations(urls: string[]): Record<string, number> {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const seen = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const url of urls) {
      if (!url || seen.current.has(url)) continue;
      seen.current.add(url);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      const done = (ms: number) => setDurations((d) => ({ ...d, [url]: ms }));
      v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0);
      v.onerror = () => done(0);
      v.src = url;
    }
  }, [urls.join('|')]);
  return durations;
}
