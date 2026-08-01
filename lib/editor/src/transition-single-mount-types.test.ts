import { describe, it, expect } from 'vitest';
import {
  isTransitionNode,
  type TransitionNode,
  type TransitionPlanProps,
  type TransitionComposite,
  type LayerHandle,
  type PlateLayer,
} from '@video-toolkit/lib/theming/transitions';

// Phase 5 Task 1.1 widened `TransitionNode` from a single shape to a
// `{ plan } | { composite }` union, ADDITIVELY, so every existing
// `{ composite }` node kept type-checking unchanged. Phase 5 Task 5 narrows
// it back down to the single `{ plan }` shape now that Stages 2-4 migrated
// every catalog kind off `composite` and the arm itself (the boundary
// Sequence + `AtCutTransition`'s composite branch, `lib/render/
// video-track.tsx` / `at-cut-transitions.tsx`) is deleted.
//
// EVERY TEST THAT USED TO EXERCISE THE UNION IS DELETED, NOT ADAPTED —
// deliberately, and each is named here so it is clear none of them "stopped
// failing" quietly:
//
//   - "accepts a composite-arm node, unchanged from before this task" — a
//     `{ composite }` object literal no longer satisfies `TransitionNode` at
//     all; there is nothing left to accept.
//   - "narrows via typeof node.plan === 'function' — composite arm (false
//     branch)" — there is no longer a `composite` arm for the `typeof`
//     narrowing to route to; `node.plan` is now a required, non-optional
//     field, so the `false` branch this test exercised is unreachable for any
//     value that type-checks as a `TransitionNode` at all.
//   - "rejects a node supplying both plan and composite (compile-time)" and
//     its "isolates `plan?: never`" companion — both pinned that a FRESH or
//     DECLARED object literal supplying both `plan` and `composite` keys is
//     rejected. `TransitionNode` is a plain interface now, not a union, so
//     there is no `composite` key to declare in the first place: TypeScript
//     rejects `{ plan, composite }` today for the ordinary reason (excess
//     property on a fresh literal / no such member on a declared type), not
//     because of a `…?: never` guard that no longer exists. The capability
//     these two tests pinned — "a node cannot legally supply both arms" — is
//     moot once there is only one arm to supply.
//   - "isTransitionNode accepts the composite arm, unchanged from before this
//     task" — `isTransitionNode` no longer checks for a `composite` field
//     (see its own updated doc comment in lib/theming/transitions.ts); there
//     is no composite-shaped value left for it to accept.
//
// What survives is the plan arm's own behaviour (unaffected by the
// narrowing — a plan node satisfied `TransitionNode` before this task and
// still does) and `TransitionComposite`/`PlateLayer`'s own shape (the return
// value of `plan()`, a completely different type from the old `.composite`
// React-component field despite the similar name — untouched by this task).

const PLAN_HANDLE: LayerHandle = { range: [0, 30] };

const PLAN_COMPOSITE: TransitionComposite = {
  from: { style: { opacity: 1 } },
  to: { style: { opacity: 0 } },
};

const planNode: TransitionNode = {
  plan: (_props: TransitionPlanProps): TransitionComposite => PLAN_COMPOSITE,
};

describe('TransitionNode — the single plan-arm shape (Phase 5 Task 5, narrowed from Task 1.1\'s union)', () => {
  it('accepts a plan node', () => {
    expect(typeof planNode.plan).toBe('function');
  });

  it("narrows via typeof node.plan === 'function'", () => {
    const node: TransitionNode = planNode;
    if (typeof node.plan === 'function') {
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

  it('isTransitionNode accepts a plan node', () => {
    expect(isTransitionNode(planNode)).toBe(true);
  });

  it('isTransitionNode still rejects a one-sided AnyPresentation', () => {
    const presentation = { component: (() => null) as unknown, props: {} };
    expect(isTransitionNode(presentation as never)).toBe(false);
  });

  // Exercises `PlateLayer` and the rest of `TransitionComposite`'s shape so a
  // future field rename shows up here, not only at a call site nobody wrote
  // yet. Untouched by this task's narrowing — `TransitionComposite` is `plan`'s
  // RETURN type, not the deleted `.composite` field.
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
