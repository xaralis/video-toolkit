import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector } from '../app/LayeredInspector';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

// The inspector's framing controls — how a clip meets the frame — are now two
// Collapsible sections, "Crop & zoom" (the source window: crop/zoom/pan,
// independent of fit) and "Fit & pad" (how that window meets the frame: fit,
// pad, placement). The reshaping insight behind the split: `blur-pad` was
// never a third fit, it is `contain` whose pad happens to be a blurred copy
// of the shot — `resolveFraming` (framing.ts) is what lets a legacy
// `fit: 'blur-pad'` item still round-trip correctly through the new
// two-axis controls instead of looking unselected.

const reelWith = (extra: Record<string, unknown>): LayeredReel => ({
  version: 'layered-1',
  meta: { topic: 't', totalDurationMs: 4000 },
  tracks: {
    video: [
      {
        id: 'v1',
        kind: 'broll',
        startMs: 0,
        endMs: 4000,
        source: 'broll/portrait.mp4',
        sourceInMs: 0,
        sourceOutMs: 4000,
        musicBoostDb: 0,
        ...extra,
      } as LayeredReel['tracks']['video'][number],
    ],
    audio: [],
    music: { baseVolumeDb: -8 },
    overlays: [],
    brand: [],
  },
});

const mount = (reel: LayeredReel, onChange = () => {}) =>
  render(<LayeredInspector reel={reel} selectedId="video:v1" onChange={onChange} onSeek={() => {}} fps={30} />);

const cropHeader = () => screen.getByRole('button', { name: 'Crop & zoom' });
const fitHeader = () => screen.getByRole('button', { name: 'Fit & pad' });
const openCrop = () => fireEvent.click(cropHeader());
const openFit = () => fireEvent.click(fitHeader());

describe('inspector — framing — sections collapse/expand', () => {
  it('both sections start collapsed for an untouched item', () => {
    mount(reelWith({}));
    expect(cropHeader()).toHaveAttribute('aria-expanded', 'false');
    expect(fitHeader()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Zoom (1 = none)')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Fit' })).toBeNull();
  });

  it('Crop & zoom starts expanded once the crop or pan differs from default', () => {
    mount(reelWith({ focalX: 0.8 }));
    expect(cropHeader()).toHaveAttribute('aria-expanded', 'true');
  });

  it('Fit & pad starts expanded once fit/pad/placement/backdrop differ from default', () => {
    mount(reelWith({ fit: 'contain' }));
    expect(fitHeader()).toHaveAttribute('aria-expanded', 'true');
  });

  it('a manual expand of Crop & zoom survives a re-render of the same item', () => {
    const { rerender } = mount(reelWith({}));
    openCrop();
    expect(screen.getByLabelText('Zoom (1 = none)')).toBeInTheDocument();
    rerender(<LayeredInspector reel={reelWith({})} selectedId="video:v1" onChange={() => {}} onSeek={() => {}} fps={30} />);
    expect(screen.getByLabelText('Zoom (1 = none)')).toBeInTheDocument();
  });
});

