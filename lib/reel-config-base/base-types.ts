// Base TS types matching the BASE schemas (no caption, no overlays, no aiGenerated).
// Templates extend with their own per-template additions.
// Derived from the zod schema so the two can never drift (the hand-written
// union used to lag behind TransitionSchema's kinds — fade/clock-wipe/iris/
// slide/flip/gradient-wipe were missing, breaking segment transitionOut types).
// Re-exported here (rather than redefined) because the segment-based templates
// import their types from this module.
// `Transition` admits brand-authored kinds since Phase 4; `CoreTransition` is
// the closed catalog union, and `TransitionKind` its kinds. Narrow to
// `CoreTransition` when you need a discriminated member.
export type { Transition, CoreTransition, BrandTransition, TransitionKind } from './transition-schema';
import type { Transition } from './transition-schema';

// Derived from CropSchema (segment-base-schemas.ts) so this and the zod
// schema can never drift — same precedent as Transition above.
export type { Crop } from './segment-base-schemas';
import type { Crop } from './segment-base-schemas';

// Per-clip colour correction, applied IN the composition (before the brand LUT,
// rule #32). For matching exposure / white balance across shots — not for the
// brand look. brightness/contrast/saturation are multipliers (1 = unchanged);
// temperature/tint are −1..1 (temperature + = warmer, tint + = magenta).
// sepia (0..1) and hueRotateDeg (−180..180) are neutral at 0 — added in Phase 4
// Task 2.7 so a vintage/VHS-style look is expressible in core's own vocabulary
// rather than requiring a brand renderer with a hardcoded filter string.
export interface Grade {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  sepia?: number;
  hueRotateDeg?: number;
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
