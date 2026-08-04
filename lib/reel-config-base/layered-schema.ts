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
import { TransitionSchema } from './transition-schema';
import { NodeEnabledSchema } from './node-enabled';

const OverlayContent = z.record(z.string(), z.unknown()); // { kind, text?, number?, placement?, ... }

const Ms = z.number().min(0);

// Every track item shares a time span.
const TimeSpan = { startMs: Ms, endMs: Ms };

// A generic clip effect: a typed tag + arbitrary params. Ken Burns, blend, colour, etc.
// are effects. Kept permissive (a `type` discriminant + passthrough params) so core stays
// generic and new effect kinds — or brand-preset params — need no schema change. This is
// the real-NLE "clip carries a stack of effects" model; simplification lives in brand presets.
//
// `enabled` is DECLARED rather than left to the passthrough: it is not a param
// of any one effect type, it is the node contract's own field (see
// ./node-enabled.ts), and the schema is where the editor and every reader learn
// that it exists. Absent means enabled, so no baked literal changes.
export const EffectSchema = z.object({ type: z.string(), enabled: NodeEnabledSchema }).passthrough();
export type Effect = z.infer<typeof EffectSchema>;

const SubSource = z.object({
  source: z.string(),
  sourceInMs: Ms,
  sourceOutMs: Ms,
  label: z.string().optional(),
  zoom: z.number().optional(),
});

// Shared video-container contract — every video track item satisfies this.
// NB: NO audio fields. Sound lives on the audio track (see AudioItemSchema);
// the only link back to a clip is AudioItem.followsVideoId.
const VideoContainerBase = {
  id: z.string(),
  ...TimeSpan,
  focalX: z.number().min(0).max(1).optional(),
  focalY: z.number().min(0).max(1).optional(),
  crop: z.record(z.string(), z.unknown()).optional(),
  grade: z.record(z.string(), z.unknown()).optional(),
  // How the media meets the frame — TWO independent axes, not one enum. `fit`
  // decides whether the shot is cropped to fill the frame or shown whole;
  // `pad` decides what fills the leftover space `contain` leaves behind.
  // `cover` (the default, and every item authored before this field existed)
  // crops away whatever doesn't fit — right for a small aspect mismatch,
  // destructive for a large one. `contain` shows the whole shot, for footage
  // whose orientation doesn't match the composition's (a portrait phone
  // b-roll in a 16:9 frame): what fills the space around it is `pad`'s job,
  // not `fit`'s — a BARE `contain` (`pad: 'none'`) is reachable (nothing in
  // the model forbids it) but is not what the editor offers by default; a
  // blurred copy of the shot (`pad: 'blur'`) is. `blur-pad` is a DEPRECATED
  // ALIAS this schema still parses — see `resolveFraming` in
  // `lib/reel-config-base/framing.ts`, the one place that reads
  // `fit === 'blur-pad'` as `{ fit: 'contain', pad: 'blur' }` — kept so every
  // config authored before this split keeps rendering unchanged with no data
  // migration; the editor never writes it. Left OPTIONAL with no
  // `.default()`: a default would materialise `fit: 'cover'` onto every item
  // the editor round-trips, turning an untouched config into a diff. The
  // renderer supplies the same fallback (via `resolveFraming`).
  fit: z.enum(['cover', 'contain', 'blur-pad']).optional(),
  // contain only. Absent means 'blur' (`resolveFraming`'s default) — the
  // renderer decides whether `pad` matters for the resolved `fit`.
  pad: z.enum(['blur', 'color', 'none']).optional(),
  // Used when pad === 'color'. Absent means TRANSPARENT, not black — the
  // frame's own background shows through.
  padColor: z.string().optional(),
  // contain only. Where the shot sits in the leftover space — 0=left/top,
  // 0.5=centre (default), 1=right/bottom. Deliberately NOT the same field as
  // focalX/focalY (source-window pan, independent of fit): switching `fit`
  // must be lossless in both directions, and one shared `object-position`
  // field would make a focalX authored for a `cover` crop jump the picture
  // under `contain`.
  placeX: z.number().min(0).max(1).optional(),
  placeY: z.number().min(0).max(1).optional(),
  backdropBlur: z.number().min(0).max(80).optional(),
  // Stored as DIMMING, not brightness: 0 leaves the backdrop alone, 1 is
  // black. The render inverts it once (`brightness(1 - backdropDim)`), so the
  // config reads the same direction as the editor's control and there is no
  // conversion to get backwards.
  backdropDim: z.number().min(0).max(1).optional(),
  effects: z.array(EffectSchema).optional(),
  musicBoostDb: z.number().optional(),
  // The at-the-cut boundary transitions. These carry the SHARED TransitionSchema
  // (not a permissive record): a missing required field or a bad value on a CORE
  // kind used to parse cleanly and then degrade silently to a hard cut at render
  // time, because `resolveTransition` returns null for anything it doesn't
  // recognise. That half of the guarantee is intact — a core kind is still
  // validated field by field.
  //
  // What CHANGED in Phase 4: the schema is no longer closed. A brand must be able
  // to add a transition without editing core, so an unknown kind with a valid
  // `{kind, frames}` shape now parses (shape-only). A TYPO'd kind is
  // indistinguishable from that, so it parses too — and is caught instead by the
  // dev warning at `getTransitionRecord` (lib/render/transition-record.ts), which
  // sees every record on its way to the renderer. See transition-schema.ts.
  transitionOut: TransitionSchema.optional(),
  transitionIn: TransitionSchema.optional(),
  // Per-item brand render-hint bag (e.g. a displayMode; outro style/variant).
  // Generic escape hatch — mirrors BrandLayerItemSchema.props.
  props: z.record(z.string(), z.unknown()).optional(),
};

