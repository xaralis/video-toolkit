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
 * while a body it was handed to is on screen. When `videoItems` is given, it is
 * placed by TIME ALONE: every video item its span overlaps receives it, and
 * `anchorVideoId` plays no part — it is the clip the item was aligned to at
 * authoring time, a reference, not a link. So an overlay stretched across
 * several clips renders across all of them, one moved off its original clip
 * follows its new span, and one with no anchor lands wherever it sits. Each
 * body times the item against its own start, so it enters once, reads as
 * settled in the clips after that, and exits once. An overlay that covers no
 * video item goes to the track so it stays visible.
 *
 * `videoItems` must be the list whose ids the caller looks the anchored lists
 * up by (i.e. after any theme-side video-track preparation). Omitted = the
 * legacy rule: the declared anchor only, track when there is none.
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
    if (routing !== 'anchored') {
      track.push(item);
      continue;
    }
    const targets =
      videoItems.length > 0
        ? videoItems.filter((v) => overlaps(item, v)).map((v) => v.id)
        : item.anchorVideoId
          ? [item.anchorVideoId]
          : [];
    if (targets.length === 0) {
      track.push(item); // covers no video item — keep it visible
      continue;
    }
    for (const id of targets) deliver(id, item);
  }
  return { track, anchored };
}
