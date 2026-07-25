// The composition + the reel DATA.
//
// There is no per-scene assembly to write: `LayeredReelComposition` (behind
// ./MinimalReel) renders every track the same way for every brand, and the theme
// contributes only look.
//
// The reel is written INLINE in `defaultProps`, not imported from another module.
// That is the convention every real project follows: Remotion Studio and the
// toolkit editor both read this literal out of the file and write edits back into
// it in place, which they can only do while it is literally here.
import React from 'react';
import { Composition } from 'remotion';
import { MinimalReel } from './MinimalReel';

const FPS = 30;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MinimalReel"
    component={MinimalReel}
    // The composition's length is DERIVED FROM THE DATA, the way every real
    // template does it: `calculateMetadata` reads `meta.totalDurationMs` off the
    // props that are actually rendered, so an edit to the timeline moves the
    // composition with it. The `durationInFrames` below is only the placeholder
    // Remotion requires on the element — calculateMetadata always overrides it.
    // (`meta.totalDurationMs` itself is kept honest by core's
    // `withTotalDuration` in lib/reel-config-base/total-duration.ts, which the
    // editor applies on every edit; recompute it with `computeTotalDurationMs`
    // if you hand-edit the tracks below.)
    calculateMetadata={({ props }: { props: { reel: { meta: { totalDurationMs: number } } } }) => ({
      durationInFrames: Math.max(60, Math.round((props.reel.meta.totalDurationMs / 1000) * FPS)),
    })}
    durationInFrames={180}
    fps={FPS}
    width={1080}
    height={1920}
    defaultProps={{
      reel: {
        version: 'layered-1',
        // Every value in this literal is a literal: `readDefaultProps` (the
        // editor's reader) accepts only the JSON grammar, so an identifier or a
        // constant here would make the file unopenable.
        meta: { topic: 'Minimal layered example', totalDurationMs: 6000 },
        tracks: {
          // ---- video: what fills the frame, back to back -------------------
          // Two `photo` items. `photo`/`clip`/`broll` are the FOOTAGE kinds:
          // core renders them itself (SegmentMedia) unless the brand registers
          // its own renderer, so a brand gets trim, crop, focal point, grade and
          // Ken Burns for free.
          video: [
            {
              id: 'v-dawn',
              kind: 'photo',
              startMs: 0,
              endMs: 3000,
              source: 'photos/dawn.jpg',
              // Effects are a generic stack, not named fields — Ken Burns is
              // just one entry a brand preset can seed.
              effects: [{ type: 'ken-burns', fromScale: 1.0, toScale: 1.14 }],
              // The transition is declared ONCE, by the item LEAVING the cut.
              // The next item borrows handle frames from this side
              // automatically, so the wipe really plays across both clips
              // instead of degrading to a fade. `color` names a brand ACCENT
              // SLOT key, never a hex — core does not own the palette.
              transitionOut: { kind: 'wipe', frames: 20, direction: 'left', color: 'accent' },
            },
            {
              id: 'v-dusk',
              kind: 'photo',
              startMs: 3000,
              endMs: 6000,
              source: 'photos/dusk.jpg',
              effects: [{ type: 'ken-burns', direction: 'in' }],
            },
          ],

          // ---- audio: voice and beds, independent of the video track --------
          // Empty here (the example ships no voiceover). A real reel puts one
          // item per narration take, optionally `followsVideoId`-linked to a clip.
          audio: [],

          // ---- music: the envelope of a bed, with no bed ----------------------
          // This example renders SILENT. There is no `source`, so nothing plays
          // and the gain/fades below are inert — they are here to show the shape
          // a real bed takes. Drop an MP3 into `public/music/` and add
          // `source: 'music/bed.mp3'` to actually hear it.
          music: { baseVolumeDb: -8, fadeInMs: 500, fadeOutMs: 800 },

          // ---- overlays: absolutely timed, free of the cuts below them -------
          // An overlay's window is its own: it may start mid-clip and outlive
          // it. `{accent:…}` is accent markup — the key resolves against the
          // brand's accentSlots at render time.
          overlays: [
            {
              id: 'o-intro',
              startMs: 400,
              endMs: 2800,
              position: 'lower-left',
              content: { kind: 'text', text: 'One timeline.\n{accent:Independent} tracks.', reveal: 'all', hide: 'fade' },
              anchorVideoId: 'v-dawn',
            },
            {
              id: 'o-outro',
              startMs: 3400,
              endMs: 5800,
              position: 'lower-left',
              content: { kind: 'text', text: 'The brand supplies\nthe {accent:look}.', reveal: 'all', hide: 'fade' },
              anchorVideoId: 'v-dusk',
            },
          ],

          // ---- brand: persistent identity, painted by the theme ---------------
          brand: [
            {
              id: 'b-mark',
              kind: 'watermark',
              startMs: 0,
              endMs: 6000,
              props: { asset: 'brand/logo.png', corner: 'top-right', sizePx: 96, alpha: 0.85 },
            },
          ],
        },
      },
    }}
  />
);
