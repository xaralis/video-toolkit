import { EDITOR_ACCENT } from './ui';

/** Sources whose metadata has not come back yet. A URL is "pending" until it has
 *  an entry in `durations` — the hook writes one for a FAILED decode too (0), so
 *  a missing file resolves rather than pinning the indicator on forever. */
export function pendingSources(urls: string[], durations: Record<string, number>): string[] {
  return urls.filter((u) => !(u in durations));
}

const SPIN_CSS = `@keyframes vt-spin { to { transform: rotate(360deg); } }`;

/** Covers the preview while its media is still arriving.
 *
 *  The editor opens on a composition whose video elements have no data yet, so
 *  the first seconds are BLACK FRAMES that look exactly like a broken cut. This
 *  says "not ready" instead — the one thing black cannot say for itself.
 *
 *  Two independent signals feed it, because neither covers the other's case:
 *  `loaded`/`total` is the editor's own metadata probe, which is what is running
 *  at startup, and `buffering` is the Player's `waiting`/`resume` pair, which is
 *  what fires on a seek into media the browser has not fetched. Renders nothing
 *  when both are quiet.
 *
 *  `pointerEvents: none` — it is a status, never a modal. Nothing under it is
 *  worth blocking, and blocking it would swallow the focus/zoom controls that
 *  sit in the same corner. */
export function MediaLoadingOverlay({
  loaded,
  total,
  buffering,
  label,
}: {
  loaded: number;
  total: number;
  buffering: boolean;
  /** Replaces the derived text. For a stage that is neither probing nor
   *  buffering — the project itself still loading, before there is a reel. */
  label?: string;
}) {
  const probing = total > 0 && loaded < total;
  if (!probing && !buffering) return null;
  return (
    <div className="ed:absolute ed:inset-0 ed:z-[3] ed:flex ed:flex-col ed:items-center ed:justify-center ed:gap-2.5 ed:text-ink ed:text-xs ed:pointer-events-none ed:bg-[rgba(12,13,16,0.55)]">
      <style>{SPIN_CSS}</style>
      <div
        aria-hidden
        className="ed:w-[22px] ed:h-[22px] ed:rounded-full ed:border-2 ed:border-white/20"
        style={{ borderTopColor: EDITOR_ACCENT, animation: 'vt-spin 0.8s linear infinite' }}
      />
      <div style={{ fontVariantNumeric: 'tabular-nums' }}>
        {label ?? (probing ? `Loading media… ${loaded}/${total}` : 'Buffering…')}
      </div>
    </div>
  );
}
