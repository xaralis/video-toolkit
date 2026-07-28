import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector } from '../app/LayeredInspector';
import type { EditorMeta } from '../app/editor-meta';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

// Phase 4 Task 1.1 collapsed the inspector's TWO parameter dispatches into one
// (`renderParamControl`). Before it there were two vocabularies:
//
//   • the DECLARED-PARAMS path (opaque `props` / effect bags): number, string,
//     boolean, and a bare-`string[]` dropdown. No `accent`.
//   • the HAND-WRITTEN transition path: enum (with `{value,label}` choices),
//     number, boolean, accent. No `string`.
//
// This file drives, through the real inspector, the cases each path used to own
// on the OTHER path — which is the only way to show the collapse kept both
// halves — plus the capability the merge adds: burn's `mask` and `glowColor`,
// which had no control anywhere.

const burnReel: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [
      {
        id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
        transitionOut: { kind: 'burn', frames: 20, mask: 'clouds.png', glowColor: '#ff8800' },
      },
    ],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

const gradientReel: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [
      {
        id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
        transitionOut: { kind: 'gradient-wipe', frames: 6, direction: 'tl-br', softness: 23 },
      },
    ],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

const outroReel: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{ id: 'v1', kind: 'outro', startMs: 0, endMs: 2000, musicBoostDb: 0 }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

const SLOTS = [
  { key: 'gold', label: 'Gold', color: '#f6aa1c' },
  { key: 'rust', label: 'Rust', color: '#b5482c' },
];

