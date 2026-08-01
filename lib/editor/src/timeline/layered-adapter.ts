import type { LayeredReel, VideoItem, AudioItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import { withTotalDuration } from '@video-toolkit/lib/reel-config-base/total-duration';
import {
  isCut,
  CUT_KIND,
  transitionAlignmentOf,
  transitionHandles,
} from '@video-toolkit/lib/reel-config-base/transition-schema';

export interface TLAction { id: string; start: number; end: number; effectId: string; movable?: boolean; flexible?: boolean; minStart?: number; }
export interface TLRow { id: string; actions: TLAction[]; }

// Display order, top → bottom (NLE convention): overlays highest, then video
// and its audio directly stacked, then the music bed, then brand marks.
// Display order, top → bottom. Transitions sit ABOVE video so the video track
// and its (linked) audio stay adjacent as one visual group.
export const LANES = ['overlays', 'transitions', 'video', 'audio', 'music', 'brand'] as const;
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
  // NB: source in/out bounds are NOT applied here as action.minStart/maxEnd —
  // those constrain MOVES too (a broll with sourceInMs 0 couldn't move left at
  // all). They're enforced only during RESIZE, via onActionResizing in
  // LayeredTimeline; moving a clip is always free.
  const video = reel.tracks.video.map((v) => act('video', v.id, v.startMs, v.endMs, `video-${v.kind}`));
  const overlays = reel.tracks.overlays.map((o) => {
    const kind = (o.content as { kind?: string }).kind ?? 'overlay';
    return act('overlays', o.id, o.startMs, o.endMs, `overlay-${kind}`);
  });
  const audio = reel.tracks.audio.map((a) => act('audio', a.id, a.startMs, a.endMs, 'audio'));
  const brand = reel.tracks.brand.map((b) => act('brand', b.id, b.startMs, b.endMs, `brand-${b.kind}`));
  // Music is a single base layer (not an item array) — show it as one block
  // anchored at 0. Its right edge is its explicit out-point when set (a trimmed
  // bed), else it follows the content end. The block is end-trimmable in the
  // timeline; its move + left edge stay locked (music always starts at 0).
  const music: TLAction[] = [act('music', 'base', 0, reel.tracks.music.endMs ?? reel.meta.totalDurationMs, 'music')];
  // Transitions are a derived "at-the-cut" view: clips stay butted on the
  // video track. Every item's non-`cut` transitionOut gets one block on its cut
  // — including the LAST item, whose transitionOut is a closing fade to the
  // composition background rather than into a following clip. The FIRST item's
  // non-`cut` transitionIn gets one opening block anchored at time 0 (a fade in
  // from the background). Together this makes the lane a view of every
  // transition edge in the reel, not just adjacent-pair cuts.
  //
  // WHERE the block sits comes from `transitionHandles` — the SAME decider the
  // renderer's `computeVideoLayout` uses (lib/render/video-track-layout.ts), so
  // a boundary authored `alignment: 'start'` or `'end'` is DRAWN where it is
  // RENDERED. This lane used to reimplement the split as an unconditional
  // `[cut - frames/2, cut + frames/2]`, which was silently wrong off `center`.
  const vids = reel.tracks.video;
  const transitions: TLAction[] = [];
  const framesToMs = (f: number) => Math.round((f / fps) * 1000);
  for (let i = 0; i < vids.length; i++) {
    const item = vids[i];
    if (i === 0) {
      const tin = item.transitionIn as { kind?: string; frames?: number } | undefined;
      // `!isCut(tin)` implies a truthy `kind`, but a predicate over `unknown`
      // cannot carry that back into the narrowing — hence the assertions below.
      if (!isCut(tin) && tin?.frames) {
        // No alignment split at a reel EDGE: the renderer zeroes the handle
        // there (isFirst/isLast in computeVideoLayout), so the transition plays
        // over the item's own opening frames whatever its alignment says.
        transitions.push({ id: `${TRANSITION_IN_PREFIX}${item.id}`, start: 0, end: framesToMs(tin.frames) / MS, effectId: tin.kind! });
      }
    }
    const t = item.transitionOut as { kind?: string; frames?: number } | undefined;
    if (isCut(t) || !t?.frames) continue;
    // start/end are in SECONDS like every other lane (act() divides by MS).
    const cut = item.endMs;
    const { before, after } = transitionHandles(t.frames, transitionAlignmentOf(t));
    transitions.push({
      id: `${TRANSITION_PREFIX}${item.id}`,
      start: Math.max(0, cut - framesToMs(before)) / MS,
      end: (cut + framesToMs(after)) / MS,
      effectId: t.kind!,
    });
  }
  return {
    editorData: [
      ...packLane('overlays', overlays),
      { id: 'transitions', actions: transitions },
      { id: 'video', actions: video },
      ...packLane('audio', audio),
      { id: 'music', actions: music },
      ...packLane('brand', brand),
    ],
  };
}

