/**
 * Transition Gallery
 *
 * A visual showcase of all available transitions.
 * Each transition is demonstrated with consistent before/after scenes,
 * labeled clearly for easy comparison.
 *
 * Can be:
 * 1. Rendered as a showcase video (see showcase/transitions, which imports this file)
 * 2. Used with @remotion/player for interactive preview
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Sequence } from 'remotion';

// THE RENDER PATH, imported deliberately. A gallery whose whole job is to show
// what a reel looks like must resolve a kind the way a reel resolves it — see
// `galleryTransitionNode` below.
import { AtCutTransition, transitionNodeFor } from '../render/at-cut-transitions';
import type { TransitionNode, TransitionRecord } from '../render/at-cut-transitions';
import { defaultTransition, isCut, TRANSITION_CATALOG } from '../reel-config-base/transition-schema';
import type { TransitionKind } from '../reel-config-base/transition-schema';

// ONE TABLE, DERIVED FROM THE CATALOG (Phase 4 Task 2.6).
//
// This file used to hand-maintain THREE parallel kind→presentation tables —
// `TRANSITIONS`, `transitionMap` and `TRANSITION_NOTES` — in camelCase
// spellings (`rgbSplit`, `lightLeak`) that disagreed with the catalog's kinds
// (`rgb-split`, `light-leak`), plus a `noteFor` helper whose only job was to
// paper over that mismatch. They covered 8 of the catalog's 21 kinds and
// nothing caught them drifting further; that is how the gallery came to show
// `@remotion/transitions/wipe` under a name reels used for a different
// component (Task 2.5).
//
// `noteFor` is GONE rather than kept working: a helper that reconciles two
// spellings preserves the bug in dormant form once there is only one spelling.
// There is now one spelling — the catalog kind, which is also what a reel
// authors — and everything else (label, note, presentation, demo length) hangs
// off it.
//
// NO PRESENTATION IS IMPORTED HERE ANY MORE. Not `@remotion/transitions/wipe`
// (Task 2.5's fork, deleted), and not `glitch` / `rgbSplit` / `slide` / … either:
// every kind resolves through `transitionNodeFor`, the reel's own resolver, so
// "which component does the gallery show for kind K?" has exactly one possible
// answer and it is production's.
//
// AND NO `TransitionSeries`. It hands a presentation ONE clip at a time, so it
// structurally cannot drive the four NATIVE TWO-INPUT kinds (`wipe`,
// `pixelate`, `checkerboard`, `scanline-glitch` — Task 2.1), which is why they
// had no gallery entry at all. `transitionNodeFor` LIFTS a one-sided
// presentation into the same two-input shape, so one demo component
// (`NodeTransitionDemo`) now drives every kind and the split disappears with
// the tables.

// Scene colors for visual variety
const SCENE_A_COLOR = '#1a1a2e';
const SCENE_B_COLOR = '#e94560';

// Default scene lengths (frames) on either side of a transition
const DEFAULT_SCENE_DURATION = 90;

/** How long every demo's boundary runs — 45 frames, 1.5 s at 30 fps.
 *
 *  ONE number for every kind, deliberately. The old per-entry lengths (40 / 45
 *  / 60, hand-picked) were the fourth thing the parallel tables carried, and a
 *  gallery is a COMPARISON: the same window for every kind is what makes two
 *  demos comparable. It is not read off `defaultTransition().frames` either —
 *  that default (15) is a sensible reel cut and far too short to see a
 *  transition's shape. */
const DEMO_TRANSITION_FRAMES = 45;

/** Per-kind prose, keyed by CATALOG KIND — the same string a reel writes in
 *  `{ kind: … }`. A kind with no note falls back to its catalog label, so a new
 *  kind reads sensibly the day it lands and this table never becomes a second
 *  list of kinds to maintain. */
const TRANSITION_NOTES: Partial<Record<TransitionKind, string>> = {
  'dissolve': 'A→B crossfade — the canonical name',
  'fade': 'Crossfade; a synonym of dissolve, rendered identically',
  'fade-coal': 'DEPRECATED alias of fade-to-color: a plain crossfade, despite the name',
  'fade-to-color': 'Dips through a brand accent colour — with none set, a crossfade',
  'glitch': 'Digital distortion with RGB shift',
  'rgb-split': 'Chromatic aberration effect',
  'scanline-glitch': 'RGB-shifted copies under a scanline sweep',
  'burn': 'Organic ember reveal with a hot glow edge',
  'light-leak': 'Cinematic lens flare washing over the cut',
  'slide': 'Push from a direction',
  'flip': '3D card flip',
  'whip-pan': 'Rapid directional pan with motion blur',
  'zoom-through': 'Zooms through the screen plane',
  'zoom-blur': 'Radial motion blur',
  'clock-wipe': 'Sweeps round like a clock hand',
  'iris': 'Circular iris opening from the centre',
  'wipe': 'Coloured sheet sweeps across, then off',
  'gradient-wipe': 'Soft feathered diagonal blend',
  'pixelate': 'Mosaic blocks dissolve one clip into the next',
  'checkerboard': 'Grid of squares reveals the incoming clip',
};

