// deriveLayered — the /cut compiler (and migration engine): reshapes a
// segment-centric reel config (the compact CUT AUTHORING format — sequential
// segments with relative trim points that /cut produces from footage, and the
// shape existing pre-layered projects were stored in) into the track-native
// LayeredReel model (absolute-ms items across independent tracks). The
// segment/cut format is a permanent authoring INPUT, not a legacy model:
// LayeredReel is the source of truth it compiles to. See the layered-timeline
// spec for the full model.
//
// NOTE on transitions: segments advance the cursor by their FULL derived
// duration; we do NOT subtract transitionOut overlap frames here. Real
// playback overlaps adjacent segments during a transition, so this
// derivation is sequential-only ("close parity", not frame-exact) — good
// enough to seed the layered editor, not a source of playback truth.
import { segmentDurationFrames } from './duration';
import type { Transition } from './transition-schema';
import type { LayeredReel, VideoItem, AudioItem, OverlayItem, Effect } from './layered-schema';

// ---- Cut authoring format — structural (non-Zod) input types --------------
// The compact segment model /cut authors and this compiler consumes.
// Deliberately permissive / structural so this module doesn't couple to any
// one template's Zod segment schemas (clip/broll/multi-clip/card/outro all
// vary slightly per template, and callers commonly build config literals
// without `as const`, which widens string-literal `type` fields to `string`).
// One flat interface covering the union of fields any segment type may
// carry; only the fields the derivation rules actually read are declared.

export interface CutOverlaySpec {
  kind: string;
  appearAt: number; // ms offset from the segment's own start
  durationMs: number;
  placement?: string;
  position?: string;
  [key: string]: unknown;
}

export interface CutSegment {
  id: string;
  type: string; // 'clip' | 'broll' | 'multi-clip' | 'card' | 'photo' | 'outro'
  // clip / broll
  source?: string;
  // photo uses `src` (not `source`) — a still image or an AI i2v clip
  src?: string;
  trimIn?: number;
  trimOut?: number;
  audioMode?: string; // clip: 'voice'|'silent'; broll: 'silent'|'extend-previous'|'inherit-from-clip'
  focalX?: number;
  focalY?: number;
  crop?: Record<string, unknown>;
  grade?: Record<string, unknown>;
  // How the media meets the frame — see VideoContainerBase in layered-schema.ts.
  // Authored per segment by /toolkit:cut when a source's orientation doesn't
  // match the composition's.
  fit?: 'cover' | 'blur-pad';
  backdropBlur?: number;
  backdropDim?: number;
  // Typed with the shared catalog, not a loose record — the layered item this
  // compiles into validates against TransitionSchema.
  transitionOut?: Transition;
  // clip
  overlays?: CutOverlaySpec[];
  // broll
  audioSource?: string;
  audioStartSec?: number;
  aiGenerated?: boolean;
  kenBurns?: Record<string, unknown>;
  blendTo?: string;
  blend?: Record<string, unknown>;
  overlay?: CutOverlaySpec; // broll / multi-clip
  // multi-clip
  layout?: string;
  sources?: Array<{ source: string; trimIn: number; trimOut: number; label?: string; zoom?: number }>;
  durationMs?: number; // multi-clip / card
  // card
  cardKind?: string;
  cardProps?: Record<string, unknown>;
  pattern?: string;
}

export interface CutConfig {
  topic: string;
  chevron?: string;
  audio?: { music?: string; musicVolumeDb?: number };
  segments: CutSegment[];
}

export interface DeriveLayeredOpts {
  fps: number;
  outroFrames: number;
  chevronDurationMs?: number;
}

// ---- helpers ----------------------------------------------------------------

const msFromSec = (sec: number | undefined): number => Math.round((sec ?? 0) * 1000);

// Per-item music-envelope contribution (dB), matching the old composition's
// per-frame `classifyFrame` rule (brand rule #30): the +6 dB "broll-silent"
// boost only applies when NO narration plays under the segment — i.e. a broll
// whose audio does NOT continue the previous clip's voice. An
// `inherit-from-clip` broll (narration still playing) gets NO boost (voice).
// Silent clips / silent multi-clips also fill the gap and get +6. Outro +10.
function musicBoostDbFor(type: string, audioMode: string | undefined): number {
  if (type === 'outro') return 10;
  // photo is always silent (a still / muted AI clip, no narration) → fill the gap.
  if (type === 'photo') return 6;
  // broll boosts unless it inherits the previous clip's narration (then voice → 0)
  if (type === 'broll') return audioMode === 'inherit-from-clip' ? 0 : 6;
  // clip / multi-clip boost only when explicitly silent (no narration)
  if (type === 'clip' || type === 'multi-clip') return audioMode === 'silent' ? 6 : 0;
  return 0;
}

