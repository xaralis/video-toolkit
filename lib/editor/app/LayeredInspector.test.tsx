import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector } from './LayeredInspector';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const base: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
              effects: [{ type: 'vintage', mode: 'film' }] }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

describe('LayeredInspector effect add/remove', () => {
  it('adds a ken-burns effect to a clip that has none of it', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByText('+ Add effect'));
    fireEvent.click(getByText('Ken Burns'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects).toHaveLength(2);
    expect(next.tracks.video[0].effects!.some((e) => e.type === 'ken-burns')).toBe(true);
  });

  it('removes an existing effect', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByLabelText('remove effect vintage'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects ?? []).toHaveLength(0);
  });
});

const overlayReel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [], audio: [], music: { baseVolumeDb: -8 }, brand: [],
    overlays: [{ id: 'ov1', startMs: 0, endMs: 2000, content: { kind: 'text', text: 'Hi' } }],
  },
};

// The gap Task 3 left behind: `SubOption.kind === 'boolean'` and its
// CheckboxField branch were written for the kinds that landed in Task 4, so
// until `pixelate` existed nothing asserted that a boolean sub-option actually
// REACHES the DOM as a checkbox. A control that is only reachable through a
// kind is only verified through a kind — so this drives it through the real
// transitions-lane route rather than rendering CheckboxField in isolation.
const pixelateReel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 4000 },
  tracks: {
    video: [{
      id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
      transitionOut: { kind: 'pixelate', frames: 12, scanlines: true, glitchArtifacts: false },
    }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

describe('LayeredInspector boolean transition sub-options', () => {
  it('renders a checked checkbox for a boolean sub-option that is on', () => {
    render(
      <LayeredInspector reel={pixelateReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    const scanlines = screen.getByLabelText('Scanlines') as HTMLInputElement;
    expect(scanlines.type).toBe('checkbox');
    expect(scanlines.checked).toBe(true);
    // ...and unchecked for the one that is off — not a dropdown, not a number.
    expect((screen.getByLabelText('Glitch artifacts') as HTMLInputElement).checked).toBe(false);
  });

  it('commits the toggled boolean back onto the transition', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector reel={pixelateReel} selectedId="transition:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByLabelText('Scanlines'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].transitionOut).toEqual({
      kind: 'pixelate', frames: 12, scanlines: false, glitchArtifacts: false,
    });
  });
});

describe('LayeredInspector accentSlots', () => {
  it('passes the brand slots to the AccentEditor toolbar', () => {
    render(
      <LayeredInspector
        reel={overlayReel}
        selectedId="overlays:ov1"
        onChange={() => {}}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    expect(screen.getByRole('button', { name: /Gold/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Lime/ })).toBeNull();
  });
});

// wipe's `color` sub-option is the one 'accent' control in the catalog: the
// schema names the field but not its values (see AccentKey in
// transition-schema.ts), so TransitionFields fills the dropdown from whatever
// accentSlots the brand handed the editor, and drops the control entirely
// when there is no palette to choose from (see LayeredInspector.tsx's
// `TransitionFields`, the `opt.kind === 'accent'` branch).
const wipeReel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{
      id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
      transitionOut: { kind: 'wipe', frames: 15, direction: 'left' },
    }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

describe('LayeredInspector accent sub-option (wipe color)', () => {
  it('renders the brand slots as options, keyed by slot key with slot label as text', () => {
    render(
      <LayeredInspector
        reel={wipeReel}
        selectedId="transition:v1"
        onChange={() => {}}
        onSeek={() => {}}
        fps={30}
        accentSlots={[
          { key: 'gold', label: 'Gold', color: '#f6aa1c' },
          { key: 'rust', label: 'Rust', color: '#b5482c' },
        ]}
      />,
    );
    expect(screen.getByText('Color')).toBeInTheDocument();
    const gold = screen.getByRole('option', { name: 'Gold' }) as HTMLOptionElement;
    expect(gold.value).toBe('gold');
    const rust = screen.getByRole('option', { name: 'Rust' }) as HTMLOptionElement;
    expect(rust.value).toBe('rust');
  });

  it('omits the control entirely when there is no brand palette', () => {
    render(
      <LayeredInspector reel={wipeReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByText('Color')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 6: core knows MECHANISMS, brands supply VALUES. The effect catalog, the
// item-`props` editor and the accent palette all arrive as metadata; with none
// supplied the inspector is brand-neutral but still fully functional.
// ---------------------------------------------------------------------------

const outroReel: LayeredReel = {
  version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [{ id: 'o1', kind: 'outro', startMs: 0, endMs: 2000, musicBoostDb: 0,
              props: { style: 'organic', variant: 'sand-brown', logoDelaySec: 0.6 } }],
    audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
  },
};

describe('LayeredInspector item props (no brand metadata)', () => {
  it('renders every prop generically, typed by its current value', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    // Humanized labels, no brand vocabulary needed to reach the values.
    expect((screen.getByLabelText('Style') as HTMLInputElement).value).toBe('organic');
    expect((screen.getByLabelText('Variant') as HTMLInputElement).value).toBe('sand-brown');
    const delay = screen.getByLabelText('Logo delay sec') as HTMLInputElement;
    expect(delay.type).toBe('number');
    expect(delay.value).toBe('0.6');
  });

  it('offers no brand outro vocabulary as choices', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    // A plain text field, not a dropdown of roost's styles.
    expect(screen.queryByRole('option', { name: 'heartbeat' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'white-black' })).toBeNull();
  });

  it('commits a generically-edited prop back onto the item', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.change(screen.getByLabelText('Logo delay sec'), { target: { value: '1.2' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.video[0].props as Record<string, unknown>).logoDelaySec).toBe(1.2);
    expect((next.tracks.video[0].props as Record<string, unknown>).style).toBe('organic');
  });
});

describe('LayeredInspector item props (brand metadata)', () => {
  const meta = {
    videoProps: {
      outro: [
        { prop: 'style', label: 'Style', options: ['organic', 'fade', 'heartbeat'] },
        { prop: 'variant', options: ['sand-brown', 'white-black'] },
      ],
    },
  };

  it('renders a declared field as a dropdown over the brand values', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const style = screen.getByLabelText('Style') as HTMLSelectElement;
    expect(style.tagName).toBe('SELECT');
    expect(style.value).toBe('organic');
    expect(screen.getByRole('option', { name: 'heartbeat' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'white-black' })).toBeTruthy();
  });

  it('still renders undeclared props generically alongside the declared ones', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByLabelText('Logo delay sec') as HTMLInputElement).type).toBe('number');
  });

  it('renders a declared field even when the item does not carry that prop yet', () => {
    const bare: LayeredReel = {
      ...outroReel,
      tracks: { ...outroReel.tracks, video: [{ id: 'o1', kind: 'outro', startMs: 0, endMs: 2000, musicBoostDb: 0, props: {} }] },
    };
    render(<LayeredInspector reel={bare} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByLabelText('Style') as HTMLSelectElement).tagName).toBe('SELECT');
  });
});