// The lane a (possibly sub-row) row id belongs to: 'overlays#1' → 'overlays'.
export function laneOfRow(rowId: string): LaneId {
  const hash = rowId.indexOf('#');
  return (hash === -1 ? rowId : rowId.slice(0, hash)) as LaneId;
}

// Pack a lane's items into as many sub-rows as needed so nothing overlaps within
// a row (greedy interval partitioning): items that overlap in time land on
// separate rows instead of hiding each other. The FIRST sub-row keeps the bare
// lane id (so the header labels it); extras get `${lane}#1`, `${lane}#2`, …
// Action ids are unchanged (`lane:itemId`), so edits still resolve by lane.
function packLane(lane: LaneId, actions: TLAction[]): TLRow[] {
  if (actions.length === 0) return [{ id: lane, actions: [] }];
  const sorted = [...actions].sort((a, b) => a.start - b.start);
  const rows: TLAction[][] = [];
  for (const a of sorted) {
    const row = rows.find((r) => r[r.length - 1].end <= a.start + 1e-6);
    if (row) row.push(a);
    else rows.push([a]);
  }
  return rows.map((acts, i) => ({ id: i === 0 ? lane : `${lane}#${i}`, actions: acts }));
}

// The COMMIT-time footage cap for a video item's RIGHT trim edge, or undefined
// for "no cap". A single-source video (clip OR broll) can't be trimmed past the
// end of its real file — its decoded duration is the cap. (A config sourceOutMs
// that overshoots the real file is DRIFT, not extra footage: ffprobe is the
// truth, so we cap at the decoded duration for both.) Only sources with no
// intrinsic duration (a still image / generated broll) decode to 0 and are
// naturally uncapped. multi-clip / card / outro have no single trim source.
export function clipFootageCapMs(item: VideoItem, decodedMs: number | undefined): number | undefined {
  if (item.kind !== 'clip' && item.kind !== 'broll') return undefined;
  return decodedMs && decodedMs > 0 ? decodedMs : undefined;
}

// Real-time resize bounds (ms) for a clip/broll edge, fed to the timeline as the
// action's minStart/maxEnd so the handle HARD-STOPS at the boundary during the
// drag (instead of overshooting and snapping back on release). Left bound: the
// source head (startMs - sourceInMs) — you can't reveal footage before frame 0.
// Right bound: the nearer of the real footage end and the next clip's start —
// you can't invent frames past the file, and clips can't overlap. Clip and broll
// are treated identically: a broll's max length is its footage, same as a clip.
// A source with no decoded duration (a still image) has no footage bound → it's
// limited only by the next clip (or unbounded when it's the last item).
export function resizeBoundsMs(
  item: VideoItem,
  decodedMs: number | undefined,
  nextStartMs: number | undefined,
): { minStartMs: number; maxEndMs?: number } | null {
  if (item.kind !== 'clip' && item.kind !== 'broll') return null;
  const footageEndMs = decodedMs && decodedMs > 0 ? item.startMs + (decodedMs - item.sourceInMs) : undefined;
  const rights: number[] = [];
  if (footageEndMs !== undefined) rights.push(footageEndMs);
  if (nextStartMs !== undefined) rights.push(nextStartMs);
  return { minStartMs: item.startMs - item.sourceInMs, maxEndMs: rights.length ? Math.min(...rights) : undefined };
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
// extend a clip left past its source start (nothing new there). The out-point
// stays <= the real footage duration (`footageMs`, when known) — you can't pull
// the right edge past the end of the media. Both are CLAMPS, not vetoes: the
// resize always proceeds, the edge just stops at the media boundary. (An
// absolute min/max veto in the timeline UI misfires whenever the block's
// endMs drifts past its footage — e.g. a config sourceOutMs that overshoots the
// real file — locking the whole clip.) Multi-clip / card / outro have no single
// trim, and a move (both edges) is span-only.
function resizeVideoItem(item: VideoItem, np: { startMs: number; endMs: number }, footageMs?: number): VideoItem {
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
  const rawOut = Math.max(item.sourceInMs + 100, item.sourceOutMs + dEnd);
  const sourceOutMs = footageMs && footageMs > 0 ? Math.min(footageMs, rawOut) : rawOut; // can't pass the footage end
  return { ...item, endMs: item.startMs + (sourceOutMs - item.sourceInMs), sourceOutMs };
}

// An audio edge resize is trim-linked exactly like a clip: the left edge moves
// the in-point (clamped >= 0, so you can't reveal audio before the source
// start), the right edge moves the out-point. `sourceOutMs` is optional in the
// schema (legacy beds have only an in-point) — fall back to sourceInMs + span.
// A move (both edges change) slides the whole bed, leaving the trim untouched.
function resizeAudioItem(item: AudioItem, np: { startMs: number; endMs: number }): AudioItem {
  const dStart = np.startMs - item.startMs;
  const dEnd = np.endMs - item.endMs;
  if (dStart === 0 && dEnd === 0) return item;
  if (dStart !== 0 && dEnd !== 0) return { ...item, startMs: np.startMs, endMs: np.endMs };
  if (dStart !== 0) {
    const applied = Math.min(Math.max(dStart, -item.sourceInMs), item.endMs - item.startMs - 100);
    return { ...item, startMs: item.startMs + applied, sourceInMs: item.sourceInMs + applied };
  }
  const curOut = item.sourceOutMs ?? item.sourceInMs + (item.endMs - item.startMs);
  const sourceOutMs = Math.max(item.sourceInMs + 100, curOut + dEnd);
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
    audio: reel.tracks.audio.map((a) => {
      if (a.id !== id) return shift(a);
      const np = newMs('audio', a.id);
      return np ? resizeAudioItem(a, np) : a;
    }),
    brand: reel.tracks.brand.map((b) => (b.id === id ? spanApplied(b, newMs('brand', b.id)) : shift(b))),
  };
  return withTotalDuration({ ...reel, tracks });
}

