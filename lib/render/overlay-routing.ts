// lib/render/overlay-routing.ts — pure routing of overlay-track items per the
// brand's registrations (spec 2026-07-25). Core knows the MODES, never kind names.
import type { OverlayItem } from '../reel-config-base/layered-schema';
import type { OverlayItemRegistration } from '../theming/types';

export function overlayKind(item: OverlayItem): string {
  return ((item.content as Record<string, unknown>).kind as string) ?? '';
}

type Span = { id: string; startMs: number; endMs: number };

// Strict overlap: two spans that only touch at a boundary share no frame.
const overlaps = (a: Span, b: Span) => a.startMs < b.endMs && b.startMs < a.endMs;

/**
 * Split overlays into the independent track and the per-video-item anchored
 * lists.
 *
 * An anchored overlay draws INSIDE a video item's body, so it can only appear
 * while a body it was handed to is on screen. It always goes to its declared
 * anchor, and — when `videoItems` is given — to every other video item its
 * span overlaps. Without that, an anchored overlay stretched across several
 * clips (the editor allows it) showed only during its anchor clip: the
 * timeline promised a span the render dropped. Each body receives the same
 * item and times it against its own start, so the overlay enters once, reads
 * as settled in the clips after that, and exits once.
 *
 * `videoItems` must be the list whose ids the caller looks the anchored lists
 * up by (i.e. after any theme-side video-track preparation). Omitted = the
 * anchor only, the behaviour before spanning existed.
 */
export function routeOverlays(
  overlays: OverlayItem[],
  registrations: Record<string, OverlayItemRegistration> | undefined,
  videoItems: readonly Span[] = [],
): { track: OverlayItem[]; anchored: Map<string, OverlayItem[]> } {
  const track: OverlayItem[] = [];
  const anchored = new Map<string, OverlayItem[]>();
  const deliver = (videoId: string, item: OverlayItem) => {
    const list = anchored.get(videoId) ?? [];
    list.push(item);
    anchored.set(videoId, list);
  };
  for (const item of overlays) {
    const routing = registrations?.[overlayKind(item)]?.routing ?? 'track';
    if (routing === 'anchored' && item.anchorVideoId) {
      deliver(item.anchorVideoId, item);
      for (const v of videoItems) {
        if (v.id !== item.anchorVideoId && overlaps(item, v)) deliver(v.id, item);
      }
    } else {
      track.push(item); // 'track', or 'anchored' with no anchor — keep it visible
    }
  }
  return { track, anchored };
}
