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
import type { AccentSlot } from '@video-toolkit/lib/theming/palette';
import { paramChoices, type ParamOption } from '@video-toolkit/lib/reel-config-base/param-field';

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
    // `accent` is covered by the palette test below. `string`/`color` are
    // brand-supplied assets (burn's mask path, its glow hex) with no
    // in-bounds probe value to invent — they became sub-options in Phase 4
    // Task 1.1 and are pinned by the editor tests, not by this render probe.
    if (opt.type === 'accent' || opt.type === 'string' || opt.type === 'color') continue;
    const v = probeValueFor(kind, opt.prop, opt.type as 'enum' | 'number' | 'boolean', opt.options);
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
  it('exactly four core kinds are native two-input nodes', () => {
    expect([...NODE_KINDS].sort()).toEqual(['checkerboard', 'pixelate', 'scanline-glitch', 'wipe']);
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
      expect(warn.mock.calls).toHaveLength(NODE_KINDS.length);
      for (const kind of NODE_KINDS) {
        expect(warn.mock.calls.filter(([m]) => String(m).includes(`"${kind}"`))).toHaveLength(1);
      }
      expect(String(warn.mock.calls[0][0])).toContain('HARD CUT');
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
    expect(typeof node!.composite).toBe('function');
    // A native node has NO one-sided form to hand back; every other kind still
    // does, and brands' `presentationFor` call sites still get it.
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
    const Composite = node.composite;
    const inputs: Array<[React.ReactNode | null, React.ReactNode | null]> = [
      [<div key="a" />, <div key="b" />],
      // The reel's leading and trailing edges — a node must survive a missing
      // neighbour rather than special-casing it upstream.
      [null, <div key="b" />],
      [<div key="a" />, null],
    ];
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
            />,
          ).unmount(),
        ).not.toThrow();
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
      const key = RENAMED[kind]?.[prop] ?? prop;
      const expected = VALUE_MAP[kind]?.[prop] ? VALUE_MAP[kind]![prop](value) : value;
      expect({ prop, got: (p.props as Record<string, unknown>)[key] }).toEqual({ prop, got: expected });
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
// and it fails whether the value is dropped at the forwarding table or ignored
// inside the node itself.
//
// Three progress points, because a param need only bite at one of them:
// `pixelate.randomness` is provably inert at 0.5 (every cell's reveal clamps to
// 1 once pixelIntensity peaks) and only shows on the ramp.
// ---------------------------------------------------------------------------
describe.each(NODE_KINDS)('two-input node %s delivers every authored param', (kind) => {
  const PROBE_PROGRESS = [0.2, 0.5, 0.8];

  const renderedFor = (t: Record<string, unknown>) =>
    PROBE_PROGRESS.map((progress) => {
      const Composite = transitionNodeFor(t as TransitionRecord, { ...DIMS, palette: PALETTE })!.composite;
      const { container, unmount } = render(
        <Composite
          from={<div data-testid="a" />}
          to={<div data-testid="b" />}
          progress={progress}
          durationInFrames={15}
          width={1080}
          height={1920}
          fps={30}
          palette={PALETTE}
        />,
      );
      const html = container.innerHTML;
      unmount();
      return html;
    }).join('\n');

  // `accent` is pinned by the palette tests below; `string`/`color` are
  // brand-supplied assets with no in-bounds probe value to invent (burn only).
  const tunable = subOptionsFor(kind).filter(
    (o) => o.type !== 'accent' && o.type !== 'string' && o.type !== 'color',
  );

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
  const sheetColorFor = (t: TransitionRecord, dims: Parameters<typeof transitionNodeFor>[1]) => {
    const Composite = transitionNodeFor(t, dims)!.composite;
    const { container, unmount } = render(
      <Composite from={null} to={null} progress={0.5} durationInFrames={15} width={1080} height={1920} fps={30} palette={[]} />,
    );
    const sheet = [...container.querySelectorAll('div')].find((d) => d.style.backgroundColor !== '');
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

  const mountNode = (
    node: TransitionNode,
    progress: number,
    inputs: { from?: React.ReactNode | null; to?: React.ReactNode | null } = {},
  ) => {
    const Composite = node.composite;
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
      />,
    );
  };

  const count = (container: HTMLElement, id: 'a' | 'b') =>
    container.querySelectorAll(`[data-testid="${id}"]`).length;

  const cellsOf = (container: HTMLElement) =>
    [...container.querySelectorAll('div')].filter((d) => d.style.transformOrigin === 'center center');

  // ---- wipe ---------------------------------------------------------------
  // WAS: both beats ran over the SAME window, entering drawn on top, so its
  // sheet already sat at translateX(0%) at progress 0 and the whole frame
  // flashed to the accent colour on the transition's first frame.
  // IS: two SEQUENTIAL beats over one window — sheet in over A across the first
  // half, sheet out off B across the second.
  it('wipe sweeps its sheet IN over the outgoing clip, then OUT to reveal the incoming one', () => {
    const node = nodeFor({ kind: 'wipe', frames: 15, color: 'secondary', direction: 'left' }, PALETTE);
    const sample = (progress: number) => {
      const { container, unmount } = mountNode(node, progress);
      const sheet = [...container.querySelectorAll('div')].find((d) => d.style.backgroundColor !== '');
      const out = {
        progress,
        shows: count(container, 'a') ? 'outgoing' : count(container, 'b') ? 'incoming' : 'neither',
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
  it('checkerboard clips the INCOMING clip into every cell over an intact outgoing clip', () => {
    const node = nodeFor({ kind: 'checkerboard', frames: 15, gridSize: 3 });
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

  it('checkerboard draws no cells at all when there is no incoming clip — no empty-cell artefact', () => {
    const node = nodeFor({ kind: 'checkerboard', frames: 15, gridSize: 3 });
    const { container, unmount } = mountNode(node, 0.5, { to: null });
    expect({ cells: cellsOf(container).length, a: count(container, 'a') }).toEqual({ cells: 0, a: 1 });
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

  // ---- scanline-glitch ----------------------------------------------------
  // WAS: never touched opacity and never read `presentationDirection`, so at a
  // cut the incoming clip was simply THERE from the transition's first frame
  // and the cut effectively landed half a window early. Its jittered RGB copies
  // were invisible too, buried under an opaque third `AbsoluteFill`.
  // IS: an explicit blend — B fades in over A — with the RGB-split copies
  // ramped by the transition's own peak, so they are visible mid-cut and gone
  // at both ends.
  it('scanline-glitch blends the incoming clip in over the outgoing one and ramps its glitch layers', () => {
    const node = nodeFor({ kind: 'scanline-glitch', frames: 15 });
    const sample = (progress: number) => {
      const { container, unmount } = mountNode(node, progress);
      const out = {
        progress,
        incoming: [...container.querySelectorAll('[data-testid="b"]')].map(
          (el) => (el.parentElement as HTMLElement).style.opacity,
        ),
        glitch: [...container.querySelectorAll('div')]
          .filter((d) => d.style.mixBlendMode === 'screen')
          .map((d) => d.style.opacity),
        outgoing: count(container, 'a'),
      };
      unmount();
      return out;
    };
    expect([0, 0.5, 1].map(sample)).toEqual([
      // Progress 0 is the outgoing clip, clean: B fully transparent, both RGB
      // copies invisible.
      { progress: 0, incoming: ['0', '0', '0'], glitch: ['0', '0'], outgoing: 3 },
      { progress: 0.5, incoming: ['0.5', '0.5', '0.5'], glitch: ['1', '1'], outgoing: 3 },
      { progress: 1, incoming: ['1', '1', '1'], glitch: ['0', '0'], outgoing: 3 },
    ]);
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
    const Composite = node.composite;
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
      />,
    );
    expect(order).toEqual(['exiting', 'entering']);
    expect(container.querySelectorAll('[data-testid="a"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="b"]')).toHaveLength(1);
  });

  it('renders NOTHING on a null side — which is how a reel edge keeps its pixels', () => {
    const order: string[] = [];
    const node = fromRemotionPresentation(trace(order));
    const Composite = node.composite;
    render(
      <Composite
        from={null}
        to={<div data-testid="b" />}
        progress={0.5}
        durationInFrames={10}
        width={1080}
        height={1920}
        fps={30}
        palette={[]}
      />,
    );
    expect(order).toEqual(['entering']);
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
    const Composite = node.composite;
    render(
      <Composite from={null} to={<div />} progress={0.25} durationInFrames={12} width={1} height={2} fps={30} palette={[]} />,
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
    expect(node!.composite).toBe(composite);
  });
});
