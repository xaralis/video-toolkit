import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector, TransitionFields } from './LayeredInspector';
import { editorMetaFromTheme, type EditorMeta } from './editor-meta';
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

// ---------------------------------------------------------------------------
// Phase 4 Task 3.4 — the two editor guards against authoring BOTH `item.grade`
// and a `type: 'grade'` effect (now one implementation, style-effect.ts's
// `gradeStyleEffect` — see grade-unification.test.tsx for the render-path
// proof). Per the task brief, tested with a STATEFUL PARENT: a wrapper that
// holds real state and re-renders on `onChange`, the shape that would have
// caught all four prior editor data-loss bugs (an inert `onChange={() => {}}`
// never lets the component see its own committed value come back).
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
    fireEvent.click(screen.getByText('+ Add effect'));
    expect(screen.getByText('Ken Burns')).toBeTruthy();
    expect(screen.getByText('vignette-pulse')).toBeTruthy(); // catalog button label falls back to the raw type, no humanizing
  });

  it('round-trips an authored intensity through a STATEFUL parent: add → edit → re-render → still there → editable again', () => {
    render(<StatefulInspector initial={clean} selectedId="video:v1" meta={meta} />);

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
    // rewrite or drop the unrecognised effect entry.
    const boost = screen.getByLabelText('Music boost (dB)') as HTMLInputElement;
    fireEvent.change(boost, { target: { value: '3' } });
    fireEvent.blur(boost);
    expect(screen.getByText('Effect · unregistered-style-fx')).toBeTruthy();
  });
});

describe('LayeredInspector grade unification guards (Phase 4 Task 3.4)', () => {
  const withGradeField: LayeredReel = {
    version: 'layered-1', meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0,
                grade: { brightness: 1.2 } } as never],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  const withGradeEffect: LayeredReel = {
    ...withGradeField,
    tracks: {
      ...withGradeField.tracks,
      video: [{ ...withGradeField.tracks.video[0], effects: [{ type: 'grade', contrast: 1.3 }] } as never],
    },
  };

  const noGradeAtAll: LayeredReel = {
    ...withGradeField,
    tracks: { ...withGradeField.tracks, video: [{ ...withGradeField.tracks.video[0], grade: undefined } as never] },
  };

  // GUARD 1: "+ Add effect → Grade" is disabled when item.grade is already
  // set — MUTATION TARGET: break `AddEffectControl`'s `blockedTypes` guard
  // (or its call site's `v.grade ? new Set(['grade']) : undefined` in
  // LayeredInspector.tsx) and this goes red — clicking "Grade" would add a
  // second, dead grade effect.
  it('disables "+ Add effect → Grade" when item.grade is already set, and clicking it is a no-op', () => {
    render(<StatefulInspector initial={withGradeField} selectedId="video:v1" />);
    fireEvent.click(screen.getByText('+ Add effect'));
    const gradeBtn = screen.getByText('Grade') as HTMLButtonElement;
    expect(gradeBtn.disabled).toBe(true);
    fireEvent.click(gradeBtn);
    expect(screen.queryByText('Effect · grade')).toBeNull();
  });

  it('allows adding a Grade effect when item.grade is absent', () => {
    render(<StatefulInspector initial={noGradeAtAll} selectedId="video:v1" />);
    fireEvent.click(screen.getByText('+ Add effect'));
    fireEvent.click(screen.getByText('Grade'));
    expect(screen.getByText('Effect · grade')).not.toBeNull();
  });

  // GUARD 2: the Color panel is greyed (disabled, not hidden) when a `grade`
  // effect already exists — MUTATION TARGET: drop the `hasGradeEffect`
  // computation or the `disabled={hasGradeEffect}` prop in
  // LayeredInspector.tsx's Color-panel block and this goes red.
  it('greys the Color panel (Brightness disabled) when a grade effect is present', () => {
    render(<StatefulInspector initial={withGradeEffect} selectedId="video:v1" />);
    const brightness = screen.getByLabelText('Brightness') as HTMLInputElement;
    expect(brightness.disabled).toBe(true);
  });

  it('the Color panel is enabled when no grade effect is present', () => {
    render(<StatefulInspector initial={withGradeField} selectedId="video:v1" />);
    expect((screen.getByLabelText('Brightness') as HTMLInputElement).disabled).toBe(false);
  });

  // Disabled ≠ cleared — the guard that protects `item.grade` must not be
  // the thing that destroys it. Pinned end-to-end through the STATEFUL
  // parent: greyed while a grade effect exists, value SURVIVES, re-enables
  // and round-trips once the effect is removed, THEN can still be edited.
  it('item.grade SURVIVES being greyed, re-enabled, and round-tripped after the grade effect is removed', () => {
    render(<StatefulInspector initial={withGradeEffect} selectedId="video:v1" />);
    // Greyed, but showing the ORIGINAL item.grade value, not the effect's own.
    let brightness = screen.getByLabelText('Brightness') as HTMLInputElement;
    expect(brightness.disabled).toBe(true);
    expect(brightness.value).toBe('1.2');

    // Remove the grade EFFECT (not the field) — the panel re-enables.
    fireEvent.click(screen.getByLabelText('remove effect grade'));
    brightness = screen.getByLabelText('Brightness') as HTMLInputElement;
    expect(brightness.disabled).toBe(false);
    // The stored item.grade value round-tripped through the whole disable →
    // re-enable cycle untouched — greying never wrote to it.
    expect(brightness.value).toBe('1.2');

    // And it is genuinely editable again, not just visually re-enabled.
    fireEvent.change(brightness, { target: { value: '1.5' } });
    // A SliderField (Task 10) is `type="range"` — jest-dom's `toHaveValue`
    // only special-cases `type="number"`, so a range input's value compares
    // as a string.
    expect((screen.getByLabelText('Brightness') as HTMLInputElement).value).toBe('1.5');
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
});
