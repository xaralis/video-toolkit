import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector, TransitionFields } from './LayeredInspector';
import { editorMetaFromTheme, type EditorMeta } from './editor-meta';
import { formatTimecode } from './controls/timecode';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { CompositionTheme } from '../../theming/types';
import type { StyleEffectRenderer } from '../../theming/effects';

// A real, resolvable renderer — fix round 1 (review Important): a
// renderer-less styleEffects registration is not offered by
// styleEffectsFromTheme, so this fixture must have one to exercise the
// ADVERTISED-AND-RENDERS case, not the now-excluded renderer-less one.
const dummyStyleRenderer: StyleEffectRenderer = () => ({});

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
    // A number field with no declared min/max renders as a ScrubField now
    // (Task 10) — a text input (`type="number"`'s spinner/locale-decimal
    // behaviour is exactly what it removes), not a number input. `inputMode`
    // (only ScrubField sets it) tells it apart from a plain TextField, which
    // `type="text"` alone would not.
    expect(delay.type).toBe('text');
    expect(delay.inputMode).toBe('decimal');
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

  it('renders a declared 4-or-fewer-choice enum as a segmented control over the brand values', () => {
    // Task 10: an enum with ≤4 choices routes to SegmentedField, not
    // SelectField — `style` (3 choices) and `variant` (2) both qualify.
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect(screen.getByRole('group', { name: 'Style' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'organic' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'heartbeat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'white-black' })).toBeTruthy();
  });

  it('still renders undeclared props generically alongside the declared ones', () => {
    render(<LayeredInspector reel={outroReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    // ScrubField (Task 10) — see the comment on the equivalent assertion above.
    const delay = screen.getByLabelText('Logo delay sec') as HTMLInputElement;
    expect(delay.type).toBe('text');
    expect(delay.inputMode).toBe('decimal');
  });

  it('renders a declared field even when the item does not carry that prop yet', () => {
    const bare: LayeredReel = {
      ...outroReel,
      tracks: { ...outroReel.tracks, video: [{ id: 'o1', kind: 'outro', startMs: 0, endMs: 2000, musicBoostDb: 0, props: {} }] },
    };
    render(<LayeredInspector reel={bare} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect(screen.getByRole('group', { name: 'Style' })).toBeInTheDocument();
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

  it('renders a numeric ScrubField for a declared-number prop the item does not carry', () => {
    render(<LayeredInspector reel={bare} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30} meta={numMeta} />);
    const f = screen.getByLabelText('Logo delay (s)') as HTMLInputElement;
    // ScrubField (Task 10) — see the comment on the equivalent assertion above.
    expect(f.type).toBe('text');
    expect(f.inputMode).toBe('decimal');
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

  it('renders a brand effect param as a segmented control over its declared options', () => {
    // Task 10: 2 choices is ≤4, so this routes to SegmentedField, not SelectField.
    const meta = {
      effects: [{ type: 'vintage', params: [{ prop: 'mode', label: 'Mode', options: ['film', 'vhs'] }] }],
    };
    render(<LayeredInspector reel={base} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.click(screen.getByText('Effect · vintage')); // open the collapsible
    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'film' })).toHaveAttribute('aria-pressed', 'true');
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
// touched, the same data-loss class as Task 1.2b's coerce-to-cut. These pin
// the shared `GRADE_DEFAULTS` (`lib/reel-config-base/grade.ts`, the object
// that replaced the inspector's own local `GRADE_NEUTRAL_ZERO` set), from
// both sides.
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
    // `base`'s item has no grade at all — untouched, so the Color section
    // starts collapsed (see the "collapse an untouched Color section"
    // describe block below) and has to be opened by hand first.
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    expect((screen.getByLabelText('Sepia') as HTMLInputElement).value).toBe('0');
    expect((screen.getByLabelText('Hue rotate (deg)') as HTMLInputElement).value).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// A STATEFUL PARENT: a wrapper that holds real state and re-renders on
// `onChange`, the shape that would have caught all four prior editor
// data-loss bugs (an inert `onChange={() => {}}` never lets the component see
// its own committed value come back). Introduced for Phase 4 Task 3.4's two
// editor guards against authoring both `item.grade` and a `type: 'grade'`
// effect — those guards, and the tests that pinned them, are gone (the
// `grade` effect no longer exists to author at all; `item.grade` is the
// survivor — see CORE_EFFECTS's comment in editor-meta.ts), but this helper
// stays: the style-effect catalog tests below still need a real round-trip
// through committed state.
// ---------------------------------------------------------------------------
function StatefulInspector({ initial, selectedId, meta }: { initial: LayeredReel; selectedId: string; meta?: EditorMeta }) {
  const [reel, setReel] = useState(initial);
  return <LayeredInspector reel={reel} selectedId={selectedId} onChange={setReel} onSeek={() => {}} fps={30} meta={meta} />;
}

// ---------------------------------------------------------------------------
// Task 4.4, Gap 1 — a brand's STYLE-axis registration (`theme.styleEffects`)
// end to end: derived by editorMetaFromTheme (not a hand-built EditorMeta,
// so this exercises the SAME wiring a real host uses), offerable in
// "+ Add effect", its declared param editable, and — per the brief's
// stateful-parent requirement — the authored value SURVIVES a commit →
// re-render → still-there → editable-again round trip.
// ---------------------------------------------------------------------------
describe('LayeredInspector style-effect catalog (Task 4.4, Gap 1)', () => {
  const themeWithStyleEffect: CompositionTheme = {
    background: '#000',
    accentSlots: [],
    styleEffects: {
      'vignette-pulse': { renderer: dummyStyleRenderer, params: [{ prop: 'intensity', type: 'number' }] },
    },
  };
  const meta = editorMetaFromTheme(themeWithStyleEffect);

  const clean: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  it('offers the theme-derived style effect in "+ Add effect", alongside core', () => {
    render(<LayeredInspector reel={clean} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    // `clean` carries no effects — the Effects section starts collapsed (see
    // the "gets its own Effects section" describe block below).
    fireEvent.click(screen.getByRole('button', { name: 'Effects' }));
    fireEvent.click(screen.getByText('+ Add effect'));
    expect(screen.getByText('Ken Burns')).toBeTruthy();
    expect(screen.getByText('vignette-pulse')).toBeTruthy(); // catalog button label falls back to the raw type, no humanizing
  });

  it('round-trips an authored intensity through a STATEFUL parent: add → edit → re-render → still there → editable again', () => {
    render(<StatefulInspector initial={clean} selectedId="video:v1" meta={meta} />);

    // `clean` carries no effects — open the Effects section by hand first.
    fireEvent.click(screen.getByRole('button', { name: 'Effects' }));
    // Add the brand style effect.
    fireEvent.click(screen.getByText('+ Add effect'));
    fireEvent.click(screen.getByText('vignette-pulse'));

    // Open its collapsible and set the declared param.
    fireEvent.click(screen.getByText('Effect · vignette-pulse'));
    const intensityField = screen.getByLabelText('Intensity') as HTMLInputElement;
    fireEvent.change(intensityField, { target: { value: '0.75' } });
    fireEvent.blur(intensityField);

    // Re-render happened via the stateful parent's own onChange → setReel.
    // The authored value must still be there, AND still editable (not
    // dropped, not coerced, not unmounted mid-round-trip — the class of bug
    // this task's brief calls out by name).
    const after = screen.getByLabelText('Intensity') as HTMLInputElement;
    expect(after.value).toBe('0.75');

    // Editable again: change it a second time and confirm the new value
    // sticks too — a control that renders once and then goes inert would
    // pass the first assertion and fail this one.
    fireEvent.change(after, { target: { value: '0.4' } });
    fireEvent.blur(after);
    expect((screen.getByLabelText('Intensity') as HTMLInputElement).value).toBe('0.4');
  });

  it('an unrecognised style-effect type is not coerced or dropped by editing a neighbouring control', () => {
    const withUnknown: LayeredReel = {
      ...clean,
      tracks: {
        ...clean.tracks,
        video: [{ ...clean.tracks.video[0], effects: [{ type: 'unregistered-style-fx', foo: 'bar' } as never] }],
      },
    };
    render(<StatefulInspector initial={withUnknown} selectedId="video:v1" meta={meta} />);
    // Touch an unrelated control (the item's music boost) — this must not
    // rewrite or drop the unrecognised effect entry. Music boost sits at its
    // default (0dB) here, so its own section starts collapsed — open it first.
    fireEvent.click(screen.getByRole('button', { name: 'Music boost' }));
    const boost = screen.getByLabelText('Music boost (dB)') as HTMLInputElement;
    fireEvent.change(boost, { target: { value: '3' } });
    fireEvent.blur(boost);
    expect(screen.getByText('Effect · unregistered-style-fx')).toBeTruthy();
  });
});

// `grade` used to be a second, redundant way to author the same seven
// parameters `item.grade` (the Color panel) already covers — Phase 4 Task
// 3.4 through this removal. The two editor guards that used to keep them
// from silently fighting over one render ("+ Add effect → Grade" disabled
// when `item.grade` was set; the Color panel greyed when a `type: 'grade'`
// effect existed) are gone along with the effect itself — see CORE_EFFECTS's
// comment in editor-meta.ts for why. These pin the two visible consequences:
// the catalog no longer offers it, and the Color panel — having nothing left
// to grey against — now stays enabled unconditionally, even in the
// backwards-compatibility case of a hand-edited config that still carries a
// stray authored `type: 'grade'` effect entry.
describe('LayeredInspector grade effect removal', () => {
  const withGradeField: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
                grade: { brightness: 1.2 } } as never],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  const withStrayGradeEffect: LayeredReel = {
    ...withGradeField,
    tracks: {
      ...withGradeField.tracks,
      video: [{ ...withGradeField.tracks.video[0], effects: [{ type: 'grade', contrast: 1.3 }] } as never],
    },
  };

  it('no longer offers "Grade" in "+ Add effect"', () => {
    render(<StatefulInspector initial={withGradeField} selectedId="video:v1" />);
    // `withGradeField` carries no effects — open the Effects section first.
    fireEvent.click(screen.getByRole('button', { name: 'Effects' }));
    fireEvent.click(screen.getByText('+ Add effect'));
    expect(screen.queryByText('Grade')).toBeNull();
  });

  it('the Color panel (Brightness) stays enabled even with a stray authored grade effect present', () => {
    render(<StatefulInspector initial={withStrayGradeEffect} selectedId="video:v1" />);
    const brightness = screen.getByLabelText('Brightness') as HTMLInputElement;
    expect(brightness.disabled).toBe(false);
    expect(brightness.value).toBe('1.2'); // item.grade's own value, untouched by the stray effect
  });

  it('the Color section heading carries no "disabled" suffix any more, even with a stray authored grade effect present', () => {
    render(<StatefulInspector initial={withStrayGradeEffect} selectedId="video:v1" />);
    // `getByText` matches the FULL string exactly by default — this fails on
    // its own if the heading were ever "Color (disabled)" or similar, which
    // is what makes it informative on its own. (A second assertion used to
    // additionally `queryByText` a regex for the OLD removed guard message —
    // that text has no code path left that could ever produce it, so it
    // passed regardless of any future change to this heading; dropped.)
    expect(screen.getByText('Color')).not.toBeNull();
  });

  // A hand-edited config can still carry a `type: 'grade'` effect entry from
  // before this removal — it renders through the generic ParamFields
  // fallback now (no bespoke GradeFields branch left in EffectEditor), not a
  // crash and not a silently dropped entry.
  it('a stray authored grade effect entry still renders (through the generic fallback), not dropped', () => {
    render(<StatefulInspector initial={withStrayGradeEffect} selectedId="video:v1" />);
    expect(screen.getByText('Effect · grade')).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A clip nobody has graded and nobody has added an effect to used to show
// eight sliders and a stray "+ Add effect" button saying nothing, pushing
// everything below out of view. Both the Color and Effects sections now
// start collapsed when they have nothing to show and expanded the instant
// they do — same `Collapsible`, same mechanism (see the doc comments at each
// section in LayeredInspector.tsx), not two differently-behaving patterns.
// ---------------------------------------------------------------------------
describe('LayeredInspector collapses an untouched Color section, and gives it a reset', () => {
  const untouched: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const touched: LayeredReel = {
    ...untouched,
    tracks: { ...untouched.tracks, video: [{ ...untouched.tracks.video[0], grade: { brightness: 1.2 } }] },
  };

  // `Collapsible`'s header is a plain container; the toggle is its own real
  // `<button>` and the `right` slot (the reset-all button, with its own
  // `aria-label`) is a SIBLING of it, not a descendant — so the toggle's
  // accessible name is "Color" alone, whether or not the section is touched
  // and showing a reset button beside it. This used to need a workaround
  // (`getByText('Color').closest('[role="button"]')`) because the header was
  // itself a `role="button"` div with `right` nested INSIDE it, which folded
  // the reset button's label into the header's own accessible name (something
  // like "Color Reset all color adjustments"). See Collapsible.tsx's own
  // comment for the fix.
  const colorHeader = () => screen.getByRole('button', { name: 'Color' });

  it('starts collapsed for an item whose grade is untouched', () => {
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(colorHeader()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Brightness')).toBeNull();
  });

  it('starts expanded for an item whose grade differs from the defaults', () => {
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(colorHeader()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument();
  });

  it('a manual expand survives a re-render of the same item', () => {
    const { rerender } = render(
      <LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    fireEvent.click(colorHeader());
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument();
    // A fresh (but equivalent) reel object, same selected id — the shape of
    // a re-render coming back through the same `onChange` round-trip every
    // other control here goes through, not merely React re-invoking with
    // identical props.
    rerender(<LayeredInspector reel={{ ...untouched }} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument();
  });

  it('a manual collapse survives a re-render of the same item', () => {
    const { rerender } = render(
      <LayeredInspector reel={touched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    fireEvent.click(colorHeader()); // touched starts open — close it
    expect(screen.queryByLabelText('Brightness')).toBeNull();
    rerender(<LayeredInspector reel={{ ...touched }} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByLabelText('Brightness')).toBeNull();
  });

  it('shows no dot when untouched', () => {
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByTestId('grade-dirty-dot')).toBeNull();
  });

  it('shows a dot on the header once touched, and it stays after a manual collapse', () => {
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    // Present immediately (the section starts expanded since it's touched) —
    // the dot is decorative (`aria-hidden`, hence a `data-testid` query
    // rather than an accessible one) and not conditioned on open/closed.
    expect(screen.getByTestId('grade-dirty-dot')).toBeInTheDocument();
    fireEvent.click(colorHeader()); // collapse it by hand
    // Still there — this is the case the brief calls out: a touched section
    // the user has collapsed must not read as empty.
    expect(screen.getByTestId('grade-dirty-dot')).toBeInTheDocument();
  });

  it('shows no reset-all button when untouched', () => {
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByLabelText('Reset all color adjustments')).toBeNull();
  });

  it('a reset-all click clears every grade field at once', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByLabelText('Reset all color adjustments'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].grade).toBeUndefined();
  });

  it('a single field reset deletes only that key, leaving the rest of the grade untouched', () => {
    const twoFields: LayeredReel = {
      ...untouched,
      tracks: { ...untouched.tracks, video: [{ ...untouched.tracks.video[0], grade: { brightness: 1.2, contrast: 1.3 } }] },
    };
    const onChange = vi.fn();
    render(<LayeredInspector reel={twoFields} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByLabelText('Reset Brightness'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].grade).toEqual({ contrast: 1.3 });
  });
});

describe('LayeredInspector gives the effect list its own Effects section', () => {
  const noEffects: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const oneEffect: LayeredReel = {
    ...noEffects,
    tracks: { ...noEffects.tracks, video: [{ ...noEffects.tracks.video[0], effects: [{ type: 'vintage', mode: 'film' }] }] },
  };

  it('starts collapsed with no effects — the "+ Add effect" button is not reachable until expanded', () => {
    render(<LayeredInspector reel={noEffects} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('+ Add effect')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Effects' }));
    expect(screen.getByText('+ Add effect')).toBeInTheDocument();
  });

  it('starts expanded with one effect', () => {
    render(<LayeredInspector reel={oneEffect} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Effects' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('+ Add effect')).toBeInTheDocument();
    expect(screen.getByText('Effect · vintage')).toBeInTheDocument();
  });

  it('a manual toggle survives a re-render of the same item', () => {
    const { rerender } = render(
      <LayeredInspector reel={noEffects} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Effects' }));
    expect(screen.getByText('+ Add effect')).toBeInTheDocument();
    rerender(<LayeredInspector reel={{ ...noEffects }} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByText('+ Add effect')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Music boost used to sit loose in the clip panel as a bare slider. Same
// mechanism as Color/Effects above, not a third one: a `Collapsible` starting
// collapsed at the renderer default (0dB — music-envelope.ts's
// `item?.musicBoostDb ?? 0`) and expanded the moment it isn't. Unlike Color,
// this section carries no header-level reset: `SliderField`'s own
// reset-to-default affordance already covers the one field it holds.
// ---------------------------------------------------------------------------
describe('LayeredInspector gives Music boost its own collapsible section', () => {
  const untouched: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const touched: LayeredReel = {
    ...untouched,
    tracks: { ...untouched.tracks, video: [{ ...untouched.tracks.video[0], musicBoostDb: 4 }] },
  };

  it('starts collapsed when the value is at its default (0dB)', () => {
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Music boost' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Music boost (dB)')).toBeNull();
  });

  it('starts expanded when the value is off default', () => {
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Music boost' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Music boost (dB)')).toBeInTheDocument();
  });

  it('a manual toggle survives a re-render of the same item', () => {
    const { rerender } = render(
      <LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Music boost' }));
    expect(screen.getByLabelText('Music boost (dB)')).toBeInTheDocument();
    rerender(<LayeredInspector reel={{ ...untouched }} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByLabelText('Music boost (dB)')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Transition out gets the same treatment, with `Cut` (no transition) as its
// default — decided by `isCut` (transition-schema.ts), THE decider, never a
// hand-copied `kind === 'cut'` check here. Unlike Music boost, this section's
// controls have no per-field reset of their own, so it gets the same
// header-level "reset all" the Color section has.
// ---------------------------------------------------------------------------
describe('LayeredInspector gives Transition out its own collapsible section, with Cut as its reset default', () => {
  const cutReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const noKindReel: LayeredReel = {
    ...cutReel,
    tracks: { ...cutReel.tracks, video: [{ ...cutReel.tracks.video[0], transitionOut: { kind: 'cut' } }] },
  };
  const dissolveReel: LayeredReel = {
    ...cutReel,
    tracks: { ...cutReel.tracks, video: [{ ...cutReel.tracks.video[0], transitionOut: { kind: 'dissolve', frames: 15 } }] },
  };

  it('starts collapsed when the item has no transitionOut at all', () => {
    render(<LayeredInspector reel={cutReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Transition out' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts collapsed when transitionOut is explicitly Cut', () => {
    render(<LayeredInspector reel={noKindReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Transition out' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts expanded for any other kind', () => {
    render(<LayeredInspector reel={dissolveReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Transition out' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Kind')).toBeInTheDocument();
  });

  it('shows no reset-all button when the transition is a cut', () => {
    render(<LayeredInspector reel={cutReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByLabelText('Reset transition to cut')).toBeNull();
  });

  it('a reset-all click returns the transition to a plain cut', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={dissolveReel} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByLabelText('Reset transition to cut'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0].transitionOut).toEqual({ kind: 'cut' });
  });

  it('a manual toggle survives a re-render of the same item', () => {
    const { rerender } = render(
      <LayeredInspector reel={cutReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Transition out' }));
    expect(screen.getByLabelText('Kind')).toBeInTheDocument();
    rerender(<LayeredInspector reel={{ ...cutReel }} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByLabelText('Kind')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// The seek-to-start action moved off its own row onto the Clip/Overlay
// heading row (right-aligned, icon-led) — vertical space in the inspector is
// scarce and a secondary action doesn't earn a whole row. It must keep the
// same accessible name and behaviour it always had, in BOTH panels.
// ---------------------------------------------------------------------------
describe('LayeredInspector inline seek-to-start control', () => {
  const videoReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 4000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 1000, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const overlayPanelReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 4000 },
    tracks: {
      video: [], audio: [], music: { baseVolumeDb: -8 }, brand: [],
      overlays: [{ id: 'ov1', startMs: 2000, endMs: 3000, content: { kind: 'text', text: 'Hi' } }],
    },
  };

  it('the Clip panel keeps an accessible "seek to start" control and fires onSeek at the clip start frame', () => {
    const onSeek = vi.fn();
    render(<LayeredInspector reel={videoReel} selectedId="video:v1" onChange={() => {}} onSeek={onSeek} fps={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'seek to start' }));
    expect(onSeek).toHaveBeenCalledWith(30); // 1000ms @ 30fps
  });

  it('the Overlay panel keeps an accessible "seek to start" control and fires onSeek at the overlay start frame', () => {
    const onSeek = vi.fn();
    render(
      <LayeredInspector reel={overlayPanelReel} selectedId="overlays:ov1" onChange={() => {}} onSeek={onSeek} fps={30} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'seek to start' }));
    expect(onSeek).toHaveBeenCalledWith(60); // 2000ms @ 30fps
  });
});

// ---------------------------------------------------------------------------
// Task 7: the length field bounds NEW input against what the boundary can
// actually lend (handle-room.ts), and NEVER rewrites an already-authored
// value on mount — a retroactively-starved boundary is reported by the
// timeline's hatching/diagnostics (Tasks 5/6) instead of silently truncated.
// ---------------------------------------------------------------------------
describe('TransitionFields length field — bounded commit, never a mount-time clamp', () => {
  it('clamps a typed value to maxFrames', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'dissolve', frames: 10 }} onChange={onChange} maxFrames={12} />);
    fireEvent.change(screen.getByLabelText('Length (frames, max 12)'), { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'dissolve', frames: 12 });
  });

  it('is a SLIDER when the ceiling is known — you pick a transition length by feel, not by typing', () => {
    render(<TransitionFields t={{ kind: 'dissolve', frames: 10 }} onChange={vi.fn()} maxFrames={12} />);
    const input = screen.getByLabelText('Length (frames, max 12)') as HTMLInputElement;
    expect(input.type).toBe('range');
    expect(input.min).toBe('1');
    expect(input.max).toBe('12');
  });

  it('stretches the track to an authored over-cap value rather than snapping the thumb back', () => {
    render(<TransitionFields t={{ kind: 'dissolve', frames: 40 }} onChange={vi.fn()} maxFrames={12} />);
    const input = screen.getByLabelText('Length (frames, max 12)') as HTMLInputElement;
    expect(input.max).toBe('40'); // the ceiling is still 12 — the clamp lives on commit
    expect(input.value).toBe('40');
  });

  it('stays a typed field when there is no ceiling — a soft one would cap what the boundary can afford', () => {
    render(<TransitionFields t={{ kind: 'dissolve', frames: 10 }} onChange={vi.fn()} />);
    expect((screen.getByLabelText('Length (frames)') as HTMLInputElement).type).not.toBe('range');
  });

  it('does not clamp on mount — an authored value already past maxFrames is shown untouched', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'dissolve', frames: 40 }} onChange={onChange} maxFrames={12} />);
    expect((screen.getByLabelText('Length (frames, max 12)') as HTMLInputElement).value).toBe('40');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('is unbounded (plain label, no clamp) when maxFrames is absent', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'dissolve', frames: 10 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Length (frames)'), { target: { value: '999' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'dissolve', frames: 999 });
  });

  it('also treats an Infinity maxFrames (an edge boundary, or every duration unknown) as unbounded', () => {
    const onChange = vi.fn();
    render(<TransitionFields t={{ kind: 'dissolve', frames: 10 }} onChange={onChange} maxFrames={Infinity} />);
    expect(screen.getByLabelText('Length (frames)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Length (frames)'), { target: { value: '999' } });
    expect(onChange).toHaveBeenCalledWith({ kind: 'dissolve', frames: 999 });
  });
});

describe('LayeredInspector transition length — bounded by the boundary’s actual handle room', () => {
  // b.mp4's sourceInMs is 200ms = 6 frames @ 30fps; a.mp4 has 150 tail frames
  // to spare. Center alignment's two sides are asymmetric (transitionHandles'
  // floor/ceil split — see handle-room.ts's maxTransitionFrames), so the
  // ceiling is min(2*head + 1, 2*tail) = min(13, 300) = 13 — below the
  // authored 15, i.e. this boundary is already starved (Task 5/6's case),
  // which is exactly the scenario this field must NOT silently fix. (13, not
  // the pre-review-fix 12 — see Important 3 of the 2026-08-03 review.)
  const starvedReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 10000 },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000,
          transitionOut: { kind: 'dissolve', frames: 15 } },
        { id: 'v2', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4', sourceInMs: 200, sourceOutMs: 5200 },
      ],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const durations = { 'a.mp4': 10000, 'b.mp4': 10000 };

  it('shows the ceiling the boundary’s neighbours can actually lend', () => {
    render(
      <LayeredInspector reel={starvedReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={durations} />,
    );
    expect(screen.getByLabelText('Length (frames, max 13)')).toBeInTheDocument();
  });

  it('leaves an already-starved authored length untouched on mount', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector reel={starvedReel} selectedId="transition:v1" onChange={onChange} onSeek={() => {}} fps={30}
        sourceDurations={durations} />,
    );
    expect((screen.getByLabelText('Length (frames, max 13)') as HTMLInputElement).value).toBe('15');
    expect(onChange).not.toHaveBeenCalled();
  });

  // The reel edge (no neighbour to run out of) AND an undecoded source (tail
  // treated as unbounded, `handleRoomFrames`'s own rule — reporting starvation
  // from a not-yet-decoded source would fire on every reel the moment it
  // opened) both mean "no ceiling at all", so together they must fall back to
  // the plain, unbounded label — a single video item, closing fade, no
  // `sourceDurations` passed at all.
  const edgeReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 5000 },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000,
          transitionOut: { kind: 'dissolve', frames: 15 } },
      ],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  it('is unbounded at the reel edge with an undecoded source', () => {
    render(
      <LayeredInspector reel={edgeReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    expect(screen.getByLabelText('Length (frames)')).toBeInTheDocument();
  });

  // Important 5 (2026-08-03 review): the LAST item's transitionOut is the
  // reel's closing fade, not a boundary — video-track-layout.ts zeroes its
  // outHalf regardless of this item's own tail room, since there is no
  // neighbour to extend into. Before the fix, `maxTransitionFrames` was
  // computed off THIS item's own (measured, exhausted) tail, so a final clip
  // trimmed exactly to its file end (tail === 0) clamped a legitimate typed
  // `20` down to `1` the instant the field committed — even though
  // `boundaryDiagnostics` correctly never flags this edge at all (its loop
  // stops at `length - 1`). Two real items (not one, unlike `edgeReel` above)
  // so this is genuinely the "last of several", not merely "the only item".
  const lastItemExhaustedTailReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 10000 },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        // b.mp4 is trimmed all the way to its file's end — tail === 0 — and
        // still carries a closing-fade transitionOut.
        { id: 'v2', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 5000,
          transitionOut: { kind: 'dissolve', frames: 20 } },
      ],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const exhaustedDurations = { 'a.mp4': 10000, 'b.mp4': 5000 };

  it('is unbounded on the LAST item’s closing fade even when that item’s own tail is exhausted', () => {
    render(
      <LayeredInspector reel={lastItemExhaustedTailReel} selectedId="transition:v2" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={exhaustedDurations} />,
    );
    expect(screen.getByLabelText('Length (frames)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Length \(frames, max/)).toBeNull();
  });

  it('is unbounded on the same boundary via the inline "video" lane view too', () => {
    render(
      <LayeredInspector reel={lastItemExhaustedTailReel} selectedId="video:v2" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={exhaustedDurations} />,
    );
    expect(screen.getByLabelText('Length (frames)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Length \(frames, max/)).toBeNull();
  });

  // Task 4: the one case the user cannot guess the remedy for on their own —
  // moving the Length slider to a value the boundary cannot afford because
  // the NEIGHBOUR has no source frames left to lend. `starvedReel` above
  // already proves the cap is 13 for v1's boundary with an ALREADY-starved
  // authored length of 15 (mount never clamps — see the "leaves an
  // already-starved authored length untouched on mount" case above), and
  // that shape is reused rather than a fresh fixture.
  //
  // The brief's own Step-1 sketch requests `999` — deliberately deviated
  // from here, not weakened: a real `<input type="range">`'s value is
  // SANITIZED at the DOM property-set step, clamped into `[min, max]`
  // before React's change handler ever runs (confirmed directly against
  // this component: querying `.value` straight after `fireEvent.change`
  // with `999` reads back as `15`, the slider's own `max` — since this
  // fixture's authored `15` already sits AT that stretched `trackMax`,
  // requesting `999` clamps right back to the value already showing, so
  // nothing actually changes at the DOM level and React never fires the
  // event at all — proven RED with `999`: `onHint` recorded ZERO calls,
  // not a wrong call). `14` sits strictly between the cap (13) and the
  // stretched track ceiling (15, `Math.max(cap, t.frames)` — see the
  // component's `trackMax` comment), so it both differs from the mounted
  // `15` (a genuine DOM mutation, so the event actually fires) and still
  // exceeds the 13-frame cap — a value the user could reach on a real drag
  // whose neighbour still cannot afford it.
  it('explains a transition length that cannot grow — the neighbour has nothing to lend', () => {
    const onHint = vi.fn();
    render(
      <LayeredInspector reel={starvedReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={durations} onHint={onHint} />,
    );
    fireEvent.change(screen.getByLabelText('Length (frames, max 13)'), { target: { value: '14' } });
    expect(onHint).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
    // FINDING 1's fix follows every publish with an immediate release — the
    // warning is the SECOND-TO-LAST call now, not the last (the last is the
    // trailing `null` that starts the auto-clear countdown).
    expect(onHint.mock.calls.at(-2)![0].text.toLowerCase()).toMatch(/lend|trim|shift/);
    expect(onHint.mock.calls.at(-1)).toEqual([null]);
  });

  // Same boundary, reached through the "video" lane's inline "Transition out"
  // section instead of the "transitions" lane — both routes render the same
  // `TransitionFields`, and both must wire the same `onHint`.
  it('explains the same starved cap via the inline "video" lane view too', () => {
    const onHint = vi.fn();
    render(
      <LayeredInspector reel={starvedReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={durations} onHint={onHint} />,
    );
    fireEvent.change(screen.getByLabelText('Length (frames, max 13)'), { target: { value: '14' } });
    expect(onHint).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
    // FINDING 1's fix follows every publish with an immediate release — the
    // warning is the SECOND-TO-LAST call now, not the last (the last is the
    // trailing `null` that starts the auto-clear countdown).
    expect(onHint.mock.calls.at(-2)![0].text.toLowerCase()).toMatch(/lend|trim|shift/);
    expect(onHint.mock.calls.at(-1)).toEqual([null]);
  });

  // Fix round 1, Finding 1 (Important): the two tests above only prove the
  // RETROACTIVELY-starved case (authored 15 already past a cap of 13, so the
  // stretched track has headroom above the cap to land on). The everyday
  // case — a boundary that was NEVER starved, where the user just drags the
  // thumb all the way to the wall — is different: `trackMax === cap` there,
  // so the range input's own DOM `max` IS the cap, and the browser sanitises
  // any request past it before React's change handler ever runs. A strict
  // `rounded > cap` can therefore never fire for this fixture — only
  // `rounded >= cap` (landing AT the cap) can, which is the fix this round
  // makes. `plainAtCapReel` shares the exact same handle-room numbers as
  // `starvedReel` above (same cap, 13) but authors `frames: 5` — comfortably
  // inside the cap, so the track's `max` is the cap itself, not a stretched
  // ceiling above it.
  const plainAtCapReel: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 10000 },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000,
          transitionOut: { kind: 'dissolve', frames: 5 } },
        { id: 'v2', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4', sourceInMs: 200, sourceOutMs: 5200 },
      ],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  it('explains the everyday case too — a boundary that was never starved, dragged to the wall', () => {
    const onHint = vi.fn();
    render(
      <LayeredInspector reel={plainAtCapReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={durations} onHint={onHint} />,
    );
    const input = screen.getByLabelText('Length (frames, max 13)') as HTMLInputElement;
    expect(input.max).toBe('13'); // the track's own ceiling IS the cap here — no headroom above it
    // Any request past the DOM's own `max` sanitises down to it — this IS
    // "dragged the thumb to the wall", not a synonym for the retroactive case.
    fireEvent.change(input, { target: { value: '999' } });
    expect(onHint).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
    // FINDING 1's fix follows every publish with an immediate release — the
    // warning is the SECOND-TO-LAST call now, not the last (the last is the
    // trailing `null` that starts the auto-clear countdown).
    expect(onHint.mock.calls.at(-2)![0].text.toLowerCase()).toMatch(/lend|trim|shift/);
    expect(onHint.mock.calls.at(-1)).toEqual([null]);
  });

  // Finding 2 (Minor): the positive cases above only prove the warning
  // fires; nothing pinned that it goes quiet again on an in-range commit, or
  // that the unbounded branch never has an opinion at all. Both regress
  // silently if the `>=` condition above drifts back toward "always warn"
  // or a `maxFrames` check gets dropped.
  it('clears the hint (publishes null) on an in-range commit — not a stale warning', () => {
    const onHint = vi.fn();
    render(
      <LayeredInspector reel={plainAtCapReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={durations} onHint={onHint} />,
    );
    // 8 is comfortably inside the cap (13) — a real in-bounds request.
    fireEvent.change(screen.getByLabelText('Length (frames, max 13)'), { target: { value: '8' } });
    expect(onHint).toHaveBeenCalledWith(null);
    expect(onHint).not.toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  });

  // Fix round, FINDING 1 (Important): a `SliderField` commit has no
  // drag/release pair of its own — unlike a timeline drag, which fires many
  // `onHint(warning)` calls but only ONE `onHint(null)` on release (see
  // LayeredTimeline's onActionResizeEnd). `useTransientHint`'s countdown only
  // (re-)arms on a `null` call (`release`) — `publish` unconditionally
  // cancels it — so a warning published here with no following `null` would
  // never clear: the starvation sentence would sit in the timeline's bottom
  // bar forever, hijacking the shortcut hints. Proven RED against the
  // pre-fix code, which called `onHint` exactly once (the warning, never a
  // trailing `null`).
  it('follows a published warning immediately with a release — Finding 1: an inspector hint must not hang forever', () => {
    const onHint = vi.fn();
    render(
      <LayeredInspector reel={starvedReel} selectedId="transition:v1" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={durations} onHint={onHint} />,
    );
    fireEvent.change(screen.getByLabelText('Length (frames, max 13)'), { target: { value: '14' } });
    expect(onHint.mock.calls).toEqual([
      [expect.objectContaining({ severity: 'warn' })],
      [null],
    ]);
  });

  it('never publishes on the unbounded (ScrubField) path — no boundary context to explain', () => {
    const onHint = vi.fn();
    render(
      <LayeredInspector reel={lastItemExhaustedTailReel} selectedId="transition:v2" onChange={() => {}} onSeek={() => {}} fps={30}
        sourceDurations={exhaustedDurations} onHint={onHint} />,
    );
    fireEvent.change(screen.getByLabelText('Length (frames)'), { target: { value: '999' } });
    expect(onHint).not.toHaveBeenCalled();
  });
});

describe('LayeredInspector project overview (no selection)', () => {
  const reelWithTwoClips: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 10000 },
    tracks: {
      video: [
        { id: 'v1', kind: 'clip', startMs: 0, endMs: 5000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 5000 },
        { id: 'v2', kind: 'clip', startMs: 5000, endMs: 10000, source: 'b.mp4', sourceInMs: 0, sourceOutMs: 5000 },
      ],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  it('shows no diagnostic row when every source loaded', () => {
    render(
      <LayeredInspector reel={reelWithTwoClips} selectedId={null} onChange={() => {}} onSeek={() => {}} fps={30}
        width={1080} height={1920} sourceDurations={{ 'a.mp4': 3000, 'b.mp4': 4000 }} />,
    );
    expect(screen.queryByText('Failed to load')).toBeNull();
  });

  it('names the sources that failed to load', () => {
    render(
      <LayeredInspector reel={reelWithTwoClips} selectedId={null} onChange={() => {}} onSeek={() => {}} fps={30}
        width={1080} height={1920} sourceDurations={{ 'a.mp4': 0, 'b.mp4': 4000 }} />,
    );
    expect(screen.getByText('a.mp4')).toBeInTheDocument();
  });

  it('shows resolution, aspect ratio and frame count', () => {
    render(
      <LayeredInspector reel={reelWithTwoClips} selectedId={null} onChange={() => {}} onSeek={() => {}} fps={30}
        width={1080} height={1920} sourceDurations={{ 'a.mp4': 3000, 'b.mp4': 4000 }} />,
    );
    expect(screen.getByText('1080 × 1920')).toBeInTheDocument();
    expect(screen.getByText('9:16')).toBeInTheDocument();
  });
});

// `Source` was a live text input wired to a config patch. It "worked", but
// there is no file picker behind it and no validation in front of it: the
// only thing it afforded was typing a filename blind, where a typo silently
// points the clip at media that does not exist. It is displayed now.
describe('Source is displayed, not edited', () => {
  const clipReel: LayeredReel = {
    ...base,
    tracks: {
      ...base.tracks,
      video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 2000, source: 'broll/BR-trida-miru_01_upright.mp4',
                sourceInMs: 0, sourceOutMs: 2000, musicBoostDb: 0 } as any],
    },
  };

  it('shows the source value but offers no editable control for it', () => {
    render(<LayeredInspector reel={clipReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByText('broll/BR-trida-miru_01_upright.mp4')).toBeInTheDocument();
    // The assertion that fails on the pre-fix component: there is no textbox
    // named Source to type into.
    expect(screen.queryByRole('textbox', { name: 'Source' })).not.toBeInTheDocument();
  });

  it('keeps the whole value reachable when it is too long to show', () => {
    render(<LayeredInspector reel={clipReel} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByText('broll/BR-trida-miru_01_upright.mp4'))
      .toHaveAttribute('title', 'broll/BR-trida-miru_01_upright.mp4');
  });
});

// ---------------------------------------------------------------------------
// Speed — same mechanism as Color/Music boost above: a Collapsible starting
// collapsed at 1x (the ratio the two spans already encode when untouched —
// see reel-config-base/speed.ts) and expanded the moment it isn't, with the
// same touched-but-collapsed dot and a header-level reset (there's only one
// number here, but "Reset speed" reads clearer next to the section title
// than a bare per-field icon would on its own).
// ---------------------------------------------------------------------------
describe('LayeredInspector gives Speed its own collapsible section', () => {
  const untouched: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 3000 },
    tracks: {
      video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };
  const touched: LayeredReel = {
    ...untouched,
    tracks: {
      ...untouched.tracks,
      video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 1500 }], // 0.5x
    },
  };

  it('starts collapsed when speed is at its default (1x)', () => {
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Speed' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Speed (%)')).toBeNull();
  });

  it('starts expanded when speed is off default', () => {
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('button', { name: 'Speed' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Speed (%)')).toBeInTheDocument();
  });

  it('shows the derived percentage, not a stored field', () => {
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect((screen.getByLabelText('Speed (%)') as HTMLInputElement).value).toBe('50');
  });

  it('offers no Speed section for a photo — no playback to speed up', () => {
    const photoReel: LayeredReel = {
      ...untouched,
      tracks: { ...untouched.tracks, video: [{ id: 'p1', kind: 'photo', startMs: 0, endMs: 3000, source: 'a.jpg' }] },
    };
    render(<LayeredInspector reel={photoReel} selectedId="video:p1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByRole('button', { name: 'Speed' })).toBeNull();
  });

  it('a manual toggle survives a re-render of the same item', () => {
    const { rerender } = render(
      <LayeredInspector reel={untouched} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    expect(screen.getByLabelText('Speed (%)')).toBeInTheDocument();
    rerender(<LayeredInspector reel={{ ...untouched }} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByLabelText('Speed (%)')).toBeInTheDocument();
  });

  it('Ripple ON: committing a speed grows endMs and shifts nothing else in this single-clip fixture, holding the source window', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} ripple />);
    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    fireEvent.change(screen.getByLabelText('Speed (%)'), { target: { value: '50' } });
    const next = onChange.mock.calls[0][0] as LayeredReel;
    const v1 = next.tracks.video[0] as Extract<LayeredReel['tracks']['video'][number], { kind: 'clip' }>;
    expect(v1.endMs).toBe(6000); // 3000 / 0.5
    expect(v1.sourceInMs).toBe(0);
    expect(v1.sourceOutMs).toBe(3000);
  });

  it('Ripple OFF: committing a speed absorbs into the source window and leaves endMs untouched', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={untouched} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Speed' }));
    fireEvent.change(screen.getByLabelText('Speed (%)'), { target: { value: '50' } });
    const next = onChange.mock.calls[0][0] as LayeredReel;
    const v1 = next.tracks.video[0] as Extract<LayeredReel['tracks']['video'][number], { kind: 'clip' }>;
    expect(v1.startMs).toBe(0);
    expect(v1.endMs).toBe(3000);
    expect(v1.sourceOutMs).toBe(1500); // 3000 * 0.5
  });

  it('the header reset returns speed to 1x', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={touched} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset speed' }));
    const next = onChange.mock.calls[0][0] as LayeredReel;
    const v1 = next.tracks.video[0] as Extract<LayeredReel['tracks']['video'][number], { kind: 'clip' }>;
    expect(v1.sourceOutMs).toBe(3000); // back to matching endMs - startMs (ripple off by default)
  });
});

describe('LayeredInspector — audio slip-lock control ("Slips with the clip" / "Keeps its own timing")', () => {
  const reelWith = (audio: LayeredReel['tracks']['audio'][number]): LayeredReel => ({
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 3000 },
    tracks: {
      video: [{ id: 'v1', kind: 'clip', startMs: 0, endMs: 3000, source: 'TH-01_t4.mp4', sourceInMs: 0, sourceOutMs: 3000 }],
      audio: [audio], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  });

  it('reads the RESOLVED value via the fallback when slipsWithVideo is absent and sources share a stem (own sound → checked)', () => {
    const reel = reelWith({ id: 'a1', startMs: 0, endMs: 3000, source: 'TH-01_t4.eq.m4a', sourceInMs: 0, followsVideoId: 'v1' });
    render(<LayeredInspector reel={reel} selectedId="audio:a1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('checkbox', { name: 'Slips with the clip' })).toBeChecked();
  });

  it('reads the RESOLVED value via the fallback when sources differ (narration under a different picture → unchecked)', () => {
    const reel = reelWith({ id: 'a1', startMs: 0, endMs: 3000, source: 'TH-01_t4.eq.m4a', sourceInMs: 0, followsVideoId: 'v1' });
    reel.tracks.video[0] = { ...reel.tracks.video[0], source: 'BR-trida-miru_01_upright.mp4' } as typeof reel.tracks.video[0];
    render(<LayeredInspector reel={reel} selectedId="audio:a1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('checkbox', { name: 'Keeps its own timing' })).not.toBeChecked();
  });

  it('an explicit slipsWithVideo overrides the fallback', () => {
    // Same-stem sources would fall back to true; explicit false must win.
    const reel = reelWith({ id: 'a1', startMs: 0, endMs: 3000, source: 'TH-01_t4.eq.m4a', sourceInMs: 0, followsVideoId: 'v1', slipsWithVideo: false });
    render(<LayeredInspector reel={reel} selectedId="audio:a1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByRole('checkbox', { name: 'Keeps its own timing' })).not.toBeChecked();
  });

  it('toggling writes an explicit boolean, never leaving it to the fallback', () => {
    const onChange = vi.fn();
    const reel = reelWith({ id: 'a1', startMs: 0, endMs: 3000, source: 'TH-01_t4.eq.m4a', sourceInMs: 0, followsVideoId: 'v1' });
    render(<LayeredInspector reel={reel} selectedId="audio:a1" onChange={onChange} onSeek={() => {}} fps={30} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Slips with the clip' }));
    const next = onChange.mock.calls[0][0] as LayeredReel;
    expect(next.tracks.audio[0].slipsWithVideo).toBe(false);
  });

  it('the control is absent for an unlinked bed — the promise is meaningless without a clip to slip with', () => {
    const reel = reelWith({ id: 'a1', startMs: 0, endMs: 3000, source: 'x.m4a', sourceInMs: 0 });
    render(<LayeredInspector reel={reel} selectedId="audio:a1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.queryByRole('checkbox', { name: 'Slips with the clip' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Keeps its own timing' })).toBeNull();
  });
});

describe('LayeredInspector brand panel', () => {
  const brandReel: LayeredReel = {
    ...base,
    tracks: { ...base.tracks, brand: [{ id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 2000 }] },
  };

  it('shows the derived span read-only and offers no timing inputs', () => {
    const { container } = render(
      <LayeredInspector reel={brandReel} selectedId="brand:brand-watermark" onChange={() => {}} onSeek={() => {}} fps={30} />);
    // The panel's whole point: nothing on it is editable — any form control, not just <input>.
    expect(container.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(container.textContent).toContain('Derived');
    // The values are still shown, just not as fields. Assert the VALUES, not only the
    // labels: dropping the two readonly value divs while keeping both <label>s would
    // otherwise stay green.
    expect(container.textContent).toContain('Start');
    expect(container.textContent).toContain('End');
    expect(container.textContent).toContain(formatTimecode(0, 30));
    expect(container.textContent).toContain(formatTimecode(2000, 30));
  });
});
