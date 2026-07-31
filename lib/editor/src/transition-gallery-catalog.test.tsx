// ONE TABLE, DERIVED FROM THE CATALOG (Phase 4 Task 2.6).
//
// The gallery used to hand-maintain three parallel kind→presentation tables
// (`TRANSITIONS`, `transitionMap`, `TRANSITION_NOTES`) written in camelCase
// spellings that disagreed with catalog kinds, plus a `noteFor` helper whose
// only job was reconciling the two spellings. Between them they covered 8 of
// the catalog's 20 kinds, and nothing caught them drifting further.
//
// The capability pinned here is NOT "all 20 kinds appear" — that would pass
// against a hardcoded list of 20 and pin nothing. It is that the table is
// DERIVED: a kind the catalog gains shows up in the gallery with no gallery
// edit at all.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

// Fix round 1 (Task 2.1 review, Important 1): `NodeTransitionDemo` now goes
// through `buildVideoNodes` — a real Remotion assembly — instead of
// forwarding a pre-resolved node as a prop, so exercising its render path
// (below) needs the same `Sequence` mock every other suite touching
// `buildVideoNodes` uses (the REAL `Sequence` calls `useVideoConfig()`
// internally in a way overriding the hook alone does not satisfy outside a
// registered `<Composition>` — jsdom has none).
vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  const react = await import('react');
  const Offset = react.createContext(0);

  const Sequence: React.FC<{
    from?: number;
    durationInFrames?: number;
    layout?: 'none' | 'absolute-fill';
    children?: React.ReactNode;
  }> = ({ from = 0, durationInFrames = Number.POSITIVE_INFINITY, children }) => {
    const parentOffset = react.useContext(Offset);
    const offset = parentOffset + from;
    const local = clock.frame - offset;
    if (local < 0 || local >= durationInFrames) return null;
    return react.createElement(Offset.Provider, { value: offset }, children);
  };

  return {
    ...actual,
    Sequence,
    useCurrentFrame: () => clock.frame - react.useContext(Offset),
    useVideoConfig: () => ({
      width: 1920, height: 1080, fps: 30, durationInFrames: 300, id: 'test', defaultProps: {}, props: {},
    }),
    staticFile: (s: string) => s,
  };
});

import {
  TRANSITION_CATALOG,
  isCut,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import type { TransitionKind } from '@video-toolkit/lib/reel-config-base/transition-schema';
import type { TransitionNode, TransitionNodeProps } from '@video-toolkit/lib/render/at-cut-transitions';
import {
  TRANSITIONS,
  transitionMap,
  buildGalleryEntries,
  GALLERY_DIMS,
} from '@video-toolkit/lib/transitions/TransitionGallery';

/** Every kind the gallery is expected to demonstrate: the catalog, minus `cut`
 *  — which is the ABSENCE of a transition (`resolveTransition` returns null for
 *  it by design), so there is no component to show. Derived from the catalog,
 *  not listed, so this expectation moves with it. */
const DEMONSTRABLE = TRANSITION_CATALOG.map((e) => e.kind).filter((k) => !isCut(k));

describe('the gallery covers the whole catalog', () => {
  it('has something to exclude — `cut` really is a catalog kind', () => {
    expect(TRANSITION_CATALOG.map((e) => e.kind)).toContain('cut');
    expect(DEMONSTRABLE.length).toBe(TRANSITION_CATALOG.length - 1);
  });

  it('TRANSITIONS (the gallery composition) demonstrates every demonstrable kind', () => {
    expect([...TRANSITIONS.map((e) => e.kind)].sort()).toEqual([...DEMONSTRABLE].sort());
  });

  it('transitionMap (SingleTransitionPreview) is keyed by catalog kind, same coverage', () => {
    expect(Object.keys(transitionMap).sort()).toEqual([...DEMONSTRABLE].sort());
  });
});

// THE ACTUAL CAPABILITY. The three tests above would pass against a hardcoded
// list of the 20 kinds that exist today — they measure COVERAGE, not
// derivation. What follows uses a kind that exists ONLY in this file's fixture,
// so the only way for it to appear in the gallery is for the gallery to read
// the catalog it is given.
//
// The fake kind arrives with a renderer through the same seam a BRAND kind
// does (`dims.transitions`, the transition registry), because a kind with no
// renderer is not a new kind — it is a broken one, and `galleryTransitionNode`
// is supposed to throw for it.
describe('the gallery table is DERIVED, not listed', () => {
  const FAKE = 'probe-only-kind' as TransitionKind;
  const fakeNode: TransitionNode = {
    composite: (_props: TransitionNodeProps) => <div data-testid="fake-transition" />,
  };
  const dimsWithFake = {
    ...GALLERY_DIMS,
    transitions: { [FAKE]: { renderer: () => fakeNode } },
  };

  const entries = buildGalleryEntries(
    [...TRANSITION_CATALOG, { kind: FAKE, label: 'Probe only' }],
    dimsWithFake,
  );
  const entry = entries.find((e) => e.kind === FAKE);

  it('a kind the catalog gains appears with NO gallery edit', () => {
    expect(entries.map((e) => e.kind)).toContain(FAKE);
  });

  it('and it appears with the node ITS OWN renderer resolved', () => {
    expect(entry?.node).toBe(fakeNode);
    // Not just present in the array: the demo the gallery ACTUALLY RENDERS
    // resolves through the SAME registry — `entry.node` alone would also be
    // satisfied by a demo that silently re-resolved through core's kinds
    // instead of the fixture's `dimsWithFake.transitions` (this is exactly
    // the fix round 1 regression: `NodeTransitionDemo` no longer takes a
    // pre-resolved `node` prop, it re-resolves via `buildVideoNodes`, so the
    // registry has to reach that call too — see `NodeTransitionDemo`'s own
    // `dims` prop). Rendering and finding the fixture's own marker is what
    // proves the registry-fed resolution actually ran, not merely that
    // `galleryTransitionNode` (used only to populate `entry.node`) can see it.
    // Frame 90 is the cut point itself (`sceneADuration`, the default 90
    // frames, converted to ms and back) — inside the boundary window under
    // any alignment, so the live composite is guaranteed to be mounted.
    clock.frame = 90;
    const { container } = render(<>{entry?.render()}</>);
    expect(container.querySelectorAll('[data-testid="fake-transition"]').length).toBeGreaterThan(0);
  });

  it('a kind with no prose falls back to its catalog label, so it still reads', () => {
    expect(entry?.note).toBe('Probe only');
  });

  it('still excludes `cut` from a fixture catalog — the exclusion is a rule, not a list', () => {
    expect(entries.map((e) => e.kind)).not.toContain('cut');
  });
});
