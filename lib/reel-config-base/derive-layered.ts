// deriveLayered — pure migration engine: reshapes a segment-centric reel
// config (sequential segments with relative trim points) into the
// track-native LayeredReel model (absolute-ms items across independent
// tracks). See docs/plans/... layered-timeline spec for the full model.
//
// NOTE on transitions: segments advance the cursor by their FULL derived
// duration; we do NOT subtract transitionOut overlap frames here. Real
// playback overlaps adjacent segments during a transition, so this MVP
// derivation is sequential-only ("close parity", not frame-exact) — good
// enough to seed the layered editor, not a source of playback truth.
import { segmentDurationFrames } from './duration';
import type { LayeredReel, VideoItem, AudioItem, OverlayItem } from './layered-schema';

// ---- Structural (non-Zod) input types -------------------------------------
// Deliberately permissive / structural so this module doesn't couple to any
// one template's Zod segment schemas (clip/broll/multi-clip/card/outro all
// vary slightly per template, and callers commonly build config literals
// without `as const`, which widens string-literal `type` fields to `string`).
// One flat interface covering the union of fields any segment type may
// carry; only the fields the derivation rules actually read are declared.

export interface OldOverlaySpec {
  kind: string;
  appearAt: number; // ms offset from the segment's own start
  durationMs: number;
  placement?: string;
  position?: string;
  [key: string]: unknown;
}

export interface OldSegment {
  id: string;
  type: string; // 'clip' | 'broll' | 'multi-clip' | 'card' | 'outro'
  // clip / broll
  source?: string;
  trimIn?: number;
  trimOut?: number;
  audioMode?: string; // clip: 'voice'|'silent'; broll: 'silent'|'extend-previous'|'inherit-from-clip'
  focalX?: number;
  focalY?: number;
  crop?: Record<string, unknown>;
  grade?: Record<string, unknown>;
  transitionOut?: Record<string, unknown>;
  // clip
  overlays?: OldOverlaySpec[];
  // broll
  audioSource?: string;
  audioStartSec?: number;
  aiGenerated?: boolean;
  overlay?: OldOverlaySpec; // broll / multi-clip
  // multi-clip
  layout?: string;
  sources?: Array<{ source: string; trimIn: number; trimOut: number; label?: string }>;
  durationMs?: number; // multi-clip / card
  // card
  cardKind?: string;
  cardProps?: Record<string, unknown>;
  pattern?: string;
}

export interface OldReelConfig {
  topic: string;
  chevron?: string;
  audio?: { music?: string; musicVolumeDb?: number };
  segments: OldSegment[];
}

export interface DeriveLayeredOpts {
  fps: number;
  outroFrames: number;
  chevronDurationMs?: number;
}

// ---- helpers ----------------------------------------------------------------

const msFromSec = (sec: number | undefined): number => Math.round((sec ?? 0) * 1000);

function musicBoostDbFor(type: string): number {
  if (type === 'broll') return 6;
  if (type === 'outro') return 10;
  return 0;
}

function buildVideoItem(seg: OldSegment, startMs: number, endMs: number): VideoItem {
  const musicBoostDb = musicBoostDbFor(seg.type);
  switch (seg.type) {
    case 'clip':
      return {
        id: seg.id,
        kind: 'clip',
        startMs,
        endMs,
        source: seg.source,
        sourceInMs: msFromSec(seg.trimIn),
        sourceOutMs: msFromSec(seg.trimOut),
        ...(seg.focalX !== undefined ? { focalX: seg.focalX } : {}),
        ...(seg.focalY !== undefined ? { focalY: seg.focalY } : {}),
        ...(seg.crop !== undefined ? { crop: seg.crop } : {}),
        ...(seg.grade !== undefined ? { grade: seg.grade } : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'broll':
      return {
        id: seg.id,
        kind: 'broll',
        startMs,
        endMs,
        source: seg.source,
        sourceInMs: msFromSec(seg.trimIn),
        sourceOutMs: msFromSec(seg.trimOut),
        ...(seg.focalX !== undefined ? { focalX: seg.focalX } : {}),
        ...(seg.focalY !== undefined ? { focalY: seg.focalY } : {}),
        ...(seg.crop !== undefined ? { crop: seg.crop } : {}),
        ...(seg.grade !== undefined ? { grade: seg.grade } : {}),
        ...(seg.aiGenerated !== undefined ? { aiGenerated: seg.aiGenerated } : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'multi-clip':
      return {
        id: seg.id,
        kind: 'multi-clip',
        startMs,
        endMs,
        ...(seg.layout !== undefined ? { layout: seg.layout as VideoItem['layout'] } : {}),
        ...(seg.sources !== undefined
          ? {
              sources: seg.sources.map((s) => ({
                source: s.source,
                sourceInMs: msFromSec(s.trimIn),
                sourceOutMs: msFromSec(s.trimOut),
                ...(s.label !== undefined ? { label: s.label } : {}),
              })),
            }
          : {}),
        ...(seg.transitionOut !== undefined ? { transitionOut: seg.transitionOut } : {}),
        musicBoostDb,
      };
    case 'card':
      return {
        id: seg.id,
        kind: 'card',
        startMs,
        endMs,
        ...(seg.cardKind !== undefined ? { cardKind: seg.cardKind } : {}),
        ...(seg.cardProps !== undefined ? { cardProps: seg.cardProps } : {}),
        ...(seg.pattern !== undefined ? { pattern: seg.pattern } : {}),
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
function buildOverlayItems(segId: string, videoItem: VideoItem, raw: OldOverlaySpec[]): OverlayItem[] {
  return raw.map((overlay, i) => {
    const { kind, appearAt, durationMs, placement, position, ...rest } = overlay;
    const startMs = videoItem.startMs + appearAt;
    return {
      id: raw.length === 1 ? `${segId}-ov` : `${segId}-ov-${i}`,
      startMs,
      endMs: startMs + durationMs,
      content: { kind, ...rest },
      ...(placement ?? position ? { position: placement ?? position } : {}),
      anchorVideoId: videoItem.id,
    };
  });
}

export function deriveLayered(config: OldReelConfig, opts: DeriveLayeredOpts): LayeredReel {
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
      if (audioMode === 'voice') {
        audioItems.push({
          id: `${seg.id}-audio`,
          startMs,
          endMs,
          source: seg.source ?? '',
          sourceInMs: msFromSec(seg.trimIn),
          volumeDb: 0,
        });
      }
      // 'silent' → no audio item
    } else if (seg.type === 'broll') {
      if (seg.audioMode === 'inherit-from-clip') {
        audioItems.push({
          id: `${seg.id}-audio`,
          startMs,
          endMs,
          source: seg.audioSource ?? '',
          sourceInMs: msFromSec(seg.audioStartSec),
        });
      } else if (seg.audioMode === 'extend-previous') {
        const prev = audioItems[audioItems.length - 1];
        if (prev) {
          prev.endMs = endMs;
        }
        // no previous audio item → treat as silent (no item)
      }
      // 'silent' → no audio item
    }

    // overlays (clip's overlays[] array; broll/multi-clip's single overlay)
    if (seg.type === 'clip' && seg.overlays && seg.overlays.length > 0) {
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
  // CONSTRUCTION, so brand full-span layers ([0, totalMs]) align exactly with
  // the video track end.
  const totalMs = cursorMs;

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
        { id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: totalMs },
        { id: 'brand-disclaimer', kind: 'disclaimer', startMs: 0, endMs: totalMs },
      ],
    },
  };
}
