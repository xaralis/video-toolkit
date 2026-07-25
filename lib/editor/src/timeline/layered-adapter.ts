import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

export interface TLAction { id: string; start: number; end: number; effectId: string; movable?: boolean; flexible?: boolean; }
export interface TLRow { id: string; actions: TLAction[]; }

// Display order, top → bottom (NLE convention): overlays highest, then video
// and its audio directly stacked, then the music bed, then brand marks.
export const LANES = ['overlays', 'video', 'transitions', 'audio', 'music', 'brand'] as const;
export type LaneId = (typeof LANES)[number];
const MS = 1000;
const TRANSITION_PREFIX = 'transition:';

export function parseActionId(actionId: string): { lane: LaneId; id: string } {
  if (actionId.startsWith(TRANSITION_PREFIX)) {
    return { lane: 'transitions', id: actionId.slice(TRANSITION_PREFIX.length) };
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
  // video track, and each adjacent pair A→B where A carries a non-`cut`
  // transitionOut gets one centered block on the cut (A.endMs === B.startMs).
  const vids = reel.tracks.video;
  const transitions: TLAction[] = [];
  for (let i = 0; i < vids.length - 1; i++) {
    const A = vids[i];
    const t = A.transitionOut as { kind?: string; frames?: number } | undefined;
    if (!t?.kind || t.kind === 'cut' || !t.frames) continue;
    // start/end are in SECONDS like every other lane (act() divides by MS).
    const cut = A.endMs;
    const halfMs = Math.round((t.frames / 2 / fps) * 1000);
    transitions.push({ id: `${TRANSITION_PREFIX}${A.id}`, start: Math.max(0, cut - halfMs) / MS, end: (cut + halfMs) / MS, effectId: t.kind });
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
  return {
    ...reel,
    tracks: {
      ...reel.tracks,
      video: reel.tracks.video.map((v) => patch('video', v)),
      overlays: reel.tracks.overlays.map((o) => patch('overlays', o)),
      audio: reel.tracks.audio.map((a) => patch('audio', a)),
      brand: reel.tracks.brand.map((b) => patch('brand', b)),
    },
  };
}
