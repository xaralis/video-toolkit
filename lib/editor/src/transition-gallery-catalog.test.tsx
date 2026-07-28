// ONE TABLE, DERIVED FROM THE CATALOG (Phase 4 Task 2.6).
//
// The gallery used to hand-maintain three parallel kind→presentation tables
// (`TRANSITIONS`, `transitionMap`, `TRANSITION_NOTES`) written in camelCase
// spellings that disagreed with catalog kinds, plus a `noteFor` helper whose
// only job was reconciling the two spellings. Between them they covered 8 of
// the catalog's 21 kinds, and nothing caught them drifting further.
//
// The capability pinned here is NOT "all 21 kinds appear" — that would pass
// against a hardcoded list of 21 and pin nothing. It is that the table is
// DERIVED: a kind the catalog gains shows up in the gallery with no gallery
// edit at all.
import React from 'react';
import { describe, it, expect } from 'vitest';

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
    // Not just present in the array: the demo the gallery renders is handed
    // that same node.
    expect((entry?.render().props as { node?: TransitionNode } | undefined)?.node).toBe(fakeNode);
  });

  it('a kind with no prose falls back to its catalog label, so it still reads', () => {
    expect(entry?.note).toBe('Probe only');
  });

  it('still excludes `cut` from a fixture catalog — the exclusion is a rule, not a list', () => {
    expect(entries.map((e) => e.kind)).not.toContain('cut');
  });
});
