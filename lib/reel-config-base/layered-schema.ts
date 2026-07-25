// Layered timeline model — track-native, absolute-ms timings. This is the
// foundation of the layered-timeline video-editor redesign: unlike the
// segment-based schemas in this directory (sequential segments with relative
// trim points), this schema stores every item's position on an absolute
// timeline (startMs/endMs) across independent tracks (video, audio, music,
// overlays, brand).
//
// Overlay CONTENT variants (title/quote-pull/stat-callout/source-tag/...)
// live in the TEMPLATE's schema.ts, not core. To keep core generic, the
// layered schema stores overlay content as a permissive record and lets the
// template/derivation supply the concrete union.
import { z } from 'zod';

const OverlayContent = z.record(z.string(), z.unknown()); // { kind, text?, number?, placement?, ... }

const Ms = z.number().min(0);

// Every track item shares a time span.
const TimeSpan = { startMs: Ms, endMs: Ms };

// A generic clip effect: a typed tag + arbitrary params. Ken Burns, blend, colour, etc.
// are effects. Kept permissive (a `type` discriminant + passthrough params) so core stays
// generic and new effect kinds — or brand-preset params — need no schema change. This is
// the real-NLE "clip carries a stack of effects" model; simplification lives in brand presets.
export const EffectSchema = z.object({ type: z.string() }).passthrough();
export type Effect = z.infer<typeof EffectSchema>;

export const VideoItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['clip', 'broll', 'multi-clip', 'card', 'outro']),
  ...TimeSpan,
  source: z.string().optional(), // absent for outro; multi-clip uses sources[]
  sources: z
    .array(
      z.object({
        source: z.string(),
        sourceInMs: Ms,
        sourceOutMs: Ms,
        label: z.string().optional(),
        zoom: z.number().optional(),
      }),
    )
    .optional(),
  sourceInMs: Ms.optional(), // trim window into the source (clip/broll)
  sourceOutMs: Ms.optional(),
  layout: z.enum(['split-h', 'split-v', 'pip', 'quad']).optional(), // multi-clip
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  crop: z.record(z.string(), z.unknown()).optional(),
  grade: z.record(z.string(), z.unknown()).optional(),
  aiGenerated: z.boolean().optional(), // broll
  cardKind: z.string().optional(), // card
  cardProps: z.record(z.string(), z.unknown()).optional(),
  pattern: z.string().optional(),
  musicBoostDb: z.number().optional(), // this item's contribution to the music envelope while on screen
  effects: z.array(EffectSchema).optional(),
  // per-clip audio setting (clip voice|silent · broll inherit-from-clip|extend-previous|silent · multi-clip first|mix|silent)
  audioMode: z.string().optional(),
  transitionOut: z.record(z.string(), z.unknown()).optional(), // the existing Transition union, stored permissively
});

export const AudioItemSchema = z.object({
  id: z.string(),
  ...TimeSpan,
  source: z.string(), // the audio source file
  sourceInMs: Ms, // in-point into the audio source (slippable)
  volumeDb: z.number().optional(),
  mute: z.boolean().optional(),
  followsVideoId: z.string().optional(), // the video item this bed was derived from (for alignment; editing may detach)
});

export const OverlayItemSchema = z.object({
  id: z.string(),
  ...TimeSpan,
  content: OverlayContent, // { kind: 'title'|'quote-pull'|'stat-callout'|'source-tag'|'chevron', ...fields }
  position: z.string().optional(),
  anchorVideoId: z.string().optional(), // the clip it was aligned to at /cut (for reference; freely movable)
});

export const BrandLayerItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['watermark', 'disclaimer']),
  ...TimeSpan,
  props: z.record(z.string(), z.unknown()).optional(),
});

export const MusicLayerSchema = z.object({
  source: z.string().optional(),
  baseVolumeDb: z.number().default(-8),
});

export const LayeredReelSchema = z.object({
  version: z.literal('layered-1'),
  meta: z.object({ topic: z.string(), totalDurationMs: Ms }),
  tracks: z.object({
    video: z.array(VideoItemSchema),
    audio: z.array(AudioItemSchema),
    music: MusicLayerSchema,
    overlays: z.array(OverlayItemSchema),
    brand: z.array(BrandLayerItemSchema),
  }),
});
export type LayeredReel = z.infer<typeof LayeredReelSchema>;
export type VideoItem = z.infer<typeof VideoItemSchema>;
export type AudioItem = z.infer<typeof AudioItemSchema>;
export type OverlayItem = z.infer<typeof OverlayItemSchema>;
export type BrandLayerItem = z.infer<typeof BrandLayerItemSchema>;
