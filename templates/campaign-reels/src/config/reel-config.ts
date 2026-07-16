// The builder is a near-identity transformation from ReelConfigInput
// (Zod-validated shape) to ReelConfig (TypeScript type). It exists so that
// downstream code (CampaignReel.tsx) always sees a normalized shape, even
// if upstream defaulting or normalization rules evolve over time.

import type { ReelConfig } from './types';
import type { ReelConfigInput } from './schema';

export function buildReelConfig(input: ReelConfigInput): ReelConfig {
  return input as ReelConfig;
}

export const fps = 30;
export const width = 1080;
export const height = 1920;
export const outroFrames = 180;
