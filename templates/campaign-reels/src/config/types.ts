// Reels-specific extension of base types. Adds caption + overlays to clip,
// overlay + aiGenerated to broll/multi-clip, and the reels-only segment kinds.
import type {
  Transition,
  ClipSegmentBase,
  BrollSegmentBase,
  MultiClipSegmentBase,
} from '../../../../lib/reel-config-base/base-types';

export type { Transition } from '../../../../lib/reel-config-base/base-types';

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ReelConfig {
  topic: string;
  chevron: string;
  segments: Segment[];
  audio?: { music?: string; musicVolumeDb?: number };
}

export type Segment =
  | ClipSegment
  | BrollSegment
  | MultiClipSegment
  | CardSegment
  | OutroSegment;

export interface ClipSegment extends ClipSegmentBase {
  caption?: CaptionOverride;
  overlays?: GraphicOverlay[];
}

export interface BrollSegment extends BrollSegmentBase {
  aiGenerated: boolean;
  overlay?: GraphicOverlay;
}

export interface MultiClipSegment extends MultiClipSegmentBase {
  overlay?: GraphicOverlay;
}

export interface CardSegment {
  id: string;
  type: 'card';
  kind: 'claim-plate' | 'program-plate' | 'contrast-plate' | 'stats-plate';
  props: Record<string, unknown>;
  durationMs: number;
  pattern?: 'pixels' | 'diagonals' | 'dots' | 'grid' | 'none';
  transitionOut?: Transition;
}

export interface OutroSegment {
  id: string;
  type: 'outro';
}

export type GraphicOverlay =
  | TitleOverlay
  | StatCalloutOverlay
  | QuotePullOverlay
  | SourceTagOverlay;

export interface TitleOverlay {
  kind: 'title';
  text: string;
  appearAt: number;
  durationMs: number;
}

export interface StatCalloutOverlay {
  kind: 'stat-callout';
  number: string;
  unit?: string;
  label?: string;
  appearAt: number;
  durationMs: number;
  color: 'lime' | 'teal';
}

export interface QuotePullOverlay {
  kind: 'quote-pull';
  text: string;
  placement:
    | 'upper-third' | 'center' | 'lower-third'
    | 'upper-left' | 'upper-center' | 'upper-right'
    | 'mid-left' | 'mid-right'
    | 'lower-left' | 'lower-center' | 'lower-right';
  appearAt: number;
  durationMs: number;
}

export interface SourceTagOverlay {
  kind: 'source-tag';
  text: string;
  position: 'bottom-left' | 'bottom-right' | 'top-right';
  appearAt: number;
  durationMs: number;
}

export interface CaptionOverride {
  lines?: Array<{ startMs: number; endMs: number; text: string }>;
}
