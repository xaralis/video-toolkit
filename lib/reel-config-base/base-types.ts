// Base TS types matching the BASE schemas (no caption, no overlays, no aiGenerated).
// Templates extend with their own per-template additions.

export type Transition =
  | { kind: 'cut' }
  | { kind: 'dissolve'; frames: number }
  | { kind: 'fade-coal'; frames: number }
  | { kind: 'glitch'; frames: number }
  | { kind: 'whip-pan'; frames: number; direction: 'left' | 'right' | 'up' | 'down' }
  | { kind: 'zoom-through'; frames: number; from: 'in' | 'out' }
  | { kind: 'wipe'; frames: number; color: 'lime' | 'teal' | 'coal'; direction: 'left' | 'right' };

export interface Crop {
  width: number;
  x?: number;
  y?: number;
}

// Per-clip colour correction, applied IN the composition (before the brand LUT,
// rule #32). For matching exposure / white balance across shots — not for the
// brand look. brightness/contrast/saturation are multipliers (1 = unchanged);
// temperature/tint are −1..1 (temperature + = warmer, tint + = magenta).
export interface Grade {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
}

export interface ClipSegmentBase {
  id: string;
  type: 'clip';
  source: string;
  trimIn: number;
  trimOut: number;
  audioMode?: 'voice' | 'silent';
  focalX?: number;
  focalY?: number;
  crop?: Crop;
  grade?: Grade;
  transitionOut?: Transition;
}

export interface BrollSegmentBase {
  id: string;
  type: 'broll';
  source: string;
  trimIn: number;
  trimOut: number;
  audioMode: 'extend-previous' | 'silent' | 'inherit-from-clip';
  audioSource?: string;
  audioStartSec?: number;
  focalX?: number;
  focalY?: number;
  crop?: Crop;
  grade?: Grade;
  transitionOut?: Transition;
}

export interface MultiClipSegmentBase {
  id: string;
  type: 'multi-clip';
  layout: 'split-h' | 'split-v' | 'pip' | 'quad';
  sources: Array<{
    source: string;
    trimIn: number;
    trimOut: number;
    label?: string;
  }>;
  durationMs: number;
  audioMode: 'first' | 'mix' | 'silent';
  transitionOut?: Transition;
}

export type SegmentBase = ClipSegmentBase | BrollSegmentBase | MultiClipSegmentBase;
