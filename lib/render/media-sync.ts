// lib/render/media-sync.ts — how far the PICTURE may drift from the timeline
// in preview before it gets pulled back. Audio carries no tolerance at all —
// see WHY THE ASYMMETRY below.
//
// WHY THIS EXISTS. In the Player (the reel editor's preview) the timeline is
// wall-clock truth: `@remotion/player` advances the frame from
// `performance.now()` and jumps frames when the machine is too busy to draw
// them. Every media element then CHASES that frame from its own decoder — and
// Remotion only seeks an element back into place once it is further out than
// `acceptableTimeShiftInSeconds` (`use-media-playback.ts`). The default is
// 0.45s + 0.2s = **0.65s**, a deliberate anti-thrash margin for ordinary
// playback and far too loose for judging an edit.
//
// WHY THE ASYMMETRY — sound leads, picture chases, and only one of them may be
// re-leashed. Every video element here is `muted`; what the ear judges comes
// from the audio track. Decoding an audio element is nearly free, so audio
// barely drifts in the first place — there is close to nothing to correct.
// 4K HEVC is not free to decode, so under load the PICTURE is the one that
// falls behind, by design up to two thirds of a second at the default. The
// correction itself is asymmetric too: Remotion pulls a lagging element back
// into place by SEEKING it, and a seek in an audio element is audible — a
// gap or a click, right at the moment the user is trying to judge the cut. A
// seek in a video element is not audible at all (it's muted) and merely
// redraws a frame. So tightening the tolerance on audio buys nothing (there
// is barely any drift to correct) and costs the one artefact a user can hear;
// tightening it on video buys real, visible sync and costs only a redraw.
// Concretely: `<Audio>` call sites (the voice track, the music bed, the
// outro's own audio) pass NO `acceptableTimeShiftInSeconds` at all, so
// Remotion's own default governs them exactly as it would any other
// `<Audio>`. `<OffthreadVideo>` call sites (a clip/broll/photo's picture, the
// outro's video) carry the tightened constant below.
//
// A tighter tolerance is not merely "seek sooner". A seek during playback runs
// `bufferUntilFirstFrame`, which pauses the WHOLE Player until the picture has
// caught up — so the failure mode changes from "picture trails audio" (silent,
// and it makes every cut look wrong) to "playback stutters" (obvious, and sync
// survives it). That is the trade a cutting tool wants, and it is the same one
// a hardware NLE makes — but it is a trade video can afford and audio cannot.
//
// 0.3s is ~9 frames at 30fps: still under half of Remotion's 0.65s default
// (so it is a real tightening, not a no-op — see the "otherwise it changes
// nothing" test), but well clear of the couple of frames a merely-busy
// decoder slips on its own, so ordinary playback does not trigger a seek
// every few seconds. This constant was 0.15 until a user-reported regression
// (audio dropping out during preview playback) traced back to the SAME
// tolerance also sitting on every `<Audio>` element — 0.15 is tight enough
// that even audio's tiny drift crossed it under load, and every correction
// was an audible seek. Tune HERE, in one direction only now that audio has no
// knob of its own:
//   - picture and sound visibly apart (lipsync drifts) ⇒ lower this value.
//   - playback hitches/stutters on a slower machine ⇒ raise this value, or —
//     the real remedy, still unstarted — decode a lower-resolution proxy for
//     preview instead of the full 4K source, so the picture stops falling
//     behind in the first place.
//
// RENDER IS UNAFFECTED, in both directions: `<OffthreadVideo>` under
// `renderMedia` extracts frames exactly rather than playing an element, and
// render-time `<Audio>` is mixed by ffmpeg from the timeline. This value only
// ever reaches the preview's playback path.
export const PREVIEW_VIDEO_SYNC_TOLERANCE_SECONDS = 0.3;
