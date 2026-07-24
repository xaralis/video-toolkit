// The shared at-the-cut VIDEO TRACK assembly — lifted verbatim (see
// lib/render/README.md) from campaign-reels' LayeredCampaignReel.tsx
// `videoNodes` map so campaign and roost consume one copy of the handle-borrow
// math that makes real cross-transitions render. The pure layout math lives in
// ./video-track-layout (no Remotion import there, so it can be unit-tested in
// core — same split as ./transition-record / ./at-cut-transitions); this
// module adds the JSX assembly (buildVideoNodes) and re-exports the pure
// function so consumers can import everything from one path.
import React from 'react';
import { Sequence } from 'remotion';
import { AtCutTransition, presentationFor } from './at-cut-transitions';
import { computeVideoLayout, type VideoLayoutEntry } from './video-track-layout';
import type { VideoItem } from '../reel-config-base/layered-schema';

export { computeVideoLayout, type VideoLayoutEntry };

// The JSX assembly — one <Sequence> per video-track item, each wrapped in its
// own AtCutTransition per computeVideoLayout's handle math. Skips items whose
// seqDuration <= 0 (returns null for them), matching LayeredCampaignReel.tsx's
// `if (normalDuration <= 0) return null` guard.
export function buildVideoNodes(
  items: VideoItem[],
  opts: {
    renderItem: (item: VideoItem, handles: { inHalf: number; outHalf: number }) => React.ReactNode;
    width: number;
    height: number;
    fps: number;
  },
): React.ReactNode[] {
  const layout = computeVideoLayout(items, opts.fps);

  return items.map((item, i) => {
    const entry = layout[i];
    if (entry.seqDuration <= 0) return null;

    const inPresentation = presentationFor(entry.inRecord, { width: opts.width, height: opts.height });
    const outPresentation = presentationFor(entry.outRecord, { width: opts.width, height: opts.height });

    return (
      <Sequence key={item.id} from={entry.seqFrom} durationInFrames={entry.seqDuration} name={item.id}>
        <AtCutTransition
          inPresentation={inPresentation}
          inFrames={entry.inFrames}
          outPresentation={outPresentation}
          outFrames={entry.outFrames}
          seqDurationF={entry.seqDuration}
        >
          {opts.renderItem(item, { inHalf: entry.inHalf, outHalf: entry.outHalf })}
        </AtCutTransition>
      </Sequence>
    );
  });
}
