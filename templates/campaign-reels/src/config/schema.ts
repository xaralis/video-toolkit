// Generic Zod schemas for the campaign-reels ReelConfig. Consumed via
// <Composition schema={...} defaultProps={...}> so Remotion Studio renders a
// full editor UI for every segment, overlay, and transition in the sidebar.

import { z } from 'zod';
import {
  ClipSegmentBaseSchema,
  BrollSegmentBaseSchema,
  MultiClipSegmentBaseSchema,
} from '../../../../lib/reel-config-base/segment-base-schemas';
import {
  TransitionSchema,
  TransitionFrames,
} from '../../../../lib/reel-config-base/transition-schema';

// Re-export so existing imports across the reels codebase still work:
export { TransitionSchema, TransitionFrames };

// Accent text supports inline {lime:phrase} / {teal:phrase} syntax,
// parsed by lib/accent-parser at render time.
const AccentText = z
  .string()
  .describe('Plain text with optional inline {lime:phrase} / {teal:phrase} accents');

// ----- Overlay variants ----------------------------------------------------

export const TitleOverlaySchema = z.object({
  kind: z.literal('title'),
  text: AccentText.describe(
    'Title plate text. Supports {lime:..} / {teal:..} accents. Trailing "." auto-styles to teal (brand rule #10).',
  ),
  appearAt: z
    .number()
    .min(0)
    .max(60000)
    .describe('MILLISECONDS into the segment when the title appears. 0 = at segment start (typical for opening title).'),
  durationMs: z
    .number()
    .min(3000)
    .max(15000)
    .describe('How long the title is visible, in MILLISECONDS. Min 3000 (3s) — brand rule #19. Typical: 3000.'),
});

export const QuotePullOverlaySchema = z.object({
  kind: z.literal('quote-pull'),
  text: AccentText.describe(
    'Emphasis text shown over the clip. 1–3 words in accent ({lime:..} / {teal:..}), rest in linen.',
  ),
  // Placement options — rule #28. Full-width bands for headline moments;
  // anchored zones (max-width 56%) for face-safe placement on talking-head
  // clips. Anchored *-right / *-center positions sit at top >= 18% to clear
  // the top-right PP logo.
  placement: z
    .enum([
      'upper-third', 'center', 'lower-third',
      'upper-left', 'upper-center', 'upper-right',
      'mid-left', 'mid-right',
      'lower-left', 'lower-center', 'lower-right',
    ])
    .describe(
      'Where on frame the quote-pull sits (rule #28). For CLIP segments prefer lower-* (face-safe). For BROLL any placement works. Rotate placements segment-to-segment for visual rhythm.',
    ),
  appearAt: z
    .number()
    .min(0)
    .max(60000)
    .describe('MILLISECONDS into the segment when the overlay appears. 0 = at segment start.'),
  durationMs: z
    .number()
    .min(3000)
    .max(15000)
    .describe('How long the overlay holds on screen, in MILLISECONDS. Min 3000 — rule #19.'),
});

export const StatCalloutOverlaySchema = z.object({
  kind: z.literal('stat-callout'),
  number: z.string().describe('The big number — e.g., "500" or "1.2k". Plain string so units like "k" work.'),
  unit: z.string().optional().describe('Unit suffix — "dětí", "%", "km/h", etc. Renders smaller next to number.'),
  label: z.string().optional().describe('Caption under the number, e.g., "dětí chodí denně do ZŠ".'),
  appearAt: z.number().min(0).max(60000).describe('MILLISECONDS into segment when the callout appears.'),
  durationMs: z.number().min(3000).max(15000).describe('How long callout holds, in MILLISECONDS. Min 3000.'),
  color: z.enum(['lime', 'teal']).describe('Brand accent colour for the number.'),
});

export const SourceTagOverlaySchema = z.object({
  kind: z.literal('source-tag'),
  text: z.string().describe('Source attribution — e.g., "ČSÚ 2024" or "Magistrát Pardubice".'),
  position: z.enum(['bottom-left', 'bottom-right', 'top-right']).describe('Where on the frame the tag sits.'),
  appearAt: z.number().min(0).max(60000).describe('MILLISECONDS into segment when the tag appears.'),
  durationMs: z.number().min(3000).max(15000).describe('How long tag holds, in MILLISECONDS.'),
});

