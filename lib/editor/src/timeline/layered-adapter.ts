import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

export interface TLAction { id: string; start: number; end: number; effectId: string; movable?: boolean; flexible?: boolean; }
export interface TLRow { id: string; actions: TLAction[]; }

// Display order, top → bottom (NLE convention): overlays highest, then video
// and its audio directly stacked, then the music bed, then brand marks.
export const LANES = ['overlays', 'video', 'transitions', 'audio', 'music', 'brand'] as const;
export type LaneId = (typeof LANES)[number];
const MS = 1000;
const TRANSITION_PREFIX = 'transition:';
const TRANSITION_IN_PREFIX = 'transition-in:';

export function parseActionId(actionId: string): { lane: LaneId; id: string; edge?: 'in' | 'out' } {
  // Check transition-in: first — it's a distinct prefix (not a suffix
  // extension of transition:), but ordering here keeps the intent explicit.
  if (actionId.startsWith(TRANSITION_IN_PREFIX)) {
    return { lane: 'transitions', id: actionId.slice(TRANSITION_IN_PREFIX.length), edge: 'in' };
  }
  if (actionId.startsWith(TRANSITION_PREFIX)) {
    return { lane: 'transitions', id: actionId.slice(TRANSITION_PREFIX.length), edge: 'out' };
  }
  const i = actionId.indexOf(':');
  return { lane: actionId.slice(0, i) as LaneId, id: actionId.slice(i + 1) };
}

export function layeredToTimeline(reel: LayeredReel, fps: number): { editorData: TLRow[] } {
  const act = (lane: LaneId, id: string, startMs: number, endMs: number, effectId: string): TLAction => ({
    id: `${lane}:${id}`, start: startMs / MS, end: endMs / MS, effectId,
  });
  const video = reel.tracks.video.map((v) => act('video', v.id, v.startMs, v.endMs, `video-${v.kind}`));
  const overlays = reel.tracks.overlays.map((o) => {
    const kind = (o.content as { kind?: string }).kind ?? 'overlay';
    return act('overlays', o.id, o.startMs, o.endMs, `overlay-${kind}`);
  });
  const audio = reel.tracks.audio.map((a) => act('audio', a.id, a.startMs, a.endMs, 'audio'));
  const brand = reel.tracks.brand.map((b) => act('brand', b.id, b.startMs, b.endMs, `brand-${b.kind}`));
  // Music is a single base layer (not an item array) — show it as one block
  // spanning the reel. Its derived envelope + editing is sub-spec 3, so it is
  // display-only here (locked in the timeline).
  const music: TLAction[] = [act('music', 'base', 0, reel.meta.totalDurationMs, 'music')];
  // Transitions are a derived "at-the-cut" view: clips stay butted on the
  // video track. Every item's non-`cut` transitionOut gets one centered block
  // on its cut — including the LAST item, whose transitionOut is a closing
  // fade to the coal background rather than into a following clip. The FIRST
  // item's non-`cut` transitionIn gets one opening block anchored at time 0
  // (a fade in from coal). Together this makes the lane a unified view of
  // every transition edge in the reel, not just adjacent-pair cuts.
  const vids = reel.tracks.video;
  const transitions: TLAction[] = [];
  for (let i = 0; i < vids.length; i++) {
    const item = vids[i];
    if (i === 0) {
      const tin = item.transitionIn as { kind?: string; frames?: number } | undefined;
      if (tin?.kind && tin.kind !== 'cut' && tin.frames) {
        const halfMs = Math.round((tin.frames / 2 / fps) * 1000);
        transitions.push({ id: `${TRANSITION_IN_PREFIX}${item.id}`, start: 0, end: (halfMs * 2) / MS, effectId: tin.kind });
      }
    }
    const t = item.transitionOut as { kind?: string; frames?: number } | undefined;
    if (!t?.kind || t.kind === 'cut' || !t.frames) continue;
    // start/end are in SECONDS like every other lane (act() divides by MS).
    const cut = item.endMs;
    const halfMs = Math.round((t.frames / 2 / fps) * 1000);
    transitions.push({ id: `${TRANSITION_PREFIX}${item.id}`, start: Math.max(0, cut - halfMs) / MS, end: (cut + halfMs) / MS, effectId: t.kind });
  }
  return {
    editorData: [
      { id: 'overlays', actions: overlays },
      { id: 'video', actions: video },
      { id: 'transitions', actions: transitions },
      { id: 'audio', actions: audio },
      { id: 'music', actions: music },
      { id: 'brand', actions: brand },
    ],
  };
}

export function applyTimelineChange(reel: LayeredReel, rows: TLRow[]): LayeredReel {
  const byId = new Map<string, TLAction>();
  for (const r of rows) for (const a of r.actions) byId.set(a.id, a);
  const patch = <T extends { id: string; startMs: number; endMs: number }>(lane: LaneId, item: T): T => {
    const a = byId.get(`${lane}:${item.id}`);
    if (!a) return item;
    return { ...item, startMs: Math.round(a.start * MS), endMs: Math.round(a.end * MS) };
  };
  const video0 = reel.tracks.video.map((v) => patch('video', v));
  // Butt adjacent video clips (model B: clips don't overlap). If a clip's start
  // was dragged left over the previous clip, trim the PREVIOUS clip's end to
  // this clip's start — so it really ends earlier instead of dangling at full
  // length, and its transitionOut marker re-derives at the new cut.
  const video = video0.map((v, i) => {
    const next = video0[i + 1];
    return next && next.startMs > v.startMs && next.startMs < v.endMs ? { ...v, endMs: next.startMs } : v;
  });
  return {
    ...reel,
    tracks: {
      ...reel.tracks,
      video,
      overlays: reel.tracks.overlays.map((o) => patch('overlays', o)),
      audio: reel.tracks.audio.map((a) => patch('audio', a)),
      brand: reel.tracks.brand.map((b) => patch('brand', b)),
    },
  };
}
