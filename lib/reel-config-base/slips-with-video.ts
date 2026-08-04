// `AudioItem.followsVideoId` used to carry TWO promises at once: "I move with
// this clip on the timeline" and "I slip with this clip in the source". They
// coincide for a talking head — the bed IS that shot's own sync sound, so
// slipping the picture must slip the sound with it or the lips desync. They
// DIVERGE for narration laid under b-roll: the picture is filler footage the
// editor is free to slip to choose which part shows, but the narration is an
// independent recording that must hold still or the whole reel desyncs. One
// field cannot say both things for the same item, so this module splits the
// SLIP promise out as its own optional field (`AudioItem.slipsWithVideo` in
// layered-schema.ts) and resolves it here — this is the ONE place that
// answers "does this bed slip with its video?", mirroring `resolveFraming`'s
// role for the legacy `blur-pad` alias.
//
// `followsVideoId` keeps meaning exactly what it always meant for TIMELINE
// following (move/trim in lockstep, the Link/Unlink relationship in the
// editor). Only the slip promise moves out of it.

/** Minimal shape this module needs from an audio bed. */
export interface AudioSlipLike {
  source: string;
  slipsWithVideo?: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** The basename of `path`, truncated at its FIRST dot. This is the identity
 *  rule `bedIsOwnSoundOf` compares on: a processing suffix like `.eq` (an
 *  EQ'd pass of the same recording) must not make two files read as
 *  different sources, so only stripping at the LAST dot (the extension)
 *  would wrongly treat `TH-01_t4.eq.m4a` as distinct from `TH-01_t4.mp4`.
 *  Truncating at the first dot instead collapses both to `TH-01_t4`.
 *
 *  Worked example (the real case this exists for, from
 *  `pp-program-bydleni/src/Root.tsx`):
 *    - `TH-01_t4.mp4` (picture) and `TH-01_t4.eq.m4a` (bed) → both `TH-01_t4`
 *      → same recording → the bed is that shot's own sound.
 *    - `BR-trida-miru_01_upright.mp4` (picture) and `TH-01_t4.eq.m4a` (bed,
 *      the SAME audio file as above) → `BR-trida-miru_01_upright` vs
 *      `TH-01_t4` → different → the bed is narration borrowed from a
 *      different shot. */
function sourceStem(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.indexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

/** Whether `bed` is plausibly `video`'s OWN sync sound — i.e. they were
 *  recorded together — rather than a narration track laid under unrelated
 *  footage. A BEST GUESS from filename identity, not a semantic guarantee:
 *  it exists only to answer `resolveSlipsWithVideo`'s fallback for configs
 *  written before `slipsWithVideo` existed (see there). Anything authored
 *  from now on (`/toolkit:cut`) should set `slipsWithVideo` explicitly and
 *  never depend on this guess.
 *
 *  Deliberately typed `unknown` for `video` (not `VideoItem` from
 *  layered-schema.ts) so it works across the discriminated union without
 *  every caller narrowing first — `multi-clip`, `card`, and `outro` items
 *  have no single `source` field, and for those this correctly falls through
 *  to "not the same recording" rather than a type error. */
export function bedIsOwnSoundOf(video: unknown, bed: AudioSlipLike): boolean {
  if (!isRecord(video) || typeof video.source !== 'string') return false;
  return sourceStem(video.source) === sourceStem(bed.source);
}

/** Resolves whether `bed` slips with `video` when the video is slipped
 *  (⌥+drag, `slipVideoItem` in `lib/editor/src/timeline/layered-adapter.ts`).
 *  Explicit `slipsWithVideo` always wins. ABSENT MUST NOT MEAN `false` —
 *  every config written before this field existed has no such value and its
 *  talking-head beds must keep slipping exactly as before, so absence falls
 *  through to the filename-identity guess (`bedIsOwnSoundOf`) rather than a
 *  fixed default. Same shape as `resolveFraming` absorbing the legacy
 *  `blur-pad` value: one small pure resolver, called from both the editor
 *  and (eventually) the renderer, so neither has to reimplement the
 *  fallback. */
export function resolveSlipsWithVideo(video: unknown, bed: AudioSlipLike): boolean {
  if (typeof bed.slipsWithVideo === 'boolean') return bed.slipsWithVideo;
  return bedIsOwnSoundOf(video, bed);
}
