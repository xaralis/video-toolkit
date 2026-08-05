// lib/render/media-sync.ts — how far a media element may drift from the
// timeline before it gets pulled back.
//
// WHY THIS EXISTS. In the Player (the reel editor's preview) the timeline is
// wall-clock truth: `@remotion/player` advances the frame from
// `performance.now()` and jumps frames when the machine is too busy to draw
// them. Every media element then CHASES that frame from its own decoder — and
// Remotion only seeks an element back into place once it is further out than
// `acceptableTimeShiftInSeconds` (`use-media-playback.ts`). The default is
// 0.45s + 0.2s = **0.65s**, which is a deliberate anti-thrash margin for
// ordinary playback and far too loose for judging an edit: sound comes from
// the audio track (every video element here is `muted`), decoding an audio
// element is nearly free, and decoding 4K HEVC is not — so under load the
// picture is the one that falls behind, and up to two thirds of a second of
// it is by design.
//
// A tighter tolerance is not merely "seek sooner". A seek during playback runs
// `bufferUntilFirstFrame`, which pauses the WHOLE Player until the picture has
// caught up — so the failure mode changes from "audio runs ahead of picture"
// (silent, and it makes every cut look wrong) to "playback stutters" (obvious,
// and sync survives it). That is the trade a cutting tool wants, and it is the
// same one a hardware NLE makes.
//
// 0.15s is ~4-5 frames at 30fps, just inside the window where a lipsync error
// starts being noticeable rather than merely measurable. Tune HERE — it is one
// constant on purpose. Going much tighter buys little and costs a hitch every
// time a slow decoder slips a couple of frames.
//
// RENDER IS UNAFFECTED, in both directions: `<OffthreadVideo>` under
// `renderMedia` extracts frames exactly rather than playing an element, and
// render-time `<Audio>` is mixed by ffmpeg from the timeline. This value only
// ever reaches the preview's playback path.
export const PREVIEW_SYNC_TOLERANCE_SECONDS = 0.15;
