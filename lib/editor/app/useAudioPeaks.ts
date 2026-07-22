import { useEffect, useState } from 'react';

// Computes downsampled waveform peaks for audio sources via the Web Audio API.
// Decoding is expensive, so peaks are cached module-level by URL and each
// source is decoded at most once across the whole editor session.

export const PEAKS_PER_SEC = 40;

const cache = new Map<string, Float32Array>();
let sharedCtx: AudioContext | null = null;
function audioContext(): AudioContext {
  if (!sharedCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new Ctor();
  }
  return sharedCtx;
}

async function computePeaks(url: string): Promise<Float32Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  const arr = await res.arrayBuffer();
  const audio = await audioContext().decodeAudioData(arr);
  const ch = audio.getChannelData(0); // mono/left channel is enough for a preview
  const total = Math.max(1, Math.round(audio.duration * PEAKS_PER_SEC));
  const bucket = Math.max(1, Math.floor(ch.length / total));
  const peaks = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    let max = 0;
    const start = i * bucket;
    for (let j = 0; j < bucket; j++) {
      const v = Math.abs(ch[start + j] ?? 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

/** Resolve+decode the given URLs; returns a peaks map + the set still loading. */
export function useAudioPeaks(urls: string[]): { peaks: Map<string, Float32Array>; loading: Set<string> } {
  const [peaks, setPeaks] = useState<Map<string, Float32Array>>(() => new Map(cache));
  const [loading, setLoading] = useState<Set<string>>(() => new Set());
  const key = urls.filter(Boolean).sort().join('|');

  useEffect(() => {
    let cancelled = false;
    const todo = urls.filter((u) => u && !cache.has(u));
    if (todo.length === 0) {
      setPeaks(new Map(cache));
      return;
    }
    setLoading((prev) => new Set([...prev, ...todo]));
    Promise.allSettled(
      todo.map(async (u) => {
        try {
          cache.set(u, await computePeaks(u));
        } catch (err) {
          // Cache an empty result so a persistently-broken source (404/corrupt)
          // is treated as settled and not re-fetched every time the URL set changes.
          cache.set(u, new Float32Array(0));
          // eslint-disable-next-line no-console
          console.warn('[useAudioPeaks] failed to decode', u, err);
        }
      }),
    ).then(() => {
      if (cancelled) return;
      setPeaks(new Map(cache));
      setLoading((prev) => {
        const next = new Set(prev);
        todo.forEach((u) => next.delete(u));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { peaks, loading };
}
