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
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import type { TransitionPresentation } from '@remotion/transitions';

// Any transition's presentation() call returns TransitionPresentation<PropsForThatTransition> —
// each transition has its own props shape (GlitchProps, RgbSplitProps, ...), so a component
// that renders whichever one is passed in must be generic over that shape rather than pinned
// to a single transition's props (as it previously was, pinned to glitch's).

import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { flip } from '@remotion/transitions/flip';
import { glitch } from './presentations/glitch';
import { rgbSplit } from './presentations/rgb-split';
import { zoomBlur } from './presentations/zoom-blur';
import { lightLeak } from './presentations/light-leak';
import { pixelate } from './presentations/pixelate';
import { checkerboard } from './presentations/checkerboard';

// Scene colors for visual variety
const SCENE_A_COLOR = '#1a1a2e';
const SCENE_B_COLOR = '#e94560';

// Default scene lengths (frames) on either side of a transition
const DEFAULT_SCENE_DURATION = 90;

// Transition descriptions for context
const TRANSITION_NOTES: Record<string, string> = {
  'glitch()': 'Digital distortion with RGB shift',
  'rgbSplit()': 'Chromatic aberration effect',
  'zoomBlur()': 'Radial motion blur',
  'lightLeak()': 'Cinematic lens flare',
  'pixelate()': 'Mosaic dissolution',
  'checkerboard()': 'Grid squares reveal',
  'checkerboard(diagonal)': 'Diagonal wave pattern',
  'checkerboard(alternating)': 'True checkerboard pattern',
  'checkerboard(spiral)': 'Spiral from center',
  'checkerboard(center-out)': 'Radial grid reveal',
  'slide()': 'Push from direction',
  'fade()': 'Simple crossfade',
  'wipe()': 'Edge reveal',
  'flip()': '3D card flip',
};

// The gallery labels transitions as `glitch()`; the programmatic transitionMap keys them as
// `glitch`. Look up both spellings so a note shows either way.
const noteFor = (label: string): string =>
  TRANSITION_NOTES[label] ?? TRANSITION_NOTES[`${label}()`] ?? '';

