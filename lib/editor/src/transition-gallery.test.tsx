// ONE `wipe` — the gallery must demonstrate the component reels render.
// (Phase 4 Task 2.5.)
//
// The fork this file exists to prevent: `lib/render/at-cut-transitions.tsx`
// mapped `wipe` to the TOOLKIT's own presentation while
// `lib/transitions/TransitionGallery.tsx` imported `@remotion/transitions/wipe`
// and showed THAT under the same label. Two components, one name — which is
// why the gallery would never have caught the `wipe` defect Task 2.1 fixed: it
// was never showing the broken component.
//
// THIS IS PINNED BEHAVIOURALLY, NOT BY AN IMPORT CHECK. An import assertion
// would be satisfied by a gallery that imports the right module and then
// renders something else. What follows renders both and compares the pictures.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => clock.frame,
    useVideoConfig: () => ({
      width: 1920, height: 1080, fps: 30, durationInFrames: 300,
      id: 'test', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
  };
});

import { wipe as officialWipe } from '@remotion/transitions/wipe';
import { defaultTransition } from '@video-toolkit/lib/reel-config-base/transition-schema';
import type { TransitionKind } from '@video-toolkit/lib/reel-config-base/transition-schema';
import {
  transitionNodeFor,
  fromRemotionPresentation,
  type TransitionNode,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import { TRANSITIONS, transitionMap } from '@video-toolkit/lib/transitions/TransitionGallery';

/** The gallery's composition size. Stated here rather than imported, so this
 *  file's RED is an assertion about behaviour and not a missing export. */
const GALLERY_DIMS = { width: 1920, height: 1080, fps: 30 };

/** The picture a node draws across its whole window, as one comparable string.
 *  Both inputs are inert markers, so any difference is the TRANSITION's. */
const pictureOf = (node: TransitionNode): string =>
  [0, 0.25, 0.5, 0.75, 1]
    .map((progress) => {
      const Composite = node.composite;
      const { container, unmount } = render(
        <Composite
          from={<div data-testid="a" />}
          to={<div data-testid="b" />}
          progress={progress}
          durationInFrames={40}
          width={GALLERY_DIMS.width}
          height={GALLERY_DIMS.height}
          fps={GALLERY_DIMS.fps}
          palette={[]}
          background="transparent"
        />,
      );
      const html = container.innerHTML;
      unmount();
      return `p=${progress} ${html}`;
    })
    .join('\n');

/** What a REEL draws for this kind — the production resolver, at the gallery's
 *  own dimensions and with the kind's catalog defaults. */
const reelPictureFor = (kind: TransitionKind): string =>
  pictureOf(transitionNodeFor(defaultTransition(kind) as TransitionRecord, GALLERY_DIMS)!);

type Claim = { label: string; kind?: TransitionKind; node?: TransitionNode };

// BOTH TABLES, EACH CHECKED SEPARATELY — and that separation is the point.
//
// `TRANSITIONS` is what the gallery COMPOSITION renders; `transitionMap` only
// feeds `SingleTransitionPreview`. The first version of this file derived its
// cases from `transitionMap` alone, and the original fork could still be
// reconstructed in `TRANSITIONS` (`makeNodeEntry('wipe()','wipe',40)` →
// `makeTransitionEntry('wipe()', fade(), 40)`) with every test green: the
// surviving `transitionMap` entry kept satisfying a union-shaped check. A
// per-table `it.each` is what makes each table answer for itself.
const TABLES: ReadonlyArray<readonly [string, readonly Claim[]]> = [
  ['TRANSITIONS (the gallery composition)', TRANSITIONS.map((e) => ({ label: e.name, kind: e.kind, node: e.node }))],
  [
    'transitionMap (SingleTransitionPreview)',
    Object.entries(transitionMap).map(([label, e]) => ({ label, kind: e.kind, node: e.node })),
  ],
];

describe.each(TABLES)('the gallery shows what reels render — %s', (_table, entries) => {
  /** Entries claiming a catalog kind, derived rather than hardcoded, so a
   *  second kind added to the gallery is covered the day it is added. */
  const claimed = entries.filter((e) => e.kind !== undefined);

  it('demonstrates the catalog `wipe` at all', () => {
    expect(claimed.map((e) => e.kind)).toContain('wipe');
  });

  it.each(claimed.map((e) => [e.label, e.kind!, e.node] as const))(
    '%s renders exactly the node the reel path resolves for kind "%s"',
    (_label, kind, node) => {
      expect(node).toBeDefined();
      expect(pictureOf(node!)).toBe(reelPictureFor(kind));
    },
  );
});

describe('the gallery shows what reels render', () => {
  // THE FORK ITSELF, pinned. Before Task 2.5 the gallery's `wipe` was
  // @remotion/transitions' own — a clip-path reveal with no coloured sheet —
  // while a reel drew the toolkit's two-beat sweep. If this ever passes, the
  // two have silently become the same thing and the assertion above has stopped
  // meaning anything.
  it('does NOT show @remotion/transitions/wipe, which is a different component', () => {
    const official = pictureOf(fromRemotionPresentation(officialWipe() as never));
    expect(reelPictureFor('wipe')).not.toBe(official);
  });
});
