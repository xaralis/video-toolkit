// Base segment schemas — NO caption, NO overlays, NO aiGenerated. Templates
// extend with .extend({...}) to layer their own per-template fields.
import { z } from 'zod';
import { TransitionSchema } from './transition-schema';

const TrimInDesc =
  'SECONDS into source where clip starts (0 = start of source). Use "." as decimal separator (not ",").';
const TrimOutDesc =
  'SECONDS into source where clip ends. Effective duration = trimOut − trimIn. Use "." as decimal separator.';
const trimNumber = () => z.number().min(0).step(0.01);

// Static crop / zoom on the source. The output frame aspect is unchanged
// (reels stay 9:16), so only ONE dimension is needed — `width` — and the height
// follows to keep the frame aspect. Reusable across any project / segment.
export const CropSchema = z
  .object({
    width: z
      .number()
      .min(0.05)
      .max(1)
      .step(0.01)
      .describe(
        'Crop WIDTH as a fraction of the FITTED PICTURE (1 = no zoom, 0.5 = zoom in 2×) — NOT a fraction of the source. The renderer applies scale(1/width) to the element AFTER fit is already applied, so the same width means the same amount of zoom under every fit, not the same visible window (cover starts already cropped to fill the frame; contain starts showing the whole shot). This is the only dimension you set.',
      ),
    x: z
      .number()
      .min(0)
      .max(1)
      .step(0.01)
      .optional()
      .describe('Horizontal centre of the crop — 0=left, 0.5=centre (default), 1=right. Pans the zoom.'),
    y: z
      .number()
      .min(0)
      .max(1)
      .step(0.01)
      .optional()
      .describe('Vertical centre of the crop — 0=top, 0.5=centre (default), 1=bottom. Pans the zoom.'),
  })
  .describe('Static crop/zoom: one dimension (width) + x/y position. Frame stays 9:16.');

// `Crop` used to be a hand-written interface declared independently in THREE
// places (here as CropSchema, plus lib/reel-config-base/crop.ts and
// base-types.ts) — the same drift risk TransitionSchema/Transition already
// hit once (see transition-schema.ts). This is now the one source: the type
// is inferred from the schema above, and both crop.ts and base-types.ts
// re-export it rather than redeclaring it.
export type Crop = z.infer<typeof CropSchema>;

// Per-clip colour correction, applied IN the composition BEFORE the brand LUT
// (rule #32). Use it to match exposure / white balance across shots — NOT to
// build the brand look (that's the LUT). Subtle values; heavy grading fights
// the LUT.
export const GradeSchema = z
  .object({
    brightness: z
      .number()
      .min(0.2)
      .max(2)
      .step(0.01)
      .optional()
      .describe('Brightness multiplier — 1 = unchanged, <1 darker, >1 brighter.'),
    contrast: z
      .number()
      .min(0.2)
      .max(2)
      .step(0.01)
      .optional()
      .describe('Contrast multiplier — 1 = unchanged, <1 flatter, >1 punchier.'),
    saturation: z
      .number()
      .min(0)
      .max(2)
      .step(0.01)
      .optional()
      .describe('Saturation multiplier — 1 = unchanged, 0 = greyscale, >1 more vivid.'),
    temperature: z
      .number()
      .min(-1)
      .max(1)
      .step(0.01)
      .optional()
      .describe('White balance temperature — 0 = neutral, + warmer (more red), − cooler (more blue).'),
    tint: z
      .number()
      .min(-1)
      .max(1)
      .step(0.01)
      .optional()
      .describe('White balance tint — 0 = neutral, + magenta, − green. Fixes green casts (e.g. GoPro evening).'),
    sepia: z
      .number()
      .min(0)
      .max(1)
      .step(0.01)
      .optional()
      .describe('Sepia amount — 0 = unchanged (default), 1 = fully sepia. For aged/vintage looks.'),
    hueRotateDeg: z
      .number()
      .min(-180)
      .max(180)
      .step(1)
      .optional()
      .describe('Hue rotation in degrees — 0 = unchanged (default). For VHS-style colour shifts.'),
  })
  .describe('Per-clip colour correction (brightness / contrast / saturation / white balance / sepia / hue rotation), applied before the brand LUT (rule #32). For matching shots, not for the look.');