// Ripple MOVE (a drag in ripple mode): the clip goes where you put it and every
// item behind it comes along by the same delta, so the rest of the reel keeps
// its relative timing. This is the one meaning the Ripple switch has — "does
// the rest of the track follow my edit?" — applied to a drag exactly as it is
// to a resize. Ripple OFF is the ordinary NLE overwrite drag: only the grabbed
// clip moves.
//
// This REPLACES a slot-based insert (re-order by where the clip's centre landed,
// then re-butt the whole track). That is Final Cut's magnetic timeline, not
// Premiere's or Resolve's, and it made two thirds of all drags a SILENT no-op:
// any drag too small to cross a neighbour's centre, and every rightward drag of
// the LAST clip, since there is no slot beyond it to insert into.
//
// The one thing a drag may not do is overlap what is already there, so a
// leftward drag stops at the previous clip's end (0 for the first clip, which
// is what keeps a gap at the head recoverable). Rightward is unbounded: opening
// a gap is a legitimate edit, and it is undoable by dragging back.
//
// Linked audio is realigned afterwards by relinkAudio, which re-derives every
// bound bed from its clip's delta — so the beds are deliberately not shifted
// here beyond the plain downstream carry.
function rippleMove(reel: LayeredReel, movedId: string, newStartMs: number): LayeredReel {
  const vids = reel.tracks.video;
  const idx = vids.findIndex((v) => v.id === movedId);
  if (idx < 0) return reel;
  const moved = vids[idx];
  const floor = idx > 0 ? vids[idx - 1].endMs : 0;
  const delta = Math.max(newStartMs, floor) - moved.startMs;
  if (delta === 0) return reel;
  // "Behind it" is measured against the clip's ORIGINAL end, so the carried set
  // is decided before anything moves.
  const carried = (item: { id: string; startMs: number }) => item.id === movedId || item.startMs >= moved.endMs;
  const shift = <T extends { id: string; startMs: number; endMs: number }>(item: T): T =>
    carried(item) ? { ...item, startMs: item.startMs + delta, endMs: item.endMs + delta } : item;
  return {
    ...reel,
    tracks: {
      ...reel.tracks,
      video: vids.map(shift),
      audio: reel.tracks.audio.map(shift),
      overlays: reel.tracks.overlays.map(shift),
      brand: reel.tracks.brand.map(shift),
    },
  };
}

