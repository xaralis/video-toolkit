// WIRING coverage for lib/render/at-cut-transitions.tsx.
//
// READ THIS BEFORE TRUSTING A GREEN RUN. This suite runs under jsdom, which
// has no Player and renders no pixels — core itself CAN render (see
// examples/layered-minimal, a real Remotion project with working `still`/
// `render`), but this file doesn't exercise that path. So this file settles
// the wiring and NOTHING about how a transition LOOKS at a cut:
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
//     check — now doable in core via examples/layered-minimal, not a brand
//     repo. See docs/superpowers/HANDOFF.md.
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
  CoreTransitionSchema,
  defaultTransition,
  subOptionsFor,
  type Transition,
  type TransitionKind,
} from '@video-toolkit/lib/reel-config-base/transition-schema';
import {
  presentationFor,
  resolveTransition,
  transitionNodeFor,
  resetTransitionNodeCache,
  fromRemotionPresentation,
  isTransitionNode,
  TransitionLayer,
  AtCutTransition,
  DIRECTION_4WAY,
  getTransitionRecord,
  type AnyPresentation,
  type TransitionNode,
  type TransitionNodeProps,
  type TransitionRecord,
} from '@video-toolkit/lib/render/at-cut-transitions';
import { resetWarnOnce } from '@video-toolkit/lib/render/warn-once';
import { ActiveTransitionProgressContext } from '@video-toolkit/lib/render/video-track-plan';
import { EdgePlate } from '@video-toolkit/lib/transitions/edge-plate';
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';
import { paramChoices, type ParamOption } from '@video-toolkit/lib/reel-config-base/param-field';

const KINDS = TRANSITION_CATALOG.map((e) => e.kind);
const DIMS = { width: 1080, height: 1920 };

// Phase 5 Task 1.1 widened `TransitionNode` into a `plan`/`composite` union.
// Nothing in this repo produces a `plan` node yet — every node this suite
// builds or resolves is still composite-only — so this helper narrows once
// per call site instead of repeating an `if (typeof node.plan === 'function')
// throw …` guard at every one of them (typeof, not `'plan' in node` — see
// TransitionNode's own doc comment in lib/theming/transitions.ts for why). If
// a future `plan` node genuinely reaches one of these call sites, this throw
// is the loud failure that says so.
function compositeOf(node: TransitionNode): React.ComponentType<TransitionNodeProps> {
  if (typeof node.plan === 'function') throw new Error('expected a composite-arm TransitionNode in this test');
  return node.composite;
}

/** Drives a `plan`-arm node's `wrap`s directly, mirroring what `LayerShell`
 *  (`lib/render/video-track-plan.tsx`) applies to an already-mounted layer:
 *  `op.style`/`op.z` as the shell's own style, `op.wrap` (when declared)
 *  mounted `active` around the content, and the live progress delivered
 *  through `ActiveTransitionProgressContext` — the same context a real
 *  `wrap` reads, never a prop. Used wherever the OLD `compositeOf`-based
 *  render no longer applies because a migrated kind has no `.composite`
 *  (Task 2.1 moved `fade`, `dissolve`, `slide`, `flip`, `clock-wipe`, `iris`
 *  and colourless `fade-to-color` onto `plan`). */
function mountPlan(
  node: TransitionNode,
  inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null },
  progress: number,
  background = 'transparent',
  durationInFrames = 20,
) {
  const frame = Math.round(progress * durationInFrames);
  // PHASE 5 TASK 2.2 FIX ROUND — the `LayerHandle` passed to `plan()` must
  // agree with `inputs.from`/`inputs.to`'s own nullability. Before this fix
  // the handle was ALWAYS non-null regardless of `inputs`, which is not what
  // the real pipeline does (`handleFor` in `video-track.tsx` returns `null`
  // whenever the side has no item — a reel edge) and made it IMPOSSIBLE for
  // any test built on this helper to exercise a node's own `from === null` /
  // `to === null` branching, exactly the contract §2.5 explicitly grants a
  // node the right to use. Found while chasing `pixelate`'s reel-edge defect
  // (see the "pixelate does not let a materialised edge plate curtain over
  // real content" test below) — the first draft of that test passed on the
  // BUGGY code because this helper silently fed the node a real handle even
  // when the test asked for `to: null`.
  const composite = node.plan!({
    from: inputs.from === null ? null : { range: [0, durationInFrames] },
    to: inputs.to === null ? null : { range: [0, durationInFrames] },
    progress,
    frame,
    durationInFrames,
    params: {},
    dims: { width: 1080, height: 1920, fps: 30 },
    palette: [],
    background,
  });
  const renderSide = (side: 'from' | 'to', content: React.ReactNode) => {
    const op = composite[side];
    const style: React.CSSProperties = {
      ...(op?.style ?? {}),
      ...(op?.z === undefined ? {} : { zIndex: op.z }),
    };
    const Wrap = op?.wrap;
    return <div style={style}>{Wrap ? <Wrap active>{content}</Wrap> : content}</div>;
  };
  const CLIP = <div data-testid="clip" />;
  const fromContent = inputs.from === null ? <EdgePlate background={background} /> : (inputs.from ?? CLIP);
  const toContent = inputs.to === null ? <EdgePlate background={background} /> : (inputs.to ?? CLIP);
  // PLATES (Phase 5 Task 2.2) — mirrors `PlateHost`
  // (lib/render/video-track-plan.tsx): `under`/`over` carry an explicit
  // z-index, `between` is placed by TREE POSITION alone (between the two
  // shells, exactly where `video-track.tsx`'s `plates(b)` Sequence sits
  // relative to the two item Sequences). `wipe`'s sheet, `fade-to-color`'s
  // dip and `pixelate`'s overlays are all media-free `layers` this helper
  // would otherwise never render — a real gap, since none of those kinds'
  // pictures live on `from`/`to` alone.
  const renderPlates = (z: 'under' | 'between' | 'over') =>
    (composite.layers ?? []).filter((l) => l.z === z).map((l) => (
      <div
        key={l.key}
        style={{
          ...(z === 'under' ? { zIndex: -1 } : z === 'over' ? { zIndex: 1 } : {}),
          ...l.style,
        }}
      >
        {l.content}
      </div>
    ));
  return render(
    <ActiveTransitionProgressContext.Provider value={{ progress, frame, durationInFrames }}>
      {renderPlates('under')}
      {renderSide('from', fromContent)}
      {renderPlates('between')}
      {renderSide('to', toContent)}
      {renderPlates('over')}
    </ActiveTransitionProgressContext.Provider>,
  );
}

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
  const member = (CoreTransitionSchema.options as unknown as LooseZod[]).find(
    (o) => (o.shape?.kind as unknown as { _def: { value: string } })._def.value === kind,
  );
  if (!member?.shape) throw new Error(`no schema member for kind ${kind}`);
  return member.shape;
}

/** A value inside the field's own bounds, deliberately NOT the presentation's
 *  own default, so "the param arrived" is distinguishable from "the default
 *  happened to match". */
function probeValueFor(
  kind: string,
  prop: string,
  control: 'enum' | 'number' | 'boolean',
  options?: readonly ParamOption[],
): unknown {
  if (control === 'enum') {
    const choices = paramChoices(options)!;
    return choices[choices.length - 1].value;
  }
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
    // `accent` (and the dual `accent-or-color`) is covered by the palette
    // tests below. `string`/`color` are brand-supplied assets (burn's mask
    // path, its glow hex) with no in-bounds probe value to invent — they
    // became sub-options in Phase 4 Task 1.1 and are pinned by the editor
    // tests, not by this render probe.
    if (opt.type === 'accent' || opt.type === 'accent-or-color' || opt.type === 'string' || opt.type === 'color') continue;
    const v = probeValueFor(kind, opt.prop, opt.type as 'enum' | 'number' | 'boolean', opt.options);
    t[opt.prop] = v;
    probes[opt.prop] = v;
  }
  return { transition: t as unknown as Transition, probes };
}

/** Where a kind TRANSFORMS a schema value on the way to the presentation.
 *
 *  There used to be a `RENAMED` table beside this one, mapping
 *  `zoom-through.from → direction`. It existed only because production
 *  disagreed with itself about what the in/out concept is called; Task 2.5
 *  unified the schema on `direction` and the table was deleted rather than left
 *  as scaffolding. EVERY field now passes straight through under its own name,
 *  and that — not a translation layer — is the thing worth pinning. */
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

  // Reachable only since Phase 4 opened the schema. While the union was closed
  // no authored kind could name an inherited property; now any non-core string
  // parses, and a bare `PRESENTATIONS[t.kind]` would hand back
  // `Object.prototype.constructor` — a FUNCTION — which this code would then
  // call as a renderer.
  it('returns null for a kind that names an Object.prototype member', () => {
    for (const kind of ['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf']) {
      const bogus = { kind, frames: 15 } as unknown as Transition;
      expect(presentationFor(getTransitionRecord(bogus), DIMS), kind).toBeNull();
    }
  });

  it('treats cut as no transition at all', () => {
    expect(getTransitionRecord({ kind: 'cut' } as Transition)).toBeUndefined();
  });
});

/** The kinds that resolve to a NATIVE two-input node instead of a one-sided
 *  presentation core lifts. DERIVED from what the renderer actually returns,
 *  never listed by hand — and PINNED below, because a kind joining this set
 *  silently opts out of the generic param test. */
const NODE_KINDS = KINDS.filter((k) => {
  const r = resolveTransition(probeTransitionFor(k).transition as never, DIMS);
  return r !== null && isTransitionNode(r);
});

describe('one-sided presentations vs native two-input nodes', () => {
  // FIVE, and the count is a measurement of the PROBE, not of the catalog.
  // PHASE 5 TASK 2.2 added `gradient-wipe` to this set: it used to be a
  // one-sided `TransitionPresentation` core lifted (`wrapRemotionPresentation`);
  // it is now a native `plan` node returning `to.style.maskImage` directly, so
  // it resolves to a `TransitionNode` straight out of `resolveTransition` like
  // the other four. `wipe` and `pixelate` were ALREADY native nodes before this
  // task (Phase 4) and stay in this set — migrating their ARM (`composite` →
  // `plan`) does not change whether `isTransitionNode()` is true for them.
  //
  // `fade-to-color` is a node only when its `color` key resolves — a dip has no
  // one-sided form, but a colourless `fade-to-color` is not a dip at all, it is
  // the plain `fade()`. `probeTransitionFor` deliberately skips `accent`-typed
  // sub-options (there is no in-bounds key to invent for a palette core does
  // not own), so the probe carries no colour and the kind resolves one-sided
  // here. That CONDITIONAL ARITY is reviewed and accepted, and it is pinned
  // directly — with and without a colour — in "a fade’s colour is a parameter"
  // below, so it cannot drift unnoticed just because this list does not name it.
  //
  // The sixth entry used to be a brand-named fade kind hardwired to a black
  // core had chosen for it. It was removed from core entirely; the colour is
  // the brand's to name now, which is why the arity became conditional.
  it('exactly five kinds are native two-input nodes AT THEIR CATALOG DEFAULT — not a statement about the catalog', () => {
    expect([...NODE_KINDS].sort()).toEqual(['checkerboard', 'gradient-wipe', 'pixelate', 'scanline-glitch', 'wipe']);
  });

  // The other half of the conditional arity, stated where the list above is —
  // otherwise "four" reads as "and `fade-to-color` never is", which is false.
  it('fade-to-color joins them the moment a colour resolves', () => {
    const withColor = resolveTransition(
      { kind: 'fade-to-color', frames: 15, color: 'primary' } as never,
      { ...DIMS, palette: PALETTE },
    );
    const without = resolveTransition({ kind: 'fade-to-color', frames: 15 } as never, { ...DIMS, palette: PALETTE });
    expect([isTransitionNode(withColor!), isTransitionNode(without!)]).toEqual([true, false]);
  });

  // THE LIVE TRAP. Six files in the PP brand repo call `presentationFor` and
  // feed the result to `TransitionSeries.Transition`, where `null` means "no
  // transition" — a hard cut. For these four kinds `null` is now the only
  // honest answer (there IS no one-sided form), so the degradation has to be
  // AUDIBLE. No shim fakes a one-sided form: a wrong picture rendered silently
  // is worse than a visible degradation.
  it('presentationFor WARNS once per two-input kind instead of degrading silently', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const kind of NODE_KINDS) {
        const { transition } = probeTransitionFor(kind);
        // Called twice: the warning must be de-duplicated, not per-frame.
        expect(presentationFor(transition as never, DIMS)).toBeNull();
        expect(presentationFor(transition as never, DIMS)).toBeNull();
      }
      // Filtered on HARD CUT rather than counting every call: a kind may
      // legitimately emit other, unrelated warnings. What is pinned is exactly
      // one degradation warning per node kind.
      const hardCut = warn.mock.calls.filter(([m]) => String(m).includes('HARD CUT'));
      expect(hardCut).toHaveLength(NODE_KINDS.length);
      for (const kind of NODE_KINDS) {
        expect(hardCut.filter(([m]) => String(m).includes(`"${kind}"`))).toHaveLength(1);
      }
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });

  it('does not warn for a kind that legitimately has no transition at all', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(presentationFor(undefined, DIMS)).toBeNull();
      expect(presentationFor({ kind: 'nope', frames: 15 } as unknown as TransitionRecord, DIMS)).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });
});

