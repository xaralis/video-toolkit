// AT-CUT TRANSITION PROBE — the render-side counterpart to
// lib/editor/src/at-cut-transitions.test.tsx.
//
// That suite runs under jsdom and settles WIRING only (a kind resolves, mounts
// in both directions, and its params arrive under the key the presentation
// reads). It cannot settle APPEARANCE, and at-cut composites differently from
// `TransitionSeries` — handle-borrowed overlap between two sibling `Sequence`s,
// not a shrinking sequence — so a presentation that reads fine in
// `showcase/transitions` can still misbehave at a cut.
//
// This module registers, for EVERY kind in `TRANSITION_CATALOG`, three probe
// compositions:
//
//   Probe-<kind>-enter   one clip, the kind as its `transitionIn`  → the
//                        ENTERING presentation, alone, nothing beneath it.
//   Probe-<kind>-exit    one clip, the kind as its `transitionOut` → the
//                        EXITING presentation, alone.
//   Probe-<kind>-cut     two clips across a real cut → the composite the reel
//                        actually renders: clip 2's entering layer drawn over
//                        clip 1's exiting layer, with handle frames borrowed.
//
// The two isolated modes are what lets a defect be ATTRIBUTED to a direction;
// the `cut` mode is what shows the composite (a presentation that occludes its
// neighbour only misbehaves visibly there).
//
// The kind list is DERIVED from the catalog, never hardcoded — same discipline
// as the wiring suite — so a kind added later gets its probes automatically,
// and `scripts/render-transition-matrix.mjs` picks them up off
// `getCompositions()` without knowing any kind name either.
//
// Content is deliberately CHEAP and flat: a solid colour plus a large numeral.
// No video — that is where the known ~1-in-20 render flake lives, and this
// renders hundreds of stills.
import React from 'react';
import { Composition } from 'remotion';
import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { CompositionTheme, VideoRenderProps } from '@video-toolkit/lib/theming';
import {
  TRANSITION_CATALOG,
  defaultTransition,
} from '@video-toolkit/lib/reel-config-base/transition-schema';

// One clip is 2000ms = 60 frames at 30fps; the transition is a fixed 20 frames
// for every kind, so a progress point maps to the same frame everywhere and the
// render script needs no per-kind arithmetic.
const FPS = 30;
const CLIP_MS = 2000;
export const PROBE_FRAMES = 20;
export const PROBE_WIDTH = 540;
export const PROBE_HEIGHT = 960;

/** The flat-colour plate. Registered as the `card` renderer, so the probe reel
 *  uses core's ordinary video track with no media files at all. */
const ProbePlate: React.FC<VideoRenderProps> = ({ item }) => {
  const props = (item as Extract<VideoItem, { kind: 'card' }>).cardProps as
    | { color?: string; label?: string }
    | undefined;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: props?.color ?? '#888888',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontWeight: 900,
        fontSize: 420,
        lineHeight: 1,
      }}
    >
      {props?.label ?? '?'}
    </div>
  );
};

// A neutral MID-GREY background on purpose: black would be indistinguishable
// from a presentation that paints black (the `pixelate` suspect), and white
// would hide an over-exposure. Nothing here is a brand look — this theme exists
// only to make the transition legible.
const probeTheme: CompositionTheme = {
  accentSlots: [{ key: 'accent', label: 'Accent', color: '#ff2d6f' }],
  background: '#4a4a52',
  video: { card: { renderer: ProbePlate } },
};

const PLATE_A = { color: '#e07a1f', label: '1' };
const PLATE_B = { color: '#1f5fe0', label: '2' };

type ProbeMode = 'enter' | 'exit' | 'cut';
export const PROBE_MODES: readonly ProbeMode[] = ['enter', 'exit', 'cut'];

function plate(id: string, startMs: number, look: { color: string; label: string }) {
  return {
    id,
    kind: 'card' as const,
    startMs,
    endMs: startMs + CLIP_MS,
    cardKind: 'probe-plate',
    cardProps: look,
  };
}

/** The kind's CATALOG default, with `frames` forced to PROBE_FRAMES so every
 *  probe shares one progress→frame mapping. `wipe` and `fade-to-color`
 *  additionally get an accent KEY (the catalog seeds none, since the vocabulary
 *  is the brand's) so the sweep / the dip is visible rather than falling back to
 *  a colourless default. */
function probeTransition(kind: string): Record<string, unknown> {
  const t = defaultTransition(kind, { frames: PROBE_FRAMES }) as Record<string, unknown>;
  // `fade-to-color` for the same reason as `wipe`: its colour is an accent-slot
  // KEY the catalog cannot seed (the vocabulary is the brand's), and with none
  // it deliberately renders the plain crossfade — which would make its 15
  // goldens a duplicate of `fade`'s and pin nothing about the dip.
  if (kind === 'wipe' || kind === 'fade-to-color') t.color = 'accent';
  return t;
}

function probeReel(kind: string, mode: ProbeMode): LayeredReel {
  const t = probeTransition(kind);
  let video: unknown[];
  if (mode === 'enter') {
    video = [{ ...plate('p-enter', 0, PLATE_B), transitionIn: t }];
  } else if (mode === 'exit') {
    video = [{ ...plate('p-exit', 0, PLATE_A), transitionOut: t }];
  } else {
    video = [
      { ...plate('p-a', 0, PLATE_A), transitionOut: t },
      plate('p-b', CLIP_MS, PLATE_B),
    ];
  }
  return {
    version: 'layered-1',
    meta: { topic: `at-cut probe: ${kind} / ${mode}`, totalDurationMs: (video.length as number) * CLIP_MS },
    tracks: {
      video: video as LayeredReel['tracks']['video'],
      audio: [],
      // No `source`, so nothing plays; `baseVolumeDb` is required by the schema.
      music: { baseVolumeDb: 0 },
      overlays: [],
      brand: [],
    },
  };
}

const Probe: React.FC<{ kind: string; mode: ProbeMode }> = ({ kind, mode }) => (
  <LayeredReelComposition reel={probeReel(kind, mode)} theme={probeTheme} />
);

/** One `<Composition>` per catalog kind per mode. Mounted from `Root.tsx`
 *  alongside `MinimalReel`; registering extra compositions cannot change what
 *  `MinimalReel` renders. */
export const TransitionProbeCompositions: React.FC = () => (
  <>
    {TRANSITION_CATALOG.flatMap((entry) => {
      const kind = entry.kind;
      return PROBE_MODES.map((mode) => (
        <Composition
          key={`${kind}-${mode}`}
          id={`Probe-${kind}-${mode}`}
          component={Probe as React.FC<Record<string, unknown>>}
          durationInFrames={(mode === 'cut' ? 2 : 1) * (CLIP_MS / 1000) * FPS}
          fps={FPS}
          width={PROBE_WIDTH}
          height={PROBE_HEIGHT}
          defaultProps={{ kind, mode } as unknown as Record<string, unknown>}
        />
      ));
    })}
  </>
);
