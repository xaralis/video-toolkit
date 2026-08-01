import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { LayeredInspector } from '../app/LayeredInspector';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

// The inspector's "Framing" group — how a clip meets the frame. The controls
// under `Fit` change meaning with it, and the point of these tests is that the
// UI says so rather than leaving a dead control on screen: a non-technical
// editor arrives here saying "that shot is cut off", not "I want objectFit".

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

describe('inspector — framing', () => {
  it('offers the two fit modes in plain language, not as API values', () => {
    mount(reelWith({}));
    const fit = screen.getByLabelText('Fit') as HTMLSelectElement;
    const labels = Array.from(fit.options).map((o) => o.textContent);
    expect(labels).toContain('Fill frame');
    expect(labels).toContain('Whole shot + blurred backdrop');
    expect(labels).not.toContain('cover');
  });

  it('commits a fit change onto the item', () => {
    const onChange = vi.fn();
    mount(reelWith({}), onChange);
    fireEvent.change(screen.getByLabelText('Fit'), { target: { value: 'blur-pad' } });
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0][0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ fit: 'blur-pad' });
  });

  it('frees the word "fit" — the zoom control no longer claims it', () => {
    mount(reelWith({}));
    expect(screen.getByLabelText('Zoom (1 = none)')).toBeTruthy();
    expect(screen.queryByLabelText('Zoom (1 = fit)')).toBeNull();
  });

  it('names the crop controls for what they do', () => {
    mount(reelWith({}));
    expect(screen.getByLabelText('Crop focus X')).toBeTruthy();
    expect(screen.queryByLabelText('Focal X')).toBeNull();
  });

  it('disables the crop focus under blur-pad, because nothing is cropped', () => {
    mount(reelWith({ fit: 'blur-pad' }));
    expect((screen.getByLabelText('Crop focus X') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Crop focus Y') as HTMLInputElement).disabled).toBe(true);
  });

  it('says WHY the crop focus is dead, rather than leaving a grey box', () => {
    mount(reelWith({ fit: 'blur-pad' }));
    expect(screen.getByText('Nothing is cropped — the whole shot is visible.')).toBeTruthy();
  });

  it('shows no such note under fill-frame, where the control is live', () => {
    mount(reelWith({}));
    expect((screen.getByLabelText('Crop focus X') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText('Nothing is cropped — the whole shot is visible.')).toBeNull();
  });

  it('keeps a greyed crop focus VALUE, so switching back restores it', () => {
    mount(reelWith({ fit: 'blur-pad', focalX: 0.8 }));
    const x = screen.getByLabelText('Crop focus X') as HTMLInputElement;
    expect(x.disabled).toBe(true);
    expect(x.value).toBe('0.8');
  });

  it('disables the backdrop knobs under fill-frame, where there is no backdrop', () => {
    mount(reelWith({}));
    expect((screen.getByLabelText('Backdrop blur') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Backdrop dim') as HTMLInputElement).disabled).toBe(true);
  });

  it('commits an edited backdrop blur under blur-pad', () => {
    const onChange = vi.fn();
    mount(reelWith({ fit: 'blur-pad' }), onChange);
    const blur = screen.getByLabelText('Backdrop blur') as HTMLInputElement;
    expect(blur.disabled).toBe(false);
    fireEvent.change(blur, { target: { value: '12' } });
    const next = onChange.mock.calls[0][0] as LayeredReel;
    expect(next.tracks.video[0]).toMatchObject({ backdropBlur: 12 });
  });

  it('shows the backdrop defaults the renderer will use, not an empty box', () => {
    mount(reelWith({ fit: 'blur-pad' }));
    expect((screen.getByLabelText('Backdrop blur') as HTMLInputElement).value).toBe('32');
    expect((screen.getByLabelText('Backdrop dim') as HTMLInputElement).value).toBe('0.45');
  });
});
