import { describe, it, expect } from 'vitest';
import type { ComponentType } from 'react';
import {
  isTransitionNode,
  type TransitionNode,
  type TransitionPlanProps,
  type TransitionComposite,
  type LayerHandle,
  type PlateLayer,
  type TransitionNodeProps,
} from '@video-toolkit/lib/theming/transitions';

// Phase 5 Task 1.1 — the single-mount contract, added ADDITIVELY.
//
// `TransitionNode` widened from `{ composite }` alone to a union with a new
// `plan` arm. Nothing renders through `plan` yet (that starts Task 1.2); this
// file pins the TYPE, not any rendering behaviour: both arms satisfy
// `TransitionNode`, `typeof node.plan === 'function'` narrows soundly in both
// directions (NOT `'plan' in node` — see TransitionNode's own doc comment in
// lib/theming/transitions.ts: `plan?: never` is optional, so a node with an
// explicit `plan: undefined` key would take the wrong branch under `'in'`),
// supplying both `plan` and `composite` on one node does not compile, and
// `isTransitionNode` (the existing structural test) accepts both arms.

const PLAN_HANDLE: LayerHandle = { source: 'clip', range: [0, 30] };

const PLAN_COMPOSITE: TransitionComposite = {
  from: { style: { opacity: 1 } },
  to: { style: { opacity: 0 } },
};

const planNode: TransitionNode = {
  plan: (_props: TransitionPlanProps): TransitionComposite => PLAN_COMPOSITE,
};

const CompositeComponent: ComponentType<TransitionNodeProps> = (_props) => null;

const compositeNode: TransitionNode = {
  composite: CompositeComponent,
};

describe('TransitionNode — the plan/composite union (Phase 5 Task 1.1)', () => {
  it('accepts a plan-arm node', () => {
    expect(typeof planNode.plan).toBe('function');
    expect(planNode.composite).toBeUndefined();
  });

  it('accepts a composite-arm node, unchanged from before this task', () => {
    expect(typeof compositeNode.composite).toBe('function');
    expect(planNode).not.toBe(compositeNode);
  });

  it("narrows via typeof node.plan === 'function' — plan arm", () => {
    const node: TransitionNode = planNode;
    if (typeof node.plan === 'function') {
      // Narrowed: `node.plan` must be callable without a cast.
      const result = node.plan({
        from: PLAN_HANDLE,
        to: null,
        progress: 0.5,
        frame: 15,
        durationInFrames: 30,
        params: {},
        dims: { width: 1080, height: 1920, fps: 30 },
        palette: [],
        background: 'transparent',
      });
      expect(result).toBe(PLAN_COMPOSITE);
    } else {
      throw new Error('expected the plan arm to narrow true');
    }
  });

  it("narrows via typeof node.plan === 'function' — composite arm (false branch)", () => {
    const node: TransitionNode = compositeNode;
    if (typeof node.plan === 'function') {
      throw new Error('expected the composite arm to narrow false');
    } else {
      // Narrowed: `node.composite` must be callable without a cast.
      expect(typeof node.composite).toBe('function');
    }
  });

  // TYPE-LEVEL PIN. A node must supply exactly one of `plan`/`composite` — the
  // `…?: never` members on each union arm are what make this a compile error
  // instead of a silently-accepted object that picks one arm at random.
  // `@ts-expect-error` is itself an error when the line COMPILES, so this
  // fails loudly if the guarantee is lost.
  it('rejects a node supplying both plan and composite (compile-time)', () => {
    // @ts-expect-error a node must supply exactly one of `plan`/`composite`.
    const both: TransitionNode = { plan: planNode.plan, composite: CompositeComponent };
    expect(both).toBeTruthy();
  });

  // TYPE-LEVEL PIN, isolating `plan?: never` specifically (the review round
  // that found the pin above does NOT: deleting `plan?: never` alone leaves
  // every gate green, because `composite?: never` on the OTHER arm already
  // rejects a FRESH object literal supplying both keys — TypeScript's
  // excess-property leniency for literals treats a key as non-excess as long
  // as it is declared SOMEWHERE in the union, so the literal-based pin above
  // stays red for a reason that has nothing to do with `plan?: never`).
  //
  // A DECLARED (non-literal) value exposes the difference literal freshness
  // hides: ordinary structural typing tolerates a value's extra properties
  // (width subtyping), UNLESS the target type declares that key itself — and
  // `plan?: never` is exactly such a declaration on the composite arm. So a
  // declared value shaped like a composite node, whose `plan` key carries a
  // value NOT compatible with `never`, is accepted by a composite-only type
  // and rejected by this union — specifically because of `plan?: never`.
  it('rejects (compile-time) a declared composite-shaped value whose extra `plan` key is not never-compatible — isolates `plan?: never`', () => {
    const declaredValue: { composite: ComponentType<TransitionNodeProps>; plan: boolean } = {
      composite: CompositeComponent,
      plan: true,
    };
    // @ts-expect-error `plan?: never` rejects a declared value whose `plan` key is not never-compatible.
    const pinned: TransitionNode = declaredValue;
    expect(pinned).toBeTruthy();
  });

  it('isTransitionNode accepts the plan arm', () => {
    expect(isTransitionNode(planNode)).toBe(true);
  });

  it('isTransitionNode accepts the composite arm, unchanged from before this task', () => {
    expect(isTransitionNode(compositeNode)).toBe(true);
  });

  it('isTransitionNode still rejects a one-sided AnyPresentation', () => {
    const presentation = { component: CompositeComponent, props: {} };
    expect(isTransitionNode(presentation as never)).toBe(false);
  });

  // Exercises `PlateLayer` and the rest of `TransitionComposite`'s shape so a
  // future field rename shows up here, not only at a call site nobody wrote
  // yet.
  it('TransitionComposite accepts layers and post, both optional', () => {
    const full: TransitionComposite = {
      from: { style: {}, z: 0, ghosts: [{ opacity: 0.5 }] },
      to: { style: {}, wrap: ({ children }) => children as never },
      layers: [
        { key: 'plate', z: 'between', style: { background: '#000' } } satisfies PlateLayer,
      ],
      post: { filter: 'blur(2px)' },
    };
    expect(full.layers?.[0].z).toBe('between');
  });
});
