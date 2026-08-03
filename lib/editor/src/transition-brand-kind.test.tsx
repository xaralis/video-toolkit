// A BRAND TRANSITION KIND, END TO END THROUGH THE EDITOR — Task 1.2b.
//
// Task 1.2 gave the transition axis a registry, so a brand kind authored in
// `Root.tsx` RENDERS. The editor was still catalog-only, and that made it the
// last place where "a brand adds a transition without touching core" was false
// — in two distinct ways, pinned separately below:
//
//  (a) DATA LOSS. The video-lane route coerced any kind not in
//      `TRANSITION_CATALOG` to `{ kind: 'cut' }` before handing it to the
//      picker. The brand's transition was DISPLAYED as "Cut", and the first
//      touch of any control in that section wrote the coercion back through
//      `onChange`. Same class as Task 1.4's dropped `alignment` and Task 1.5's
//      `enabled`, and the same rule applies: a field (here, a whole kind) with
//      no editor control must at least SURVIVE the editor untouched.
//
//  (b) NO CAPABILITY. Surviving is the floor. The kind must also be
//      SELECTABLE (picker sourced from the theme's registered kinds ∪ the
//      catalog) and EDITABLE through the `params` its registration already
//      declares — the same descriptor Task 1.1 unified across both axes, and
//      the one `editorMetaFromTheme` already derives for the overlay and video
//      axes.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector, TransitionFields } from '../app/LayeredInspector';
import { editorMetaFromTheme } from '../app/editor-meta';
import { transitionParamsFor } from '../app/transitions';
import type { CompositionTheme } from '../../theming/types';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { DraftTransition } from '@video-toolkit/lib/reel-config-base/transition-schema';

const BRAND_KIND = 'sand-sweep';

/** A reel whose single clip carries a transition core has never heard of. */
const reelWith = (transitionOut: Record<string, unknown>): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0, transitionOut } as never],
    audio: [],
    music: { baseVolumeDb: -8 },
    brand: [],
    overlays: [],
  },
});

// ---- (a) an unrecognised kind survives the inspector ------------------------

describe('an unrecognised transition kind survives the inspector', () => {
  const authored = { kind: BRAND_KIND, frames: 18, grain: 0.4 };

  it('is DISPLAYED as itself, not as Cut', () => {
    render(
      <LayeredInspector reel={reelWith(authored)} selectedId="video:v1"
        onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect((screen.getByLabelText('Kind') as HTMLSelectElement).value).toBe(BRAND_KIND);
  });

  it('survives a round trip: touching another control does not rewrite it to cut', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector reel={reelWith(authored)} selectedId="video:v1"
        onChange={onChange} onSeek={() => {}} fps={30} />);
    // The length field is the control every frame-bearing kind has, brand kinds
    // included — the cheapest "user touched this section" gesture there is.
    fireEvent.change(screen.getByLabelText('Length (frames)'), { target: { value: '24' } });
    fireEvent.blur(screen.getByLabelText('Length (frames)'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    const out = next.tracks.video[0].transitionOut as unknown as Record<string, unknown>;
    expect(out.kind).toBe(BRAND_KIND);
    expect(out.frames).toBe(24);
    // The kind's own params ride along untouched — nothing in core knows what
    // `grain` means, and that is precisely why it must not be dropped.
    expect(out.grain).toBe(0.4);
  });

  it('still falls back to cut when there is genuinely no transition', () => {
    render(
      <LayeredInspector reel={reelWith(undefined as never)} selectedId="video:v1"
        onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect((screen.getByLabelText('Kind') as HTMLSelectElement).value).toBe('cut');
  });
});

// ---- (b) a brand kind is selectable and carries its declared params ---------

const brandTheme: CompositionTheme = {
  background: '#000',
  accentSlots: [],
  transitions: {
    [BRAND_KIND]: {
      renderer: () => null,
      params: [
        { prop: 'grain', label: 'Grain', type: 'number' },
        { prop: 'sweep', label: 'Sweep', options: ['left', 'right'] },
      ],
    },
  },
};

describe('a brand transition kind is offered by the picker', () => {
  it('appears in the Kind dropdown alongside the core catalog', () => {
    const meta = editorMetaFromTheme(brandTheme);
    render(<TransitionFields t={{ kind: 'cut' }} onChange={() => {}} meta={meta} />);
    const sel = screen.getByLabelText('Kind') as HTMLSelectElement;
    const kinds = Array.from(sel.options).map((o) => o.value);
    expect(kinds).toContain(BRAND_KIND);
    // …and the core catalog is still whole — this ADDS, it does not replace.
    expect(kinds).toContain('dissolve');
    expect(kinds).toContain('cut');
  });

  it('is selectable, and switching to it writes the brand kind', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'dissolve', frames: 12 }} onChange={onChange} meta={editorMetaFromTheme(brandTheme)} />);
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: BRAND_KIND } });
    const next = onChange.mock.calls.at(-1)![0] as DraftTransition;
    expect(next.kind).toBe(BRAND_KIND);
    expect(next.frames).toBe(12);
  });
});

