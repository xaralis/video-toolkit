// The end-to-end of Task 7: a brand registers ONE thing — a kind, with `params`
// — in its theme, and that kind becomes editable in the inspector with no core
// UI knowing the kind's name. These drive the whole path (theme registration →
// editorMetaFromTheme → LayeredInspector) rather than handing the inspector a
// hand-written EditorMeta, because the hand-written EditorMeta is exactly the
// second declaration this task removed.
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector } from '../app/LayeredInspector';
import { editorMetaFromTheme } from '../app/editor-meta';
import type { CompositionTheme } from '../../theming/types';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const bareTheme: CompositionTheme = { background: '#000', accentSlots: [] };

const overlayReel = (content: Record<string, unknown>): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 2000 },
  tracks: {
    video: [],
    audio: [],
    music: { baseVolumeDb: -8 },
    brand: [],
    overlays: [{ id: 'ov1', startMs: 0, endMs: 2000, content }],
  },
});

describe('overlay params, declared by the theme', () => {
  const theme: CompositionTheme = {
    ...bareTheme,
    overlays: {
      chevron: {
        params: [
          { prop: 'weight', label: 'Weight', options: ['light', 'heavy'] },
          { prop: 'delaySec', label: 'Delay (s)', type: 'number' },
        ],
      },
    },
  };
  const meta = editorMetaFromTheme(theme);

  it('renders a declared option field as a dropdown over the brand values', () => {
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron', weight: 'light' })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const w = screen.getByLabelText('Weight') as HTMLSelectElement;
    expect(w.tagName).toBe('SELECT');
    expect(w.value).toBe('light');
    expect(screen.getByRole('option', { name: 'heavy' })).toBeTruthy();
  });

  it('commits a declared edit back onto the overlay content', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron', weight: 'light' })}
        selectedId="overlays:ov1" onChange={onChange} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.change(screen.getByLabelText('Weight'), { target: { value: 'heavy' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect((next.tracks.overlays[0].content as Record<string, unknown>).weight).toBe('heavy');
    expect((next.tracks.overlays[0].content as Record<string, unknown>).kind).toBe('chevron');
  });

  // THE failure mode editor-meta.ts's own comment warns about: a field with no
  // declared `type` and no current value has nothing to be typed from, falls
  // back to a text input, and writes a STRING into a bag the renderer reads as
  // a number. `z.record(z.unknown())` accepts it, so nothing rejects the
  // type-dirty config. A declared `type` is what closes it.
  it('a declared-number field the item does not carry renders as a number input', () => {
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron' })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const d = screen.getByLabelText('Delay (s)') as HTMLInputElement;
    expect(d.type).toBe('number');
    expect(d.value).toBe('');
  });

  it('and commits a NUMBER for that absent key, not the string "0.5"', () => {
    const onChange = vi.fn();
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron' })}
        selectedId="overlays:ov1" onChange={onChange} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.change(screen.getByLabelText('Delay (s)'), { target: { value: '0.5' } });
    const content = (onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.overlays[0].content as Record<string, unknown>;
    expect(content.delaySec).toBe(0.5);
    expect(typeof content.delaySec).toBe('number');
  });

  it('renders an undeclared content key alongside the declared ones', () => {
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron', weight: 'light', strokeWidth: 4 })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByLabelText('Stroke width') as HTMLInputElement).type).toBe('number');
  });

  // `text` has the dedicated accent-aware editor above the params; a plain
  // TextField for the same value would be a second, accent-blind editor.
  it('never renders `text` as a plain param — the accent editor owns it', () => {
    const textTheme: CompositionTheme = {
      ...bareTheme,
      overlays: { banner: { params: [{ prop: 'text' }, { prop: 'weight', options: ['a', 'b'] }] } },
    };
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'banner', text: 'Hi' })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30}
        meta={editorMetaFromTheme(textTheme)} />);
    expect(screen.queryByLabelText('Text')).toBeNull(); // no second editor
    expect(screen.getByLabelText('Weight')).toBeTruthy();
  });
});

