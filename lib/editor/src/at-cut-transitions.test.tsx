// WIRING coverage for lib/render/at-cut-transitions.tsx.
//
// READ THIS BEFORE TRUSTING A GREEN RUN. Core cannot render: there is no
// Remotion render pipeline here, only jsdom. So this file settles the wiring
// and NOTHING about how a transition LOOKS at a cut:
//
//   covered here — every catalog kind resolves to a presentation; every
//     presentation mounts in both directions across the progress range without
//     throwing; each kind's authored params reach the presentation under the
//     key it expects; an accent-carrying kind resolves through the BRAND
//     palette rather than a core-side default.
//   NOT covered here — whether the composite is correct. At-cut composites
//     differently from TransitionSeries (handle-borrowed overlap, not a
//     shrinking sequence), so a presentation that reads fine in
//     showcase/transitions can still misbehave at a cut. That stays a render
//     check in a consuming brand repo. See docs/superpowers/HANDOFF.md.
//
// The kind list is DERIVED from the catalog on purpose: a hardcoded list stops
// covering new kinds the day someone adds one, which is the exact failure the
// `Record<TransitionKind, …>` in at-cut-transitions.tsx exists to prevent.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

const clock = vi.hoisted(() => ({ frame: 0 }));

vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return {
    ...actual,
    useCurrentFrame: () => clock.frame,
    // Stands in for the <Composition> context a presentation is normally
    // mounted inside — `burn` reads the frame size off it. Without this,
    // mounting burn outside a composition throws "No video config found",
    // which says nothing about burn and everything about jsdom.
    useVideoConfig: () => ({ width: 1080, height: 1920, fps: 30, durationInFrames: 300, id: 'test', defaultProps: {}, props: {} }),
    staticFile: (s: string) => s,
  };
});

