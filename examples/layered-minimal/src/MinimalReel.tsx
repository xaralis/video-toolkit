// The brand's composition component: bind the theme, hand core the reel.
//
// This wrapper is why it exists at all — Remotion's `defaultProps` must stay
// JSON-serializable (Studio and the editor read and rewrite them), so the theme,
// which carries React components and functions, is bound HERE in code, and only
// the reel DATA travels through props.
import React from 'react';
import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { theme } from './theme';

export const MinimalReel: React.FC<{ reel: LayeredReel }> = ({ reel }) => (
  <LayeredReelComposition reel={reel} theme={theme} />
);
