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
  // FOUR, and the count is a measurement of the PROBE, not of the catalog.
  // `fade-to-color` is a node only when its `color` key resolves — a dip has no
  // one-sided form, but a colourless `fade-to-color` is not a dip at all, it is
  // the plain `fade()`. `probeTransitionFor` deliberately skips `accent`-typed
  // sub-options (there is no in-bounds key to invent for a palette core does
  // not own), so the probe carries no colour and the kind resolves one-sided
  // here. That CONDITIONAL ARITY is reviewed and accepted, and it is pinned
  // directly — with and without a colour — in "a fade’s colour is a parameter"
  // below, so it cannot drift unnoticed just because this list does not name it.
  //
  // The fifth entry used to be a brand-named fade kind hardwired to a black
  // core had chosen for it. It was removed from core entirely; the colour is
  // the brand's to name now, which is why the arity became conditional.
  it('exactly four kinds are native two-input nodes AT THEIR CATALOG DEFAULT — not a statement about the catalog', () => {
    expect([...NODE_KINDS].sort()).toEqual(['checkerboard', 'pixelate', 'scanline-glitch', 'wipe']);
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
              background="transparent"
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
          background="transparent"
        />,
      );
      const html = container.innerHTML;
      unmount();
      return html;
    }).join('\n');

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
  const sheetColorFor = (t: TransitionRecord, dims: Parameters<typeof transitionNodeFor>[1]) => {
    const Composite = transitionNodeFor(t, dims)!.composite;
    const { container, unmount } = render(
      <Composite from={null} to={null} progress={0.5} durationInFrames={15} width={1080} height={1920} fps={30} palette={[]} background="transparent" />,
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
        background="transparent"
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

  // TASK 2.1's "no cells when there is no incoming clip" PIN IS GONE, replaced
  // rather than deleted. 2.1 answered the trailing edge with "draw nothing",
  // which is what made `checkerboard` the eighth exiting no-op; Task 2.2's
  // model answers it with the composition background, so the grid IS drawn and
  // its cells carry a background plate. The replacement lives in
  // 'a reel edge resolves the missing input to the theme background' below —
  // and the empty-cell artefact 2.1 actually removed (a cell drawn with no
  // content AND no background) stays impossible, because there is no longer a
  // code path that puts nothing inside a cell.
  it('checkerboard never draws a cell with nothing in it', () => {
    const node = nodeFor({ kind: 'checkerboard', frames: 15, gridSize: 3 });
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
    const Composite = node.composite;
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
    const Composite = node.composite;
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
    expect(node!.composite).toBe(composite);
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
    const Composite = transitionNodeFor(t, { ...DIMS, palette })!.composite;
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

  // ---- the seven lifted one-sided presentations ---------------------------
  //
  // Their entering branch reveals the incoming picture; at the trailing edge
  // that picture is now the background plate, so the outgoing clip visibly
  // resolves to it. The observable is per-kind on purpose: `opacity` for the
  // four opacity reveals, a gradient mask for `gradient-wipe`, a clip path for
  // the two shape wipes.

  it.each(['fade', 'dissolve', 'burn'] as const)(
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

  // ---- the native node Task 2.1 left for this task ------------------------
  //
  // 2.1 made `checkerboard` draw NO grid when `to === null`, explicitly
  // deferring "what should a checkerboard to nowhere look like?" here. It is
  // cells of background: the same answer the other seven get.
  it('checkerboard reveals the theme background cell by cell at the trailing edge', () => {
    const cellsAt = (p: number) => {
      const { container, unmount } = mount('checkerboard', { to: null }, p);
      const plates = platesOf(container);
      const lit = plates.filter((d) => {
        const cell = d.parentElement?.parentElement;
        return cell !== null && cell !== undefined && cell.style.opacity !== '0';
      }).length;
      unmount();
      return { plates: plates.length, lit };
    };
    const early = cellsAt(0.25);
    const late = cellsAt(0.9);
    // The default 8x8 grid, every cell carrying the background plate, and more
    // of them lit late than early.
    expect(early.plates).toBe(64);
    expect(late.plates).toBe(64);
    expect(late.lit).toBeGreaterThan(early.lit);
  });

  // ---- the LEADING edge, the mirror case ----------------------------------
  //
  // `from === null`. The plate goes through the EXITING branch, which for these
  // eight is the identity — so the incoming clip resolves out of the background
  // rather than out of nothing. Same mechanism, so one pin per family is enough
  // here; what must not happen is the plate silently disappearing.
  it.each(['fade', 'dissolve', 'fade-to-color', 'burn', 'gradient-wipe', 'clock-wipe', 'iris'] as const)(
    '%s draws the theme background beneath the incoming clip at the leading edge',
    (kind) => {
      const { container } = mount(kind, { from: null }, 0.5);
      expect(platesOf(container)).toHaveLength(1);
    },
  );

  it('checkerboard draws the theme background beneath its cells at the leading edge', () => {
    const { container } = mount('checkerboard', { from: null }, 0.5);
    // One beneath the grid; the cells carry the real incoming clip.
    expect(platesOf(container)).toHaveLength(1);
    expect(container.querySelectorAll('[data-testid="clip"]')).toHaveLength(64);
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
    const Composite = node.composite;
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
