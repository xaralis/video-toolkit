// Schema for the web-program-intro template. Reuses the BASE segment schemas
// from lib/reel-config-base — adds no caption/overlay fields (web overlays
// captions via HTML <track>, headline via the website's own DOM layer).
//
// Project-level metadata fields (programNumber/Slug/Title/targetDurationSec)
// are unique to web-program-intro and surface in project.json + are useful
// for the website integration (alt text, structured data, credits).

import { z } from 'zod';
import {
  ClipSegmentBaseSchema,
  BrollSegmentBaseSchema,
  MultiClipSegmentBaseSchema,
} from '../../../../lib/reel-config-base/segment-base-schemas';

export const ClipSegmentSchema = ClipSegmentBaseSchema;
export const BrollSegmentSchema = BrollSegmentBaseSchema;
export const MultiClipSegmentSchema = MultiClipSegmentBaseSchema;

export const SegmentSchema = z.discriminatedUnion('type', [
  ClipSegmentSchema,
  BrollSegmentSchema,
  MultiClipSegmentSchema,
]);

export const WebProgramIntroConfigSchema = z.object({
  programNumber: z
    .number()
    .int()
    .min(1)
    .max(99)
    .describe('Program point number (1-8 in the current campaign).'),
  programSlug: z
    .string()
    .describe('URL slug matching the .mdx — e.g., "mobilita", "klima".'),
  programTitle: z
    .string()
    .describe('Display title — e.g., "Mobilita", "Klima".'),
  targetDurationSec: z
    .number()
    .min(15)
    .max(180)
    .optional()
    .describe('Guideline duration for scripting (seconds). Actual duration is sum of segments.'),
  audio: z
    .object({
      music: z
        .string()
        .optional()
        .describe('Path to background music relative to public/ — e.g., "music/bg.mp3".'),
      musicVolumeDb: z
        .number()
        .min(-30)
        .max(0)
        .optional()
        .describe('Base music level in dB. Ambient default ~-12 (calibrated by audio_calibrate.py to ~18 LU below voice).'),
    })
    .optional(),
  segments: z.array(SegmentSchema).min(1).describe('Ordered list of segments.'),
});

export type WebProgramIntroConfigInput = z.infer<typeof WebProgramIntroConfigSchema>;
