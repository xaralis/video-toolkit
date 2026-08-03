/** `mm:ss.ff` — the form an NLE shows and the reason the inspector stops
 *  asking anyone to type `1.35` seconds. */
export function formatTimecode(ms: number, fps: number): string {
  const total = Math.max(0, Math.round((ms / 1000) * fps));
  const frames = total % fps;
  const totalSec = Math.floor(total / fps);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(sec).padStart(2, '0')}.${String(frames).padStart(2, '0')}`;
}

/** Permissive parse. Accepts `1:02.15`, `:02`, `62.5` and `90`.
 *
 *  Returns `null` — never `0` — for anything it cannot read. That distinction
 *  is load-bearing: a caller must leave the value untouched on a bad parse,
 *  and a `0` would silently zero a trim mid-typing. */
export function parseTimecode(text: string, fps: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d*):(\d{1,2})(?:\.(\d{1,2}))?$/.exec(t);
  if (m) {
    const frames = m[3] === undefined ? 0 : Number(m[3]);
    if (frames >= fps) return null;
    const min = m[1] === '' ? 0 : Number(m[1]);
    return Math.round(((min * 60 + Number(m[2])) + frames / fps) * 1000);
  }
  // Bare seconds, integer or decimal.
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  return null;
}
