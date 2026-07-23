import type { LayeredReel, VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

export interface TLAction { id: string; start: number; end: number; effectId: string; movable?: boolean; flexible?: boolean; minStart?: number; }
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
  const video = reel.tracks.video.map((v) => {
    const a = act('video', v.id, v.startMs, v.endMs, `video-${v.kind}`);
    // A clip/broll left handle can't extend before its source start — the
    // earliest start is where sourceInMs would reach 0 (no footage before it).
    if (v.kind === 'clip' || v.kind === 'broll') a.minStart = Math.max(0, v.startMs - v.sourceInMs) / MS;
    return a;
  });
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

// Time-bearing tracks a ripple edit shifts (music is a single spanning layer;
// transitions are derived from clip positions).
const RIPPLE_LANES = ['video', 'overlays', 'audio', 'brand'] as const;

type NewMs = (lane: LaneId, id: string) => { startMs: number; endMs: number } | null;

function spanApplied<T extends { startMs: number; endMs: number }>(item: T, np: { startMs: number; endMs: number } | null): T {
  return np ? { ...item, startMs: np.startMs, endMs: np.endMs } : item;
}

// A clip/broll edge resize moves the SOURCE trim with it (linked 1:1) so you
// reveal new footage instead of a freeze; the in-point stays >= 0 — you can't
// extend a clip left past its source start (nothing new there). Multi-clip /
// card / outro have no single trim, and a move (both edges) is span-only.
function resizeVideoItem(item: VideoItem, np: { startMs: number; endMs: number }): VideoItem {
  const dStart = np.startMs - item.startMs;
  const dEnd = np.endMs - item.endMs;
  if (dStart === 0 && dEnd === 0) return item;
  if ((item.kind !== 'clip' && item.kind !== 'broll') || (dStart !== 0 && dEnd !== 0)) {
    return { ...item, startMs: np.startMs, endMs: np.endMs };
  }
  if (dStart !== 0) {
    const applied = Math.min(Math.max(dStart, -item.sourceInMs), item.endMs - item.startMs - 100); // clamp in>=0 and keep >0 duration
    return { ...item, startMs: item.startMs + applied, sourceInMs: item.sourceInMs + applied };
  }
  const sourceOutMs = Math.max(item.sourceInMs + 100, item.sourceOutMs + dEnd);
  return { ...item, endMs: item.startMs + (sourceOutMs - item.sourceInMs), sourceOutMs };
}

// Ripple edit: resizing ONE clip's edge shifts every item beyond it (across all
// time-bearing tracks) so the timeline stays butted — END → right, START →
// left. `resolvedVideo` carries the trim-adjusted video; other tracks use their
// raw new spans. Returns null when the change wasn't a single-edge resize (a
// move / no-op), so the caller falls back to the normal per-item mapping.
function applyRipple(reel: LayeredReel, resolvedVideo: VideoItem[], newMs: NewMs): LayeredReel | null {
  const resolvedById = new Map(resolvedVideo.map((v) => [v.id, v]));
  const spanOf = (lane: LaneId, id: string): { startMs: number; endMs: number } | null =>
    lane === 'video' ? resolvedById.get(id) ?? null : newMs(lane, id);

  let edit: { edge: 'start' | 'end'; anchor: number; delta: number; id: string } | null = null;
  for (const lane of RIPPLE_LANES) {
    for (const item of reel.tracks[lane]) {
      const np = spanOf(lane, item.id);
      if (!np) continue;
      const dStart = np.startMs - item.startMs;
      const dEnd = np.endMs - item.endMs;
      if (dStart === 0 && dEnd === 0) continue;
      if (dStart === 0 && dEnd !== 0) edit = { edge: 'end', anchor: item.endMs, delta: dEnd, id: item.id };
      else if (dEnd === 0 && dStart !== 0) edit = { edge: 'start', anchor: item.startMs, delta: dStart, id: item.id };
      break; // a move (both edges changed) leaves edit null → normal fallback
    }
    if (edit) break;
  }
  if (!edit) return null;

  const { edge, id } = edit;
  let delta = edit.delta;
  const affects = (item: { id: string; startMs: number; endMs: number }) =>
    item.id !== id && (edge === 'end' ? item.startMs >= edit.anchor : item.endMs <= edit.anchor);

  // A leftward start-ripple must not push any item's start below 0 — clamp it.
  if (edge === 'start' && delta < 0) {
    let minStart = Infinity;
    for (const lane of RIPPLE_LANES) for (const item of reel.tracks[lane]) if (affects(item)) minStart = Math.min(minStart, item.startMs);
    if (minStart !== Infinity) delta = Math.max(delta, -minStart);
  }

  const shift = <T extends { id: string; startMs: number; endMs: number }>(item: T): T =>
    affects(item) ? { ...item, startMs: item.startMs + delta, endMs: item.endMs + delta } : item;

  const tracks = {
    ...reel.tracks,
    video: reel.tracks.video.map((v) => (v.id === id ? resolvedById.get(v.id) ?? v : shift(v))),
    overlays: reel.tracks.overlays.map((o) => (o.id === id ? spanApplied(o, newMs('overlays', o.id)) : shift(o))),
    audio: reel.tracks.audio.map((a) => (a.id === id ? spanApplied(a, newMs('audio', a.id)) : shift(a))),
    brand: reel.tracks.brand.map((b) => (b.id === id ? spanApplied(b, newMs('brand', b.id)) : shift(b))),
  };
  const totalMs = Math.max(0, ...tracks.video.map((v) => v.endMs));
  return { ...reel, meta: { ...reel.meta, totalDurationMs: totalMs }, tracks };
}

export function applyTimelineChange(reel: LayeredReel, rows: TLRow[], opts: { ripple?: boolean } = {}): LayeredReel {
  const byId = new Map<string, TLAction>();
  for (const r of rows) for (const a of r.actions) byId.set(a.id, a);
  const newMs: NewMs = (lane, id) => {
    const a = byId.get(`${lane}:${id}`);
    return a ? { startMs: Math.round(a.start * MS), endMs: Math.round(a.end * MS) } : null;
  };

  // Trim-linked resize: a clip's left edge reveals earlier footage (clamped at
  // the source start), the right edge extends its out-point.
  const resolvedVideo = reel.tracks.video.map((v) => {
    const np = newMs('video', v.id);
    return np ? resizeVideoItem(v, np) : v;
  });

  if (opts.ripple) {
    const rippled = applyRipple(reel, resolvedVideo, newMs);
    if (rippled) return rippled;
  }

  // Butt adjacent video clips (model B: clips don't overlap). If a clip's start
  // was dragged left over the previous clip, trim the PREVIOUS clip's end to
  // this clip's start — so it really ends earlier instead of dangling at full
  // length, and its transitionOut marker re-derives at the new cut.
  const video = resolvedVideo.map((v, i) => {
    const next = resolvedVideo[i + 1];
    return next && next.startMs > v.startMs && next.startMs < v.endMs ? { ...v, endMs: next.startMs } : v;
  });
  return {
    ...reel,
    tracks: {
      ...reel.tracks,
      video,
      overlays: reel.tracks.overlays.map((o) => spanApplied(o, newMs('overlays', o.id))),
      audio: reel.tracks.audio.map((a) => spanApplied(a, newMs('audio', a.id))),
      brand: reel.tracks.brand.map((b) => spanApplied(b, newMs('brand', b.id))),
    },
  };
}

// Delete the selected timeline item. A video clip also removes its bound audio
// item; a transition marker just clears the clip's transitionOut/In (→ cut). In
// ripple mode the gap is closed (items after the removed clip shift left by its
// duration); otherwise a gap is left. Returns the reel unchanged if not found.
export function deleteItem(reel: LayeredReel, selectedId: string, opts: { ripple?: boolean } = {}): LayeredReel {
  const { lane, id, edge } = parseActionId(selectedId);

  if (lane === 'transitions') {
    const field = edge === 'in' ? 'transitionIn' : 'transitionOut';
    return {
      ...reel,
      tracks: { ...reel.tracks, video: reel.tracks.video.map((v) => (v.id === id ? { ...v, [field]: { kind: 'cut' } } : v)) },
    };
  }
  if (lane === 'music') return reel; // the single music bed isn't deletable

  const track = reel.tracks[lane] as ReadonlyArray<{ id: string; startMs: number; endMs: number }>;
  const item = track.find((x) => x.id === id);
  if (!item) return reel;
  const gap = item.endMs - item.startMs;

  const removeIds = new Set<string>([id]);
  if (lane === 'video') for (const a of reel.tracks.audio) if (a.followsVideoId === id) removeIds.add(a.id);

  const prune = <T extends { id: string; startMs: number; endMs: number }>(arr: T[]): T[] =>
    arr
      .filter((x) => !removeIds.has(x.id))
      .map((x) => (opts.ripple && x.startMs >= item.endMs ? { ...x, startMs: x.startMs - gap, endMs: x.endMs - gap } : x));

  const tracks = {
    ...reel.tracks,
    video: prune(reel.tracks.video),
    overlays: prune(reel.tracks.overlays),
    audio: prune(reel.tracks.audio),
    brand: prune(reel.tracks.brand),
  };
  const totalMs = Math.max(0, ...tracks.video.map((v) => v.endMs));
  return { ...reel, meta: { ...reel.meta, totalDurationMs: totalMs }, tracks };
}

// Split (razor) a clip/broll at the playhead into two butted pieces, each with
// its own trim window. The bound audio item is split at the same point. The
// right piece inherits the outgoing transition (the left gets a hard cut at the
// split); the opening transitionIn stays on the left. No-op if the playhead
// isn't inside the clip, or the item isn't a single-source clip/broll.
export function splitItem(reel: LayeredReel, selectedId: string, atFrame: number, fps: number): LayeredReel {
  const { lane, id } = parseActionId(selectedId);
  if (lane !== 'video') return reel;
  const idx = reel.tracks.video.findIndex((v) => v.id === id);
  if (idx < 0) return reel;
  const v = reel.tracks.video[idx];
  if (v.kind !== 'clip' && v.kind !== 'broll') return reel;
  const atMs = Math.round((atFrame / fps) * 1000);
  if (atMs <= v.startMs + 1 || atMs >= v.endMs - 1) return reel; // playhead not inside
  const leftDur = atMs - v.startMs;
  const rightId = `${v.id}-b`;
  const cut = v.sourceInMs + leftDur;

  const left: VideoItem = { ...v, endMs: atMs, sourceOutMs: cut, transitionOut: { kind: 'cut' } };
  const right: VideoItem = { ...v, id: rightId, startMs: atMs, sourceInMs: cut, transitionIn: undefined };

  const video = [...reel.tracks.video.slice(0, idx), left, right, ...reel.tracks.video.slice(idx + 1)];

  const audio = reel.tracks.audio.flatMap((a) => {
    if (a.followsVideoId !== id || atMs <= a.startMs || atMs >= a.endMs) return [a];
    return [
      { ...a, endMs: atMs },
      { ...a, id: `${a.id}-b`, startMs: atMs, sourceInMs: a.sourceInMs + (atMs - a.startMs), followsVideoId: rightId },
    ];
  });

  return { ...reel, tracks: { ...reel.tracks, video, audio } };
}

// Duplicate the selected video clip: insert a copy right after it (with its
// bound audio), shifting everything after right by the clip's duration to make
// room. No-op for non-video selections.
export function duplicateItem(reel: LayeredReel, selectedId: string): LayeredReel {
  const { lane, id } = parseActionId(selectedId);
  if (lane !== 'video') return reel;
  const src = reel.tracks.video.find((v) => v.id === id);
  if (!src) return reel;
  const dur = src.endMs - src.startMs;
  const at = src.endMs;
  const shift = <T extends { startMs: number; endMs: number }>(arr: T[]): T[] =>
    arr.map((x) => (x.startMs >= at ? { ...x, startMs: x.startMs + dur, endMs: x.endMs + dur } : x));

  const shiftedVideo = shift(reel.tracks.video);
  const srcIdx = shiftedVideo.findIndex((v) => v.id === id);
  const copy: VideoItem = { ...src, id: `${id}-copy`, startMs: at, endMs: at + dur };
  const video = [...shiftedVideo.slice(0, srcIdx + 1), copy, ...shiftedVideo.slice(srcIdx + 1)];

  const boundAudio = reel.tracks.audio.find((a) => a.followsVideoId === id);
  const audio = shift(reel.tracks.audio);
  if (boundAudio) {
    audio.push({ ...boundAudio, id: `${boundAudio.id}-copy`, startMs: at, endMs: at + (boundAudio.endMs - boundAudio.startMs), followsVideoId: `${id}-copy` });
  }
  const totalMs = Math.max(0, ...video.map((v) => v.endMs));
  return { ...reel, meta: { ...reel.meta, totalDurationMs: totalMs }, tracks: { ...reel.tracks, video, audio } };
}