describe('inspector — framing — Crop & zoom', () => {
  it('offers the zoom and crop-focus controls, named for what they do', () => {
    mount(reelWith({ focalX: 0.8 }));
    expect(screen.getByLabelText('Zoom (1 = none)')).toBeTruthy();
    expect(screen.getByLabelText('Crop focus X')).toBeTruthy();
    expect(screen.getByLabelText('Crop focus Y')).toBeTruthy();
    expect(screen.queryByLabelText('Focal X')).toBeNull();
  });

  it('greys the crop focus under contain at zoom 1 — genuinely nothing to pan', () => {
    mount(reelWith({ fit: 'contain' }));
    openCrop();
    expect((screen.getByLabelText('Crop focus X') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Crop focus Y') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('Nothing is cropped at this zoom — zoom in to choose what shows.')).toBeTruthy();
  });

  it('keeps the crop focus LIVE under contain once zoomed in — it was never inert', () => {
    mount(reelWith({ fit: 'contain', crop: { width: 0.5 } }));
    expect((screen.getByLabelText('Crop focus X') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Crop focus Y') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText('Nothing is cropped at this zoom — zoom in to choose what shows.')).toBeNull();
  });

  it('keeps the crop focus live under fill-frame regardless of zoom', () => {
    mount(reelWith({}));
    openCrop();
    expect((screen.getByLabelText('Crop focus X') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText('Nothing is cropped at this zoom — zoom in to choose what shows.')).toBeNull();
  });

  it('keeps a greyed crop focus VALUE, so switching back restores it', () => {
    mount(reelWith({ fit: 'contain', focalX: 0.8 }));
    const x = screen.getByLabelText('Crop focus X') as HTMLInputElement;
    expect(x.disabled).toBe(true);
    expect(x.value).toBe('0.8');
  });

  it("Crop & zoom's own reset clears crop/focalX/focalY and nothing else", () => {
    const onChange = vi.fn();
    mount(reelWith({ crop: { width: 0.5 }, focalX: 0.8, focalY: 0.2, fit: 'contain', backdropBlur: 10 }), onChange);
    fireEvent.click(screen.getByLabelText('Reset crop & zoom'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ crop: undefined, focalX: undefined, focalY: undefined, fit: 'contain', backdropBlur: 10 });
  });
});

describe('inspector — framing — Fit & pad', () => {
  it('offers the two fit modes in plain language, as a button group', () => {
    mount(reelWith({}));
    openFit();
    expect(screen.getByRole('group', { name: 'Fit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fill frame' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Whole shot' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'cover' })).toBeNull();
  });

  it('commits a fit change onto the item', () => {
    const onChange = vi.fn();
    mount(reelWith({}), onChange);
    openFit();
    fireEvent.click(screen.getByRole('button', { name: 'Whole shot' }));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ fit: 'contain' });
  });

  it('never writes the deprecated blur-pad value', () => {
    const onChange = vi.fn();
    mount(reelWith({}), onChange);
    openFit();
    fireEvent.click(screen.getByRole('button', { name: 'Whole shot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fill frame' }));
    for (const call of onChange.mock.calls) {
      expect((call[0] as LayeredReel).tracks.video[0].fit).not.toBe('blur-pad');
    }
  });

  it('a legacy fit:"blur-pad" item shows as Whole shot + Blurred copy, not unselected', () => {
    // `hasFitChanges` reports true for the legacy alias, so the section
    // starts expanded already — no need to open it by hand.
    mount(reelWith({ fit: 'blur-pad' }));
    expect(screen.getByRole('button', { name: 'Whole shot' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Blurred copy' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('greys Pad under fill-frame — nothing to pad', () => {
    mount(reelWith({}));
    openFit();
    expect(screen.getByRole('button', { name: 'Blurred copy' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Colour' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'None' })).toBeDisabled();
  });

  it('defaults Pad to Blurred copy under contain', () => {
    mount(reelWith({ fit: 'contain' }));
    expect(screen.getByRole('button', { name: 'Blurred copy' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('choosing Colour writes pad:"color" and an explicit black padColor', () => {
    const onChange = vi.fn();
    mount(reelWith({ fit: 'contain' }), onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Colour' }));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ pad: 'color', padColor: '#000000' });
  });

  it('greys Pad colour unless pad is Colour', () => {
    mount(reelWith({ fit: 'contain' }));
    expect((screen.getByLabelText('Pad colour') as HTMLInputElement).disabled).toBe(true);
  });

  it('enables Pad colour once pad is Colour, preserving an existing value', () => {
    mount(reelWith({ fit: 'contain', pad: 'color', padColor: '#ff00ff' }));
    const field = screen.getByLabelText('Pad colour') as HTMLInputElement;
    expect(field.disabled).toBe(false);
    expect(field.value).toBe('#ff00ff');
  });

  it('greys the backdrop blur/dim fields unless pad is blur', () => {
    mount(reelWith({ fit: 'contain', pad: 'none' }));
    expect((screen.getByLabelText('Backdrop blur') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Backdrop dim') as HTMLInputElement).disabled).toBe(true);
  });

  it('enables the backdrop blur/dim fields when pad is blur', () => {
    mount(reelWith({ fit: 'contain' }));
    expect((screen.getByLabelText('Backdrop blur') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Backdrop dim') as HTMLInputElement).disabled).toBe(false);
  });

  it('commits an edited backdrop blur under contain + blur pad', () => {
    const onChange = vi.fn();
    mount(reelWith({ fit: 'contain' }), onChange);
    const blur = screen.getByLabelText('Backdrop blur') as HTMLInputElement;
    fireEvent.change(blur, { target: { value: '12' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ backdropBlur: 12 });
  });

  it('shows the backdrop defaults the renderer will use, not an empty box', () => {
    mount(reelWith({ fit: 'contain' }));
    expect((screen.getByLabelText('Backdrop blur') as HTMLInputElement).value).toBe('32');
    expect((screen.getByLabelText('Backdrop dim') as HTMLInputElement).value).toBe('0.45');
  });

  it('greys placement under fill-frame, with a reason', () => {
    mount(reelWith({}));
    openFit();
    expect((screen.getByLabelText('Position in frame X') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Position in frame Y') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('The shot fills the frame — there is nothing to position.')).toBeTruthy();
  });

  it('keeps placement live under contain', () => {
    mount(reelWith({ fit: 'contain' }));
    expect((screen.getByLabelText('Position in frame X') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('Position in frame Y') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText('The shot fills the frame — there is nothing to position.')).toBeNull();
  });

  it('commits a placement change onto the item', () => {
    const onChange = vi.fn();
    mount(reelWith({ fit: 'contain' }), onChange);
    const placeX = screen.getByLabelText('Position in frame X') as HTMLInputElement;
    fireEvent.change(placeX, { target: { value: '0.75' } });
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ placeX: 0.75 });
  });

  it("Fit & pad's own reset clears fit/pad/padColor/place*/backdrop* and nothing else", () => {
    const onChange = vi.fn();
    mount(
      reelWith({
        fit: 'contain',
        pad: 'color',
        padColor: '#ff00ff',
        placeX: 0.2,
        placeY: 0.8,
        backdropBlur: 12,
        backdropDim: 0.1,
        crop: { width: 0.5 },
        focalX: 0.9,
      }),
      onChange,
    );
    fireEvent.click(screen.getByLabelText('Reset fit & pad'));
    const next = onChange.mock.calls.at(-1)![0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({
      fit: undefined,
      pad: undefined,
      padColor: undefined,
      placeX: undefined,
      placeY: undefined,
      backdropBlur: undefined,
      backdropDim: undefined,
      crop: { width: 0.5 },
      focalX: 0.9,
    });
  });
});