// Consistent scene component
const GalleryScene: React.FC<{
  color: string;
  label: string;
  isAfter?: boolean;
}> = ({ color, label, isAfter = false }) => {
  const frame = useCurrentFrame();
  const labelOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const sceneName = isAfter ? 'Scene B' : 'Scene A';
  const note = noteFor(label);

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

// Single transition demo segment
function TransitionDemo<Props extends Record<string, unknown>>({
  name,
  presentation,
  transitionDuration = 45,
  sceneADuration = DEFAULT_SCENE_DURATION,
  sceneBDuration = DEFAULT_SCENE_DURATION,
}: {
  name: string;
  presentation: TransitionPresentation<Props>;
  transitionDuration?: number;
  sceneADuration?: number;
  sceneBDuration?: number;
}) {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={sceneADuration}>
        <GalleryScene color={SCENE_A_COLOR} label={name} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={presentation}
        timing={linearTiming({ durationInFrames: transitionDuration })}
      />
      <TransitionSeries.Sequence durationInFrames={sceneBDuration}>
        <GalleryScene color={SCENE_B_COLOR} label={name} isAfter />
      </TransitionSeries.Sequence>
    </TransitionSeries>
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

// Each transition's presentation() call returns TransitionPresentation<PropsForThatTransition> —
// a different, incompatible Props type per transition. Storing those directly in one array would
// force TypeScript to widen them to a union, which TransitionDemo's generic can't be instantiated
// from at a single call site (its `component` slot is contravariant in Props). makeTransitionEntry
// closes over the concrete presentation inside a `render` closure instead, so each entry's Props is
// resolved once, locally, at its own call to makeTransitionEntry — the array itself only ever holds
// the resulting non-generic { name, duration, render } shape.
type TransitionEntry = {
  name: string;
  duration: number;
  sceneA: number;
  sceneB: number;
  render: (transitionDuration: number) => React.ReactElement;
};

function makeTransitionEntry<Props extends Record<string, unknown>>(
  name: string,
  presentation: TransitionPresentation<Props>,
  duration: number,
  scenes: { sceneA?: number; sceneB?: number } = {},
): TransitionEntry {
  const sceneA = scenes.sceneA ?? DEFAULT_SCENE_DURATION;
  const sceneB = scenes.sceneB ?? DEFAULT_SCENE_DURATION;
  return {
    name,
    duration,
    sceneA,
    sceneB,
    render: (transitionDuration) => (
      <TransitionDemo
        name={name}
        presentation={presentation}
        transitionDuration={transitionDuration}
        sceneADuration={sceneA}
        sceneBDuration={sceneB}
      />
    ),
  };
}

// Define all transitions to showcase.
// Transition durations: 45 frames = 1.5s for most, longer for complex effects.
const TRANSITIONS: TransitionEntry[] = [
  makeTransitionEntry('glitch()', glitch({ intensity: 0.9 }), 45),
  makeTransitionEntry('rgbSplit()', rgbSplit({ direction: 'horizontal' }), 45),
  makeTransitionEntry('zoomBlur()', zoomBlur({ direction: 'in' }), 45),
  makeTransitionEntry('lightLeak()', lightLeak({ temperature: 'warm' }), 60),
  makeTransitionEntry('pixelate()', pixelate({ maxBlockSize: 50 }), 45),
  makeTransitionEntry('checkerboard(diagonal)', checkerboard({ pattern: 'diagonal', gridSize: 8 }), 50),
  makeTransitionEntry('checkerboard(alternating)', checkerboard({ pattern: 'alternating', gridSize: 8 }), 50),
  makeTransitionEntry('checkerboard(spiral)', checkerboard({ pattern: 'spiral', gridSize: 10 }), 55),
  makeTransitionEntry(
    'checkerboard(center-out)',
    checkerboard({ pattern: 'center-out', gridSize: 8, squareAnimation: 'scale' }),
    50,
  ),
  makeTransitionEntry('slide()', slide(), 40),
  makeTransitionEntry('fade()', fade(), 45),
  makeTransitionEntry('wipe()', wipe(), 40),
  makeTransitionEntry('flip()', flip(), 45),
];

// Calculate segment duration (scene A + scene B - overlap from transition)
const getSegmentDuration = (t: TransitionEntry) => t.sceneA + t.sceneB - t.duration;

export const TransitionGallery: React.FC = () => {
  const introDuration = 60; // 2 seconds

  let currentFrame = introDuration;
  const segments: { name: string; from: number; duration: number }[] = [];

  TRANSITIONS.forEach((t) => {
    const duration = getSegmentDuration(t);
    segments.push({ name: t.name, from: currentFrame, duration });
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
          key={t.name}
          from={segments[i].from}
          durationInFrames={segments[i].duration}
        >
          {t.render(t.duration)}
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
  fps: 30,
  width: 1920,
  height: 1080,
};

// For single-transition preview (useful for interactive player)
export const SingleTransitionPreview: React.FC<{
  transitionName: keyof typeof transitionMap;
}> = ({ transitionName }) => {
  const transition = transitionMap[transitionName];
  if (!transition) return null;

  return transition.render(transitionName, transition.duration);
};

// Map for programmatic access. See the TransitionEntry / makeTransitionEntry comment above —
// same reasoning, but render() also takes `name` here since the map's keys (not a stored field)
// are what SingleTransitionPreview passes through as the demo's label.
type NamedTransitionEntry = {
  duration: number;
  render: (name: string, transitionDuration: number) => React.ReactElement;
};

function makeNamedTransitionEntry<Props extends Record<string, unknown>>(
  presentation: TransitionPresentation<Props>,
  duration: number,
): NamedTransitionEntry {
  return {
    duration,
    render: (name, transitionDuration) => (
      <TransitionDemo name={name} presentation={presentation} transitionDuration={transitionDuration} />
    ),
  };
}

export const transitionMap = {
  glitch: makeNamedTransitionEntry(glitch({ intensity: 0.9 }), 45),
  rgbSplit: makeNamedTransitionEntry(rgbSplit({ direction: 'horizontal' }), 45),
  zoomBlur: makeNamedTransitionEntry(zoomBlur({ direction: 'in' }), 45),
  lightLeak: makeNamedTransitionEntry(lightLeak({ temperature: 'warm' }), 60),
  pixelate: makeNamedTransitionEntry(pixelate({ maxBlockSize: 50 }), 45),
  checkerboard: makeNamedTransitionEntry(checkerboard({ pattern: 'diagonal', gridSize: 8 }), 50),
  slide: makeNamedTransitionEntry(slide(), 40),
  fade: makeNamedTransitionEntry(fade(), 45),
  wipe: makeNamedTransitionEntry(wipe(), 40),
  flip: makeNamedTransitionEntry(flip(), 45),
} as const;

export type TransitionName = keyof typeof transitionMap;