// ---------------------------------------------------------------------------
// THE CAPABILITY: burn's two strings become editable, for the first time.
// The line that carries it is the `z.ZodString` branch of `subOptionForField`
// (lib/reel-config-base/transition-schema.ts); remove it and every test in this
// block goes red.
// ---------------------------------------------------------------------------
describe('burn’s mask and glowColor — controls that did not exist before', () => {
  it('renders `mask` as a text input holding its authored value', () => {
    render(<LayeredInspector reel={burnReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    const mask = screen.getByLabelText('Mask') as HTMLInputElement;
    expect(mask.type).toBe('text');
    expect(mask.value).toBe('clouds.png');
  });

  it('renders `glowColor` as a COLOUR control, not a plain text box', () => {
    render(<LayeredInspector reel={burnReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    // The text half stays authoritative and keeps the plain label, so a colour
    // field is queried exactly like any other.
    expect((screen.getByLabelText('Glow color') as HTMLInputElement).value).toBe('#ff8800');
    const swatch = screen.getByLabelText('Glow color swatch') as HTMLInputElement;
    expect(swatch.type).toBe('color');
    expect(swatch.value).toBe('#ff8800');
    // `mask` is a path, not a colour — it gets NO swatch. Both are `z.string()`
    // to zod; the difference is declared in `COLOR_FIELDS` (transition-schema.ts).
    expect(screen.queryByLabelText('Mask swatch')).toBeNull();
  });

  it('commits an edited mask back onto the transition, keeping every sibling', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={burnReel} selectedId="transition:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.change(screen.getByLabelText('Mask'), { target: { value: 'embers.png' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].transitionOut).toEqual({
      kind: 'burn', frames: 20, mask: 'embers.png', glowColor: '#ff8800',
    });
  });

  it('commits a colour picked from the swatch as a string', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={burnReel} selectedId="transition:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.change(screen.getByLabelText('Glow color swatch'), { target: { value: '#0044cc' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.video[0].transitionOut as Record<string, unknown>).glowColor).toBe('#0044cc');
  });

  it('offers both, from empty, on a burn that carries neither', () => {
    const bare: LayeredReel = {
      ...burnReel,
      tracks: {
        ...burnReel.tracks,
        video: [{ ...burnReel.tracks.video[0], transitionOut: { kind: 'burn', frames: 20 } }],
      },
    };
    render(<LayeredInspector reel={bare} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect((screen.getByLabelText('Mask') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Glow color') as HTMLInputElement).value).toBe('');
    // ...and the numeric knobs it always had are still there, still numeric.
    expect((screen.getByLabelText('Edge contrast') as HTMLInputElement).type).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// THE COLLAPSE, half 1: a case the HAND-WRITTEN transition path used to own,
// now reached through the shared dispatch from the DECLARED-PARAMS side.
// ---------------------------------------------------------------------------
describe('accent — a transition-path control, now available to declared params', () => {
  const meta: EditorMeta = { videoProps: { outro: [{ prop: 'tint', type: 'accent' }] } };

  it('renders a brand-palette dropdown for a declared `accent` prop', () => {
    render(
      <LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} accentSlots={SLOTS} />,
    );
    const gold = screen.getByRole('option', { name: 'Gold' }) as HTMLOptionElement;
    expect(gold.value).toBe('gold');
    expect((screen.getByRole('option', { name: 'Rust' }) as HTMLOptionElement).value).toBe('rust');
  });

  it('commits the slot KEY, not its label', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector reel={outroReel} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} meta={meta} accentSlots={SLOTS} />,
    );
    fireEvent.change(screen.getByLabelText('Tint'), { target: { value: 'rust' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].props).toEqual({ tint: 'rust' });
  });

  // The omit-rather-than-show-empty rule travels with the type, so it holds on
  // this path too — and with nothing else declared, the bag reports itself
  // empty rather than rendering a dropdown with no choices.
  it('omits the control (and says so) when there is no brand palette', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect(screen.queryByLabelText('Tint')).toBeNull();
    expect(screen.getByText('No editable params.')).toBeInTheDocument();
  });

  // PRECEDENCE, as documented in lib/reel-config-base/param-field.ts: `accent`
  // is tested BEFORE `options`, so a field declaring both gets the brand
  // palette and its own options are ignored. `accent` is a value DOMAIN (the
  // stored value is a slot KEY only the brand's palette can enumerate), not a
  // control preference, so a core declaration cannot narrow it. The doc said
  // the opposite until this test existed to settle which one is the contract.
  it('renders the brand palette, NOT the declared options, when a field declares both', () => {
    const both: EditorMeta = {
      videoProps: { outro: [{ prop: 'tint', type: 'accent', options: ['not-a-slot'] }] },
    };
    render(
      <LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={both} accentSlots={SLOTS} />,
    );
    expect((screen.getByRole('option', { name: 'Gold' }) as HTMLOptionElement).value).toBe('gold');
    expect(screen.queryByRole('option', { name: 'not-a-slot' })).toBeNull();
  });
});

describe('enum choice LABELS — a transition-path affordance, on both paths', () => {
  // The transition path has always rendered `{value,label}` choices, and
  // gradient-wipe's corner codes are the reason VALUE_LABELS exists.
  it('keeps the human label on the transition path', () => {
    render(<LayeredInspector reel={gradientReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    const tlbr = screen.getByRole('option', { name: 'Top-left → bottom-right' }) as HTMLOptionElement;
    expect(tlbr.value).toBe('tl-br');
  });

  // ...and a declared param may now use the same spelled-out form, which the
  // bare-`string[]` vocabulary could not express.
  it('accepts spelled-out choices in a DECLARED params list', () => {
    const meta: EditorMeta = {
      videoProps: { outro: [{ prop: 'style', options: [{ value: 'organic', label: 'Organic sweep' }, { value: 'fade', label: 'Straight fade' }] }] },
    };
    render(<LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByRole('option', { name: 'Organic sweep' }) as HTMLOptionElement).value).toBe('organic');
  });

  // Backward compatibility, and the reason `options` stayed a union: every
  // existing brand declaration is a bare string list, and a bare string's label
  // is the string itself — NOT humanized, or every dropdown would silently
  // relabel.
  it('still accepts a bare string list, label = the value', () => {
    const meta: EditorMeta = { videoProps: { outro: [{ prop: 'style', options: ['organic', 'fade'] }] } };
    render(<LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByRole('option', { name: 'organic' }) as HTMLOptionElement).value).toBe('organic');
  });
});

// ---------------------------------------------------------------------------
// THE COLLAPSE, half 2: a case the DECLARED-PARAMS path used to own, now
// reached through the shared dispatch from the TRANSITION side.
// ---------------------------------------------------------------------------
describe('declared `type` beats the value’s own type — on the transition path too', () => {
  it('types burn’s absent numeric knob from the schema, not from `undefined`', () => {
    const bare: LayeredReel = {
      ...burnReel,
      tracks: {
        ...burnReel.tracks,
        video: [{ ...burnReel.tracks.video[0], transitionOut: { kind: 'burn', frames: 20 } }],
      },
    };
    const onChange = vi.fn();
    render(<LayeredInspector reel={bare} selectedId="transition:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    // Absent value + declared type → a NUMBER field. Under the old
    // value-presence rule this would have been a text box committing "9".
    fireEvent.change(screen.getByLabelText('Glow band'), { target: { value: '9' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.video[0].transitionOut as Record<string, unknown>).glowBand).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// The two units the merged descriptor adds. Neither converts anything: they
// change the CONTROL, never the stored value.
// ---------------------------------------------------------------------------
describe('percent and angle', () => {
  const meta: EditorMeta = {
    videoProps: {
      outro: [
        { prop: 'opacity', type: 'percent' },
        { prop: 'tilt', type: 'angle' },
        { prop: 'coverage', type: 'percent', min: 10, max: 90, step: 5 },
      ],
    },
  };

  it('bounds a percent to 0–100 and steps an angle in whole degrees', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const opacity = screen.getByLabelText('Opacity') as HTMLInputElement;
    expect(opacity.type).toBe('number');
    expect(opacity.min).toBe('0');
    expect(opacity.max).toBe('100');
    const tilt = screen.getByLabelText('Tilt') as HTMLInputElement;
    expect(tilt.step).toBe('1');
    expect(tilt.min).toBe('');
  });

  it('lets an explicit min/max/step win over the unit’s preset', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const coverage = screen.getByLabelText('Coverage') as HTMLInputElement;
    expect([coverage.min, coverage.max, coverage.step]).toEqual(['10', '90', '5']);
  });

  it('writes the number through unchanged — no ×100, no wrap', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={outroReel} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '65' } });
    expect((onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].props).toEqual({ opacity: 65 });
    fireEvent.change(screen.getByLabelText('Tilt'), { target: { value: '-370' } });
    expect((onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].props).toEqual({ tilt: -370 });
  });
});

// ---------------------------------------------------------------------------
// The schema's own bounds arrive at the control, so a bounded transition param
// is bounded in the UI without anyone restating the range — WITH a step the
// range can actually be traversed in. min/max without a step is worse than
// neither: `<input type=number>` defaults step to 1, so a 0–1 field could only
// spin between 0 and 1 and a typed `0.5` was rejected as a step mismatch.
// ---------------------------------------------------------------------------
function transitionReel(transitionOut: Record<string, unknown>): LayeredReel {
  return {
    ...burnReel,
    tracks: { ...burnReel.tracks, video: [{ ...burnReel.tracks.video[0], transitionOut }] },
  };
}

describe('schema bounds reach the transition control', () => {
  it('gives light-leak’s intensity the schema’s 0..1 range AND a step that fits it', () => {
    render(
      <LayeredInspector reel={transitionReel({ kind: 'light-leak', frames: 20 })} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    const intensity = screen.getByLabelText('Intensity') as HTMLInputElement;
    expect([intensity.min, intensity.max, intensity.step]).toEqual(['0', '1', '0.01']);
  });

  it('accepts a fractional value on that control — the whole point of the step', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector reel={transitionReel({ kind: 'light-leak', frames: 20 })} selectedId="transition:v1" onChange={onChange} onSeek={() => {}} fps={30} />,
    );
    const intensity = screen.getByLabelText('Intensity') as HTMLInputElement;
    fireEvent.change(intensity, { target: { value: '0.5' } });
    // jsdom implements validity.stepMismatch; with the pre-fix step of 1 this
    // is `true` and the value cannot be committed by a real browser.
    expect(intensity.validity.stepMismatch).toBe(false);
    expect((onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].transitionOut).toMatchObject({ intensity: 0.5 });
  });

  it('keeps a whole-number step on a wide range — 8..200 does not become 10', () => {
    render(
      <LayeredInspector reel={transitionReel({ kind: 'pixelate', frames: 20 })} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    const block = screen.getByLabelText('Max block size') as HTMLInputElement;
    expect([block.min, block.max, block.step]).toEqual(['8', '200', '1']);
  });
});
