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
import { layeredCompositionProps } from '@video-toolkit/lib/render/layered-composition-props';
import { MinimalReel } from './MinimalReel';
import { ConformanceReel } from './ConformanceReel';
import { TransitionProbeCompositions } from './TransitionMatrix';

export const RemotionRoot: React.FC = () => (
  <>
  <Composition
    // The composition's length is DERIVED FROM THE DATA, the way every real
    // template does it: `layeredCompositionProps` supplies a `calculateMetadata`
    // that reads `meta.totalDurationMs` off the props that are actually
    // rendered, so an edit to the timeline moves the composition with it.
    // (`meta.totalDurationMs` itself is kept honest by core's
    // `withTotalDuration` in lib/reel-config-base/total-duration.ts, which the
    // editor applies on every edit; recompute it with `computeTotalDurationMs`
    // if you hand-edit the tracks below.)
    {...layeredCompositionProps({
      id: 'MinimalReel',
      component: MinimalReel,
      fps: 30,
      width: 1080,
      height: 1920,
    })}
    defaultProps={{
      reel: {
        version: 'layered-1',
        // Every value in this literal is a literal: `readDefaultProps` (the
        // editor's reader) accepts only the JSON grammar, so an identifier or a
        // constant here would make the file unopenable.
        meta: { topic: 'Minimal layered example', totalDurationMs: 13500 },
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
              // automatically, so a transition really plays ACROSS both clips
              // instead of degrading to a fade on one of them. `color` names a
              // brand ACCENT SLOT key, never a hex — core does not own the
              // palette.
              //
              // WHAT THIS ACTUALLY RENDERS, since a comment claiming otherwise
              // is worse than none: since Phase 4 Task 2.1 `wipe` is a native
              // TWO-INPUT node and plays its two beats in SEQUENCE — the accent
              // sheet sweeps in over `v-dawn` across the first half of the
              // window, then sweeps out off `v-dusk` across the second. It used
              // to be a known defect (both beats over the same window, entering
              // on top, so the frame flashed to the accent colour on the
              // transition's first frame); the before/after is graded in
              // docs/superpowers/phase4-migrations.md, and the old measurements
              // are in docs/superpowers/at-cut-transition-findings.md.
              //
              // Left as-is deliberately: this literal is also the still gate's
              // fixture, and its window is frames 80-100 (see CONSTRAINTS.md).
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
            // The three kinds core draws GENERICALLY without any brand
            // renderer: multi-clip, card and outro. This theme registers no
            // `video` renderers at all, so everything below is core's own —
            // recoloured only through `tokens` in ./theme.tsx.
            {
              id: 'v-compare',
              kind: 'multi-clip',
              startMs: 6000,
              endMs: 9000,
              layout: 'split-h',
              sources: [
                { source: 'photos/dawn.jpg', sourceInMs: 0, sourceOutMs: 3000, label: 'DAWN' },
                { source: 'photos/dusk.jpg', sourceInMs: 0, sourceOutMs: 3000, label: 'DUSK' },
              ],
            },
            {
              id: 'v-claim',
              kind: 'card',
              startMs: 9000,
              endMs: 12000,
              // `cardKind` is OPEN: core implements 'claim-plate' and draws
              // background-only for any name it doesn't know, so a brand can
              // name its own plates without core changing.
              cardKind: 'claim-plate',
              cardProps: { lines: ['One timeline.', 'Every kind', 'renders'] },
              pattern: 'grid',
            },
            {
              id: 'v-outro',
              kind: 'outro',
              startMs: 12000,
              endMs: 13500,
              // The generic outro is an ASSET outro: a muted video plus a
              // separate audio file. A brand wanting a PROCEDURAL outro
              // registers its own renderer instead.
              props: { video: 'brand/outro.mp4', audio: 'brand/outro.mp3' },
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
              endMs: 13500,
              props: { asset: 'brand/logo.png', corner: 'top-right', sizePx: 96, alpha: 0.85 },
            },
          ],
        },
      },
    }}
  />
  {/* At-cut transition probes — one composition per catalog kind per direction.
      Registration only; nothing here can change what MinimalReel renders. */}
  <TransitionProbeCompositions />
  {/* Phase 4 Task 6.2 — the CONFORMANCE fixture: a SEPARATE composition, its
      own theme (./conformance-theme.tsx) and its own reel literal, exercising
      all six extension axes with a deliberately non-core look. Additive only
      — MinimalReel above and the pixel harness's own inputs are untouched. */}
  <Composition
    {...layeredCompositionProps({
      id: 'ConformanceReel',
      component: ConformanceReel,
      fps: 30,
      width: 1080,
      height: 1920,
    })}
    defaultProps={{
      reel: {
        version: 'layered-1',
        meta: { topic: 'Phase 4 conformance fixture', totalDurationMs: 6000 },
        tracks: {
          video: [
            {
              id: 'v-photo',
              kind: 'photo',
              startMs: 0,
              endMs: 3000,
              // A BARE filename, deliberately: core's own resolveMediaSource
              // leaves 'photo' unprefixed (see lib/theming/media-source.ts),
              // so this resolves to a real asset ONLY because the theme's
              // AXIS 6 registration (resolveMediaSource) prefixes it —
              // remove that registration and this item points at a file that
              // does not exist.
              source: 'dawn.jpg',
              // AXIS 3 — both effect scopes on the same item: 'glitch-frame'
              // (scope: 'clip', wraps the whole item) and 'ghost-echo'
              // (scope: 'media', builds a second media element).
              effects: [{ type: 'glitch-frame' }, { type: 'ghost-echo' }],
              // AXIS 5 — the brand-authored transition kind, WITH its
              // registered param ('teeth') authored to a non-default value.
              transitionOut: { kind: 'shard-cut', frames: 18, teeth: 9 },
            },
            {
              id: 'v-card',
              kind: 'card',
              startMs: 3000,
              endMs: 6000,
              // AXIS 1 — a registered video kind: this renders through
              // ConformanceCard, never core's GenericCard.
              cardKind: 'claim-plate',
              cardProps: { lines: ['Six axes.', 'One theme.'] },
            },
          ],
          audio: [],
          music: { baseVolumeDb: -8 },
          overlays: [
            {
              id: 'o-badge',
              startMs: 400,
              endMs: 2800,
              // AXIS 2 — a non-'text' kind, routed 'anchored' by the theme's
              // registration, drawn via the item-level `render` escape hatch.
              content: { kind: 'badge', label: 'BRAND' },
              anchorVideoId: 'v-photo',
            },
          ],
          brand: [
            {
              id: 'b-sticker',
              // AXIS 4 — a brand-layer renderer replacing core's generic for
              // an existing kind. (Not a THIRD kind name — see the CONTRACT
              // FINDING in conformance-theme.tsx: BrandLayerItemSchema.kind
              // is a closed 2-literal enum, so a schema-valid literal here
              // cannot name one core has never heard of.)
              kind: 'disclaimer',
              startMs: 0,
              endMs: 6000,
              props: { text: 'v6.2' },
            },
          ],
        },
      },
    }}
  />
  </>
);
