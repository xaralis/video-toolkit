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
    fireEvent.click(getByText('ken-burns'));
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
