/**
 * Whip Pan Transition
 *
 * A rapid directional pan with motion blur, mimicking a whip camera movement.
 * Creates a sense of speed and energy as content swaps directions.
 *
 * Best for: Fast-paced sequences, scene breaks, energetic transitions, action moments
 */
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

export type WhipPanProps = {
  /** Direction of the pan: 'left', 'right', 'up', 'down'. Default: 'left' */
  direction?: 'left' | 'right' | 'up' | 'down';
  /** Blur intensity during pan. Default: 20 */
  blurAmount?: number;
};

const WhipPanPresentation: React.FC<
  TransitionPresentationComponentProps<WhipPanProps>
> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const {
    direction = 'left',
    blurAmount = 20,
  } = passedProps;

  // Motion blur peaks in the middle of the transition
  const blur = useMemo(() => {
    return blurAmount * interpolate(presentationProgress, [0, 0.5, 1], [0, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }, [presentationProgress, blurAmount]);

  // Pan translation amount (content moves off-screen)
  const panAmount = useMemo(() => {
    const maxPan = 110; // Move content 110% of viewport to ensure full pan
    const isExit = presentationDirection === 'exiting';
    const progress = isExit ? presentationProgress : presentationProgress;

    switch (direction) {
      case 'left':
        return isExit
          ? interpolate(progress, [0, 1], [0, -maxPan])
          : interpolate(progress, [0, 1], [maxPan, 0]);
      case 'right':
        return isExit
          ? interpolate(progress, [0, 1], [0, maxPan])
          : interpolate(progress, [0, 1], [-maxPan, 0]);
      case 'up':
        return isExit
          ? interpolate(progress, [0, 1], [0, -maxPan])
          : interpolate(progress, [0, 1], [maxPan, 0]);
      case 'down':
        return isExit
          ? interpolate(progress, [0, 1], [0, maxPan])
          : interpolate(progress, [0, 1], [-maxPan, 0]);
      default:
        return 0;
    }
  }, [presentationProgress, presentationDirection, direction]);

  // Opacity: fade in on enter, fade out on exit
  const opacity = presentationDirection === 'exiting'
    ? interpolate(presentationProgress, [0, 1], [1, 0])
    : interpolate(presentationProgress, [0, 1], [0, 1]);

  // Determine transform based on direction
  const transform = useMemo(() => {
    if (direction === 'left' || direction === 'right') {
      return `translateX(${panAmount}%)`;
    } else {
      return `translateY(${panAmount}%)`;
    }
  }, [panAmount, direction]);

  const contentStyle: React.CSSProperties = useMemo(() => ({
    width: '100%',
    height: '100%',
    transform,
    filter: blur > 0.5 ? `blur(${blur}px)` : undefined,
    opacity,
  }), [transform, blur, opacity]);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={contentStyle}>
        {children}
      </div>

      {/* Motion speed lines for extra effect */}
      {blur > 2 && (
        <AbsoluteFill
          style={{
            opacity: Math.min(blur / 20, 1) * 0.3,
            background:
              direction === 'left' || direction === 'right'
                ? `repeating-linear-gradient(
                    90deg,
                    rgba(255, 255, 255, 0.4) 0px,
                    rgba(255, 255, 255, 0.4) 2px,
                    transparent 2px,
                    transparent 8px
                  )`
                : `repeating-linear-gradient(
                    0deg,
                    rgba(255, 255, 255, 0.4) 0px,
                    rgba(255, 255, 255, 0.4) 2px,
                    transparent 2px,
                    transparent 8px
                  )`,
            pointerEvents: 'none',
            mixBlendMode: 'overlay',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const whipPan = (
  props: WhipPanProps = {}
): TransitionPresentation<WhipPanProps> => {
  return { component: WhipPanPresentation, props };
};
