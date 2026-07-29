import { useState } from 'react';
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

// wipe's `color` sub-option is a DUAL 'accent-or-color' control in the
// catalog (widened from pure 'accent' — see the `color` literal-widening task
// and `AccentOrColorHex` in transition-schema.ts): the schema names the field
// but not its accent values (see AccentKey), so TransitionFields fills the
// dropdown's accent half from whatever accentSlots the brand handed the
// editor. Unlike a PURE accent field, the control is never omitted for lack
// of a palette — its literal half needs none (see LayeredInspector.tsx's
// `AccentOrColorField`).
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

describe('LayeredInspector dual accent-or-color sub-option (wipe color)', () => {
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

  // CHANGED FROM the pre-widening behaviour: a pure `accent` field used to
  // vanish entirely with no palette in scope (there was nothing valid it
  // could offer). A DUAL field always has its literal half, which needs no
  // palette — so it degrades to a plain colour control instead of
  // disappearing. Disappearing here would be exactly the class of editor
  // data-loss this repo has hit three times before: a control that cannot be
  // reached cannot be used to author the one form (a literal) that doesn't
  // need a brand at all.
  it('degrades to a plain literal-colour control when there is no brand palette, rather than vanishing', () => {
    render(
      <LayeredInspector reel={wipeReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    const colorInput = screen.getByLabelText('Color') as HTMLInputElement;
    expect(colorInput.type).toBe('text');
    expect(screen.getByLabelText('Color swatch')).toBeInTheDocument();
  });

  it('commits an accent SLOT KEY when one is picked from the dropdown', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector
        reel={wipeReel}
        selectedId="transition:v1"
        onChange={onChange}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: 'gold' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.video[0].transitionOut as Record<string, unknown>).color).toBe('gold');
  });

  // Picking "Custom colour" from a field that has never authored anything
  // must switch the control into literal mode WITHOUT core inventing a hex of
  // its own — the seed is an empty string, not a colour.
  it('picking "Custom colour" from an unset field seeds an empty literal, never a hex', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector
        reel={wipeReel}
        selectedId="transition:v1"
        onChange={onChange}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: '__literal__' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.video[0].transitionOut as Record<string, unknown>).color).toBe('');
  });

  // THE ROUND-TRIP, both directions, and the data-loss guard: an authored
  // LITERAL must still show as itself (not silently coerced into the
  // dropdown's palette half and lost), and an authored slot KEY not in the
  // CURRENT palette (stale/renamed) must still show as itself too — neither
  // form the control does not currently favour gets discarded on render.
  it('shows an authored LITERAL colour as itself, with the picker reflecting "custom"', () => {
    const literalReel: LayeredReel = {
      ...wipeReel,
      tracks: {
        ...wipeReel.tracks,
        video: [{ ...wipeReel.tracks.video[0], transitionOut: { kind: 'wipe', frames: 15, direction: 'left', color: '#0a0a0a' } }],
      },
    };
    render(
      <LayeredInspector
        reel={literalReel}
        selectedId="transition:v1"
        onChange={() => {}}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    // The literal itself is still visible, in a colour control.
    expect((screen.getByLabelText('Color (hex)') as HTMLInputElement).value).toBe('#0a0a0a');
    // The dropdown does NOT coerce the literal into (or hide it behind) an
    // unrelated accent slot — it reflects "custom colour", not "gold".
    const select = screen.getByLabelText('Color') as HTMLSelectElement;
    expect(select.value).not.toBe('gold');
  });

  it('shows an authored slot key NOT in the current palette as itself, not silently dropped', () => {
    const staleReel: LayeredReel = {
      ...wipeReel,
      tracks: {
        ...wipeReel.tracks,
        video: [{ ...wipeReel.tracks.video[0], transitionOut: { kind: 'wipe', frames: 15, direction: 'left', color: 'retired-slot' } }],
      },
    };
    render(
      <LayeredInspector
        reel={staleReel}
        selectedId="transition:v1"
        onChange={() => {}}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    expect((screen.getByLabelText('Color') as HTMLSelectElement).value).toBe('retired-slot');
  });

  // Switching FROM a literal TO the palette, via the dropdown's own "custom
  // colour" option round-tripping back: picking a real slot after a literal
  // was authored must commit the slot key, not leave the old literal in place.
  it('switches a literal back to an accent key when a slot is picked from the dropdown', () => {
    const onChange = vi.fn();
    const literalReel: LayeredReel = {
      ...wipeReel,
      tracks: {
        ...wipeReel.tracks,
        video: [{ ...wipeReel.tracks.video[0], transitionOut: { kind: 'wipe', frames: 15, direction: 'left', color: '#0a0a0a' } }],
      },
    };
    render(
      <LayeredInspector
        reel={literalReel}
        selectedId="transition:v1"
        onChange={onChange}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: 'gold' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.video[0].transitionOut as Record<string, unknown>).color).toBe('gold');
  });

  // THE CRITICAL FIX. A `render={() => {}}` fixture (every test above) never
  // shows the control its OWN committed value, so it cannot catch a control
  // that unmounts itself on its own output — the fourth instance of this
  // repo's recurring editor data-loss bug. This wrapper is a REAL controlled
  // parent: every commit updates state and re-renders, exactly like the real
  // inspector, so the control sees what it just wrote.
  //
  // Before the fix: `literalMode` was derived from `isColorLiteral(value)`,
  // which requires a COMPLETE hex. The first keystroke commits `'#'`,
  // `isColorLiteral('#')` is false, mode flips back to accent, and the hex
  // input — the one the user is typing into — unmounts, stranding `'#'` in
  // the data. Typing over an already-good literal is worse: select-all +
  // retype replaces a valid `#0a0a0a` with `'#'` and removes the very control
  // that could fix it.
  function StatefulWipeReel({ onColor }: { onColor: (color: unknown) => void }) {
    const [reel, setReel] = useState<LayeredReel>({
      ...wipeReel,
      tracks: {
        ...wipeReel.tracks,
        video: [{ ...wipeReel.tracks.video[0], transitionOut: { kind: 'wipe', frames: 15, direction: 'left', color: '' } }],
      },
    });
    return (
      <LayeredInspector
        reel={reel}
        selectedId="transition:v1"
        onChange={(next) => {
          setReel(next);
          onColor((next.tracks.video[0].transitionOut as Record<string, unknown>).color);
        }}
        onSeek={() => {}}
        fps={30}
        accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
      />
    );
  }

  it('survives typing a hex character by character against a STATEFUL parent, never unmounting the hex input', () => {
    const onColor = vi.fn();
    render(<StatefulWipeReel onColor={onColor} />);
    // Field starts in literal mode (seeded `''`, as "Custom colour" leaves it).
    for (const ch of '#0a0a0a') {
      const input = screen.getByLabelText('Color (hex)') as HTMLInputElement;
      fireEvent.change(input, { target: { value: input.value + ch } });
    }
    expect(onColor).toHaveBeenLastCalledWith('#0a0a0a');
    // The control is STILL there after the final keystroke — it never
    // unmounted mid-typing.
    expect((screen.getByLabelText('Color (hex)') as HTMLInputElement).value).toBe('#0a0a0a');
  });

  it('survives retyping OVER an already-valid literal, character by character', () => {
    const onColor = vi.fn();
    function StatefulLiteralWipeReel() {
      const [reel, setReel] = useState<LayeredReel>({
        ...wipeReel,
        tracks: {
          ...wipeReel.tracks,
          video: [{ ...wipeReel.tracks.video[0], transitionOut: { kind: 'wipe', frames: 15, direction: 'left', color: '#0a0a0a' } }],
        },
      });
      return (
        <LayeredInspector
          reel={reel}
          selectedId="transition:v1"
          onChange={(next) => {
            setReel(next);
            onColor((next.tracks.video[0].transitionOut as Record<string, unknown>).color);
          }}
          onSeek={() => {}}
          fps={30}
          accentSlots={[{ key: 'gold', label: 'Gold', color: '#f6aa1c' }]}
        />
      );
    }
    render(<StatefulLiteralWipeReel />);
    expect((screen.getByLabelText('Color (hex)') as HTMLInputElement).value).toBe('#0a0a0a');
    // Select-all + retype: the first keystroke replaces the whole value.
    let typed = '';
    for (const ch of '#f6aa1c') {
      typed += ch;
      const input = screen.getByLabelText('Color (hex)') as HTMLInputElement;
      fireEvent.change(input, { target: { value: typed } });
    }
    expect(onColor).toHaveBeenLastCalledWith('#f6aa1c');
    expect((screen.getByLabelText('Color (hex)') as HTMLInputElement).value).toBe('#f6aa1c');
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

// Phase 4 Task 2.7 added `sepia` and `hueRotateDeg` to Grade. The inspector
// drops NEUTRAL grade fields so the bag stays minimal, and its neutral test
// used to be inlined as `k === 'temperature' || k === 'tint' ? 0 : 1` — i.e.
// "1 is neutral for everything else". Under that rule an authored `sepia: 1`
// (fully sepia) is silently DESTROYED the moment any other grade control is
// touched, the same data-loss class as Task 1.2b's coerce-to-cut. These pin the
// GRADE_NEUTRAL_ZERO set that replaced it, from both sides.
describe('LayeredInspector grade neutral handling', () => {
  const withGrade = (grade: Record<string, number>): LayeredReel => ({
    ...base,
    tracks: { ...base.tracks, video: [{ ...base.tracks.video[0], grade } as never] },
  });

  const commitBrightness = (reel: LayeredReel) => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={reel} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.change(screen.getByLabelText('Brightness'), { target: { value: '1.2' } });
    return (onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].grade as Record<string, number>;
  };

  it('KEEPS a non-neutral sepia/hueRotateDeg of 1 when another control is touched', () => {
    expect(commitBrightness(withGrade({ sepia: 1, hueRotateDeg: 1 }))).toEqual({
      brightness: 1.2,
      sepia: 1,
      hueRotateDeg: 1,
    });
  });

  it('DROPS sepia/hueRotateDeg at their neutral 0, so the bag stays minimal', () => {
    expect(commitBrightness(withGrade({ sepia: 0, hueRotateDeg: 0, saturation: 0.8 }))).toEqual({
      brightness: 1.2,
      saturation: 0.8,
    });
  });

  it('offers a control for each, seeded at the neutral 0', () => {
    render(<LayeredInspector reel={base} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect((screen.getByLabelText('Sepia') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Hue rotate (deg)') as HTMLInputElement).value).toBe('0');
  });
});
