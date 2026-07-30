// The conformance fixture's composition component — same shape as MinimalReel,
// bound to conformance-theme.tsx instead. See that file for what each axis
// registers and why the look is deliberately non-core.
import React from 'react';
import { LayeredReelComposition } from '@video-toolkit/lib/render/layered-composition';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { conformanceTheme } from './conformance-theme';

export const ConformanceReel: React.FC<{ reel: LayeredReel }> = ({ reel }) => (
  <LayeredReelComposition reel={reel} theme={conformanceTheme} />
);