describe.each(KINDS)('transition kind %s', (kind) => {
  const isNode = NODE_KINDS.includes(kind);

  it('resolves to something the boundary can drive', () => {
    const { transition } = probeTransitionFor(kind);
    const node = transitionNodeFor(transition as never, DIMS);
    if (kind === 'cut') {
      expect(node).toBeNull();
      expect(presentationFor(transition as never, DIMS)).toBeNull();
      return;
    }
    expect(node).not.toBeNull();
    const isPlan = typeof node!.plan === 'function';
    expect(typeof (isPlan ? node!.plan : compositeOf(node!))).toBe('function');
    // A native node has NO one-sided form to hand back; every other kind still
    // does (a `plan`-arm kind included — it started as one, and
    // `WRAP_PLAN_KINDS` in at-cut-transitions.tsx deliberately keeps
    // `resolveTransition`/`presentationFor` unaware of the lift), and brands'
    // `presentationFor` call sites still get it.
    const p = presentationFor(transition as never, DIMS);
    expect({ kind, oneSided: p !== null }).toEqual({ kind, oneSided: !isNode });
    if (p) {
      expect(typeof p.component).not.toBe('undefined');
      expect(p.props).toBeTypeOf('object');
    }
  });

  it('mounts across the progress range, and against a null neighbour, without throwing', () => {
    const { transition } = probeTransitionFor(kind);
    const node = transitionNodeFor(transition as never, DIMS);
    if (!node) return; // cut
    const inputs: Array<[React.ReactNode | null, React.ReactNode | null]> = [
      [<div key="a" />, <div key="b" />],
      // The reel's leading and trailing edges — a node must survive a missing
      // neighbour rather than special-casing it upstream.
      [null, <div key="b" />],
      [<div key="a" />, null],
    ];
    if (typeof node.plan === 'function') {
      for (const progress of [0, 0.5, 1]) {
        for (const [from, to] of inputs) {
          expect(() => mountPlan(node, { from, to }, progress).unmount()).not.toThrow();
        }
      }
    } else {
      const Composite = compositeOf(node);
      for (const progress of [0, 0.5, 1]) {
        for (const [from, to] of inputs) {
          expect(() =>
            render(
              <Composite
                from={from}
                to={to}
                progress={progress}
                durationInFrames={15}
                width={1080}
                height={1920}
                fps={30}
                palette={[]}
                background="transparent"
              />,
            ).unmount(),
          ).not.toThrow();
        }
      }
    }
    // One-sided kinds are additionally driven through the layer core lifts them
    // with, in both directions — the coverage this suite has always had.
    const p = presentationFor(transition as never, DIMS);
    if (!p) return;
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

  // A NODE closes over its params — there is no props bag to inspect, so this
  // generic check does not apply to one. Their params are pinned by DOM
  // assertions in "the four two-input nodes render what their name promises"
  // instead, which is the stronger claim: the param reaches the PICTURE, not
  // just an object. `NODE_KINDS` is pinned above so a fifth kind cannot take
  // this exit quietly.
  it.skipIf(isNode)('carries its authored params through to the presentation', () => {
    const { transition, probes } = probeTransitionFor(kind);
    const p = presentationFor(transition as never, DIMS);
    if (!p) return; // cut
    for (const [prop, value] of Object.entries(probes)) {
      const expected = VALUE_MAP[kind]?.[prop] ? VALUE_MAP[kind]![prop](value) : value;
      expect({ prop, got: (p.props as Record<string, unknown>)[prop] }).toEqual({ prop, got: expected });
    }
  });
});

// ---------------------------------------------------------------------------
// PARAM DELIVERY FOR THE FOUR NODES — the complement of the `skipIf` above.
//
// The generic check reads a PROPS BAG, and a node has none: it closes over its
// params. Skipping it left a real hole, demonstrated rather than imagined —
// deleting `scanlines: t.scanlines` from the PRESENTATIONS table in
// lib/render/at-cut-transitions.tsx passed EVERY gate, because the editor suite
// skipped the kind and the pixel harness only ever renders catalog defaults.
//
// This closes it DIFFERENTIALLY and generically: for each sub-option a node kind
// declares, render the kind twice — catalog default vs an in-bounds probe value
// for that ONE param — and require the rendered output to differ. No per-param
// knowledge is encoded, so a param added later is covered the day it is added,
// and it goes red whether the value is dropped at the forwarding table or is
// ignored inside the node itself.
//
// Three progress points, because a param need only bite at one of them:
// `pixelate.randomness` is provably inert at 0.5 (every cell's reveal clamps to
// 1 once pixelIntensity peaks) and only shows on the ramp.
// ---------------------------------------------------------------------------
describe.each(NODE_KINDS)('two-input node %s delivers every authored param', (kind) => {
  const PROBE_PROGRESS = [0.2, 0.5, 0.8];

  // `checkerboard` (Task 0.1) and `scanline-glitch` (Task 0.2) each mint an
  // unseeded `random(null)`-derived SVG `id` on every mount (see
  // lib/render/README.md's "FOUR unseeded random SVG element ids" paragraph).
  // Two renders of the SAME config therefore NEVER produce equal `innerHTML`
  // regardless of any param — which silently made this differential check
  // vacuous for every kind carrying such an id (proof: with `rgbShiftPx`
  // fully dropped from scanline-glitch's forwarding, or `stagger` hard-coded
  // for checkerboard, the block still passed, because the two HTML strings
  // already differed on the id alone). Both `id="…"` attributes and the
  // `url(#…)` references to them are stripped to a fixed placeholder before
  // comparing, so the check goes back to comparing what a param actually
  // changes about the picture, not which random id got minted this render.
  const stripGeneratedIds = (html: string) =>
    html.replace(/id="[^"]*"/g, 'id="ID"').replace(/url\(#[^)]*\)/g, 'url(#ID)');

  // PHASE 5 TASK 2.2 — branches on ARM. `wipe`/`pixelate`/`gradient-wipe` moved
  // `composite` → `plan` this task; `checkerboard`/`scanline-glitch` (Stage
  // 3/4) have not. `mountPlan` (defined near `compositeOf`, above) renders
  // `layers` (plates) TOO — load-bearing here specifically, since `pixelate`'s
  // grid/glitch-slice/RGB-split/scanline/vignette/noise overlays all moved
  // onto `layers` this task; a plan-arm render that skipped plates would make
  // every one of those params' differential checks below vacuously pass on
  // NOTHING (the plate never rendered at all, so two renders' stripped HTML
  // would both be the empty string from that layer, not merely equal to each
  // other for the right reason).
  const renderedFor = (t: Record<string, unknown>) => {
    const node = transitionNodeFor(t as TransitionRecord, { ...DIMS, palette: PALETTE })!;
    return PROBE_PROGRESS.map((progress) => {
      let container: HTMLElement;
      let unmount: () => void;
      if (typeof node.plan === 'function') {
        ({ container, unmount } = mountPlan(
          node,
          { from: <div data-testid="a" />, to: <div data-testid="b" /> },
          progress,
          'transparent',
          15,
        ));
      } else {
        const Composite = compositeOf(node);
        ({ container, unmount } = render(
          <Composite
            from={<div data-testid="a" />}
            to={<div data-testid="b" />}
            progress={progress}
            durationInFrames={15}
            width={1080}
            height={1920}
            fps={30}
            palette={PALETTE}
            background="transparent"
          />,
        ));
      }
      const html = stripGeneratedIds(container.innerHTML);
      unmount();
      return html;
    }).join('\n');
  };

  // `accent` (and the dual `accent-or-color`) is pinned by the palette tests
  // below; `string`/`color` are brand-supplied assets with no in-bounds probe
  // value to invent (burn only).
  const tunable = subOptionsFor(kind).filter(
    (o) => o.type !== 'accent' && o.type !== 'accent-or-color' && o.type !== 'string' && o.type !== 'color',
  );

  // Asserted rather than skipped: a knob vanishing from a node goes red here
  // rather than quietly emptying the differential check below.
  it('declares at least one tunable param for this check to bite on', () => {
    expect({ kind, tunable: tunable.length > 0 }).toEqual({ kind, tunable: true });
  });

  it.each(tunable.map((o) => [o.prop, o.type, o.options] as const))(
    '%s changes what the node renders',
    (prop, type, options) => {
      const base = defaultTransition(kind) as Record<string, unknown>;
      const value = probeValueFor(kind, prop, type as 'enum' | 'number' | 'boolean', options);
      // Guard the guard: a probe equal to the catalog default would make the
      // comparison below vacuously green.
      expect({ prop, sameAsDefault: value === base[prop] }).toEqual({ prop, sameAsDefault: false });
      expect(renderedFor({ ...base, [prop]: value })).not.toBe(renderedFor(base));
    },
  );
});

describe('composition-size-dependent kinds', () => {
  it.each(['clock-wipe', 'iris'] as const)('%s receives the composition dimensions', (kind) => {
    const p = presentationFor(defaultTransition(kind) as never, DIMS)!;
    expect(p.props).toMatchObject({ width: 1080, height: 1920 });
  });
});

// `wipe` is a native two-input node now, so there is no `props.color` to read.
// These assert the colour where it actually matters — on the sweeping sheet the
// node paints — which is a stronger pin than the props bag ever was.
describe('accent-slot resolution', () => {
  // `wipe` moved `composite` → `plan` (Phase 5 Task 2.2); `mountPlan` renders
  // its sheet as an `over` PLATE now, not a JSX sibling.
  const sheetColorFor = (t: TransitionRecord, dims: Parameters<typeof transitionNodeFor>[1]) => {
    const node = transitionNodeFor(t, dims)!;
    let container: HTMLElement;
    let unmount: () => void;
    if (typeof node.plan === 'function') {
      ({ container, unmount } = mountPlan(node, { from: null, to: null }, 0.5, 'transparent', 15));
    } else {
      const Composite = compositeOf(node);
      ({ container, unmount } = render(
        <Composite from={null} to={null} progress={0.5} durationInFrames={15} width={1080} height={1920} fps={30} palette={[]} background="transparent" />,
      ));
    }
    // Excludes `'transparent'` — `mountPlan` materialises a NULL side as a real
    // `EdgePlate` now (Phase 5 Task 2.2's edge-plate contract), which also
    // carries a non-empty `backgroundColor`. The sheet's own colour is always a
    // resolved accent or the node's literal neutral, never the string
    // `'transparent'`, so this stays unambiguous.
    const sheet = [...container.querySelectorAll('div')].find(
      (d) => d.style.backgroundColor !== '' && d.style.backgroundColor !== 'transparent',
    );
    const color = sheet?.style.backgroundColor;
    unmount();
    return color;
  };

  it("resolves a wipe's accent KEY through the brand palette, not a core default", () => {
    const t = { kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' } as TransitionRecord;
    expect(sheetColorFor(t, { ...DIMS, palette: PALETTE })).toBe('rgb(171, 205, 239)'); // #abcdef
  });

  it('falls back to the presentation’s own neutral when the key is not in the palette', () => {
    const t = { kind: 'wipe', frames: 15, color: 'no-such-slot', direction: 'left' } as TransitionRecord;
    expect(sheetColorFor(t, { ...DIMS, palette: PALETTE })).toBe('rgb(0, 0, 0)'); // the node's own #000
  });

  it('falls back when the renderer has no palette in scope at all', () => {
    const t = { kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' } as TransitionRecord;
    expect(sheetColorFor(t, DIMS)).toBe('rgb(0, 0, 0)');
  });

  // THE GAP THIS PINS: `wipe`'s unresolved-colour fallback used to be silent —
  // unlike `fade-to-color`'s identical situation (see the `warnOnce` pin in
  // "a fade's colour is a parameter" below), nothing told the author their
  // `wipe` had just rendered a default-black sweep instead of their accent.
  // Both directions are pinned, not just the warning firing: a warning that
  // also fires on VALID input is worse than none.
  it('warns once when a wipe’s colour key does not resolve, naming both possible causes', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const t = { kind: 'wipe', frames: 15, color: 'no-such-slot', direction: 'left' } as TransitionRecord;
      sheetColorFor(t, { ...DIMS, palette: PALETTE });
      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0];
      expect(String(message)).toContain('transition "wipe" has color "no-such-slot"');
      expect(String(message)).toContain('accentSlots');
      expect(String(message)).toContain('buildVideoNodes()');
      // De-duplicated per key, not per render.
      sheetColorFor(t, { ...DIMS, palette: PALETTE });
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });

  it('does not warn for a wipe whose colour key resolves, or for a literal hex colour', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const validKey = { kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' } as TransitionRecord;
      const literalHex = { kind: 'wipe', frames: 15, color: '#ff8800', direction: 'left' } as TransitionRecord;
      const noColor = { kind: 'wipe', frames: 15, direction: 'left' } as TransitionRecord;
      sheetColorFor(validKey, { ...DIMS, palette: PALETTE });
      sheetColorFor(literalHex, { ...DIMS, palette: PALETTE });
      sheetColorFor(noColor, { ...DIMS, palette: PALETTE });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });
});

describe('burn’s string params (no sub-option control, so nothing else pins them)', () => {
  it('forwards mask and glowColor verbatim', () => {
    const t = { kind: 'burn', frames: 20, mask: 'masks/cloud.png', glowColor: '#ff8800', edgeContrast: 9, glowBand: 0.2 } as TransitionRecord;
    const p = presentationFor(t, DIMS)!;
    expect(p.props).toMatchObject({ mask: 'masks/cloud.png', glowColor: '#ff8800', edgeContrast: 9, glowBand: 0.2 });
  });
});

// ---------------------------------------------------------------------------
// THE FOUR NATIVE TWO-INPUT NODES (Phase 4 Task 2.1).
//
// `checkerboard`, `pixelate`, `scanline-glitch` and `wipe` are no longer
// one-sided presentations that core lifts: each is a `TransitionNode` that
// composites BOTH inputs itself. Their four defects were all the same shape —
// a two-input operation asked to draw itself one side at a time — so they
// dissolve into the model rather than being patched one by one.
//
// These four `it`s are the ADDED capability: each kind now renders what its
// name promises. They are deliberately written against OBSERVABLE structure
// (which input is on screen, what the sheet's offset is, what a layer's opacity
// is), not against a props bag — a node closes over its params, so "the param
// arrived" and "the param is used" are the same assertion here.
// ---------------------------------------------------------------------------
describe('the four two-input nodes render what their name promises', () => {
  const A = <div data-testid="a" />;
  const B = <div data-testid="b" />;

  const nodeFor = (t: Partial<TransitionRecord> & { kind: string }, palette?: readonly AccentSlot[]) =>
    transitionNodeFor(t as TransitionRecord, palette ? { ...DIMS, palette } : DIMS)!;

  // PHASE 5 TASK 2.2 — branches on arm: `wipe`/`pixelate` moved `composite` →
  // `plan` this task, `checkerboard`/`scanline-glitch` (Stage 3/4) have not.
  const mountNode = (
    node: TransitionNode,
    progress: number,
    inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null } = {},
  ) => {
    if (typeof node.plan === 'function') {
      return mountPlan(
        node,
        { from: inputs.from === undefined ? A : inputs.from, to: inputs.to === undefined ? B : inputs.to },
        progress,
        'transparent',
        15,
      );
    }
    const Composite = compositeOf(node);
    return render(
      <Composite
        from={inputs.from === undefined ? A : inputs.from}
        to={inputs.to === undefined ? B : inputs.to}
        progress={progress}
        durationInFrames={15}
        width={1080}
        height={1920}
        fps={30}
        palette={[]}
        background="transparent"
      />,
    );
  };

  const count = (container: HTMLElement, id: 'a' | 'b') =>
    container.querySelectorAll(`[data-testid="${id}"]`).length;

  const cellsOf = (container: HTMLElement) =>
    [...container.querySelectorAll('div')].filter((d) => d.style.transformOrigin === 'center center');

  // ---- wipe ---------------------------------------------------------------
  // WAS (Phase 4): both beats ran over the SAME window, entering drawn on top,
  // so its sheet already sat at translateX(0%) at progress 0 and the whole
  // frame flashed to the accent colour on the transition's first frame.
  // IS (Phase 4 fix): two SEQUENTIAL beats over one window — sheet in over A
  // across the first half, sheet out off B across the second.
  //
  // PHASE 5 TASK 2.2 — `shows` is now read off OPACITY, not mount presence.
  // Both `a` and `b` are ALWAYS mounted under the `plan` arm (the single-mount
  // contract this task migrates onto) — the old "only one side is even in the
  // DOM" behaviour was itself the pre-Phase-5 defect class (two mounts of
  // whichever side toggled), and the design's own argument for why the OPACITY
  // swap is pixel-identical (§3 row 17: the occluded side is always fully
  // covered by the sheet) is exactly what this rewritten assertion measures
  // directly instead of inferring from mount presence.
  it('wipe sweeps its sheet IN over the outgoing clip, then OUT to reveal the incoming one', () => {
    const node = nodeFor({ kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' }, PALETTE);
    const opacityOf = (container: HTMLElement, id: 'a' | 'b') =>
      container.querySelector(`[data-testid="${id}"]`)!.parentElement!.style.opacity;
    const sample = (progress: number) => {
      const { container, unmount } = mountNode(node, progress);
      const sheet = [...container.querySelectorAll('div')].find((d) => d.style.backgroundColor !== '');
      const aOp = opacityOf(container, 'a');
      const bOp = opacityOf(container, 'b');
      const out = {
        progress,
        shows: aOp === '1' && bOp === '0' ? 'outgoing' : bOp === '1' && aOp === '0' ? 'incoming' : 'neither',
        sheet: sheet?.style.transform,
      };
      unmount();
      return out;
    };
    expect([0, 0.25, 0.5, 0.75, 1].map(sample)).toEqual([
      // The whole first beat still shows the clip we are LEAVING — the defect
      // this pin exists for. At progress 0 the sheet is entirely off-frame.
      { progress: 0, shows: 'outgoing', sheet: 'translateX(100%)' },
      { progress: 0.25, shows: 'outgoing', sheet: 'translateX(50%)' },
      // Midpoint: the sheet covers, and the swap happens behind it.
      { progress: 0.5, shows: 'incoming', sheet: 'translateX(0%)' },
      { progress: 0.75, shows: 'incoming', sheet: 'translateX(-50%)' },
      { progress: 1, shows: 'incoming', sheet: 'translateX(-100%)' },
    ]);
  });

  it('wipe sweeps the other way round when direction is right', () => {
    const node = nodeFor({ kind: 'wipe', frames: 15, direction: 'right' });
    const at = (progress: number) => {
      const { container, unmount } = mountNode(node, progress);
      const t = [...container.querySelectorAll('div')].find((d) => d.style.backgroundColor !== '')!.style.transform;
      unmount();
      return t;
    };
    expect([at(0), at(0.5), at(1)]).toEqual(['translateX(-100%)', 'translateX(0%)', 'translateX(100%)']);
  });

  // ---- checkerboard -------------------------------------------------------
  // WAS: two branches. Entering clipped the incoming clip into the cells;
  // exiting drew the cells EMPTY over an untouched base layer, so a
  // `checkerboard` transitionOut had no visible effect at all.
  // IS: ONE implementation — B clipped into cells, over an intact A.
  //
  // Phase 5 Task 0.1 moved the DEFAULT `squareAnimation: 'fade'` onto a
  // single-mount SVG-mask path (pinned separately in
  // checkerboard-single-mount.test.tsx), so this clipped-copy assertion now
  // names `squareAnimation: 'scale'` explicitly — the one carve-out that
  // keeps a real per-cell geometric transform and therefore keeps the
  // original per-cell mount shape this test pins.
  it('checkerboard clips the INCOMING clip into every cell over an intact outgoing clip', () => {
    const node = nodeFor({ kind: 'checkerboard', frames: 15, gridSize: 3, squareAnimation: 'scale' });
    const { container, unmount } = mountNode(node, 0.5);
    expect({ cells: cellsOf(container).length, b: count(container, 'b'), a: count(container, 'a') }).toEqual({
      cells: 9,
      // B is re-drawn once per cell, clipped to it…
      b: 9,
      // …and A is drawn ONCE, whole, beneath the grid.
      a: 1,
    });
    unmount();
  });

  // TASK 2.1's "no cells when there is no incoming clip" PIN IS GONE, replaced
  // rather than deleted. 2.1 answered the trailing edge with "draw nothing",
  // which is what made `checkerboard` the eighth exiting no-op; Task 2.2's
  // model answers it with the composition background, so the grid IS drawn and
  // its cells carry a background plate. The replacement lives in
  // 'a reel edge resolves the missing input to the theme background' below —
  // and the empty-cell artefact 2.1 actually removed (a cell drawn with no
  // content AND no background) stays impossible, because there is no longer a
  // code path that puts nothing inside a cell.
  // Same carve-out redirection as the pin above — the default `'fade'` path
  // has no cell divs to inspect any more (see checkerboard-single-mount.test.tsx
  // for its equivalent "never an empty mask cell" coverage).
  it('checkerboard never draws a cell with nothing in it', () => {
    const node = nodeFor({ kind: 'checkerboard', frames: 15, gridSize: 3, squareAnimation: 'scale' });
    const { container, unmount } = mountNode(node, 0.5, { to: null });
    const cells = cellsOf(container);
    expect({
      cells: cells.length,
      empty: cells.filter((c) => c.childElementCount === 0).length,
      a: count(container, 'a'),
    }).toEqual({ cells: 9, empty: 0, a: 1 });
    unmount();
  });

  // ---- pixelate -----------------------------------------------------------
  // WAS: the root `AbsoluteFill` was painted opaque black unconditionally, so
  // at a cut the transition's first frame was FULL BLACK and the outgoing clip
  // vanished rather than dissolving.
  // IS: no opaque root at all — A is an input, drawn beneath B.
  it('pixelate paints no opaque root and holds the outgoing clip visible beneath the incoming one', () => {
    const node = nodeFor({ kind: 'pixelate', frames: 15 });
    const sample = (progress: number) => {
      const { container, unmount } = mountNode(node, progress);
      const opaqueBlack = [...container.querySelectorAll('div')].filter(
        (d) => d.style.backgroundColor === 'rgb(0, 0, 0)',
      ).length;
      const layerOpacity = (id: 'a' | 'b') =>
        (container.querySelector(`[data-testid="${id}"]`)?.parentElement as HTMLElement | null)?.style.opacity;
      const out = { progress, opaqueBlack, from: layerOpacity('a'), to: layerOpacity('b') };
      unmount();
      return out;
    };
    expect([0, 0.5].map(sample)).toEqual([
      // Progress 0: the outgoing clip, fully opaque, with nothing painted over
      // it — the frame a cut must still show as the window opens.
      { progress: 0, opaqueBlack: 0, from: '1', to: '0' },
      { progress: 0.5, opaqueBlack: 0, from: '1', to: '1' },
    ]);
  });

  // PHASE 5 TASK 2.2 — a DEDICATED pin for "the same filter/transform string on
  // BOTH `LayerOp.style`s, differing only in opacity" (design §2.4's `pixelate`
  // row). Found NECESSARY by the deletion-mutation sweep: `maxBlockSize`'s own
  // differential test (the generic `NODE_KINDS` param-delivery block) stays
  // green even with the shared `filter` deleted entirely, because
  // `maxBlockSize` ALSO drives the grid-lines plate's `backgroundSize` — a
  // second, independent observable of the same param that the differential
  // check happily latches onto instead. Nothing else in this file asserted the
  // blur filter reaches `from`/`to` at all before this test existed.
  it('pixelate applies the SAME blur filter to both from/to, differing only in opacity', () => {
    const node = nodeFor({ kind: 'pixelate', frames: 15 });
    const { container, unmount } = mountNode(node, 0.5);
    const filterOf = (id: 'a' | 'b') =>
      (container.querySelector(`[data-testid="${id}"]`)?.parentElement as HTMLElement | null)?.style.filter;
    const fromFilter = filterOf('a');
    const toFilter = filterOf('b');
    unmount();
    expect(fromFilter).toBeTruthy();
    expect(fromFilter).toContain('blur(');
    expect(fromFilter).toBe(toFilter);
  });

  // PHASE 5 TASK 2.2 FIX ROUND — a reel-edge regression `mountNode`'s default
  // inputs (real `a`/`b` on both sides) can never exercise, and the pixel
  // harness caught: `pixelate`'s `to`-opacity curve reaches 1 by progress 0.4
  // (`toOpacity = interpolate(progress, [0, 0.4, 1], [0, 1, 1])`), which is
  // exactly right when `to` is a REAL incoming clip crossfading in — but at a
  // TRAILING reel edge `to === null`, so core materialises it as an `EdgePlate`
  // (a flat background-colour rectangle, design §2.5) and stacks it ABOVE the
  // outgoing clip (`video-track.tsx`: "a trailing-edge one's materialised `to`
  // plate sits above that item"). Feeding THAT plate the same rising opacity
  // curve makes a flat background rectangle go fully opaque by progress 0.4
  // and sit on top of the still-fading-out `from` clip for the entire back
  // half of the transition — a visible premature curtain the old `composite`
  // arm never had, because it rendered NOTHING at all for a null side
  // (`{to === null ? null : plate(to, toOpacity)}`), leaving `from` to fade
  // out on its own and reveal the true background only once it actually
  // finished. Measured on the real pipeline: `pixelate__exit__p05` (a
  // trailing-edge probe reel sampled at progress 0.5) moved from a warm
  // orange numeral clearly visible to a flat, differently-toned picture with
  // no numeral at all — max 8×8 cell delta 124 of 255, not a rounding-level
  // drift. `wipe`/`fade-to-color`/`gradient-wipe` do not share this defect:
  // `wipe`'s swap instant is covered by its own opaque sheet plate, `fade-to
  // -color`'s dip plate is already opaque by the time its `to` opacity needs
  // to rise, and `gradient-wipe` never touches `to`'s opacity at all (only
  // `maskImage`, which is 0%-revealed at progress 0) — confirmed by the
  // golden diff, which named only `pixelate` cells.
  it('pixelate does not let a materialised reel-edge plate curtain over the real clip that is still fading out', () => {
    const node = nodeFor({ kind: 'pixelate', frames: 15 });
    const EDGE_BG = '#123456';
    const EDGE_RGB = 'rgb(18, 52, 86)';
    // The EdgePlate is the ONLY thing painted with this exact background —
    // pixelate's own overlay plates (grid cells, RGB-split ghosts, …) use
    // their own hardcoded colours, never a caller-supplied background, so this
    // locates the materialised edge plate without depending on DOM shape (the
    // same technique `platesOf` in the "reel edge" describe below uses).
    const edgePlateOpacity = (container: HTMLElement) => {
      const plate = [...container.querySelectorAll('div')].find((d) => d.style.backgroundColor === EDGE_RGB);
      return plate?.parentElement?.style.opacity ?? null;
    };
    const fromOpacityOf = (container: HTMLElement) =>
      (container.querySelector('[data-testid="a"]')?.parentElement as HTMLElement | null)?.style.opacity;

    // Trailing edge: `to` is the reel edge (nothing follows this clip).
    // Progress 0.7 is well past the 0.4 knot where `toOpacity` already
    // reached 1 for a real incoming clip — exactly the region where a
    // materialised edge plate must NOT do the same.
    const { container, unmount } = mountPlan(node, { from: A, to: null }, 0.7, EDGE_BG, 15);
    const fromOpacity = fromOpacityOf(container);
    const toEdgeOpacity = edgePlateOpacity(container);
    unmount();
    // The real `from` clip must still be visibly fading per its OWN curve
    // (not already at 0 — that would be a different defect), and the
    // materialised edge plate standing in for the missing `to` must not be
    // opaque enough to hide it.
    expect(Number(fromOpacity)).toBeGreaterThan(0);
    expect(Number(toEdgeOpacity)).toBe(0);

    // Symmetric check — leading edge (`from === null`, nothing precedes this
    // clip). Structurally this side is stacked BENEATH the real `to` clip
    // (`video-track.tsx`: "a leading-edge plan boundary's materialised `from`
    // plate belongs BELOW the incoming clip"), so an opaque edge plate here
    // does not visibly curtain anything — but the node should still treat a
    // null side as "nothing to show" for the same reason the trailing edge
    // must, rather than relying on z-order alone to hide the inconsistency.
    const { container: c2, unmount: u2 } = mountPlan(node, { from: null, to: B }, 0.2, EDGE_BG, 15);
    const fromEdgeOpacity = edgePlateOpacity(c2);
    u2();
    expect(Number(fromEdgeOpacity)).toBe(0);
  });

  // ---- scanline-glitch ----------------------------------------------------
  // WAS (Task 2.1): never touched opacity and never read `presentationDirection`,
  // so at a cut the incoming clip was simply THERE from the transition's first
  // frame and the cut effectively landed half a window early. Its jittered RGB
  // copies were invisible too, buried under an opaque third `AbsoluteFill`.
  // IS (Task 2.1): an explicit blend — B fades in over A — with the RGB-split
  // copies ramped by the transition's own peak, so they are visible mid-cut and
  // gone at both ends.
  // EDITED (Phase 5 Task 0.2): the RGB split used to be two more DOM mounts of
  // the same `from`/`to` pair (6 media mounts total). It is now a single SVG
  // filter (`feOffset` → `feColorMatrix` ×3 → `feBlend`) applied once to the
  // one mounted blend, so there is no DOM div carrying `mixBlendMode: 'screen'`
  // any more — the "glitch" assertion below now reads the filter's own
  // alpha-scale primitives instead, and `incoming`/`outgoing` drop from
  // three mounts to one. See `checkerboard-single-mount.test.tsx`'s sibling
  // file, `scanline-glitch-single-mount.test.tsx`, for the dedicated wiring
  // coverage (mount counts, filter application, mutation-tested primitives).
  it('scanline-glitch blends the incoming clip in over the outgoing one and ramps its glitch layers', () => {
    const node = nodeFor({ kind: 'scanline-glitch', frames: 15 });
    const sample = (progress: number) => {
      const { container, unmount } = mountNode(node, progress);
      // The alpha-scale row of each `feColorMatrix[type="matrix"]` ends
      // `<peak> 0` — reading it back is how this test observes `peak` without
      // reaching into module internals.
      const alphaScales = [...container.querySelectorAll('feColorMatrix[type="matrix"]')].map((el) => {
        const values = el.getAttribute('values') ?? '';
        const parts = values.trim().split(/\s+/);
        return parts[parts.length - 2];
      });
      const out = {
        progress,
        incoming: [...container.querySelectorAll('[data-testid="b"]')].map(
          (el) => (el.parentElement as HTMLElement).style.opacity,
        ),
        glitch: alphaScales,
        outgoing: count(container, 'a'),
      };
      unmount();
      return out;
    };
    expect([0, 0.5, 1].map(sample)).toEqual([
      // Progress 0 is the outgoing clip, clean: B fully transparent, both RGB
      // copies' alpha-scale (peak) at 0.
      { progress: 0, incoming: ['0'], glitch: ['0', '0'], outgoing: 1 },
      { progress: 0.5, incoming: ['0.5'], glitch: ['1', '1'], outgoing: 1 },
      { progress: 1, incoming: ['1'], glitch: ['0', '0'], outgoing: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Task 2.4 — six presentation props existed only as the PRESENTATION's own
// destructured defaults, with no schema field a config could set:
// glitch.{intensity,slices,rgbShift,scanLines}, whip-pan.blurAmount,
// zoom-through.zoomAmount. "Six props, six pins" — one assertion per prop, so
// a wiring break in any single one is caught by NAME rather than swallowed by
// the other five still forwarding correctly.
// ---------------------------------------------------------------------------
describe('Task 2.4 — the orphan knobs reach the presentation', () => {
  const glitchBase = { kind: 'glitch', frames: 15 };
  const whipPanBase = { kind: 'whip-pan', frames: 15, direction: 'left' };
  // `direction`, not the deprecated `from` — Task 2.5 unified the spelling.
  const zoomThroughBase = { kind: 'zoom-through', frames: 15, direction: 'in' };

  // DELIVERY half — an authored, non-default value must reach the
  // presentation's props bag under its own name.
  it('glitch.intensity reaches the presentation', () => {
    const p = presentationFor({ ...glitchBase, intensity: 0.35 } as never, DIMS)!;
    expect((p.props as Record<string, unknown>).intensity).toBe(0.35);
  });

  it('glitch.slices reaches the presentation', () => {
    const p = presentationFor({ ...glitchBase, slices: 20 } as never, DIMS)!;
    expect((p.props as Record<string, unknown>).slices).toBe(20);
  });

  it('glitch.rgbShift reaches the presentation', () => {
    const p = presentationFor({ ...glitchBase, rgbShift: false } as never, DIMS)!;
    expect((p.props as Record<string, unknown>).rgbShift).toBe(false);
  });

  it('glitch.scanLines reaches the presentation', () => {
    const p = presentationFor({ ...glitchBase, scanLines: false } as never, DIMS)!;
    expect((p.props as Record<string, unknown>).scanLines).toBe(false);
  });

  it('whip-pan.blurAmount reaches the presentation', () => {
    const p = presentationFor({ ...whipPanBase, blurAmount: 65 } as never, DIMS)!;
    expect((p.props as Record<string, unknown>).blurAmount).toBe(65);
  });

  it('zoom-through.zoomAmount reaches the presentation', () => {
    const p = presentationFor({ ...zoomThroughBase, zoomAmount: 2.4 } as never, DIMS)!;
    expect((p.props as Record<string, unknown>).zoomAmount).toBe(2.4);
  });

  // PARITY half — an authored literal that OMITS the field (every glitch,
  // whip-pan and zoom-through literal in both brand repos, today) must forward
  // `undefined` at this boundary, not a value hardcoded in the render map —
  // that is what lets the PRESENTATION's own destructured default apply and
  // keeps the rendered pixels byte-identical. Defaults, read off the
  // presentation source:
  //   glitch.tsx:39-42       intensity 0.8, slices 8, rgbShift true, scanLines true
  //   whip-pan.tsx:28        blurAmount 20
  //   zoom-through.tsx:29    zoomAmount 1.8
  it.each([
    ['glitch', glitchBase, 'intensity'],
    ['glitch', glitchBase, 'slices'],
    ['glitch', glitchBase, 'rgbShift'],
    ['glitch', glitchBase, 'scanLines'],
    ['whip-pan', whipPanBase, 'blurAmount'],
    ['zoom-through', zoomThroughBase, 'zoomAmount'],
  ] as const)('%s: an omitted %s forwards undefined (parity)', (_kind, base, prop) => {
    const p = presentationFor(base as never, DIMS)!;
    expect((p.props as Record<string, unknown>)[prop]).toBeUndefined();
  });
});

describe('AtCutTransition drives ONE node off the boundary-local frame', () => {
  const NODE_DIMS = { width: 1080, height: 1920, fps: 30 };

  beforeEach(() => {
    clock.frame = 0;
  });

  const spyNode = (seen: TransitionNodeProps[]): TransitionNode => ({
    composite: (props: TransitionNodeProps) => {
      seen.push(props);
      return (
        <>
          {props.from}
          {props.to}
        </>
      );
    },
  });

  it('ramps progress 0→1 across the boundary', () => {
    const seen: TransitionNodeProps[] = [];
    for (const [frame, expected] of [[0, 0], [5, 0.5], [10, 1]] as const) {
      clock.frame = frame;
      const { unmount } = render(
        <AtCutTransition node={spyNode(seen)} from={<div />} to={<div />} frames={10} dims={NODE_DIMS} />,
      );
      expect({ frame, progress: seen.at(-1)!.progress }).toEqual({ frame, progress: expected });
      unmount();
    }
  });

  // CORE CLAMPS, PRESENTATIONS NEVER DO. `whipPan` and `zoomThrough` set no
  // extrapolateLeft/Right and would run away outside the window; the boundary's
  // own Sequence normally bounds the frame, but the clamp is what makes [0,1] a
  // property of the CONTRACT rather than of one caller.
  it('clamps progress to [0,1] for a frame outside the window', () => {
    const seen: TransitionNodeProps[] = [];
    for (const [frame, expected] of [[-4, 0], [40, 1]] as const) {
      clock.frame = frame;
      const { unmount } = render(
        <AtCutTransition node={spyNode(seen)} from={null} to={<div />} frames={10} dims={NODE_DIMS} />,
      );
      expect({ frame, progress: seen.at(-1)!.progress }).toEqual({ frame, progress: expected });
      unmount();
    }
  });

  it('forwards both inputs, the boundary length, the dimensions and the palette', () => {
    const seen: TransitionNodeProps[] = [];
    clock.frame = 5;
    render(
      <AtCutTransition
        node={spyNode(seen)}
        from={<div data-testid="a" />}
        to={<div data-testid="b" />}
        frames={10}
        dims={{ ...NODE_DIMS, palette: PALETTE }}
      />,
    );
    expect(seen).toHaveLength(1);
    expect(seen[0].durationInFrames).toBe(10);
    expect({ w: seen[0].width, h: seen[0].height, fps: seen[0].fps }).toEqual({ w: 1080, h: 1920, fps: 30 });
    expect(seen[0].palette).toBe(PALETTE);
    expect(seen[0].from).not.toBeNull();
    expect(seen[0].to).not.toBeNull();
  });

  it('draws both inputs plainly when the kind resolved to nothing (a hard cut)', () => {
    const { container } = render(
      <AtCutTransition node={null} from={<div data-testid="content" />} to={<div data-testid="content" />} frames={10} dims={NODE_DIMS} />,
    );
    expect(container.querySelectorAll('[data-testid="content"]')).toHaveLength(2);
  });
});

// The compatibility route: the five official presentations are one-sided by
// design, and so is every brand registration written against Task 1.2. Core
// LIFTS them rather than asking brands to migrate.
describe('fromRemotionPresentation lifts a one-sided presentation', () => {
  const trace = (order: string[]): AnyPresentation => ({
    component: (props: Record<string, unknown>) => {
      order.push(props.presentationDirection as string);
      return <>{props.children as React.ReactNode}</>;
    },
    props: { marker: 1 },
  });

  it('renders `from` through EXITING and `to` through ENTERING, entering on top', () => {
    const order: string[] = [];
    const node = fromRemotionPresentation(trace(order));
    const Composite = compositeOf(node);
    const { container } = render(
      <Composite
        from={<div data-testid="a" />}
        to={<div data-testid="b" />}
        progress={0.5}
        durationInFrames={10}
        width={1080}
        height={1920}
        fps={30}
        palette={[]}
        background="transparent"
      />,
    );
    expect(order).toEqual(['exiting', 'entering']);
    expect(container.querySelectorAll('[data-testid="a"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="b"]')).toHaveLength(1);
  });

  // TASK 1.3's "renders NOTHING on a null side" IS DELIBERATELY REVERSED HERE.
  // Drawing nothing reproduced the pre-1.3 pixels exactly — and, with them, the
  // defect: a presentation whose exiting branch is the identity function had no
  // input to draw, so seven kinds did nothing at all as a `transitionOut`. Both
  // branches now always run; a null side is a plate of `background`. With
  // `background: 'transparent'` (the no-theme caller) that plate paints
  // nothing, which is how the old pixels survive where no theme is threaded.
  it('runs BOTH branches on a null side, feeding it the background plate', () => {
    const order: string[] = [];
    const node = fromRemotionPresentation(trace(order));
    const Composite = compositeOf(node);
    const { container } = render(
      <Composite
        from={null}
        to={<div data-testid="b" />}
        progress={0.5}
        durationInFrames={10}
        width={1080}
        height={1920}
        fps={30}
        palette={[]}
        background="#123456"
      />,
    );
    expect(order).toEqual(['exiting', 'entering']);
    expect(
      [...container.querySelectorAll('div')].filter((d) => d.style.backgroundColor === 'rgb(18, 52, 86)'),
    ).toHaveLength(1);
  });

  it('forwards the presentation’s own props as passedProps', () => {
    const seen: Record<string, unknown>[] = [];
    const node = fromRemotionPresentation({
      component: (props: Record<string, unknown>) => {
        seen.push(props);
        return null;
      },
      props: { marker: 42 },
    });
    const Composite = compositeOf(node);
    render(
      <Composite from={null} to={<div />} progress={0.25} durationInFrames={12} width={1} height={2} fps={30} palette={[]} background="transparent" />,
    );
    expect(seen[0].passedProps).toEqual({ marker: 42 });
    expect(seen[0].presentationProgress).toBe(0.25);
    expect(seen[0].presentationDurationInFrames).toBe(12);
  });
});

describe('transitionNodeFor is the render path', () => {
  it('lifts a core kind into a two-input node', () => {
    const node = transitionNodeFor({ kind: 'fade', frames: 15 } as TransitionRecord, DIMS);
    expect(node).not.toBeNull();
    expect(isTransitionNode(node!)).toBe(true);
  });

  it('returns null for a kind nobody knows', () => {
    expect(transitionNodeFor({ kind: 'nope', frames: 15 } as unknown as TransitionRecord, DIMS)).toBeNull();
  });

  it('passes a natively two-input registration through unlifted', () => {
    const composite = () => null;
    const node = transitionNodeFor({ kind: 'brand-x', frames: 15 } as unknown as TransitionRecord, {
      ...DIMS,
      transitions: { 'brand-x': { renderer: () => ({ composite }) } },
    });
    expect(compositeOf(node!)).toBe(composite);
  });

  // TASK R1 — MEMOIZATION, pinned at the wiring (Review Round 1, Important
  // findings 1 and 2). `transitionNodeFor` caches the RESOLVED node so an
  // unrelated re-render doesn't hand a stable boundary a fresh element type
  // (see the fix's own docblock above `transitionNodeFor`); these two tests
  // pin the two ways that cache could quietly stop doing its job.
  describe('the memoization cache (Task R1 Fix 3)', () => {
    // The cache is module-level and lives for the whole process (same as
    // `warnOnce`'s SEEN set) — these tests reason about eviction ORDER, which
    // is only deterministic from a known-empty cache, so each one starts by
    // forgetting whatever the other 150+ tests in this file already put in it.
    beforeEach(() => {
      resetTransitionNodeCache();
    });

    it('returns the SAME node for an unchanged (kind, params, dims)', () => {
      const t = { kind: 'fade', frames: 15 } as TransitionRecord;
      const first = transitionNodeFor(t, DIMS);
      const second = transitionNodeFor({ ...t }, { ...DIMS }); // a fresh object, same content
      expect(second).toBe(first);
    });

    // IMPORTANT 1 (Review Round 1): a plain FIFO evicts in INSERTION order,
    // which is backwards for this workload — a reel's STABLE boundaries are
    // inserted first (oldest), so they would be the FIRST evicted once a
    // slider drag alone has pushed `TRANSITION_NODE_CACHE_LIMIT` new keys
    // through the cache, silently undoing Fix 3 for every boundary the user
    // is NOT dragging. Reproduces that exact shape: one record ("the stable
    // boundary") resolved once, then `frames` walked through > the cache
    // limit worth of distinct values ("the drag"), then the stable record
    // resolved again.
    it('does not evict a stable boundary just because other boundaries were resolved many times (LRU, not FIFO)', () => {
      // Models what `buildVideoNodes` actually does on every render: it
      // resolves EVERY boundary's `transitionNodeFor`, not only the one whose
      // slider is moving — so a stable boundary is RE-REQUESTED, with
      // unchanged params, on every single render a drag causes, interleaved
      // with the dragged boundary's own ever-changing key. A stale "resolved
      // once, then ignored" probe (this test's first draft) would go LRU-evicted
      // too and prove nothing — the point of LRU is specifically that a
      // REPEATEDLY-touched entry survives while one-off entries around it
      // don't, so the touch has to be repeated to be a fair test of that.
      const stable = { kind: 'fade', frames: 999 } as TransitionRecord;
      // Captured ONCE, before the drag — and never reassigned inside the
      // loop. An earlier draft of this test reassigned it to the RETURN of
      // every re-request inside the loop, which made it silently track its
      // own eviction/recreation instead of detecting it: once evicted and
      // recreated mid-loop, the tracked "expected" value just became the new
      // node, and the final comparison passed trivially even against a
      // reverted (non-LRU) cache. Confirmed live — this exact mistake shipped
      // once, passed against the un-fixed code, and was only caught by a
      // manual trace.
      const stableNode = transitionNodeFor(stable, DIMS);

      // Frame counts far outside anything another test in this file would
      // plausibly use (so each is guaranteed a NEW, one-off cache entry) —
      // well more than `TRANSITION_NODE_CACHE_LIMIT` of them, so a FIFO cache
      // would have evicted `stable` (the oldest entry) long before this loop
      // ends, even though it is re-requested every step.
      for (let frames = 100_000; frames < 100_100; frames += 1) {
        transitionNodeFor(stable, DIMS); // re-requested every "render", return value ignored
        transitionNodeFor({ kind: 'fade', frames } as TransitionRecord, DIMS);
      }

      expect(transitionNodeFor(stable, DIMS)).toBe(stableNode);
    });

    // IMPORTANT 2 (Review Round 1): the cache is keyed first by the
    // TRANSITIONS REGISTRY object via a WeakMap specifically so two
    // registries that happen to register the SAME kind name with DIFFERENT
    // renderers can never collide on an identical JSON key. Deleting that
    // registry scoping (i.e. caching globally regardless of which registry
    // resolved a kind) stayed green under every other test in this repo —
    // this is the one that would have caught it.
    it('does not serve one registry’s node for another registry’s same-named kind', () => {
      const compositeA = () => null;
      const compositeB = () => null;
      const t = { kind: 'brand-sweep', frames: 15 } as unknown as TransitionRecord;

      const nodeA = transitionNodeFor(t, { ...DIMS, transitions: { 'brand-sweep': { renderer: () => ({ composite: compositeA }) } } });
      const nodeB = transitionNodeFor(t, { ...DIMS, transitions: { 'brand-sweep': { renderer: () => ({ composite: compositeB }) } } });

      expect(compositeOf(nodeA!)).toBe(compositeA);
      expect(compositeOf(nodeB!)).toBe(compositeB);
      expect(nodeB).not.toBe(nodeA);
    });
  });
});

// ---------------------------------------------------------------------------
// THE REEL'S TWO EDGES (Phase 4 Task 2.2).
//
// A boundary with `to === null` is the reel's TRAILING edge; one with
// `from === null` is its LEADING edge. Until this task the missing side was
// simply not drawn, and every kind whose EXITING branch is the identity
// function therefore did nothing at all as a `transitionOut` — measured, not
// assumed: `fade`, `dissolve`, a colourless `fade-to-color`, `burn`,
// `clock-wipe`, `iris`, `gradient-wipe` (the brief's seven) and `checkerboard`,
// which Task 2.1 deliberately left drawing no grid there.
//
// The model's answer is that the missing neighbour IS the composition
// background: a fade against `null` is a fade to `theme.background`. The
// colour is THREADED (AtCutTransition → TransitionNodeProps.background), never
// hardcoded — a literal `#000` here would be the exact brand-leak class this
// programme exists to remove, and `reel-edge-background.test.tsx` pins the
// thread end to end.
//
// EIGHT near-identical per-kind tests, deliberately. One generic category test
// would stay green while an individual kind regressed, and these are eight
// independent presentations, not eight instances of one.
// ---------------------------------------------------------------------------
describe('a reel edge resolves the missing input to the theme background', () => {
  const BG = '#123456';
  const BG_RGB = 'rgb(18, 52, 86)';
  const OTHER_BG = '#654321';
  const OTHER_RGB = 'rgb(101, 67, 33)';

  const CLIP = <div data-testid="clip" />;

  const mount = (
    kind: string,
    inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null },
    progress: number,
    background = BG,
    // `fade-to-color` needs both: a `color` key on the record, and a palette to
    // resolve it against. Every other kind here is palette-independent, so both
    // default to the empty case they have always used.
    extra: Record<string, unknown> = {},
    palette: readonly AccentSlot[] = [],
  ) => {
    const t = { ...(defaultTransition(kind, { frames: 20 }) as object), ...extra } as unknown as TransitionRecord;
    const node = transitionNodeFor(t, { ...DIMS, palette })!;
    // Task 2.1 moved `fade`/`dissolve`/`slide`/`flip`/`clock-wipe`/`iris`/
    // colourless `fade-to-color` onto the `plan` arm, which has no
    // `.composite` — `mountPlan` (defined near `compositeOf`, above)
    // exercises the SAME picture through `LayerOp.wrap`, the way `LayerShell`
    // actually drives it.
    if (typeof node.plan === 'function') {
      return mountPlan(
        node,
        { from: inputs.from === undefined ? CLIP : inputs.from, to: inputs.to === undefined ? CLIP : inputs.to },
        progress,
        background,
        20,
      );
    }
    const Composite = compositeOf(node);
    return render(
      <Composite
        from={inputs.from === undefined ? CLIP : inputs.from}
        to={inputs.to === undefined ? CLIP : inputs.to}
        progress={progress}
        durationInFrames={20}
        width={1080}
        height={1920}
        fps={30}
        palette={palette}
        background={background}
      />,
    );
  };

  /** Every element painted with the given background colour. The edge plate is
   *  the ONLY thing core paints, so this locates it without knowing the
   *  presentation's own DOM shape. */
  const platesOf = (container: HTMLElement, rgb = BG_RGB) =>
    [...container.querySelectorAll('div')].filter((d) => d.style.backgroundColor === rgb);

  /** What the presentation did TO the plate: the style its parent carries.
   *  A no-op exiting branch leaves this constant across progress; a working
   *  one does not. */
  const trailingSample = (kind: string, progress: number) => {
    const { container, unmount } = mount(kind, { to: null }, progress);
    const plate = platesOf(container)[0];
    const out = {
      plates: platesOf(container).length,
      opacity: plate?.parentElement?.style.opacity ?? null,
      style: plate?.parentElement?.getAttribute('style') ?? null,
    };
    unmount();
    return out;
  };

  // ---- the lifted one-sided presentations ----------------------------------
  //
  // Their entering branch reveals the incoming picture; at the trailing edge
  // that picture is now the background plate, so the outgoing clip visibly
  // resolves to it. The observable is per-kind on purpose: `opacity` for the
  // opacity reveals, a gradient mask for `gradient-wipe`, a clip path for the
  // two shape wipes.
  //
  // PHASE 5 TASK 2.3 adds `glitch`, `light-leak`, `whip-pan`, `zoom-blur` to
  // this family — measured, not assumed: each one's ENTERING opacity is a
  // plain `interpolate(presentationProgress, [0, 1], [0, 1])` (verified
  // against each presentation's own source), the identical shape `fade`'s is,
  // so the plate's opacity at progress 0.25/0.75 is `0.25`/`0.75` exactly the
  // same way. `zoom-through` does NOT join this list — its entering opacity
  // ramps non-linearly (`interpolate(progress, [0, 0.4, 1], [0, 1, 1])`), so
  // `0.25` reads `0.625`, not `0.25` — it gets its own dedicated test below,
  // the same shape `wipe`'s got in Task 2.2's fix round for the same reason
  // (a kind whose curve does not fit the shared numeric expectation).
  it.each(['fade', 'dissolve', 'burn', 'glitch', 'light-leak', 'whip-pan', 'zoom-blur'] as const)(
    '%s fades the theme background IN over the outgoing clip at the trailing edge',
    (kind) => {
      const at = (p: number) => {
        const s = trailingSample(kind, p);
        return { plates: s.plates, opacity: s.opacity };
      };
      expect([at(0.25), at(0.75)]).toEqual([
        { plates: 1, opacity: '0.25' },
        { plates: 1, opacity: '0.75' },
      ]);
    },
  );

  // `zoom-through`'s own trailing-edge test — see the comment above for why
  // it cannot join the shared `it.each`. `zoomThrough.tsx`'s entering opacity
  // is `interpolate(progress, [0, 0.4, 1], [0, 1, 1])`: it reaches full
  // opacity by progress 0.4 and HOLDS there, so at both 0.25 and 0.75 the
  // materialised background plate is genuinely visible (opacity rising then
  // flat), never curtaining prematurely over real content the way a wrong
  // fix elsewhere in this task (`pixelate`'s Task 2.2 defect) did — there is
  // no "real content" left to curtain over at a reel edge in the first
  // place, since the missing side IS the plate.
  it('zoom-through fades the theme background IN over the outgoing clip at the trailing edge, on its own non-linear curve', () => {
    const at = (p: number) => {
      const s = trailingSample('zoom-through', p);
      return { plates: s.plates, opacity: s.opacity };
    };
    expect([at(0.25), at(0.75)]).toEqual([
      { plates: 1, opacity: '0.625' },
      { plates: 1, opacity: '1' },
    ]);
  });

  // A `fade-to-color` WITH a colour is not in that family: it is a two-input
  // node, not a lifted one-sided presentation, so its trailing edge is the DIP
  // resolving into the background rather than the background fading in
  // linearly. Both must still be there — the dip plate AND the theme background
  // it hands off to — which is what this pins.
  //
  // Moved here from an identical pin that named a brand-derived kind hardwired
  // to a black core had chosen. The kind is gone; the CAPABILITY is unchanged,
  // and the colour is now the author's, resolved through the brand palette.
  it('fade-to-color dips through its colour and then resolves into the theme background at the trailing edge', () => {
    // `secondary` = #abcdef. Deliberately NOT black: a black here would be
    // indistinguishable from a colour core had picked.
    const DIP_RGB = 'rgb(171, 205, 239)';
    const at = (p: number) => {
      const { container, unmount } = mount(
        'fade-to-color',
        { to: null },
        p,
        BG,
        { color: 'secondary' },
        PALETTE,
      );
      const plate = platesOf(container)[0];
      const dip = [...container.querySelectorAll('div')].filter((d) => d.style.backgroundColor === DIP_RGB);
      const out = {
        bgPlates: platesOf(container).length,
        // The background plate is the INCOMING side here, held back behind the
        // dip exactly as a real clip would be.
        bgOpacity: plate?.parentElement?.style.opacity ?? null,
        dipOpacity: dip[0]?.style.opacity ?? null,
      };
      unmount();
      return out;
    };
    expect([at(0.25), at(0.75)]).toEqual([
      { bgPlates: 1, bgOpacity: '0', dipOpacity: '0.5' },
      { bgPlates: 1, bgOpacity: '0.5', dipOpacity: '1' },
    ]);
  });

  it('gradient-wipe sweeps the theme background in along its gradient at the trailing edge', () => {
    const a = trailingSample('gradient-wipe', 0.25);
    const b = trailingSample('gradient-wipe', 0.75);
    expect({ plates: a.plates, gradient: a.style?.includes('linear-gradient') }).toEqual({
      plates: 1,
      gradient: true,
    });
    expect(a.style).not.toBe(b.style);
  });

  it.each(['clock-wipe', 'iris'] as const)(
    '%s clips the theme background over the outgoing clip at the trailing edge',
    (kind) => {
      const a = trailingSample(kind, 0.25);
      const b = trailingSample(kind, 0.75);
      expect({ plates: a.plates, clipped: a.style?.includes('path(') }).toEqual({
        plates: 1,
        clipped: true,
      });
      expect(a.style).not.toBe(b.style);
    },
  );

  // ---- `wipe` (Phase 5 Task 2.2 fix round — Important 3) ------------------
  //
  // `wipe` is a NATIVE two-input node Task 2.2 migrated, not one of the seven
  // lifted one-sided presentations above — and it answers the "what does a
  // materialised edge plate do" contract question the OPPOSITE way from
  // `pixelate` (same task, same file): `pixelate` forces a null side's
  // opacity to a flat `0` (see `pixelate.tsx`'s own comment); `wipe` lets the
  // plate follow its ordinary `to`/`from` curve, exactly like a real clip
  // would. Both are correct, on two DIFFERENT properties of the same
  // contract question ("a node can no longer decline the edge plate"):
  //
  //   - `wipe`'s `from`/`to` opacities are STRICTLY COMPLEMENTARY — at every
  //     progress, exactly one of them is `1` and the other is `0` (a hard
  //     swap behind an opaque sheet, never both visible at once). So letting
  //     the null side's opacity rise is safe: it only ever becomes visible
  //     at the exact instant the REAL side has already dropped to `0`, and
  //     the swap instant itself sits behind the sheet's own full coverage
  //     (`translateX(0%)` at progress 0.5, the same frame `to`'s opacity
  //     flips). This is the SAME mechanism the seven lifted presentations
  //     above are tested for (their trailing-edge test IS "the background
  //     plate follows the entering curve, same as a real clip would").
  //   - `pixelate`'s `from`/`to` opacities OVERLAP by design (a genuine
  //     cross-dissolve: both sides can be `1` simultaneously, e.g. progress
  //     0.5) and NOTHING covers the swap — so applying the same curve to a
  //     flat-colour plate composites it directly against still-fully-visible
  //     real content, which is the defect this task's fix round closed.
  //
  // Measured (not reasoned) via the node's own `plan()` output at the
  // trailing edge (`to === null`): `to.style.opacity` is `0` for progress <
  // 0.5, and jumps to `1` at exactly progress 0.5 — the same frame the sheet
  // (`layers[0].style.transform`) reaches `translateX(0%)`, full coverage.
  // The background is then revealed PROGRESSIVELY as the sheet slides off
  // toward progress 1, which is the intended picture for a wipe transition
  // whether what's next is a real clip or nothing.
  it('wipe reveals the theme background behind the departing sheet at the trailing edge, not before', () => {
    const at = (p: number) => {
      const s = trailingSample('wipe', p);
      return { plates: s.plates, opacity: s.opacity };
    };
    expect([at(0.25), at(0.5), at(0.75)]).toEqual([
      // Before the sheet covers: the background must NOT be visible yet —
      // the outgoing clip's own beat is still showing (covered by the
      // approaching sheet, not by a premature background reveal).
      { plates: 1, opacity: '0' },
      // Exactly at the covering instant: the swap has happened, hidden.
      { plates: 1, opacity: '1' },
      // Past it: the sheet is sliding away, background progressively shown.
      { plates: 1, opacity: '1' },
    ]);
  });

  // ---- the native node Task 2.1 left for this task ------------------------
  //
  // 2.1 made `checkerboard` draw NO grid when `to === null`, explicitly
  // deferring "what should a checkerboard to nowhere look like?" here. It is
  // cells of background: the same answer the other seven get.
  //
  // Phase 5 Task 0.1 moved the DEFAULT `squareAnimation: 'fade'` path onto a
  // single SVG-masked `to` mount, so "cells of background" now lives in the
  // mask's `<rect>`s (`fillOpacity`), not in 64 separate background-plate
  // divs — there is exactly ONE plate (the masked layer itself). The mask's
  // rect count/alpha is the structural equivalent of the old `plates`/`lit`
  // pin, and is asserted here directly rather than moved to the new file: it
  // IS the trailing-edge case this describe block exists for.
  //
  // Fix round 1 (I-1): the `plates`/`lit` counts above read `fillOpacity`
  // values but never checked those values are attached to anything — a
  // deletion sweep found the `<foreignObject>`'s `mask={...}` attribute could
  // be removed with `plates`/`lit` both still passing (a de facto hard cut
  // with the background plate not masked at all reads identically to them).
  // `wired` closes that: the single plate must live INSIDE a foreignObject
  // whose `mask` attribute names the real `<mask>` element's id.
  it('checkerboard reveals the theme background cell by cell at the trailing edge', () => {
    const cellsAt = (p: number) => {
      const { container, unmount } = mount('checkerboard', { to: null }, p);
      const plates = platesOf(container);
      const rects = [...container.querySelectorAll('mask rect')];
      const lit = rects.filter((r) => Number(r.getAttribute('fill-opacity')) > 0).length;
      const maskEl = container.querySelector('mask');
      const foreignObject = container.querySelector('foreignObject');
      const wired =
        maskEl !== null &&
        foreignObject !== null &&
        foreignObject.getAttribute('mask') === `url(#${maskEl.id})` &&
        foreignObject.contains(plates[0] ?? null);
      unmount();
      return { plates: plates.length, cells: rects.length, lit, wired };
    };
    const early = cellsAt(0.25);
    const late = cellsAt(0.9);
    // ONE masked background plate (not 64 — Task 0.1's single mount), the
    // default 8x8 grid of alpha values living in the mask, more of them lit
    // late than early, and the plate ACTUALLY inside the masked foreignObject
    // — not just a fillOpacity value sitting nearby.
    expect(early.plates).toBe(1);
    expect(late.plates).toBe(1);
    expect(early.cells).toBe(64);
    expect(late.cells).toBe(64);
    expect(late.lit).toBeGreaterThan(early.lit);
    expect(early.wired).toBe(true);
    expect(late.wired).toBe(true);
  });

  // ---- the LEADING edge, the mirror case ----------------------------------
  //
  // `from === null`. The plate goes through the EXITING branch, which for these
  // eight is the identity — so the incoming clip resolves out of the background
  // rather than out of nothing. Same mechanism, so one pin per family is enough
  // here; what must not happen is the plate silently disappearing.
  //
  // `wipe` joins this list too (Task 2.2 fix round) — its exiting branch is
  // NOT the identity (the plate's own opacity still follows `wipe`'s step
  // curve, per the dedicated trailing-edge test above), but the assertion
  // here is purely structural — exactly one background plate exists — which
  // holds regardless of that curve's value, since `EdgePlate` is always
  // materialised whether or not the op currently makes it visible.
  //
  // PHASE 5 TASK 2.3 — `glitch`, `light-leak`, `whip-pan`, `zoom-through`,
  // `zoom-blur` join for the SAME reason `wipe` did, not for the "identity"
  // reason the original eight did: none of these five has an identity
  // EXITING branch (each applies a real, progress-driven opacity/transform to
  // its own exiting side — see `EXPECT_LIVE_DIFFERS` in
  // `plan-neutral-progress.test.tsx`, which pins exactly this). The assertion
  // stays purely structural regardless of the curve's value, for the same
  // reason `wipe`'s does.
  it.each([
    'fade', 'dissolve', 'fade-to-color', 'burn', 'gradient-wipe', 'clock-wipe', 'iris', 'wipe',
    'glitch', 'light-leak', 'whip-pan', 'zoom-through', 'zoom-blur',
  ] as const)(
    '%s draws the theme background beneath the incoming clip at the leading edge',
    (kind) => {
      const { container } = mount(kind, { from: null }, 0.5);
      expect(platesOf(container)).toHaveLength(1);
    },
  );

  // Task 0.1: the default `'fade'` path mounts the incoming clip ONCE, masked
  // — not once per cell. "the cells carry the real incoming clip" is now true
  // via the mask's alpha, not via 64 separate clipped copies of it.
  it('checkerboard draws the theme background beneath its cells at the leading edge', () => {
    const { container } = mount('checkerboard', { from: null }, 0.5);
    // One beneath the grid; the (single, masked) incoming clip is the other.
    expect(platesOf(container)).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="clip"]')).toHaveLength(1);
  });

  // ---- the colour FOLLOWS THE THEME ---------------------------------------
  //
  // The mutation that matters: a hardcoded `#000` would satisfy every
  // assertion above if BG happened to be black. It is not, and this says why.
  it.each(['fade', 'checkerboard'] as const)(
    '%s paints the edge with whatever background it was handed, not a fixed colour',
    (kind) => {
      const one = mount(kind, { to: null }, 0.5, BG);
      const two = mount(kind, { to: null }, 0.5, OTHER_BG);
      expect({
        first: platesOf(one.container, BG_RGB).length > 0,
        firstIsOther: platesOf(one.container, OTHER_RGB).length > 0,
        second: platesOf(two.container, OTHER_RGB).length > 0,
      }).toEqual({ first: true, firstIsOther: false, second: true });
    },
  );

  // A caller with no background in scope must not have a colour invented for
  // it — `transparent` paints nothing and leaves whatever is behind the video
  // track showing, which is the pre-2.2 pixel.
  it('paints nothing when the caller supplies no background', () => {
    const { container } = mount('fade', { to: null }, 0.5, 'transparent');
    // The plate is still THERE (the branch runs) — it is just invisible. The
    // assertion is on the colour, so a hardcoded colour in `EdgePlate` breaks
    // this case as loudly as it breaks the differential test above.
    expect(platesOf(container, 'transparent')).toHaveLength(1);
    expect([...platesOf(container, BG_RGB), ...platesOf(container, OTHER_RGB), ...platesOf(container, 'rgb(0, 0, 0)')])
      .toHaveLength(0);
  });

  // The first link of the thread. `reel-edge-background.test.tsx` pins the rest
  // of it (theme.background → LayeredReelComposition → buildVideoNodes → here).
  it('AtCutTransition hands the node the background it was given, and `transparent` when it has none', () => {
    const seen: TransitionNodeProps[] = [];
    const node: TransitionNode = {
      composite: (props: TransitionNodeProps) => {
        seen.push(props);
        return null;
      },
    };
    clock.frame = 5;
    const base = { width: 1080, height: 1920, fps: 30 };
    render(<AtCutTransition node={node} from={<div />} to={null} frames={10} dims={{ ...base, background: BG }} />);
    render(<AtCutTransition node={node} from={<div />} to={null} frames={10} dims={base} />);
    expect(seen.map((p) => p.background)).toEqual([BG, 'transparent']);
  });
});

// ---------------------------------------------------------------------------
// HONEST VOCABULARY: A FADE'S COLOUR IS A PARAMETER (Phase 4 Task 2.3).
//
// Three kinds rendered byte-identically — `fade`, `dissolve`, and a third whose
// name was ONE BRAND'S COLOUR WORD, all `() => fade()` — while that third one's
// label promised a dip that never happened. The plan's reading, and the point
// of the task: A MISLEADING NAME IS USUALLY A MISSING PARAMETER. It was not a
// rename; it was a fade whose COLOUR was never exposed.
//
// The brand-named kind has since been REMOVED FROM CORE OUTRIGHT rather than
// aliased: core ships the mechanism, the brand supplies the colour. Everything
// the alias used to pin lives here now, against `fade-to-color` with an
// explicit colour —
//
//  - the DIP itself (opaque colour plate at the midpoint, incoming clip held
//    back): "dips through the NON-BLACK colour it is given" + "holds the
//    incoming clip back until the colour has covered";
//  - the DIFFERENTIAL against the plain crossfade: "the dip belongs to a
//    fade-to-color WITH a colour";
//  - the TRAILING-EDGE behaviour: "fade-to-color dips through its colour and
//    then resolves into the theme background", in the reel-edge block above.
//
// No deprecation `it`s remain, because there is no deprecated kind to warn
// about: a baked literal naming the removed kind now fails to PARSE, loudly,
// which is the intended migration signal.
// ---------------------------------------------------------------------------
describe('a fade’s colour is a parameter (fade-to-color)', () => {
  const A = <div data-testid="a" />;
  const B = <div data-testid="b" />;

  const mountKind = (
    t: Record<string, unknown>,
    progress: number,
    palette: readonly AccentSlot[] = PALETTE,
  ) => {
    const node = transitionNodeFor(t as unknown as TransitionRecord, { ...DIMS, palette })!;
    // `fade`, `dissolve` and colourless `fade-to-color` are `plan`-arm since
    // Task 2.1 (see `mountPlan`, defined near `compositeOf`, above) — only a
    // COLOURED `fade-to-color` is still the native two-input `composite` node
    // this block was built around.
    if (typeof node.plan === 'function') {
      return mountPlan(node, { from: A, to: B }, progress, 'transparent', 15);
    }
    const Composite = compositeOf(node);
    return render(
      <Composite
        from={A}
        to={B}
        progress={progress}
        durationInFrames={15}
        width={1080}
        height={1920}
        fps={30}
        palette={palette}
        background="transparent"
      />,
    );
  };

  /** Every painted layer in the tree — a `fade` paints none at all, so this is
   *  both "is there a colour plate" and "what colour is it". */
  const paintedIn = (container: HTMLElement) =>
    [...container.querySelectorAll('div')].filter((d) => d.style.backgroundColor !== '');

  const htmlAt = (t: Record<string, unknown>, progresses = [0, 0.25, 0.5, 0.75, 1]) =>
    progresses
      .map((p) => {
        const { container, unmount } = mountKind(t, p);
        const html = container.innerHTML;
        unmount();
        return html;
      })
      .join('\n');

  // ---- THE CAPABILITY: an AUTHORED colour is honoured ---------------------

  // Deliberately a NON-BLACK colour. A test that some fixed black still renders
  // would be testing a colour CORE chose; what this pins is that the colour is
  // the author's, and reaches the picture through the BRAND's palette.
  it('dips through the NON-BLACK colour it is given, resolved through the brand palette', () => {
    const t = { kind: 'fade-to-color', frames: 15, color: 'secondary' };
    const at = (p: number) => {
      const { container, unmount } = mountKind(t, p);
      const painted = paintedIn(container);
      const out = {
        progress: p,
        plates: painted.length,
        color: painted[0]?.style.backgroundColor,
        opacity: painted[0]?.style.opacity,
      };
      unmount();
      return out;
    };
    // #abcdef — the brand's `secondary` slot, not a colour core chose.
    const C = 'rgb(171, 205, 239)';
    expect([at(0), at(0.25), at(0.5), at(1)]).toEqual([
      { progress: 0, plates: 1, color: C, opacity: '0' },
      { progress: 0.25, plates: 1, color: C, opacity: '0.5' },
      // The midpoint IS the colour: fully opaque, with the incoming clip not
      // yet ramping. That is what makes it a dip rather than a crossfade.
      { progress: 0.5, plates: 1, color: C, opacity: '1' },
      { progress: 1, plates: 1, color: C, opacity: '1' },
    ]);
  });

  it('holds the incoming clip back until the colour has covered', () => {
    const opacityOfB = (p: number) => {
      const { container, unmount } = mountKind({ kind: 'fade-to-color', frames: 15, color: 'primary' }, p);
      const layer = container.querySelector('[data-testid="b"]')!.parentElement!;
      const o = layer.style.opacity;
      unmount();
      return o;
    };
    expect([opacityOfB(0), opacityOfB(0.5), opacityOfB(0.75), opacityOfB(1)]).toEqual(['0', '0', '0.5', '1']);
  });

  // The differential discipline the four two-input nodes get for their tunable
  // params, applied to this kind's ONE param. `accent`-typed params are skipped
  // by that generic check (they have no in-bounds probe value to invent), so
  // the new colour needs its own.
  it('renders differently for two different palette slots, and differently again with none', () => {
    const primary = htmlAt({ kind: 'fade-to-color', frames: 15, color: 'primary' });
    const secondary = htmlAt({ kind: 'fade-to-color', frames: 15, color: 'secondary' });
    const none = htmlAt({ kind: 'fade-to-color', frames: 15 });
    expect(primary).not.toBe(secondary);
    expect(primary).not.toBe(none);
  });

  it('invents no colour when the key is not in the brand’s palette', () => {
    const { container, unmount } = mountKind({ kind: 'fade-to-color', frames: 15, color: 'no-such-slot' }, 0.5);
    expect(paintedIn(container)).toHaveLength(0);
    unmount();
    // …and the same when there is no palette in scope at all.
    const bare = mountKind({ kind: 'fade-to-color', frames: 15, color: 'primary' }, 0.5, []);
    expect(paintedIn(bare.container)).toHaveLength(0);
    bare.unmount();
  });

  // ---- THE DIP IS A DIP, AND IT BELONGS TO THIS KIND ALONE ----------------
  //
  // MOVED, not deleted. This assertion used to name a brand-derived kind that
  // core hardwired to a `#000000` of its own choosing; that kind is gone from
  // core entirely (the colour word was one brand's, and core had no business
  // holding it). The capability it carried — "a dip is opaque at the midpoint
  // and holds the incoming clip back, and a plain crossfade does neither" — is
  // exactly what is pinned below, now against a colour the AUTHOR named.
  //
  // The colour is deliberately not black. A black would be indistinguishable
  // from a colour core picked, which is the thing being removed.

  it('the dip belongs to a fade-to-color WITH a colour — fade and dissolve render the plain crossfade', () => {
    const dip = { kind: 'fade-to-color', frames: 15, color: 'secondary' };
    // The dip: one opaque plate at the midpoint, in the brand's own colour…
    const { container: mid, unmount: unmountMid } = mountKind(dip, 0.5);
    const painted = paintedIn(mid);
    expect({ plates: painted.length, color: painted[0]?.style.backgroundColor, opacity: painted[0]?.style.opacity })
      .toEqual({ plates: 1, color: 'rgb(171, 205, 239)', opacity: '1' });
    unmountMid();

    // …with the incoming clip still held back behind it. That pairing is what
    // makes it a dip rather than a crossfade.
    const opacityOfB = (t: Record<string, unknown>, p: number) => {
      const { container, unmount } = mountKind(t, p);
      const o = container.querySelector('[data-testid="b"]')!.parentElement!.style.opacity;
      unmount();
      return o;
    };
    expect([opacityOfB(dip, 0.5), opacityOfB(dip, 0.75)]).toEqual(['0', '0.5']);

    // The crossfades paint NO plate at all, at the same progress.
    for (const kind of ['fade', 'dissolve'] as const) {
      const { container, unmount } = mountKind({ kind, frames: 15 }, 0.5);
      expect({ kind, plates: paintedIn(container).length }).toEqual({ kind, plates: 0 });
      unmount();
    }
    // `fade` and `dissolve` remain synonyms of each other, and a coloured
    // `fade-to-color` is emphatically neither.
    expect(htmlAt({ kind: 'dissolve', frames: 15 })).toBe(htmlAt({ kind: 'fade', frames: 15 }));
    expect(htmlAt(dip)).not.toBe(htmlAt({ kind: 'fade', frames: 15 }));
    for (const kind of ['fade', 'dissolve'] as const) {
      // Still ONE-SIDED presentations, so the six `presentationFor` call sites
      // in the PP repo keep working for both.
      expect({ kind, oneSided: presentationFor({ kind, frames: 15 } as TransitionRecord, DIMS) !== null }).toEqual({
        kind,
        oneSided: true,
      });
    }
  });

  // ---- CORE WARNS ABOUT NO KIND IN THIS FAMILY ----------------------------
  //
  // There is nothing deprecated left here to warn about. The kind that used to
  // carry a `warnOnce` was REMOVED rather than deprecated, so a baked literal
  // naming it now fails to PARSE — loudly, at the schema, which is a better
  // signal than a console line nobody reads in a render farm.

  it('says nothing about any of the fade kinds', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (const kind of ['fade', 'dissolve', 'fade-to-color'] as const) {
        expect(transitionNodeFor({ kind, frames: 15 } as TransitionRecord, DIMS)).not.toBeNull();
      }
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });
});

// ---------------------------------------------------------------------------
// ONE NAME PER CONCEPT — `zoom-through.direction` (Phase 4 Task 2.5)
//
// `zoom-through` said `from: 'in'|'out'` while `zoom-blur` said
// `direction: 'in'|'out'` for the IDENTICAL concept, and the disagreement was
// papered over by a RENAMED translation table in this very file. Two answers
// to one question, which `lib/transitions/index.ts` records as deliberately
// eliminated for `clock-wipe`.
//
// `direction` is canonical. `from` survives as a DEPRECATED ALIAS, because
// silently reinterpreting or dropping a baked literal is the one thing this
// workstream must never do (the same rule that made Task 2.3 keep `fade`
// meaning crossfade).
// ---------------------------------------------------------------------------
describe('zoom-through says `direction`, like every other kind', () => {
  const directionOf = (t: Record<string, unknown>) =>
    (presentationFor(t as unknown as TransitionRecord, DIMS)!.props as Record<string, unknown>).direction;

  it('parses and forwards `direction`', () => {
    const t = { kind: 'zoom-through', frames: 15, direction: 'out' };
    expect(CoreTransitionSchema.safeParse(t).success).toBe(true);
    expect(directionOf(t)).toBe('out');
  });

  it('offers `direction` — and NOT the deprecated `from` — as the editor control', () => {
    const props = subOptionsFor('zoom-through').map((o) => o.prop);
    expect({ direction: props.includes('direction'), from: props.includes('from') }).toEqual({
      direction: true,
      from: false,
    });
  });

  // THE ALIAS, pinned separately from the canonical spelling: one test covering
  // both would assert too little about either.
  it('still renders a baked `from` literal exactly as it always did', () => {
    const t = { kind: 'zoom-through', frames: 15, from: 'out' };
    expect(CoreTransitionSchema.safeParse(t).success).toBe(true);
    expect(directionOf(t)).toBe('out');
  });

  it('lets `direction` win when a literal somehow carries both', () => {
    expect(directionOf({ kind: 'zoom-through', frames: 15, direction: 'out', from: 'in' })).toBe('out');
  });

  it('warns once about the deprecated `from`, without refusing to render it', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const t = { kind: 'zoom-through', frames: 15, from: 'out' } as unknown as TransitionRecord;
      expect(presentationFor(t, DIMS)).not.toBeNull();
      expect(presentationFor(t, DIMS)).not.toBeNull();
      expect(warn.mock.calls).toHaveLength(1);
      const message = String(warn.mock.calls[0][0]);
      expect(message).toContain('zoom-through');
      expect(message).toContain('direction');
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });

  it('says nothing when the canonical spelling is used', () => {
    resetWarnOnce();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const t = { kind: 'zoom-through', frames: 15, direction: 'out' } as unknown as TransitionRecord;
      expect(presentationFor(t, DIMS)).not.toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      resetWarnOnce();
    }
  });
});