describe('the picker’s kind list is derived from the theme, not hand-fed', () => {
  it('offers a brand kind whose registration declares NO params', () => {
    // The transition axis' derivation deliberately keeps a param-less kind (the
    // other axes drop one) — the key set IS the answer to "which kinds exist",
    // and a look with nothing to tune must still be choosable.
    const meta = editorMetaFromTheme({
      background: '#000', accentSlots: [],
      transitions: { 'plain-brand-kind': { renderer: () => null } },
    });
    expect(meta.transitionProps?.['plain-brand-kind']).toEqual([]);
    render(<TransitionFields t={{ kind: 'cut' }} onChange={() => {}} meta={meta} />);
    const kinds = Array.from((screen.getByLabelText('Kind') as HTMLSelectElement).options).map((o) => o.value);
    expect(kinds).toContain('plain-brand-kind');
  });

  it('does not duplicate a core kind the brand merely OVERRIDES', () => {
    const meta = editorMetaFromTheme({
      background: '#000', accentSlots: [],
      transitions: { dissolve: { renderer: () => null } },
    });
    render(<TransitionFields t={{ kind: 'cut' }} onChange={() => {}} meta={meta} />);
    const kinds = Array.from((screen.getByLabelText('Kind') as HTMLSelectElement).options).map((o) => o.value);
    expect(kinds.filter((k) => k === 'dissolve')).toHaveLength(1);
  });
});

describe('a brand transition kind is edited through its registration params', () => {
  const meta = editorMetaFromTheme(brandTheme);

  it('renders a control per declared param, typed as declared', () => {
    render(<TransitionFields t={{ kind: BRAND_KIND, frames: 18 }} onChange={() => {}} meta={meta} />);
    // `grain` declares `type: 'number'` with no min/max, so (Task 10) it's a
    // ScrubField (`type="text"`, `inputMode="decimal"`), not a number input.
    const grain = screen.getByLabelText('Grain') as HTMLInputElement;
    expect(grain.type).toBe('text');
    expect(grain.inputMode).toBe('decimal');
    // `sweep` has 2 choices, so it routes to SegmentedField, not SelectField.
    expect(screen.getByRole('group', { name: 'Sweep' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'right' })).toBeTruthy();
  });

  it('commits a declared edit onto the transition', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: BRAND_KIND, frames: 18 }} onChange={onChange} meta={meta} />);
    fireEvent.click(screen.getByRole('button', { name: 'right' }));
    const next = onChange.mock.calls.at(-1)![0] as DraftTransition;
    expect(next).toMatchObject({ kind: BRAND_KIND, frames: 18, sweep: 'right' });
  });

  it('declares nothing for a kind the theme never registered', () => {
    render(<TransitionFields t={{ kind: 'ghost-kind', frames: 18 }} onChange={() => {}} meta={meta} />);
    expect(screen.queryByLabelText('Grain')).toBeNull();
    // …but the kind itself is still shown as itself rather than coerced.
    expect((screen.getByLabelText('Kind') as HTMLSelectElement).value).toBe('ghost-kind');
  });

  // A CORE kind must keep exactly the controls it always had. `subOptionsFor`
  // reads them structurally off the catalog entry's zod shape and returns `[]`
  // for a brand kind, so the two sources compose rather than compete.
  it('leaves a core kind’s structural controls exactly as they were', () => {
    render(<TransitionFields t={{ kind: 'slide', frames: 12, direction: 'left' }} onChange={() => {}} meta={meta} />);
    // `slide`'s `direction` has 4 choices, so it's a SegmentedField (Task 10).
    expect(screen.getByRole('button', { name: 'Left' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText('Grain')).toBeNull();
  });
});

// `kind` and `frames` already have controls of their own — the picker and the
// length field. `subOptionsFor` excludes both by name on core's structural
// side; the DECLARED side did not, so a registration naming either got a
// SECOND control beside the real one, writing the same key.
describe('a registration cannot double up the picker or the length field', () => {
  const theme = {
    ...brandTheme,
    transitions: {
      ...brandTheme.transitions,
      'greedy-kind': {
        render: () => null,
        params: [
          { prop: 'kind', label: 'Kind' },
          { prop: 'frames', label: 'Length (frames)' },
          { prop: 'grain', type: 'number' as const },
        ],
      },
    },
  } as unknown as CompositionTheme;

  it('drops a declared `kind` / `frames` param, keeping the real controls only', () => {
    const params = transitionParamsFor('greedy-kind', editorMetaFromTheme(theme).transitionProps);
    expect(params.map((p) => p.prop)).toEqual(['grain']);
  });

  it('renders exactly one Kind control and one length control', () => {
    render(<TransitionFields t={{ kind: 'greedy-kind', frames: 18 }} onChange={() => {}} meta={editorMetaFromTheme(theme)} />);
    expect(screen.getAllByLabelText('Kind')).toHaveLength(1);
    expect(screen.getAllByLabelText(/Length/)).toHaveLength(1);
  });
});