export const ClipSegmentBaseSchema = z.object({
  id: z.string().describe('Stable segment ID, e.g. "seg-001".'),
  type: z.literal('clip'),
  source: z
    .string()
    .describe('Filename under public/recordings/ — talking-head footage with the speaker\'s voice.'),
  trimIn: trimNumber().describe(TrimInDesc),
  trimOut: trimNumber().describe(TrimOutDesc),
  audioMode: z
    .enum(['voice', 'silent'])
    .optional()
    .default('voice')
    .describe('voice (default): use clip audio, music stays at baseline. silent: mute clip, music swells +6 dB (rule #30).'),
  focalX: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'Horizontal crop focus for objectFit:cover — 0=left edge, 0.5=center (default), 1=right edge. Use to keep an off-center subject (e.g. a right-third speaker) inside a 9:16 crop.',
    ),
  focalY: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Vertical crop focus — 0=top, 0.5=center (default), 1=bottom.'),
  crop: CropSchema.optional().describe(
    'Static crop/zoom on this clip — one dimension (width) + x/y. Zooms into the source while keeping the 9:16 frame.',
  ),
  grade: GradeSchema.optional().describe(
    'Per-clip colour correction — brightness / contrast / saturation / white balance. Applied before the brand LUT (rule #32); for matching shots, not the look.',
  ),
  fit: z
    .enum(['cover', 'contain', 'blur-pad'])
    .optional()
    .describe(
      'How the shot meets the frame. cover (default): fill it, cropping whatever does not fit. contain: show the WHOLE shot, with the leftover space filled per `pad` — for footage whose orientation does not match the composition (a portrait phone b-roll in a 16:9 frame), where cover would crop most of the picture away. /toolkit:cut sets this itself when it probes a mismatched source. blur-pad is a DEPRECATED ALIAS for contain + pad:"blur" — kept so old configs keep parsing and rendering unchanged; the editor never writes it, author contain (+ pad) instead.',
    ),
  pad: z
    .enum(['blur', 'color', 'none'])
    .optional()
    .describe(
      'contain only — what fills the leftover space around the whole shot. blur (default when absent): a blurred, dimmed copy of the same shot (see backdropBlur/backdropDim). color: a flat fill (see padColor). none: no fill at all.',
    ),
  padColor: z
    .string()
    .optional()
    .describe(
      'Used when pad:"color". Absent means TRANSPARENT, not black — the frame\'s own background shows through.',
    ),
  placeX: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'contain only. Where the shot sits in the leftover space, horizontally — 0=left, 0.5=centre (default), 1=right.',
    ),
  placeY: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'contain only. Where the shot sits in the leftover space, vertically — 0=top, 0.5=centre (default), 1=bottom.',
    ),
  backdropBlur: z
    .number()
    .min(0)
    .max(80)
    .optional()
    .describe('pad:"blur" only: backdrop blur radius in px (default 32).'),
  backdropDim: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('pad:"blur" only: how far the backdrop is darkened — 0 leaves it alone, 1 is black (default 0.45).'),
  transitionOut: TransitionSchema.optional().describe(
    'Transition to the next segment. Omit for hard cut.',
  ),
});

