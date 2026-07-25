/**
 * Pure helpers for editing a segment's `transitionOut`. No React, no DOM —
 * mirrors (structurally, not by import) the discriminated union in
 * `lib/reel-config-base/transition-schema.ts`:
 *
 *   { kind: 'cut' }
 *   { kind: 'dissolve' | 'fade-coal' | 'glitch', frames }
 *   { kind: 'whip-pan', frames, direction: 'left'|'right'|'up'|'down' }
 *   { kind: 'zoom-through', frames, from: 'in'|'out' }
 *   { kind: 'wipe', frames, color: 'lime'|'teal'|'coal', direction: 'left'|'right' }
 *   { kind: 'gradient-wipe', frames, direction?: ..., softness?: 0..100 }
 *
 * Deliberately NOT importing the zod schema/type: this stays a permissive
 * structural type so the editor doesn't need the reel-config-base package as
 * a hard dependency just to describe a UI shape.
 */

/** A transition, permissively typed — `kind` plus whichever optional fields that kind uses. */
export interface Transition {
  kind: string;
  frames?: number;
  direction?: string;
  from?: string;
  color?: string;
  softness?: number;
  [key: string]: unknown;
}

/** All 8 transition kinds with human-readable labels, in schema order. */
export const TRANSITION_KINDS: Array<{ kind: string; label: string }> = [
  { kind: 'cut', label: 'Cut' },
  { kind: 'dissolve', label: 'Dissolve' },
  { kind: 'fade-coal', label: 'Fade to black' },
  { kind: 'glitch', label: 'Glitch' },
  { kind: 'whip-pan', label: 'Whip pan' },
  { kind: 'zoom-through', label: 'Zoom' },
  { kind: 'wipe', label: 'Wipe' },
  { kind: 'gradient-wipe', label: 'Gradient wipe' },
];

/** Every kind except `cut` carries a `frames` field. */
export function kindNeedsFrames(kind: string): boolean {
  return kind !== 'cut';
}

/** Named duration presets offered by the UI, in frames @ 30fps. */
export const DURATION_PRESETS: Array<{ key: 'short' | 'medium' | 'long'; label: string; frames: number }> = [
  { key: 'short', label: 'Short', frames: 8 },
  { key: 'medium', label: 'Medium', frames: 15 },
  { key: 'long', label: 'Long', frames: 30 },
];

/** Converts a frame count to seconds at the given frame rate. */
export function framesToSeconds(frames: number, fps: number): number {
  return frames / fps;
}

/**
 * Resolves which named preset (if any) a frame count matches. Matching is
 * EXACT — a value like 12 sits between "short" (8) and "medium" (15) but
 * isn't either of them, so it reports `null` ("custom") rather than snapping
 * to the nearest preset and silently mislabeling a custom value.
 */
export function presetForFrames(frames: number): 'short' | 'medium' | 'long' | null {
  const match = DURATION_PRESETS.find((p) => p.frames === frames);
  return match ? match.key : null;
}

/** A single enum option (value + human label) for a `subOptionsFor` field. */
export interface SubOptionChoice {
  value: string;
  label: string;
}

/** Describes one contextual control a transition kind needs beyond `frames`. */
export interface SubOption {
  prop: string;
  label: string;
  kind: 'enum' | 'number';
  options?: SubOptionChoice[];
}

const DIRECTION_4WAY: SubOptionChoice[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
];

const DIRECTION_2WAY: SubOptionChoice[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const WIPE_COLORS: SubOptionChoice[] = [
  { value: 'lime', label: 'Lime' },
  { value: 'teal', label: 'Teal' },
  { value: 'coal', label: 'Coal' },
];

const GRADIENT_DIRECTIONS: SubOptionChoice[] = [
  { value: 'tl-br', label: 'Top-left → bottom-right' },
  { value: 'tr-bl', label: 'Top-right → bottom-left' },
  { value: 'bl-tr', label: 'Bottom-left → top-right' },
  { value: 'br-tl', label: 'Bottom-right → top-left' },
];

/** Describes the contextual (beyond `frames`) controls a transition kind needs. */
export function subOptionsFor(kind: string): SubOption[] {
  switch (kind) {
    case 'whip-pan':
      return [{ prop: 'direction', label: 'Direction', kind: 'enum', options: DIRECTION_4WAY }];
    case 'zoom-through':
      return [
        {
          prop: 'from',
          label: 'From',
          kind: 'enum',
          options: [
            { value: 'in', label: 'In' },
            { value: 'out', label: 'Out' },
          ],
        },
      ];
    case 'wipe':
      return [
        { prop: 'color', label: 'Color', kind: 'enum', options: WIPE_COLORS },
        { prop: 'direction', label: 'Direction', kind: 'enum', options: DIRECTION_2WAY },
      ];
    case 'gradient-wipe':
      return [
        { prop: 'direction', label: 'Direction', kind: 'enum', options: GRADIENT_DIRECTIONS },
        { prop: 'softness', label: 'Softness', kind: 'number' },
      ];
    default:
      return [];
  }
}

/**
 * Builds a valid transition object for `kind`, using sensible defaults for
 * every field that kind requires. `opts.frames` (when the kind needs frames)
 * lets a caller carry over the currently-set frame count instead of
 * resetting it — used by `TransitionPicker` when switching between two
 * frame-bearing kinds.
 */
export function defaultTransition(kind: string, opts?: { frames?: number }): Transition {
  if (kind === 'cut') return { kind: 'cut' };

  const frames = opts?.frames ?? 15;

  switch (kind) {
    case 'whip-pan':
      return { kind, frames, direction: 'left' };
    case 'zoom-through':
      return { kind, frames, from: 'in' };
    case 'wipe':
      return { kind, frames, color: 'teal', direction: 'left' };
    case 'gradient-wipe':
      return { kind, frames, direction: 'tl-br', softness: 40 };
    default:
      // dissolve, fade-coal, glitch — frames only.
      return { kind, frames };
  }
}
