// deriveMontageLayered — the roost beat-montage compiler: reshapes a
// beat-synced montage config (photo/video segments placed on musical beats)
// into the track-native LayeredReel model. Beats are consumed here (beat → ms)
// and survive only as meta.guidesMs ruler markers — see the layered spec.
// Sibling to deriveLayered (different input shape, same output).
import type { LayeredReel, VideoItem, OverlayItem, BrandLayerItem, Effect } from './layered-schema';

export interface MontageSegment {
  src: string;
  type: 'photo' | 'video';
  displayMode: 'full-bleed' | 'paper-frame';
  beatStart: number;
  beatCount: number;
  transition?: 'cut' | 'fade';
  inPointSec?: number;
  kenBurns?: { direction: 'in' | 'left' | 'up' };
}

export interface MontageConfig {
  fps: number;
  bpm: number;
  track: string;
  vintage?: 'film' | 'vhs' | null;
  kicks?: string;
  segments: MontageSegment[];
  teaser?: { lines: string[]; appearAtSec: number; reveal?: 'line' | 'all'; fontSize?: number } | null;
  outro: {
    style: string; variant: string; transition: string; logoDelaySec?: number; beatStart: number;
  };
  watermark: { asset: string; corner: string; variant?: string };
}

export interface MontageOpts {
  transitionFrames?: number; // outro enter crossfade
  logoRevealFrames?: number;
  logoHoldFrames?: number;
}

// Teaser on-screen frames (reveal → hold → fade), mirrored from roost's
// TeaserOverlay.teaserDurationInFrames so the derived overlay span matches.
const LINE_STAGGER_SEC = 0.35;
const TEASER_HOLD_SEC = 4.5;
const TEASER_FADE_SEC = 0.6;
function teaserFrames(numLines: number, reveal: 'line' | 'all', fps: number): number {
  const stagger = reveal === 'line' ? Math.round(LINE_STAGGER_SEC * fps) : 0;
  const lastLineStart = Math.max(0, numLines - 1) * stagger;
  return lastLineStart + Math.round(TEASER_HOLD_SEC * fps) + Math.round(TEASER_FADE_SEC * fps);
}