// Consistent scene component
const GalleryScene: React.FC<{
  color: string;
  label: string;
  note: string;
  isAfter?: boolean;
}> = ({ color, label, note, isAfter = false }) => {
  const frame = useCurrentFrame();
  const labelOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const sceneName = isAfter ? 'Scene B' : 'Scene A';

  return (
    <AbsoluteFill
      style={{
        backgroundColor: color,
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Background grid pattern for visual texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Corner markers to show scene boundaries */}
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((corner) => (
        <div
          key={corner}
          style={{
            position: 'absolute',
            width: 40,
            height: 40,
            borderColor: 'rgba(255,255,255,0.2)',
            borderStyle: 'solid',
            borderWidth: 0,
            ...(corner.includes('top') ? { top: 30 } : { bottom: 30 }),
            ...(corner.includes('left') ? { left: 30 } : { right: 30 }),
            ...(corner.includes('top') && corner.includes('left') && { borderTopWidth: 2, borderLeftWidth: 2 }),
            ...(corner.includes('top') && corner.includes('right') && { borderTopWidth: 2, borderRightWidth: 2 }),
            ...(corner.includes('bottom') && corner.includes('left') && { borderBottomWidth: 2, borderLeftWidth: 2 }),
            ...(corner.includes('bottom') && corner.includes('right') && { borderBottomWidth: 2, borderRightWidth: 2 }),
          }}
        />
      ))}

      {/* Transition name label - top center */}
      <div
        style={{
          position: 'absolute',
          top: 50,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: labelOpacity,
        }}
      >
        <span
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: 'white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            padding: '14px 40px',
            borderRadius: 12,
            letterSpacing: '0.5px',
          }}
        >
          {label}
        </span>
      </div>

      {/* Main scene indicator - center */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Large letter */}
        <div
          style={{
            fontSize: 200,
            fontWeight: 900,
            color: 'rgba(255, 255, 255, 0.08)',
            letterSpacing: '-8px',
            lineHeight: 1,
          }}
        >
          {isAfter ? 'B' : 'A'}
        </div>

        {/* Scene name */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: 'white',
            marginTop: -20,
            textTransform: 'uppercase',
            letterSpacing: '8px',
          }}
        >
          {sceneName}
        </div>
      </div>

      {/* Transition description - bottom center */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: labelOpacity * 0.7,
        }}
      >
        <span
          style={{
            fontSize: 20,
            fontWeight: 400,
            color: 'rgba(255, 255, 255, 0.6)',
            fontStyle: 'italic',
          }}
        >
          {note}
        </span>
      </div>

      {/* Side label showing transition direction */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          ...(isAfter ? { right: 40 } : { left: 40 }),
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: 14,
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.3)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
        }}
      >
        {isAfter ? 'Entering' : 'Exiting'}
      </div>
    </AbsoluteFill>
  );
};

/** The gallery's composition size — the ONE source of it. `transitionGalleryConfig`
 *  spreads this rather than restating the numbers, and a size-dependent kind
 *  (`clock-wipe`, `iris`) resolves against it, so the demo shows the same
 *  geometry the config renders. */
export const GALLERY_DIMS = { width: 1920, height: 1080, fps: 30 };

/** What `galleryTransitionNode` resolves against: `transitionNodeFor`'s own
 *  dimensions bag (pixel size, and optionally a palette and a BRAND transition
 *  registry) plus the `fps` `AtCutTransition` needs. Read off the resolver's
 *  signature rather than restated, so it cannot drift from it. */
export type GalleryDims = Parameters<typeof transitionNodeFor>[1] & { fps: number };

/** RESOLVES A CATALOG KIND THE WAY A REEL DOES — the single line that ends the
 *  `wipe` fork (Phase 4 Task 2.5) and, since Task 2.6, the ONLY way this file
 *  obtains anything to render.
 *
 *  The gallery used to hand-pick a presentation per entry, which is how it came
 *  to demonstrate `@remotion/transitions/wipe` under the same name a reel used
 *  for the toolkit's own. Going through `transitionNodeFor` + the kind's own
 *  catalog defaults means the question "which component is this?" has exactly
 *  one answer, and it is production's. It also makes two-input nodes showable
 *  at all: `transitionNodeFor` lifts a one-sided presentation and returns a
 *  native node untouched, so both contracts arrive here in one shape.
 *
 *  THROWS rather than skipping when a kind resolves to nothing: `cut` is
 *  filtered out by name before it gets here (it IS the absence of a
 *  transition), so any other miss is a catalog kind with no renderer — loud is
 *  the only useful behaviour.
 *
 *  Pinned behaviourally by `lib/editor/src/transition-gallery.test.tsx`. */