// THE mixed case: a kind that declares a param of its own AND carries the three
// content fields core knows. Declaration is ADDITIVE — if declaring one param
// swapped the whole bag over to the generic value-typed editor, `reveal` and
// `hide` would become free-text inputs over a `z.record(z.unknown())` bag that
// rejects nothing, so `reveal: "lien"` would save clean. Core's typed controls
// must survive for the fields core knows.
describe('overlay params, mixed with the content fields core knows', () => {
  const theme: CompositionTheme = {
    ...bareTheme,
    overlays: { chevron: { params: [{ prop: 'weight', label: 'Weight', options: ['light', 'heavy'] }] } },
  };
  const meta = editorMetaFromTheme(theme);
  const mixed = overlayReel({ kind: 'chevron', weight: 'light', reveal: 'line', hide: 'fade', fontSize: 72 });

  it('keeps reveal and hide as SELECTs — not the text inputs value-typing gives', () => {
    render(<LayeredInspector reel={mixed} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByLabelText('Reveal') as HTMLSelectElement).tagName).toBe('SELECT');
    expect((screen.getByLabelText('Hide') as HTMLSelectElement).tagName).toBe('SELECT');
    // Core's real enum, not whatever string the item happens to hold.
    const reveal = screen.getByLabelText('Reveal') as HTMLSelectElement;
    expect([...reveal.options].map((o) => o.value)).toEqual(['line', 'all', 'none']);
  });

  it('keeps font size on core’s step of 4, not the generic bag editor’s 0.1', () => {
    render(<LayeredInspector reel={mixed} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const f = screen.getByLabelText('Font size') as HTMLInputElement;
    expect(f.step).toBe('4');
    expect(f.value).toBe('72');
  });

  it('renders the brand’s declared param alongside them', () => {
    render(<LayeredInspector reel={mixed} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect((screen.getByLabelText('Weight') as HTMLSelectElement).value).toBe('light');
  });

  it('shows each core field exactly once — no second, value-typed control', () => {
    render(<LayeredInspector reel={mixed} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect(screen.getAllByLabelText('Reveal')).toHaveLength(1);
    expect(screen.getAllByLabelText('Font size')).toHaveLength(1);
  });

  it('still commits a valid enum through core’s control', () => {
    const onChange = vi.fn();
    render(<LayeredInspector reel={mixed} selectedId="overlays:ov1" onChange={onChange} onSeek={() => {}} fps={30} meta={meta} />);
    fireEvent.change(screen.getByLabelText('Reveal'), { target: { value: 'all' } });
    const content = (onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.overlays[0].content as Record<string, unknown>;
    expect(content.reveal).toBe('all');
    expect(content.weight).toBe('light');
  });

  // Explicit-wins, the same rule editorMetaFromTheme applies: a brand that
  // declares one of core's three BY NAME takes it over, and core steps aside
  // for that field ONLY — the other two keep their typed controls.
  it('lets a brand declare `reveal` itself and take it over, keeping hide/fontSize core-typed', () => {
    const ownTheme: CompositionTheme = {
      ...bareTheme,
      overlays: { chevron: { params: [{ prop: 'reveal', label: 'Reveal', options: ['line', 'stagger'] }] } },
    };
    render(
      <LayeredInspector reel={mixed} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30}
        meta={editorMetaFromTheme(ownTheme)} />);
    expect(screen.getAllByLabelText('Reveal')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'stagger' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'all' })).toBeNull(); // core's list gone
    expect((screen.getByLabelText('Hide') as HTMLSelectElement).tagName).toBe('SELECT'); // core still owns it
    expect((screen.getByLabelText('Font size') as HTMLInputElement).step).toBe('4');
  });
});

