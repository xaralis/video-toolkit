import type { AccentSlot } from './palette';
import type { Placement } from './placement';

/** The static prop bag every text-overlay renderer receives. Frame-derived
 *  values (localFrame/totalFrames/fps) are read from Remotion hooks INSIDE the
 *  renderer's Sequence, not passed here. */
export interface OverlayRenderProps {
  text: string;
  placement: Placement;
  fontSize?: number;
  reveal?: 'line' | 'all';
  /** Brand palette; renderers resolve keys→hex via paletteMap/resolveAccentColor. */
  palette: AccentSlot[];
  /** Opaque brand-level config threaded down by the root from the theme. */
  config?: unknown;
  /** Usually 0 — the overlay is mounted in a Sequence at the item's start. */
  appearAtMs: number;
  durationMs: number;
}

export type OverlayRenderer = React.FC<OverlayRenderProps>;

/** Overlay kinds that flow through the theming module. Widened as kinds adopt it. */
export type OverlayKind = 'text';

/** One kind's brand registration: its custom renderer + opaque brand config. */
export interface OverlayRegistration {
  renderer: OverlayRenderer;
  config?: unknown;
}

/** The theming contract a brand's theme object satisfies. */
export interface BrandTheme {
  accentSlots: AccentSlot[];
  /** Per-kind brand-custom renderer + config. Absent kind → core generic. */
  overlays?: Partial<Record<OverlayKind, OverlayRegistration>>;
}
