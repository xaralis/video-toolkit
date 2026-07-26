// Explicit React import: files under lib/theming are transformed with the classic JSX runtime under the editor's Vitest config, so `React` must be in scope.
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo } from 'remotion';
import type { VideoRenderProps } from '../types';
import { resolveGenericSource } from './media-source';

/** Item props a generic outro reads. Both optional — an outro item that names
 *  neither renders nothing (and does not throw), which is what makes this a
 *  safe default for a brand that has not registered the kind at all. */
interface GenericOutroProps {
  /** Outro video, relative to `public/` (or an absolute http(s) URL). */
  video?: string;
  /** Outro audio, relative to `public/` (or an absolute http(s) URL). */
  audio?: string;
}

/** Core's generic `outro`: an ASSET outro — play a video, play a sound.
 *
 *  This generalises campaign-reels' 10-line OutroSegment, which is the shape a
 *  brand-agnostic outro can actually have. A PROCEDURAL outro (the other brand
 *  repo animates a PNG lockup through five reveal styles, one beat-locked) is not
 *  something core can guess, and stays a brand registration — that is exactly
 *  what the extension contract is for.
 *
 *  The video is MUTED and the sound comes from a SEPARATE <Audio>, mirroring
 *  campaign-reels exactly. Do NOT "improve" this to an unmuted video: for any
 *  brand whose outro mp4 carries its own audio track, an unmuted video plus the
 *  <Audio> would double-play the sting. A brand with sound baked into the mp4
 *  simply omits `audio`... and still gets silence, which is the honest
 *  trade — it should either split the asset or register its own renderer.
 *
 *  Effects on the item are applied AROUND this by `renderVideoItemNode`
 *  (lib/render/layered-composition.tsx), so nothing is applied here. */
export const GenericOutro: React.FC<VideoRenderProps> = ({ item }) => {
  // `props` is the schema's permissive per-item render-hint bag (z.record), so
  // it is asserted to the shape this renderer reads; anything else is ignored.
  const props = (item.props ?? {}) as GenericOutroProps;
  return (
    <AbsoluteFill>
      {props.video ? <OffthreadVideo src={resolveGenericSource(props.video)} muted /> : null}
      {props.audio ? <Audio src={resolveGenericSource(props.audio)} /> : null}
    </AbsoluteFill>
  );
};
