// Generic Zod transition schema, used by both campaign-reels and web-program-intro.
// 30 fps assumption baked into copy text ("30 frames = 1 sec").
import { z } from 'zod';

export const TransitionFrames = z
  .number()
  .min(1)
  .max(60)
  .describe('Transition length in FRAMES (30fps reel → 30 frames = 1 sec). Adjacent segments overlap by this many frames.');

export const TransitionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cut') }),
  z.object({ kind: z.literal('dissolve'), frames: TransitionFrames }),
  z.object({ kind: z.literal('fade-coal'), frames: TransitionFrames }),
  z.object({ kind: z.literal('glitch'), frames: TransitionFrames }),
  z.object({
    kind: z.literal('whip-pan'),
    frames: TransitionFrames,
    direction: z.enum(['left', 'right', 'up', 'down']),
  }),
  z.object({
    kind: z.literal('zoom-through'),
    frames: TransitionFrames,
    from: z.enum(['in', 'out']),
  }),
  z.object({
    kind: z.literal('wipe'),
    frames: TransitionFrames,
    color: z.enum(['lime', 'teal', 'coal']).describe('Wipe sweep colour.'),
    direction: z.enum(['left', 'right']),
  }),
  z.object({
    kind: z.literal('gradient-wipe'),
    frames: TransitionFrames,
    direction: z
      .enum(['tl-br', 'tr-bl', 'bl-tr', 'br-tl'])
      .optional()
      .describe('Corner the incoming clip reveals FROM; band sweeps to the opposite corner. Default tl-br.'),
    softness: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Feathered blend-band width, % of the diagonal. Larger = softer cross-blend. Default 40.'),
  }),
]);