export function galleryTransitionNode(kind: TransitionKind, dims: GalleryDims = GALLERY_DIMS): TransitionNode {
  const node = transitionNodeFor(defaultTransition(kind) as TransitionRecord, dims);
  if (!node) throw new Error(`TransitionGallery: no renderer for catalog kind "${kind}"`);
  return node;
}

/** ONE demo component for every kind.
 *
 *  It drives the boundary the way `lib/render/video-track.tsx` does: scene A
 *  alone, then a boundary Sequence of `transitionDuration` frames in which
 *  `AtCutTransition` composites BOTH scenes, then scene B alone. Total length
 *  is `sceneA + sceneB - transitionDuration`.
 *
 *  This replaced a `TransitionSeries`-based sibling in Task 2.6. The sibling
 *  could not show a two-input node at all (that is why four kinds had no entry),
 *  and keeping both would have meant the gallery deciding per kind which
 *  contract to use — one more parallel table, in the shape of an if.
 *
 *  The scenes' own clocks restart at the boundary (each Sequence is its own
 *  timeline), which is cosmetic here: `GalleryScene`'s only animation is a
 *  10-frame label fade-in. */
function NodeTransitionDemo({
  name,
  note,
  node,
  transitionDuration = DEMO_TRANSITION_FRAMES,
  sceneADuration = DEFAULT_SCENE_DURATION,
  sceneBDuration = DEFAULT_SCENE_DURATION,
}: {
  name: string;
  note: string;
  node: TransitionNode;
  transitionDuration?: number;
  sceneADuration?: number;
  sceneBDuration?: number;
}) {
  const a = <GalleryScene color={SCENE_A_COLOR} label={name} note={note} />;
  const b = <GalleryScene color={SCENE_B_COLOR} label={name} note={note} isAfter />;
  const cutAt = sceneADuration - transitionDuration;
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={cutAt}>{a}</Sequence>
      <Sequence from={cutAt} durationInFrames={transitionDuration}>
        <AtCutTransition node={node} from={a} to={b} frames={transitionDuration} dims={GALLERY_DIMS} />
      </Sequence>
      <Sequence from={sceneADuration} durationInFrames={sceneBDuration - transitionDuration}>
        {b}
      </Sequence>
    </AbsoluteFill>
  );
}

// Intro slide
const IntroSlide: React.FC = () => {
  const frame = useCurrentFrame();
  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });
  const subtitleOpacity = interpolate(frame, [15, 35], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#0f0f1a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <h1
        style={{
          fontSize: 72,
          fontWeight: 700,
          color: 'white',
          margin: 0,
          opacity: titleOpacity,
          letterSpacing: '-2px',
        }}
      >
        Transitions Gallery
      </h1>
      <p
        style={{
          fontSize: 24,
          color: 'rgba(255, 255, 255, 0.6)',
          marginTop: 20,
          opacity: subtitleOpacity,
          fontWeight: 400,
        }}
      >
        claude-code-video-toolkit
      </p>
    </AbsoluteFill>
  );
};

/** ONE gallery entry: a catalog kind, and everything about how it is shown.
 *
 *  This replaced THREE parallel tables (`TRANSITIONS`, `transitionMap`,
 *  `TRANSITION_NOTES`), each keyed differently and each hand-maintained. The
 *  entry's identity is its `kind` — the same string a reel authors — and every
 *  other field is derived from it.
 *
 *  `node` is resolved ONCE, and the `render` closure reads that same value, so
 *  a test asserting on `node` is asserting on what is shown. */
export type GalleryEntry = {
  /** The catalog kind — the entry's identity: on-screen label, note key,
   *  `transitionMap` key, and what `transitionNodeFor` resolved. */
  kind: TransitionKind;
  /** The catalog's own editor label ("Gradient wipe"). Also the note's
   *  fallback, so a kind nobody has written prose for still reads sensibly. */
  label: string;
  /** The line shown under the scene. */
  note: string;
  /** The boundary's length in frames. */
  duration: number;
  sceneA: number;
  sceneB: number;
  /** The resolved two-input node — exactly what the reel path resolves for
   *  `kind`, at the gallery's own dimensions. */
  node: TransitionNode;
  render: () => React.ReactElement;
};