// A brand that declares NOTHING must see exactly today's inspector. This is the
// fallback the declared path sits in front of, so it is asserted, not assumed.
describe('overlay fallback: a theme that declares no overlay params', () => {
  const meta = editorMetaFromTheme(bareTheme);

  it('still shows the value-presence reveal / hide / font size editor', () => {
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'quote-pull', text: 'Hi', reveal: 'line', hide: 'fade', fontSize: 72 })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const reveal = screen.getByLabelText('Reveal') as HTMLSelectElement;
    const hide = screen.getByLabelText('Hide') as HTMLSelectElement;
    // SELECTs, not the text inputs the generic bag editor would produce for
    // these same string values — the fallback is core's own editor, not
    // ParamFields with an empty declaration.
    expect(reveal.tagName).toBe('SELECT');
    expect(reveal.value).toBe('line');
    expect(hide.tagName).toBe('SELECT');
    expect(hide.value).toBe('fade');
    expect((screen.getByLabelText('Font size') as HTMLInputElement).step).toBe('4');
    expect((screen.getByLabelText('Font size') as HTMLInputElement).value).toBe('72');
  });

  it('is identical with NO meta at all — the derived-empty meta changes nothing', () => {
    const content = { kind: 'quote-pull', text: 'Hi', reveal: 'all', hide: 'none', fontSize: 64 };
    const { container: withMeta } = render(
      <LayeredInspector reel={overlayReel(content)} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    const { container: without } = render(
      <LayeredInspector reel={overlayReel(content)} selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(withMeta.innerHTML).toBe(without.innerHTML);
  });

  it('shows no param editor at all for a kind carrying none of those keys', () => {
    render(
      <LayeredInspector
        reel={overlayReel({ kind: 'chevron' })}
        selectedId="overlays:ov1" onChange={() => {}} onSeek={() => {}} fps={30} meta={meta} />);
    expect(screen.queryByLabelText('Reveal')).toBeNull();
    expect(screen.queryByText('No editable params.')).toBeNull();
  });
});

describe('video params and effects, declared by the theme', () => {
  const videoReel: LayeredReel = {
    version: 'layered-1',
    meta: { topic: 't', totalDurationMs: 2000 },
    tracks: {
      video: [{ id: 'o1', kind: 'outro', startMs: 0, endMs: 2000, musicBoostDb: 0, props: {} }],
      audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
    },
  };

  it('a video registration’s params reach the inspector without any EditorMeta', () => {
    const theme: CompositionTheme = {
      ...bareTheme,
      video: { outro: { params: [{ prop: 'style', label: 'Style', options: ['organic', 'fade'] }] } },
    };
    render(
      <LayeredInspector reel={videoReel} selectedId="video:o1" onChange={() => {}} onSeek={() => {}} fps={30}
        meta={editorMetaFromTheme(theme)} />);
    expect((screen.getByLabelText('Style') as HTMLSelectElement).tagName).toBe('SELECT');
  });

  it('an effect registration makes the effect addable in "+ Add effect"', () => {
    const theme: CompositionTheme = { ...bareTheme, effects: { vintage: {} } };
    const onChange = vi.fn();
    const clipReel: LayeredReel = {
      version: 'layered-1',
      meta: { topic: 't', totalDurationMs: 2000 },
      tracks: {
        video: [{ id: 'v1', kind: 'photo', startMs: 0, endMs: 2000, source: 'a.jpg', musicBoostDb: 0 }],
        audio: [], music: { baseVolumeDb: -8 }, overlays: [], brand: [],
      },
    };
    render(
      <LayeredInspector reel={clipReel} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30}
        meta={editorMetaFromTheme(theme)} />);
    fireEvent.click(screen.getByText('+ Add effect'));
    fireEvent.click(screen.getByText('vintage'));
    expect((onChange.mock.calls.at(-1)![0] as LayeredReel).tracks.video[0].effects).toEqual([{ type: 'vintage' }]);
  });
});
