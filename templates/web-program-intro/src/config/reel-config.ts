import type { WebProgramIntroConfigInput } from './schema';

// Near-identity builder — exists for symmetry with campaign-reels so future
// normalization logic has a single hook.
export function buildReelConfig(input: WebProgramIntroConfigInput): WebProgramIntroConfigInput {
  return input;
}

export const fps = 30;
export const width = 1920;
export const height = 1080;