/** THE DERIVATION — the whole of Phase 4 Task 2.6.
 *
 *  Every kind in `catalog`, minus `cut`, in catalog order. NOTHING HERE NAMES A
 *  KIND, so a kind the catalog gains appears in the gallery with no edit to
 *  this file at all. That is the capability, and it is pinned in
 *  `lib/editor/src/transition-gallery-catalog.test.tsx` by a kind that exists
 *  only in the test's own fixture — a test asserting "all 20 current kinds
 *  appear" would pass against a hardcoded list of 20 and pin nothing.
 *
 *  The two parameters are that pin's seam: a fixture catalog, and the `dims`
 *  bag a BRAND transition registry rides in on. Production passes neither. */
export function buildGalleryEntries(
  catalog: ReadonlyArray<{ kind: TransitionKind; label: string }> = TRANSITION_CATALOG,
  dims: GalleryDims = GALLERY_DIMS,
): GalleryEntry[] {
  return catalog
    // `cut` is the ABSENCE of a transition — `resolveTransition` returns null
    // for it by design, so there is no component to demonstrate. Filtered by
    // the shared predicate rather than by a name written here, and it is the
    // ONLY exclusion: any other kind that fails to resolve throws.
    .filter((e) => !isCut(e.kind))
    .map(({ kind, label }): GalleryEntry => {
      const note = TRANSITION_NOTES[kind] ?? label;
      const node = galleryTransitionNode(kind, dims);
      return {
        kind,
        label,
        note,
        node,
        duration: DEMO_TRANSITION_FRAMES,
        sceneA: DEFAULT_SCENE_DURATION,
        sceneB: DEFAULT_SCENE_DURATION,
        render: () => (
          <NodeTransitionDemo
            name={kind}
            note={note}
            node={node}
            transitionDuration={DEMO_TRANSITION_FRAMES}
            sceneADuration={DEFAULT_SCENE_DURATION}
            sceneBDuration={DEFAULT_SCENE_DURATION}
          />
        ),
      };
    });
}

/** The gallery's entries, in catalog order. EXPORTED so it can be pinned: this
 *  is the array the gallery COMPOSITION renders, and `transitionMap` below is
 *  an index into these same objects rather than a second table. */
export const TRANSITIONS: GalleryEntry[] = buildGalleryEntries();

// Calculate segment duration (scene A + scene B - overlap from transition)
const getSegmentDuration = (t: GalleryEntry) => t.sceneA + t.sceneB - t.duration;

export const TransitionGallery: React.FC = () => {
  const introDuration = 60; // 2 seconds

  let currentFrame = introDuration;
  const segments: { from: number; duration: number }[] = [];

  TRANSITIONS.forEach((t) => {
    const duration = getSegmentDuration(t);
    segments.push({ from: currentFrame, duration });
    currentFrame += duration;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#0f0f1a' }}>
      {/* Intro */}
      <Sequence durationInFrames={introDuration}>
        <IntroSlide />
      </Sequence>

      {/* Each transition demo */}
      {TRANSITIONS.map((t, i) => (
        <Sequence
          key={t.kind}
          from={segments[i].from}
          durationInFrames={segments[i].duration}
        >
          {t.render()}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Export configuration for Remotion
export const transitionGalleryConfig = {
  id: 'TransitionGallery',
  component: TransitionGallery,
  durationInFrames: 60 + TRANSITIONS.reduce(
    (acc, t) => acc + getSegmentDuration(t),
    0
  ),
  // Read off GALLERY_DIMS, not restated. A size-dependent kind (`clock-wipe`,
  // `iris`) resolves against those numbers, so a second copy here would be one
  // more "two answers to the same question" waiting to drift apart.
  ...GALLERY_DIMS,
};

/** Programmatic access by CATALOG KIND — an index into `TRANSITIONS`, not a
 *  second table. It used to be a hand-written object literal keyed
 *  `glitch`/`rgbSplit`/`lightLeak`, spellings no reel could author and which
 *  disagreed with both the catalog and the array above; `noteFor` existed only
 *  to translate between them and is gone with it.
 *
 *  Typed `Record<string, GalleryEntry>` rather than
 *  `Partial<Record<TransitionKind, …>>` deliberately: `cut` is legitimately
 *  absent, and a Partial would make EVERY read `GalleryEntry | undefined` at
 *  every call site to describe that one hole. The runtime guard in
 *  `SingleTransitionPreview` is what covers a miss. */
export const transitionMap: Readonly<Record<string, GalleryEntry>> = Object.fromEntries(
  TRANSITIONS.map((e) => [e.kind, e]),
);

// For single-transition preview (useful for interactive player)
export const SingleTransitionPreview: React.FC<{
  /** A catalog kind — `'light-leak'`, not `'lightLeak'`. */
  transitionName: TransitionKind;
}> = ({ transitionName }) => {
  const transition = transitionMap[transitionName];
  if (!transition) return null;

  return transition.render();
};

/** The gallery's key type. A catalog kind since Task 2.6 — every other spelling
 *  is gone. */
export type TransitionName = TransitionKind;
