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
): { track: OverlayItem[]; singleton: OverlayItem[]; anchored: Map<string, OverlayItem[]> } {
  const track: OverlayItem[] = [];
  const singleton: OverlayItem[] = [];
  const anchored = new Map<string, OverlayItem[]>();
  // A 'singleton' kind yields AT MOST ONE node — the first item of that kind.
  // Extras are dropped, not rerouted: a once-per-reel marker is mounted
  // unwrapped at a fixed position, so a second one would just paint on top of
  // the first. This matches the reference campaign composition, which picked
  // its chevron with `.find()` and filtered every chevron off the overlay track.
  const seenSingleton = new Set<string>();
  for (const item of overlays) {
    const kind = overlayKind(item);
    const routing = registrations?.[kind]?.routing ?? 'track';
    if (routing === 'singleton') {
      if (!seenSingleton.has(kind)) {
        seenSingleton.add(kind);
        singleton.push(item);
      }
    } else if (routing === 'anchored' && item.anchorVideoId) {
      const list = anchored.get(item.anchorVideoId) ?? [];
      list.push(item);
      anchored.set(item.anchorVideoId, list);
    } else {
      track.push(item); // 'track', or 'anchored' with no anchor — keep it visible
    }
  }
  return { track, singleton, anchored };
}