// AI VIZUALIZACE tag is auto-rendered when a broll segment sets
// `aiGenerated: true` — it is NOT a user-selectable overlay kind. Keeping
// it out of OverlaySchema prevents Studio from offering a dead "ai-visual-tag"
// dropdown option that no segment dispatches.

export const OverlaySchema = z.discriminatedUnion('kind', [
  TitleOverlaySchema,
  QuotePullOverlaySchema,
  StatCalloutOverlaySchema,
  SourceTagOverlaySchema,
]);

// ----- Segments ------------------------------------------------------------

// Transition + base segment schemas live in lib/reel-config-base. Reels
// extends them below with caption / overlays / aiGenerated.

export const ClipSegmentSchema = ClipSegmentBaseSchema.extend({
  caption: z
    .object({
      lines: z
        .array(
          z.object({
            startMs: z.number().min(0).describe('MILLISECONDS into the segment when this caption line appears.'),
            endMs: z.number().min(0).describe('MILLISECONDS into the segment when this caption line disappears.'),
            text: z.string().describe('Caption text. Use this when Whisper got the words wrong or to rephrase.'),
          }),
        )
        .optional()
        .describe('Manual caption override. If unset, captions auto-generate from <source>.transcript.json.'),
    })
    .optional(),
  overlays: z
    .array(OverlaySchema)
    .optional()
    .describe('Overlays rendered on top of this clip — title, quote-pulls, stat-callouts, source-tags, ai-visual-tag.'),
});

export const BrollSegmentSchema = BrollSegmentBaseSchema.extend({
  aiGenerated: z.boolean().default(false).describe('Set true for AI-derived visuals (flux2 / ltx2). Auto-renders the mandatory ▸ AI VIZUALIZACE tag.'),
  overlay: OverlaySchema.optional().describe('Single overlay rendered on top of this broll (title / quote-pull / stat-callout / source-tag).'),
});

export const MultiClipSegmentSchema = MultiClipSegmentBaseSchema.extend({
  overlay: OverlaySchema.optional(),
});

export const CardSegmentSchema = z.object({
  id: z.string().describe('Stable segment ID.'),
  type: z.literal('card'),
  kind: z.enum(['claim-plate', 'program-plate', 'contrast-plate', 'stats-plate']).describe('Which card visual variant.'),
  props: z.record(z.string(), z.unknown()).describe('Variant-specific props (see card components).'),
  durationMs: z.number().min(500).describe('How long the card holds, in MILLISECONDS. Min 500.'),
  pattern: z
    .enum(['pixels', 'diagonals', 'dots', 'grid', 'none'])
    .optional()
    .describe('Background pattern overlay. "none" or omit for clean coal background.'),
  transitionOut: TransitionSchema.optional(),
});

export const OutroSegmentSchema = z.object({
  id: z.string().describe('Always "seg-NNN" matching reel position. Typically the LAST segment.'),
  type: z.literal('outro'),
});

export const SegmentSchema = z.discriminatedUnion('type', [
  ClipSegmentSchema,
  BrollSegmentSchema,
  MultiClipSegmentSchema,
  CardSegmentSchema,
  OutroSegmentSchema,
]);

// ----- Top-level config ----------------------------------------------------

export const ReelConfigSchema = z.object({
  topic: z.string().describe('Short reel topic — appears in titles and analytics. e.g., "Bezpečně do školy".'),
  chevron: z.string().describe('Single-word category label rendered ONCE at the start (rule #7). e.g., "DOPRAVA", "ŠKOLY".'),
  audio: z
    .object({
      music: z
        .string()
        .optional()
        .describe('Path to bg music, relative to public/ — e.g., "audio/bg.mp3". Generated via /add-music.'),
      musicVolumeDb: z
        .number()
        .min(-30)
        .max(0)
        .optional()
        .describe('Base music level in dB. Brand default -8 (rule #30). The +6 broll / +10 outro boosts compose on top.'),
    })
    .optional(),
  segments: z.array(SegmentSchema).min(1).describe('Ordered list of segments — top-to-bottom = reel timeline.'),
});

export type ReelConfigInput = z.infer<typeof ReelConfigSchema>;