// A declared field with NO `options` and NO value on the item yet has nothing to
// be typed from. Without `type` it renders as text and commits a STRING into the
// opaque props bag (`z.record(z.unknown())` accepts it, the renderer coerces) —
// the config goes type-dirty and only becomes a number field after a reload.
describe('LayeredInspector declared param type (absent key)', () => {
  const numMeta = {
    videoProps: { outro: [{ prop: 'logoDelaySec', label: 'Logo delay (s)', type: 'number' as const }] },
  };
  const bare: LayeredReel = {
    ...outroReel,
    tracks: { ...outroReel.tracks, video: [{ id: 'o1', kind: 'outro', startMs: 0, endMs: 2000, musicBoostDb: 0, props: {} }] },
  };

  it('renders a number input for a declared-number prop the item does not carry', () => {
    render(<LayeredInspector reel={bare} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={numMeta} />);
    const f = screen.getByLabelText('Logo delay (s)') as HTMLInputElement;
    expect(f.type).toBe('number');
    expect(f.value).toBe('');
  });

  it('commits a NUMBER, not a string, for that absent key', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={bare} selectedId="video:o1" onChange={onChange} onSeek={() => {}} fps={30} meta={numMeta} />);
    fireEvent.change(screen.getByLabelText('Logo delay (s)'), { target: { value: '0.5' } });
    const props = (onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].props as Record<string, unknown>;
    expect(props.logoDelaySec).toBe(0.5);
    expect(typeof props.logoDelaySec).toBe('number');
  });

  it('a declared boolean prop the item lacks renders as a checkbox and commits a boolean', () => {
    const boolMeta = { videoProps: { outro: [{ prop: 'loop', label: 'Loop', type: 'boolean' as const }] } };
    const onChange = vi.fn();
    render(<LayeredInspector reel={bare} selectedId="video:o1" onChange={onChange} onSeek={() => {}} fps={30} meta={boolMeta} />);
    const box = screen.getByLabelText('Loop') as HTMLInputElement;
    expect(box.type).toBe('checkbox');
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    const props = (onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].props as Record<string, unknown>;
    expect(props.loop).toBe(true);
  });

  it('a declared type does not stop an already-typed value from rendering', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={numMeta} />);
    expect((screen.getByLabelText('Logo delay (s)') as HTMLInputElement).value).toBe('0.6');
  });
});

describe('LayeredInspector effect catalog', () => {
  it('offers only core effects when no brand catalog is supplied', () => {
    const { getByText, queryByText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    fireEvent.click(getByText('+ Add effect'));
    expect(getByText('Ken Burns')).toBeTruthy();
    expect(queryByText('vintage')).toBeNull();
  });

  it('adds a brand effect with the brand-declared defaults', () => {
    const onChange = vi.fn();
    const meta = { effects: [{ type: 'vintage', label: 'Vintage', defaults: { mode: 'film' } }] };
    const { getByText } = render(
      <LayeredInspector reel={base} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.click(getByText('+ Add effect'));
    fireEvent.click(getByText('Vintage'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].effects!.at(-1)).toEqual({ type: 'vintage', mode: 'film' });
  });

  it('renders a brand effect param as a dropdown over its declared options', () => {
    const meta = {
      effects: [{ type: 'vintage', params: [{ prop: 'mode', label: 'Mode', options: ['film', 'vhs'] }] }],
    };
    render(<LayeredInspector reel={base} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.click(screen.getByText('Effect · vintage')); // open the collapsible
    const mode = screen.getByLabelText('Mode') as HTMLSelectElement;
    expect(mode.tagName).toBe('SELECT');
    expect(mode.value).toBe('film');
  });

  it('falls back to a generic typed editor for an undeclared effect param', () => {
    render(<LayeredInspector reel={base} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByText('Effect · vintage')); // open the collapsible
    // `vintage` is unknown to core, but its `mode` is still reachable.
    const mode = screen.getByLabelText('Mode') as HTMLInputElement;
    expect(mode.tagName).toBe('INPUT');
    expect(mode.value).toBe('film');
  });
});