export const VideoItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...VideoContainerBase, kind: z.literal('clip'), source: z.string(), sourceInMs: Ms, sourceOutMs: Ms }),
  z.object({ ...VideoContainerBase, kind: z.literal('broll'), source: z.string(), sourceInMs: Ms, sourceOutMs: Ms, aiGenerated: z.boolean().optional() }),
  z.object({ ...VideoContainerBase, kind: z.literal('multi-clip'), layout: z.enum(['split-h', 'split-v', 'pip', 'quad']), sources: z.array(SubSource) }),
  z.object({ ...VideoContainerBase, kind: z.literal('card'), cardKind: z.string(), cardProps: z.record(z.string(), z.unknown()).optional(), pattern: z.string().optional() }),
  // photo: a still image OR an AI i2v clip held for its own span (no trims).
  // Ken Burns rides on `effects` like broll; durationMs = endMs − startMs.
  z.object({ ...VideoContainerBase, kind: z.literal('photo'), source: z.string(), aiGenerated: z.boolean().optional() }),
  z.object({ ...VideoContainerBase, kind: z.literal('outro') }),
]);

export const AudioItemSchema = z.object({
  id: z.string(),
  ...TimeSpan,
  source: z.string(), // the audio source file
  sourceInMs: Ms, // in-point into the audio source (trim head)
  sourceOutMs: Ms.optional(), // out-point into the audio source (trim tail); absent = sourceInMs + span
  volumeDb: z.number().optional(),
  mute: z.boolean().optional(),
  fadeInMs: Ms.optional(), // linear gain ramp from item start
  fadeOutMs: Ms.optional(), // linear gain ramp into item end
  followsVideoId: z.string().optional(), // the video item this bed was derived from (for alignment; editing may detach)
  // Whether this bed's SOURCE WINDOW moves when its video is slipped
  // (⌥+drag). This is a SEPARATE promise from `followsVideoId` (which only
  // governs moving/trimming on the TIMELINE) — a talking-head's own sync
  // sound must slip with its picture or the lips desync, but narration laid
  // under b-roll must NOT move just because the b-roll's source window
  // shifts. Left OPTIONAL with no `.default()`: absence must not mean
  // `false` for every config authored before this field existed — see
  // `resolveSlipsWithVideo` in `slips-with-video.ts`, the one place that
  // resolves it (its filename-identity fallback for the absent case).
  // `/toolkit:cut` writes this explicitly for every bed it derives; only
  // pre-existing configs rely on the fallback.
  slipsWithVideo: z.boolean().optional(),
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
  // Explicit music out-point (absolute ms; music always starts at 0). Absent =
  // the bed follows the content end (meta.totalDurationMs). Once set, the reel's
  // total duration counts it like any other track end — the reel is always as
  // long as the furthest-reaching track (see computeTotalDurationMs).
  endMs: Ms.optional(),
  // Fades are first-class data (same semantics as AudioItem's) so the editor
  // can edit them and render reads them instead of hardcoded constants.
  fadeInMs: Ms.optional(),
  fadeOutMs: Ms.optional(),
});

export const LayeredReelSchema = z.object({
  version: z.literal('layered-1'),
  meta: z.object({ topic: z.string(), totalDurationMs: Ms, guidesMs: z.array(Ms).optional() }),
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
