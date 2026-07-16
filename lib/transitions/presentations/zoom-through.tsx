/**
 * Zoom Through Transition
 *
 * A dramatic zoom effect that passes through the screen plane.
 * Content zooms in and fades out (exiting), or fades in and zooms out (entering).
 * Creates a 3D sense of depth and movement through space.
 *
 * Best for: Scene reveals, dramatic moments, cinematic transitions, product showcases
 */
import type {
  TransitionPresentation,
  TransitionPresentationComponentProps,
} from '@remotion/transitions';
import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate } from 'remotion';

export type ZoomThroughProps = {
  /** Direction: 'in' zooms toward viewer, 'out' zooms away. Default: 'in' */
  direction?: 'in' | 'out';
  /** Maximum scale multiplier. Default: 1.8 */
  zoomAmount?: number;
};

const ZoomThroughPresentation: React.FC<
  TransitionPresentationComponentProps<ZoomThroughProps>
> = ({ children, presentationDirection, presentationProgress, passedProps }) => {
  const {
    direction = 'in',
    zoomAmount = 1.8,
  } = passedProps;

  // Scale animation
  const scale = useMemo(() => {
    const isExit = presentationDirection === 'exiting';

    if (direction === 'in') {
      // On exit: zoom in from 1 to zoomAmount
      // On enter: zoom out from zoomAmount to 1
      return isExit
        ? interpolate(presentationProgress, [0, 1], [1, zoomAmount], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        : interpolate(presentationProgress, [0, 1], [zoomAmount, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
    } else {
      // On exit: zoom out from 1 to 1/zoomAmount
      // On enter: zoom in from 1/zoomAmount to 1
      return isExit
        ? interpolate(presentationProgress, [0, 1], [1, 1 / zoomAmount], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        : interpolate(presentationProgress, [0, 1], [1 / zoomAmount, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
    }
  }, [presentationProgress, presentationDirection, direction, zoomAmount]);

  // Opacity: fade out on exit, fade in on enter
  // Fade happens toward the end to enhance the "through the plane" effect
  const opacity = presentationDirection === 'exiting'
    ? interpolate(presentationProgress, [0, 0.6, 1], [1, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    : interpolate(presentationProgress, [0, 0.4, 1], [0, 1, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });

  const contentStyle: React.CSSProperties = useMemo(() => ({
    width: '100%',
    height: '100%',
    transform: `scale(${scale})`,
    transformOrigin: 'center center',
    opacity,
  }), [scale, opacity]);

  // Radial vignette that intensifies at zoom peaks
  const vignetteOpacity = useMemo(() => {
    if (presentationDirection === 'exiting') {
      return interpolate(presentationProgress, [0, 0.5, 1], [0, 0.3, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    } else {
      return interpolate(presentationProgress, [0, 0.5, 1], [0.3, 0, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
    }
  }, [presentationProgress, presentationDirection]);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={contentStyle}>
        {children}
      </div>

      {/* Vignette effect at zoom peak for depth */}
      {vignetteOpacity > 0.01 && (
        <AbsoluteFill
          style={{
            opacity: vignetteOpacity,
            background: `radial-gradient(
              ellipse at center,
              transparent 0%,
              transparent 40%,
              rgba(0, 0, 0, 0.6) 100%
            )`,
            pointerEvents: 'none',
          }}
        />
      )}
    </AbsoluteFill>
  );
};

export const zoomThrough = (
  props: ZoomThroughProps = {}
): TransitionPresentation<ZoomThroughProps> => {
  return { component: ZoomThroughPresentation, props };
};