// Snap a dragged item's edges to the nearest beat guide within `thresholdMs`.
// A MOVE (both edges shifted by the same delta) snaps whichever edge lands
// closest to a beat and preserves the span; a TRIM snaps only the edge that
// actually moved. Returns `raw` unchanged when nothing is within range — this is
// snap-ON-RELEASE (the commit seam), since xzdarcy can't take custom live snap
// points. `beats`/`thresholdMs` empty/absent → caller passes no snapMs → no-op.
export function snapEdgesToBeats(
  orig: { startMs: number; endMs: number },
  raw: { startMs: number; endMs: number },
  beats: number[],
  thresholdMs: number,
): { startMs: number; endMs: number } {
  if (beats.length === 0 || thresholdMs <= 0) return raw;
  const nearest = (ms: number): number | null => {
    let best: number | null = null;
    let bestD = thresholdMs;
    for (const b of beats) {
      const d = Math.abs(b - ms);
      if (d <= bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  };
  const startMoved = raw.startMs !== orig.startMs;
  const endMoved = raw.endMs !== orig.endMs;
  const isMove = startMoved && endMoved && raw.startMs - orig.startMs === raw.endMs - orig.endMs;
  if (isMove) {
    const span = raw.endMs - raw.startMs;
    const snapS = nearest(raw.startMs);
    const snapE = nearest(raw.endMs);
    const dS = snapS === null ? Infinity : Math.abs(snapS - raw.startMs);
    const dE = snapE === null ? Infinity : Math.abs(snapE - raw.endMs);
    if (dS === Infinity && dE === Infinity) return raw;
    return dS <= dE ? { startMs: snapS!, endMs: snapS! + span } : { startMs: snapE! - span, endMs: snapE! };
  }
  // Trim: snap only the edge that moved.
  let s = raw.startMs;
  let e = raw.endMs;
  if (startMoved) {
    const b = nearest(raw.startMs);
    if (b !== null) s = b;
  }
  if (endMoved) {
    const b = nearest(raw.endMs);
    if (b !== null) e = b;
  }
  return { startMs: s, endMs: e };
}

export function applyTimelineChange(
  reel: LayeredReel,
  rows: TLRow[],
  opts: {
    ripple?: boolean;
    footageMsById?: Record<string, number>;
    snapMs?: number[];
    snapThresholdMs?: number;
    /** Decoded duration of the music source (ms) — caps the music end-trim. */
    musicMaxMs?: number;
  } = {},
): LayeredReel {
  const byId = new Map<string, TLAction>();
  for (const r of rows) for (const a of r.actions) byId.set(a.id, a);
  // Original edges per action, so a drag/resize can be snapped to the beat grid
  // (needs to know which edge moved, and the pre-drag span).
  const origById = new Map<string, { startMs: number; endMs: number }>();
  for (const v of reel.tracks.video) origById.set(`video:${v.id}`, { startMs: v.startMs, endMs: v.endMs });
  for (const a of reel.tracks.audio) origById.set(`audio:${a.id}`, { startMs: a.startMs, endMs: a.endMs });
  for (const o of reel.tracks.overlays) origById.set(`overlays:${o.id}`, { startMs: o.startMs, endMs: o.endMs });
  for (const b of reel.tracks.brand) origById.set(`brand:${b.id}`, { startMs: b.startMs, endMs: b.endMs });
  origById.set('music:base', { startMs: 0, endMs: reel.tracks.music.endMs ?? reel.meta.totalDurationMs });
  const snap = opts.snapMs && opts.snapMs.length > 0 && (opts.snapThresholdMs ?? 0) > 0;
  const newMs: NewMs = (lane, id) => {
    const a = byId.get(`${lane}:${id}`);
    if (!a) return null;
    const raw = { startMs: Math.round(a.start * MS), endMs: Math.round(a.end * MS) };
    if (!snap) return raw;
    const orig = origById.get(`${lane}:${id}`);
    return orig ? snapEdgesToBeats(orig, raw, opts.snapMs!, opts.snapThresholdMs!) : raw;
  };

  // Music bed end-trim: the bed is pinned at 0, so only a right-edge change is
  // honored (a left-handle drag or move springs back on commit). The new
  // out-point is clamped to a minimum length and, when the source's decoded
  // duration is known, to the real end of the audio file.
  const music = (() => {
    const m = reel.tracks.music;
    const np = newMs('music', 'base');
    if (!np) return m;
    const curEnd = m.endMs ?? reel.meta.totalDurationMs;
    if (np.endMs === curEnd) return m;
    let endMs = Math.max(100, np.endMs);
    if (opts.musicMaxMs && opts.musicMaxMs > 0) endMs = Math.min(endMs, opts.musicMaxMs);
    return { ...m, endMs };
  })();
  const reelM = music === reel.tracks.music ? reel : { ...reel, tracks: { ...reel.tracks, music } };

  // Trim-linked resize: a clip's left edge reveals earlier footage (clamped at
  // the source start), the right edge extends its out-point (clamped at the
  // real footage end, when its duration is known).
  const resolvedVideo = reelM.tracks.video.map((v) => {
    const np = newMs('video', v.id);
    return np ? resizeVideoItem(v, np, opts.footageMsById?.[v.id]) : v;
  });

  if (opts.ripple) {
    // Ripple MOVE (drag): a video clip whose BOTH edges shifted is a move, not a
    // trim — it carries everything behind it. Trims fall through to applyRipple.
    const moved = reelM.tracks.video.find((v) => {
      const np = newMs('video', v.id);
      return np && np.startMs !== v.startMs && np.endMs !== v.endMs;
    });
    if (moved) {
      const np = newMs('video', moved.id)!;
      return withTotalDuration(relinkAudio(reelM, rippleMove(reelM, moved.id, np.startMs)));
    }
    const rippled = applyRipple(reelM, resolvedVideo, newMs);
    if (rippled) return withTotalDuration(relinkAudio(reelM, rippled));
  }

  // Butt adjacent video clips (model B: clips don't overlap). If a clip's start
  // was dragged left over the previous clip, trim the PREVIOUS clip's end to
  // this clip's start — so it really ends earlier instead of dangling at full
  // length, and its transitionOut marker re-derives at the new cut.
  const video = resolvedVideo.map((v, i) => {
    const next = resolvedVideo[i + 1];
    return next && next.startMs > v.startMs && next.startMs < v.endMs ? { ...v, endMs: next.startMs } : v;
  });
  const result: LayeredReel = {
    ...reelM,
    tracks: {
      ...reelM.tracks,
      video,
      overlays: reelM.tracks.overlays.map((o) => spanApplied(o, newMs('overlays', o.id))),
      // Audio is trim-linked like a clip (in/out-point move with the edges).
      audio: reelM.tracks.audio.map((a) => {
        const np = newMs('audio', a.id);
        return np ? resizeAudioItem(a, np) : a;
      }),
      brand: reelM.tracks.brand.map((b) => spanApplied(b, newMs('brand', b.id))),
    },
  };
  return withTotalDuration(relinkAudio(reelM, result));
}

// Keep every BOUND audio bed (followsVideoId set) locked to its video: NLE-style
// linked audio. After the edit is applied, any bed whose video moved/trimmed is
// re-derived from the ORIGINAL bed by the video's exact delta (trim-linked, so
// the in/out-point rides along). This carries the audio through moves, trims AND
// ripple shifts in one place. A bed whose video didn't change is left as the
// pipeline produced it (so a direct audio drag or a ripple shift still stands);
// an unbound bed (followsVideoId cleared — the explicit unlink) is never touched.
function relinkAudio(orig: LayeredReel, result: LayeredReel): LayeredReel {
  const vOrig = new Map(orig.tracks.video.map((v) => [v.id, v]));
  const vNew = new Map(result.tracks.video.map((v) => [v.id, v]));
  const audio = result.tracks.audio.map((a, i) => {
    if (!a.followsVideoId) return a;
    const o = vOrig.get(a.followsVideoId);
    const n = vNew.get(a.followsVideoId);
    if (!o || !n) return a;
    const dStart = n.startMs - o.startMs;
    const dEnd = n.endMs - o.endMs;
    if (dStart === 0 && dEnd === 0) return a; // video unchanged → keep the pipeline result
    const base = orig.tracks.audio[i]; // re-derive from the original bed, not the pipeline copy
    return resizeAudioItem(base, { startMs: base.startMs + dStart, endMs: base.endMs + dEnd });
  });
  return { ...result, tracks: { ...result.tracks, audio } };
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
      tracks: { ...reel.tracks, video: reel.tracks.video.map((v) => (v.id === id ? { ...v, [field]: { kind: CUT_KIND } } : v)) },
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
  return withTotalDuration({ ...reel, tracks });
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

  const left: VideoItem = { ...v, endMs: atMs, sourceOutMs: cut, transitionOut: { kind: CUT_KIND } };
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
  return withTotalDuration({ ...reel, tracks: { ...reel.tracks, video, audio } });
}