export const BrollSegmentBaseSchema = z.object({
  id: z.string().describe('Stable segment ID.'),
  type: z.literal('broll'),
  source: z
    .string()
    .describe('Filename under public/broll/ — cutaway / visual context shot.'),
  trimIn: trimNumber().describe(TrimInDesc),
  trimOut: trimNumber().describe(
    'SECONDS into source where broll ends. Effective duration = trimOut − trimIn. Min 3.0 (rule #19).',
  ),
  audioMode: z
    .enum(['silent', 'extend-previous', 'inherit-from-clip'])
    .describe(
      [
        '• silent           — no audio (recommended; brand rule #17 valid pause beat)',
        '• extend-previous  — previous clip\'s tail audio continues',
        '• inherit-from-clip — overlay a specific clip\'s audio (set audioSource + audioStartSec)',
      ].join('\n'),
    ),
  audioSource: z.string().optional().describe('When audioMode=inherit-from-clip: which source file provides the audio.'),
  audioStartSec: z
    .number()
    .min(0)
    .step(0.01)
    .optional()
    .describe('When audioMode=inherit-from-clip: SECONDS into audioSource where playback resumes.'),
  focalX: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'Horizontal crop focus for objectFit:cover — 0=left edge, 0.5=center (default), 1=right edge. Use to keep an off-center subject (e.g. a right-third speaker) inside a 9:16 crop.',
    ),
  focalY: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('Vertical crop focus — 0=top, 0.5=center (default), 1=bottom.'),
  kenBurns: z
    .object({
      fromX: z.number().min(0).max(1).optional().describe('Pan start — horizontal objectPosition 0..1 (default = focalX or 0.5).'),
      toX: z.number().min(0).max(1).optional().describe('Pan end — horizontal objectPosition 0..1.'),
      fromY: z.number().min(0).max(1).optional().describe('Pan start — vertical objectPosition 0..1 (default = focalY or 0.5).'),
      toY: z.number().min(0).max(1).optional().describe('Pan end — vertical objectPosition 0..1.'),
      fromScale: z.number().min(1).max(3).optional().describe('Zoom start scale, >=1 (default 1).'),
      toScale: z.number().min(1).max(3).optional().describe('Zoom end scale, >=1 (default 1).'),
    })
    .optional()
    .describe(
      'Animated Ken Burns pan/zoom over the segment. Interpolates objectPosition (fromX/toX, fromY/toY) and transform scale (fromScale/toScale) start→end with ease-in-out. Use to slowly reveal a wide (16:9) landscape b-roll across the 9:16 frame.',
    ),
  crop: CropSchema.optional().describe(
    'Static crop/zoom on this b-roll — one dimension (width) + x/y. Composes with focal; kenBurns (if set) overrides it.',
  ),
  grade: GradeSchema.optional().describe(
    'Per-clip colour correction — brightness / contrast / saturation / white balance. Applied before the brand LUT (rule #32); for matching shots, not the look.',
  ),
  fit: z
    .enum(['cover', 'contain', 'blur-pad'])
    .optional()
    .describe(
      'How the shot meets the frame. cover (default): fill it, cropping whatever does not fit. contain: show the WHOLE shot, with the leftover space filled per `pad` — for footage whose orientation does not match the composition (a portrait phone b-roll in a 16:9 frame), where cover would crop most of the picture away. /toolkit:cut sets this itself when it probes a mismatched source. blur-pad is a DEPRECATED ALIAS for contain + pad:"blur" — kept so old configs keep parsing and rendering unchanged; the editor never writes it, author contain (+ pad) instead.',
    ),
  pad: z
    .enum(['blur', 'color', 'none'])
    .optional()
    .describe(
      'contain only — what fills the leftover space around the whole shot. blur (default when absent): a blurred, dimmed copy of the same shot (see backdropBlur/backdropDim). color: a flat fill (see padColor). none: no fill at all.',
    ),
  padColor: z
    .string()
    .optional()
    .describe(
      'Used when pad:"color". Absent means TRANSPARENT, not black — the frame\'s own background shows through.',
    ),
  placeX: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'contain only. Where the shot sits in the leftover space, horizontally — 0=left, 0.5=centre (default), 1=right.',
    ),
  placeY: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'contain only. Where the shot sits in the leftover space, vertically — 0=top, 0.5=centre (default), 1=bottom.',
    ),
  backdropBlur: z
    .number()
    .min(0)
    .max(80)
    .optional()
    .describe('pad:"blur" only: backdrop blur radius in px (default 32).'),
  backdropDim: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe('pad:"blur" only: how far the backdrop is darkened — 0 leaves it alone, 1 is black (default 0.45).'),
  transitionOut: TransitionSchema.optional(),
});

export const MultiClipSegmentBaseSchema = z.object({
  id: z.string().describe('Stable segment ID.'),
  type: z.literal('multi-clip'),
  layout: z
    .enum(['split-h', 'split-v', 'pip', 'quad'])
    .describe(
      [
        '• split-h — top/bottom',
        '• split-v — left/right',
        '• pip     — main + small picture-in-picture corner',
        '• quad    — 2×2 grid of 4 clips',
      ].join('\n'),
    ),
  sources: z
    .array(
      z.object({
        source: z.string().describe('Filename — under public/broll/ by default.'),
        trimIn: trimNumber().describe('SECONDS into source where this part starts.'),
        trimOut: trimNumber().describe('SECONDS into source where this part ends.'),
        label: z.string().optional().describe('Optional JBM Mono label.'),
      }),
    )
    .describe('Sub-clips, ordered.'),
  durationMs: z.number().min(1000).describe('Total visible time, in MILLISECONDS. Min 1000.'),
  audioMode: z
    .enum(['first', 'mix', 'silent'])
    .describe(
      [
        '• first    — sources[0] audio plays',
        '• mix      — all sources audio mixed',
        '• silent   — no audio',
      ].join('\n'),
    ),
  transitionOut: TransitionSchema.optional(),
});
