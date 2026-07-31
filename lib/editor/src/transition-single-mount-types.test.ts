import { describe, it, expect } from 'vitest';
import {
  isTransitionNode,
  type TransitionNode,
  type TransitionPlanProps,
  type TransitionComposite,
  type LayerHandle,
  type PlateLayer,
} from '@video-toolkit/lib/theming/transitions';

// Phase 5 Task 1.1 — the single-mount contract, added ADDITIVELY.
//
// `TransitionNode` widened from `{ composite }` alone to a union with a new
// `plan` arm. Nothing renders through `plan` yet (that starts Task 1.2); this
// file pins the TYPE, not any rendering behaviour: both arms satisfy
// `TransitionNode`, `'plan' in node` narrows soundly in both directions,
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

const CompositeComponent = (_props: { from: unknown; to: unknown; progress: number }) => null;

const compositeNode: TransitionNode = {
  // `TransitionNodeProps` is the composite arm's real prop bag; the inline
  // shape above is loose on purpose — this file is about the `TransitionNode`
  // union, not re-pinning `TransitionNodeProps` itself.
  composite: CompositeComponent as never,
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

  it("narrows via 'plan' in node — plan arm", () => {
    const node: TransitionNode = planNode;
    if ('plan' in node) {
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

  it("narrows via 'plan' in node — composite arm (false branch)", () => {
    const node: TransitionNode = compositeNode;
    if ('plan' in node) {
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