function buildVideoItem(seg: CutSegment, startMs: number, endMs: number): VideoItem {
  const musicBoostDb = musicBoostDbFor(seg.type, seg.audioMode);

  // Generic clip-effects list: Ken Burns and blend are effect ENTRIES, not
  // named fields (real-NLE "clip carries a stack of effects" model — see
  // EffectSchema). Only broll segments carry these in the cut (segment) model.
  const effects: Effect[] = [];
  if (seg.type === 'broll' || seg.type === 'photo') {
    // Spread caller params FIRST, then the discriminant/target — so a stray
    // `type`/`to` key in brand-preset params can never clobber the effect kind.
    if (seg.kenBurns) effects.push({ ...seg.kenBurns, type: 'ken-burns' });
  }
  if (seg.type === 'broll') {
    if (seg.blendTo) effects.push({ ...(seg.blend ?? {}), to: seg.blendTo, type: 'blend' });
  }

  switch (seg.type) {
    case 'clip':
      return {
        id: seg.id,
        kind: 'clip',
        startMs,
        endMs,
        source: seg.source ?? '',
        sourceInMs: msFromSec(seg.trimIn),
        sourceOutMs: msFromSec(seg.trimOut),
        ...(seg.focalX !== undefined ? { focalX: seg.focalX } : {}),
        ...(seg.focalY !== undefined ? { focalY: seg.focalY } : {}),
        ...(seg.crop !== undefined ? { crop: seg.crop } : {}),
        ...(seg.grade !== undefined ? { grade: seg.grade } : {}),
        // Media fit — forwarded here, at the seam a dropped field survives
        // silently (schema still accepts it, renderer still honours it,
        // nothing else looks). Pinned by derive-layered.test.ts.
        ...(seg.fit !== undefined ? { fit: seg.fit } : {}),
        ...(seg.backdropBlur !== undefined ? { backdropBlur: seg.backdropBlur } : {}),
        ...(seg.backdropDim !== undefined ? { backdropDim: seg.backdropDim } : {}),
        ...(effects.length ? { effects } : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'broll':
      return {
        id: seg.id,
        kind: 'broll',
        startMs,
        endMs,
        source: seg.source ?? '',
        sourceInMs: msFromSec(seg.trimIn),
        sourceOutMs: msFromSec(seg.trimOut),
        ...(seg.focalX !== undefined ? { focalX: seg.focalX } : {}),
        ...(seg.focalY !== undefined ? { focalY: seg.focalY } : {}),
        ...(seg.crop !== undefined ? { crop: seg.crop } : {}),
        ...(seg.grade !== undefined ? { grade: seg.grade } : {}),
        // Media fit — forwarded here, at the seam a dropped field survives
        // silently (schema still accepts it, renderer still honours it,
        // nothing else looks). Pinned by derive-layered.test.ts.
        ...(seg.fit !== undefined ? { fit: seg.fit } : {}),
        ...(seg.backdropBlur !== undefined ? { backdropBlur: seg.backdropBlur } : {}),
        ...(seg.backdropDim !== undefined ? { backdropDim: seg.backdropDim } : {}),
        ...(seg.aiGenerated !== undefined ? { aiGenerated: seg.aiGenerated } : {}),
        ...(effects.length ? { effects } : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'multi-clip':
      return {
        id: seg.id,
        kind: 'multi-clip',
        startMs,
        endMs,
        // `layout` is required on the multi-clip union member (unlike source/
        // cardKind, which degrade to '' and still parse); a missing layout would
        // throw at parse. The cut schema makes it required, so this default is a
        // safety net that keeps derivation total.
        layout: (seg.layout ?? 'split-h') as 'split-h' | 'split-v' | 'pip' | 'quad',
        sources: (seg.sources ?? []).map((s) => ({
          source: s.source,
          sourceInMs: msFromSec(s.trimIn),
          sourceOutMs: msFromSec(s.trimOut),
          ...(s.label !== undefined ? { label: s.label } : {}),
          ...(s.zoom !== undefined ? { zoom: s.zoom } : {}),
        })),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'card':
      return {
        id: seg.id,
        kind: 'card',
        startMs,
        endMs,
        cardKind: seg.cardKind ?? '',
        ...(seg.cardProps !== undefined ? { cardProps: seg.cardProps } : {}),
        ...(seg.pattern !== undefined ? { pattern: seg.pattern } : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'photo':
      return {
        id: seg.id,
        kind: 'photo',
        startMs,
        endMs,
        // photo authors `src` (image or AI i2v clip), not `source`.
        source: seg.src ?? seg.source ?? '',
        ...(seg.focalX !== undefined ? { focalX: seg.focalX } : {}),
        ...(seg.focalY !== undefined ? { focalY: seg.focalY } : {}),
        ...(seg.crop !== undefined ? { crop: seg.crop } : {}),
        ...(seg.grade !== undefined ? { grade: seg.grade } : {}),
        // Media fit — forwarded here, at the seam a dropped field survives
        // silently (schema still accepts it, renderer still honours it,
        // nothing else looks). Pinned by derive-layered.test.ts.
        ...(seg.fit !== undefined ? { fit: seg.fit } : {}),
        ...(seg.backdropBlur !== undefined ? { backdropBlur: seg.backdropBlur } : {}),
        ...(seg.backdropDim !== undefined ? { backdropDim: seg.backdropDim } : {}),
        ...(seg.aiGenerated !== undefined ? { aiGenerated: seg.aiGenerated } : {}),
        ...(effects.length ? { effects } : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'outro':
      return {
        id: seg.id,
        kind: 'outro',
        startMs,
        endMs,
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    default:
      throw new Error(`Unknown segment type: ${seg.type}`);
  }
}

// Emits overlay items for a segment's overlay spec(s), given the segment's
// already-derived video item. `raw` is the segment's overlays for clip
// (array) or single overlay for broll/multi-clip; card/outro carry none.
function buildOverlayItems(segId: string, videoItem: VideoItem, raw: CutOverlaySpec[]): OverlayItem[] {
  return raw.map((overlay, i) => {
    const { kind, appearAt, durationMs, placement, position, ...rest } = overlay;
    // Some overlays carry no top-level appearAt — a party-logos overlay, for
    // instance, times each logo individually inside `logos[]` and the container
    // just spans the segment. Default a missing appearAt to 0 (segment start)
    // so the overlay item derives real ms, not NaN.
    const startMs = videoItem.startMs + (appearAt ?? 0);
    // The cut authoring format still calls the on-screen message overlay
    // 'quote-pull'; the layered model unifies it to the generic 'text' kind
    // (rendered per-brand). Other overlay kinds pass through unchanged.
    const modelKind = kind === 'quote-pull' ? 'text' : kind;
    return {
      id: raw.length === 1 ? `${segId}-ov` : `${segId}-ov-${i}`,
      startMs,
      endMs: startMs + durationMs,
      content: { kind: modelKind, ...rest },
      ...(placement ?? position ? { position: placement ?? position } : {}),
      anchorVideoId: videoItem.id,
    };
  });
}

export function deriveLayered(config: CutConfig, opts: DeriveLayeredOpts): LayeredReel {
  const { fps, outroFrames } = opts;

  const videoItems: VideoItem[] = [];
  const audioItems: AudioItem[] = [];
  const overlayItems: OverlayItem[] = [];

  let cursorMs = 0;
  for (const seg of config.segments) {
    const durFrames = segmentDurationFrames(seg, fps, outroFrames);
    const durMs = Math.round((durFrames / fps) * 1000);
    const startMs = cursorMs;
    const endMs = cursorMs + durMs;
    cursorMs = endMs;

    const videoItem = buildVideoItem(seg, startMs, endMs);
    videoItems.push(videoItem);

    // audio (clip / broll only — see derivation rules)
    if (seg.type === 'clip') {
      const audioMode = seg.audioMode ?? 'voice';
      if (audioMode === 'voice' && seg.source) {
        audioItems.push({
          id: `${seg.id}-audio`,
          startMs,
          endMs,
          source: seg.source,
          sourceInMs: msFromSec(seg.trimIn),
          volumeDb: 0,
          followsVideoId: seg.id,
        });
      }
      // 'silent' → no audio item; 'voice' with no/empty source → no item either
      // (avoid emitting a phantom item with source: '')
    } else if (seg.type === 'broll') {
      if (seg.audioMode === 'inherit-from-clip') {
        if (seg.audioSource) {
          audioItems.push({
            id: `${seg.id}-audio`,
            startMs,
            endMs,
            source: seg.audioSource,
            sourceInMs: msFromSec(seg.audioStartSec),
            volumeDb: 0,
            followsVideoId: seg.id,
          });
        }
        // no/empty audioSource → no item (avoid phantom source: '')
      } else if (seg.audioMode === 'extend-previous') {
        const prev = audioItems[audioItems.length - 1];
        if (prev) {
          prev.endMs = endMs;
        }
        // no previous audio item → treat as silent (no item)
      }
      // 'silent' → no audio item
    } else if (seg.type === 'multi-clip' && seg.sources && seg.sources.length > 0) {
      // Multi-clip audio behaves like broll: sound goes to the audio track,
      // bound to the clip. 'first' → sources[0] only; 'mix' → every source;
      // 'silent'/unset → none.
      if (seg.audioMode === 'first') {
        const s = seg.sources[0];
        audioItems.push({
          id: `${seg.id}-audio`, startMs, endMs,
          source: s.source, sourceInMs: msFromSec(s.trimIn), volumeDb: 0, followsVideoId: seg.id,
        });
      } else if (seg.audioMode === 'mix') {
        seg.sources.forEach((s, i) => {
          audioItems.push({
            id: `${seg.id}-audio-${i}`, startMs, endMs,
            source: s.source, sourceInMs: msFromSec(s.trimIn), volumeDb: 0, followsVideoId: seg.id,
          });
        });
      }
    }

    // overlays (clip's / photo's overlays[] array; broll/multi-clip's single overlay)
    if ((seg.type === 'clip' || seg.type === 'photo') && seg.overlays && seg.overlays.length > 0) {
      overlayItems.push(...buildOverlayItems(seg.id, videoItem, seg.overlays));
    } else if ((seg.type === 'broll' || seg.type === 'multi-clip') && seg.overlay) {
      overlayItems.push(...buildOverlayItems(seg.id, videoItem, [seg.overlay]));
    }
  }

  // Single source of truth: the reel's total duration IS where its last
  // timeline item ends. Deriving it independently (e.g. from a separate
  // Math.round(totalDurationFrames(...)/fps*1000) over the frame SUM) diverges
  // from the accumulated per-segment endMs by ±1ms due to independent
  // rounding paths — this makes last.endMs === meta.totalDurationMs hold BY
  // CONSTRUCTION.
  const totalMs = cursorMs;

  // Brand items (watermark/disclaimer) span CONTENT only — matching the old
  // composition, which wraps them in a Sequence of contentFrames (Σ non-outro
  // durations − the last content segment's transitionOut overlap), hiding
  // them during the outro stinger and its fade overlap. Find the last
  // non-outro video item and subtract its transitionOut overlap (if any); if
  // every item is an outro (no content), fall back to the full reel span.
  let lastNonOutroItem: VideoItem | undefined;
  for (let i = videoItems.length - 1; i >= 0; i--) {
    if (videoItems[i].kind !== 'outro') {
      lastNonOutroItem = videoItems[i];
      break;
    }
  }
  let contentEndMs = totalMs;
  if (lastNonOutroItem) {
    const overlapFrames = Number((lastNonOutroItem.transitionOut as { frames?: unknown } | undefined)?.frames) || 0;
    const overlapMs = overlapFrames ? Math.round((overlapFrames / fps) * 1000) : 0;
    contentEndMs = lastNonOutroItem.endMs - overlapMs;
  }

  if (config.chevron) {
    overlayItems.push({
      id: 'chevron',
      startMs: 0,
      endMs: opts.chevronDurationMs ?? 3000,
      content: { kind: 'chevron', text: config.chevron },
    });
  }

  return {
    version: 'layered-1',
    meta: { topic: config.topic, totalDurationMs: totalMs },
    tracks: {
      video: videoItems,
      audio: audioItems,
      music: {
        ...(config.audio?.music !== undefined ? { source: config.audio.music } : {}),
        baseVolumeDb: config.audio?.musicVolumeDb ?? -8,
      },
      overlays: overlayItems,
      brand: [
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: contentEndMs },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: contentEndMs },
      ],
    },
  };
}