import {
  TRANSITION_CATALOG,
  TransitionSchema,
  defaultTransition,
  subOptionsFor,
  type Transition,
  type TransitionKind,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import {
  presentationFor,
  TransitionLayer,
  AtCutTransition,
  DIRECTION_4WAY,
  getTransitionRecord,
  type AnyPresentation,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';

const KINDS = TRANSITION_CATALOG.map((e) => e.kind);
const DIMS = { width: 1080, height: 1920 };

// A brand's palette, invented here — core owns no colour vocabulary, so the
// slots below stand in for whatever a consuming brand declares.
const PALETTE: readonly AccentSlot[] = [
  { key: 'primary', label: 'Primary', color: '#123456' },
  { key: 'secondary', label: 'Secondary', color: '#abcdef' },
];

// ---------------------------------------------------------------------------
// Deriving a fully-populated transition for a kind, off its own zod shape.
// ---------------------------------------------------------------------------

type LooseZod = {
  _def?: { typeName?: string; innerType?: LooseZod };
  minValue?: number | null;
  maxValue?: number | null;
  shape?: Record<string, LooseZod>;
};

function unwrap(f: LooseZod): LooseZod {
  let cur = f;
  while (cur?._def?.typeName === 'ZodOptional' || cur?._def?.typeName === 'ZodDefault') {
    cur = cur._def!.innerType as LooseZod;
  }
  return cur;
}

function shapeFor(kind: string): Record<string, LooseZod> {
  const member = (TransitionSchema.options as unknown as LooseZod[]).find(
    (o) => (o.shape?.kind as unknown as { _def: { value: string } })._def.value === kind,
  );
  if (!member?.shape) throw new Error(`no schema member for kind ${kind}`);
  return member.shape;
}

/** A value inside the field's own bounds, deliberately NOT the presentation's
 *  own default, so "the param arrived" is distinguishable from "the default
 *  happened to match". */
function probeValueFor(kind: string, prop: string, control: 'enum' | 'number' | 'boolean', options?: { value: string }[]): unknown {
  if (control === 'enum') return options![options!.length - 1].value;
  if (control === 'boolean') return false; // every optional boolean defaults to true
  const num = unwrap(shapeFor(kind)[prop]);
  const min = num.minValue;
  const max = num.maxValue;
  if (typeof min === 'number' && Number.isFinite(min) && typeof max === 'number' && Number.isFinite(max)) {
    return min + (max - min) / 2;
  }
  return 7;
}

/** The catalog default plus a probe value for every non-accent sub-option. */
function probeTransitionFor(kind: TransitionKind): { transition: Transition; probes: Record<string, unknown> } {
  const t = defaultTransition(kind) as Record<string, unknown>;
  const probes: Record<string, unknown> = {};
  for (const opt of subOptionsFor(kind)) {
    if (opt.kind === 'accent') continue; // covered by the palette test below
    const v = probeValueFor(kind, opt.prop, opt.kind, opt.options);
    t[opt.prop] = v;
    probes[opt.prop] = v;
  }
  return { transition: t as unknown as Transition, probes };
}

/** Where a kind forwards a schema field under a DIFFERENT prop name, and where
 *  it transforms the value on the way. Everything not listed here is expected
 *  to pass straight through under its own name — which is the norm, and the
 *  thing worth pinning. */
const RENAMED: Partial<Record<TransitionKind, Record<string, string>>> = {
  'zoom-through': { from: 'direction' },
};
const VALUE_MAP: Partial<Record<TransitionKind, Record<string, (v: unknown) => unknown>>> = {
  slide: { direction: (v) => DIRECTION_4WAY[v as string] },
  flip: { direction: (v) => DIRECTION_4WAY[v as string] },
};

// ---------------------------------------------------------------------------

describe('the catalog is fully mapped', () => {
  it('covers every kind the catalog declares', () => {
    expect(KINDS.length).toBeGreaterThan(0);
    expect(new Set(KINDS).size).toBe(KINDS.length);
  });

  it('returns null for an absent transition', () => {
    expect(presentationFor(undefined, DIMS)).toBeNull();
  });

  it('returns null for a kind the renderer does not know (hand-edited Root.tsx)', () => {
    const bogus = { kind: 'not-a-real-kind', frames: 15 } as unknown as Transition;
    expect(presentationFor(getTransitionRecord(bogus), DIMS)).toBeNull();
  });

  it('treats cut as no transition at all', () => {
    expect(getTransitionRecord({ kind: 'cut' } as Transition)).toBeUndefined();
  });
});

describe.each(KINDS)('transition kind %s', (kind) => {
  it('resolves to a presentation (or null, for cut, which is the absence of one)', () => {
    const { transition } = probeTransitionFor(kind);
    const p = presentationFor(transition as never, DIMS);
    if (kind === 'cut') {
      expect(p).toBeNull();
      return;
    }
    expect(p).not.toBeNull();
    expect(typeof p!.component).not.toBe('undefined');
    expect(p!.props).toBeTypeOf('object');
  });

  it('mounts in both directions across the progress range without throwing', () => {
    const { transition } = probeTransitionFor(kind);
    const p = presentationFor(transition as never, DIMS);
    if (!p) return; // cut
    for (const direction of ['entering', 'exiting'] as const) {
      for (const progress of [0, 0.5, 1]) {
        expect(() =>
          render(
            <TransitionLayer presentation={p} direction={direction} progress={progress} durationInFrames={15}>
              <div data-testid="content" />
            </TransitionLayer>,
          ).unmount(),
        ).not.toThrow();
      }
    }
  });

  it('carries its authored params through to the presentation', () => {
    const { transition, probes } = probeTransitionFor(kind);
    const p = presentationFor(transition as never, DIMS);
    if (!p) return; // cut
    for (const [prop, value] of Object.entries(probes)) {
      const key = RENAMED[kind]?.[prop] ?? prop;
      const expected = VALUE_MAP[kind]?.[prop] ? VALUE_MAP[kind]![prop](value) : value;
      expect({ prop, got: (p.props as Record<string, unknown>)[key] }).toEqual({ prop, got: expected });
    }
  });
});

describe('composition-size-dependent kinds', () => {
  it.each(['clock-wipe', 'iris'] as const)('%s receives the composition dimensions', (kind) => {
    const p = presentationFor(defaultTransition(kind) as never, DIMS)!;
    expect(p.props).toMatchObject({ width: 1080, height: 1920 });
  });
});

describe('accent-slot resolution', () => {
  it("resolves a wipe's accent KEY through the brand palette, not a core default", () => {
    const t = { kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' } as TransitionRecord;
    const p = presentationFor(t, { ...DIMS, palette: PALETTE })!;
    expect(p.props.color).toBe('#abcdef');
  });

  it('falls back to the presentation’s own neutral when the key is not in the palette', () => {
    const t = { kind: 'wipe', frames: 15, color: 'no-such-slot', direction: 'left' } as TransitionRecord;
    const p = presentationFor(t, { ...DIMS, palette: PALETTE })!;
    expect(p.props.color).toBeUndefined();
  });

  it('falls back when the renderer has no palette in scope at all', () => {
    const t = { kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' } as TransitionRecord;
    const p = presentationFor(t, DIMS)!;
    expect(p.props.color).toBeUndefined();
  });
});

describe('burn’s string params (no sub-option control, so nothing else pins them)', () => {
  it('forwards mask and glowColor verbatim', () => {
    const t = { kind: 'burn', frames: 20, mask: 'masks/cloud.png', glowColor: '#ff8800', edgeContrast: 9, glowBand: 0.2 } as TransitionRecord;
    const p = presentationFor(t, DIMS)!;
    expect(p.props).toMatchObject({ mask: 'masks/cloud.png', glowColor: '#ff8800', edgeContrast: 9, glowBand: 0.2 });
  });
});

// The two kinds docs/superpowers/HANDOFF.md names as specific suspects. These
// assert STRUCTURE, not appearance.
describe('direction-branching suspects', () => {
  const mount = (p: AnyPresentation, direction: 'entering' | 'exiting', progress: number) =>
    render(
      <TransitionLayer presentation={p} direction={direction} progress={progress} durationInFrames={15}>
        <div data-testid="content" />
      </TransitionLayer>,
    );

  const cellsOf = (container: HTMLElement) =>
    [...container.querySelectorAll('div')].filter((d) => d.style.transformOrigin === 'center center');

  it('checkerboard lays out its full cell grid in both directions', () => {
    const p = presentationFor({ kind: 'checkerboard', frames: 15, gridSize: 4 } as TransitionRecord, DIMS)!;
    for (const direction of ['entering', 'exiting'] as const) {
      const { container, unmount } = mount(p, direction, 0.5);
      expect({ direction, cells: cellsOf(container).length }).toEqual({ direction, cells: 16 });
      unmount();
    }
  });

  it('checkerboard clips the incoming content into its cells when ENTERING', () => {
    const p = presentationFor({ kind: 'checkerboard', frames: 15, gridSize: 3 } as TransitionRecord, DIMS)!;
    const { container, unmount } = mount(p, 'entering', 0.5);
    expect(container.querySelectorAll('[data-testid="content"]')).toHaveLength(9);
    unmount();
  });

  // ------------------------------------------------------------------
  // KNOWN DEFECTS. `it.fails` records the behaviour we believe is CORRECT
  // together with the fact that the code does not do it. These are NOT
  // fixed here: what a transition renders is a look decision, and neither of
  // these kinds has ever had its at-cut appearance confirmed by a render, so
  // "fix" would be guessing. Each one flips to a normal `it` the moment it is
  // addressed — the runner fails loudly if a `.fails` test starts passing.
  // See docs/superpowers/HANDOFF.md.
  // ------------------------------------------------------------------

  // DEFECT: in the EXITING direction the grid cells are rendered empty — the
  // children are drawn once, whole, in the base layer beneath them, and the
  // cells carry no content and no background. So a `checkerboard` used as a
  // transitionOut has no visible effect at all: the clip simply plays and
  // cuts. Only the entering direction reveals cell by cell.
  it.fails('checkerboard clips the outgoing content into its cells when EXITING', () => {
    const p = presentationFor({ kind: 'checkerboard', frames: 15, gridSize: 3 } as TransitionRecord, DIMS)!;
    const { container, unmount } = mount(p, 'exiting', 0.5);
    expect(container.querySelectorAll('[data-testid="content"]')).toHaveLength(9);
    unmount();
  });

  // DEFECT: pixelate's root AbsoluteFill is painted opaque black unconditionally,
  // including at progress 0. Under TransitionSeries that is harmless — the
  // presentation only exists for the length of the transition and composites
  // over the outgoing sequence. At a cut it is not: the wrapper is mounted for
  // the item's WHOLE sequence, and the neighbouring clip sits beneath it in a
  // sibling Sequence, so the black root hides the neighbour rather than
  // blending with it.
  it.fails('pixelate does not paint an opaque root before the transition has begun', () => {
    const p = presentationFor({ kind: 'pixelate', frames: 15 } as TransitionRecord, DIMS)!;
    const { container, unmount } = mount(p, 'entering', 0);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.backgroundColor).toBe('');
    unmount();
  });
});

describe('AtCutTransition drives progress off the current frame', () => {
  beforeEach(() => {
    clock.frame = 0;
  });

  it('ramps the entering presentation 0→1 over its own window and clamps after', () => {
    const seen: Record<string, unknown>[] = [];
    const spy: AnyPresentation = {
      component: (props: Record<string, unknown>) => {
        seen.push(props);
        return <>{props.children as React.ReactNode}</>;
      },
      props: {},
    };
    for (const [frame, expected] of [[0, 0], [5, 0.5], [10, 1], [40, 1]] as const) {
      clock.frame = frame;
      const { unmount } = render(
        <AtCutTransition inPresentation={spy} inFrames={10} outPresentation={null} outFrames={0} seqDurationF={90}>
          <div />
        </AtCutTransition>,
      );
      expect({ frame, progress: seen.at(-1)!.presentationProgress }).toEqual({ frame, progress: expected });
      expect(seen.at(-1)!.presentationDirection).toBe('entering');
      unmount();
    }
  });

  it('ramps the exiting presentation over the window at the END of the sequence', () => {
    const seen: Record<string, unknown>[] = [];
    const spy: AnyPresentation = {
      component: (props: Record<string, unknown>) => {
        seen.push(props);
        return <>{props.children as React.ReactNode}</>;
      },
      props: {},
    };
    for (const [frame, expected] of [[0, 0], [80, 0], [85, 0.5], [90, 1]] as const) {
      clock.frame = frame;
      const { unmount } = render(
        <AtCutTransition inPresentation={null} inFrames={0} outPresentation={spy} outFrames={10} seqDurationF={90}>
          <div />
        </AtCutTransition>,
      );
      expect({ frame, progress: seen.at(-1)!.presentationProgress }).toEqual({ frame, progress: expected });
      expect(seen.at(-1)!.presentationDirection).toBe('exiting');
      unmount();
    }
  });

  it('wraps the exiting presentation OUTSIDE the entering one, mirroring TransitionSeries', () => {
    const order: string[] = [];
    const mk = (name: string): AnyPresentation => ({
      component: (props: Record<string, unknown>) => {
        order.push(name);
        return <>{props.children as React.ReactNode}</>;
      },
      props: {},
    });
    clock.frame = 5;
    render(
      <AtCutTransition
        inPresentation={mk('in')}
        inFrames={10}
        outPresentation={mk('out')}
        outFrames={10}
        seqDurationF={90}
      >
        <div />
      </AtCutTransition>,
    );
    expect(order).toEqual(['out', 'in']);
  });

  it('renders bare children when neither edge has a transition', () => {
    const { container } = render(
      <AtCutTransition inPresentation={null} inFrames={0} outPresentation={null} outFrames={0} seqDurationF={90}>
        <div data-testid="content" />
      </AtCutTransition>,
    );
    expect(container.querySelectorAll('[data-testid="content"]')).toHaveLength(1);
  });
});
