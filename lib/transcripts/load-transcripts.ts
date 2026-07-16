import { staticFile } from 'remotion';
import type { Transcript } from './transcript-window';

const cache = new Map<string, Transcript | null>();

/**
 * Synchronously fetch a transcript JSON from staticFile.
 * Returns null if the transcript doesn't exist (caption falls back to segment.caption override).
 *
 * Synchronous XHR is used because Remotion components run synchronously per frame.
 * If the transcript file doesn't exist, the request returns null and the caller
 * gracefully renders no captions for that segment.
 */
export function loadTranscriptSync(clipSource: string): Transcript | null {
  if (cache.has(clipSource)) return cache.get(clipSource) ?? null;
  const url = staticFile(`recordings/${clipSource}.transcript.json`);
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 300) {
      const t = JSON.parse(xhr.responseText) as Transcript;
      cache.set(clipSource, t);
      return t;
    }
  } catch {
    // fall through to null cache
  }
  cache.set(clipSource, null);
  return null;
}