export function deriveMontageLayered(cfg: MontageConfig, opts: MontageOpts = {}): LayeredReel {
  const fps = cfg.fps;
  const transitionFrames = opts.transitionFrames ?? 15;
  const logoRevealFrames = opts.logoRevealFrames ?? 48;
  const logoHoldFrames = opts.logoHoldFrames ?? 60;

  const fpb = Math.round((fps * 60) / cfg.bpm);
  const framesToMs = (f: number) => Math.round((f * 1000) / fps);
  const beatToMs = (b: number) => framesToMs(b * fpb);

  const vintageEffect: Effect[] = cfg.vintage ? [{ type: 'vintage', mode: cfg.vintage }] : [];

  const video: VideoItem[] = [];
  cfg.segments.forEach((s, i) => {
    const startMs = beatToMs(s.beatStart);
    const endMs = beatToMs(s.beatStart + s.beatCount);
    const id = `seg-${String(i + 1).padStart(3, '0')}`;
    const transitionIn = s.transition === 'fade' ? { transitionIn: { kind: 'fade', frames: 6 } } : {};
    if (s.type === 'photo') {
      const effects: Effect[] = [
        ...(s.kenBurns ? [{ type: 'ken-burns', direction: s.kenBurns.direction } as Effect] : []),
        ...vintageEffect,
      ];
      video.push({
        id, kind: 'photo', startMs, endMs, source: s.src,
        props: { displayMode: s.displayMode }, ...transitionIn,
        ...(effects.length ? { effects } : {}), musicBoostDb: 0,
      });
    } else {
      const sourceInMs = Math.round((s.inPointSec ?? 0) * 1000);
      video.push({
        id, kind: 'broll', startMs, endMs, source: s.src,
        sourceInMs, sourceOutMs: sourceInMs + (endMs - startMs),
        props: { displayMode: s.displayMode }, ...transitionIn,
        ...(vintageEffect.length ? { effects: [...vintageEffect] } : {}), musicBoostDb: 0,
      });
    }
  });

  // Reel length (frames, to match RoostReel.reelDurationInFrames exactly), then → ms.
  const lastSeg = cfg.segments[cfg.segments.length - 1];
  const contentEndF = lastSeg ? (lastSeg.beatStart + lastSeg.beatCount) * fpb : 0;
  const outroFromF = cfg.outro.beatStart * fpb;
  // outroEnterF is now the CUT BOUNDARY between the last content clip and the
  // outro: the outro starts here, and (when transF > 0) the last clip's
  // transitionOut renders the burn/dissolve INTO it via the shared at-cut
  // engine (handle-borrow, centered on the cut) — not the outro's own
  // bespoke enter-transition.
  const outroEnterF = Math.min(contentEndF, outroFromF);
  const atStart = outroEnterF <= 0;
  const transF = atStart ? 0 : transitionFrames;
  // Still needed to hide the watermark before the transition into the outro
  // starts playing (on the last clip's tail), independent of where the outro
  // item itself now starts.
  const transitionStartF = Math.max(0, outroEnterF - transF);
  const logoDelayF = Math.round((cfg.outro.logoDelaySec ?? 0.5) * fps);
  // The outro's full on-screen span (logo delay + reveal + hold) now runs
  // ENTIRELY AFTER the cut boundary — the transF overlap with the last clip
  // is handled by the at-cut engine's handle-borrow, not by starting the
  // outro item early.
  const totalF = outroEnterF + logoDelayF + logoRevealFrames + logoHoldFrames;

  const transitionStartMs = framesToMs(transitionStartF);
  const outroEnterMs = framesToMs(outroEnterF);
  const totalMs = framesToMs(totalF);

  // The last content clip transitions OUT into the outro at the cut boundary
  // (real at-cut transition via the shared engine); no transitionOut when the
  // outro sits at the very front (nothing to transition from).
  if (video.length && transF > 0) {
    video[video.length - 1] = {
      ...video[video.length - 1],
      transitionOut: { kind: cfg.outro.transition, frames: transF },
    } as VideoItem;
  }

  // Parse kicks once to seconds; derive two separate paths:
  // - outroKickFrames: integer reel-global frames for per-frame heartbeat animation
  // - guidesMs: precise ruler positions (no frame quantization)
  const kickSeconds = (cfg.kicks ?? '')
    .split(',').map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n));
  const outroKickFrames = kickSeconds.map((s) => Math.round(s * fps));

  video.push({
    id: 'outro', kind: 'outro', startMs: outroEnterMs, endMs: totalMs,
    props: {
      style: cfg.outro.style, variant: cfg.outro.variant,
      logoDelaySec: cfg.outro.logoDelaySec ?? 0.5, framesPerBeat: fpb, kickFrames: outroKickFrames,
    },
    musicBoostDb: 0,
  });

  const overlays: OverlayItem[] = [];
  if (cfg.teaser?.lines?.length) {
    const startMs = Math.round((cfg.teaser.appearAtSec ?? 0) * 1000);
    const durF = teaserFrames(cfg.teaser.lines.length, cfg.teaser.reveal ?? 'line', fps);
    // The teaser is a QUOTE-PULL overlay (the generic kind), rendered per-brand —
    // roost renders it as its cream/brown stacked stack. Multi-line text lives as
    // '\n'-joined text (the quote-pull convention); reveal/fontSize ride along as
    // brand-read content fields.
    overlays.push({
      id: 'teaser', startMs, endMs: startMs + framesToMs(durF),
      content: { kind: 'text', text: cfg.teaser.lines.join('\n'), reveal: cfg.teaser.reveal ?? 'line', fontSize: cfg.teaser.fontSize ?? 96 },
    });
  }

  const brand: BrandLayerItem[] = [{
    id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: transitionStartMs,
    props: { asset: cfg.watermark.asset, corner: cfg.watermark.corner, variant: cfg.watermark.variant ?? 'black' },
  }];

  // Ruler guides = the BEAT GRID (every beat = fpb frames), NOT the kick onsets.
  // The montage cuts clips on the beat grid (a segment's beatStart is in beats →
  // beatStart·fpb frames), so the guides must be that same grid for the bars to
  // land where the clips actually cut — a cutting/alignment aid. Kick onsets are
  // irregular drum hits that generally do NOT fall on the beat grid; they live on
  // the outro item's props.kickFrames (the heartbeat pulse), not here.
  const guidesMs = Array.from({ length: Math.floor(totalF / fpb) + 1 }, (_, k) => framesToMs(k * fpb));

  return {
    version: 'layered-1',
    meta: { topic: 'Roost reel', totalDurationMs: totalMs, guidesMs },
    tracks: {
      video, audio: [], music: { source: cfg.track, baseVolumeDb: -8 }, overlays, brand,
    },
  };
}
