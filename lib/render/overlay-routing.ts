// lib/render/overlay-routing.ts — pure routing of overlay-track items per the
// brand's registrations (spec 2026-07-25). Core knows the MODES, never kind names.
import type { OverlayItem } from '../reel-config-base/layered-schema';
import type { OverlayItemRegistration } from '../theming/types';

export function overlayKind(item: OverlayItem): string {
  return ((item.content as Record<string, unknown>).kind as string) ?? '';
}

export function routeOverlays(
  overlays: OverlayItem[],
  registrations: Record<string, OverlayItemRegistration> | undefined,
): { track: OverlayItem[]; anchored: Map<string, OverlayItem[]> } {
  const track: OverlayItem[] = [];
  const anchored = new Map<string, OverlayItem[]>();
  for (const item of overlays) {
    const routing = registrations?.[overlayKind(item)]?.routing ?? 'track';
    if (routing === 'anchored' && item.anchorVideoId) {
      const list = anchored.get(item.anchorVideoId) ?? [];
      list.push(item);
      anchored.set(item.anchorVideoId, list);
    } else {
      track.push(item); // 'track', or 'anchored' with no anchor — keep it visible
    }
  }
  return { track, anchored };
}
