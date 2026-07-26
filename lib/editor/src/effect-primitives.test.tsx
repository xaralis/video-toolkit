import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// The primitives are pure except for grain, which reads useCurrentFrame to
// derive its seed. Mock only the hook; keep everything else real.
const frameState = vi.hoisted(() => ({ frame: 0 }));
vi.mock('remotion', async () => {
  const actual = await vi.importActual<typeof import('remotion')>('remotion');
  return { ...actual, useCurrentFrame: () => frameState.frame };
});

import {
  grainLayerStyle,
  grainTurbulenceAttrs,
  scanlinesLayerStyle,
  vignetteLayerStyle,
  gradeFromEffect,
  transformString,
  transformLayerStyle,
  GrainEffect,
  ScanlinesEffect,
  VignetteEffect,
  GradeEffect,
  TransformEffect,
} from '@video-toolkit/lib/theming/effects';
import type { EffectRenderProps } from '@video-toolkit/lib/theming/effects';
import type { VideoItem } from '@video-toolkit/lib/reel-config-base/layered-schema';

const item: VideoItem = { id: 'v1', kind: 'photo', startMs: 0, endMs: 3000, source: 'photos/a.jpg' };
const NO_HANDLES = { inHalf: 0, outHalf: 0 };

const props = (effect: Record<string, unknown>): EffectRenderProps => ({
  effect: effect as EffectRenderProps['effect'],
  item,
  handles: NO_HANDLES,
  children: <span data-w="media" />,
});

// Every primitive must be brand-neutral: this asserts no core constant smuggles
// in a colour or a look magnitude. Values come from the entry, or not at all.
describe('grain', () => {
  it('produces an overlay-blended layer whose opacity is the entry amount', () => {
    expect(grainLayerStyle({ amount: 0.35 }, 'grain-v1')).toEqual({
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      opacity: 0.35,
      mixBlendMode: 'overlay',
      filter: 'url(#grain-v1)',
    });
  });

  it('derives the turbulence seed from the frame when the entry pins none', () => {
    expect(grainTurbulenceAttrs({ amount: 0.2 }, 17)).toEqual({ baseFrequency: 0.5, seed: 17 });
    expect(grainTurbulenceAttrs({ amount: 0.2 }, 18)).toEqual({ baseFrequency: 0.5, seed: 18 });
  });

  it('honours an explicit seed, so the grain can be frozen', () => {
    expect(grainTurbulenceAttrs({ seed: 4 }, 17)).toEqual({ baseFrequency: 0.5, seed: 4 });
    expect(grainTurbulenceAttrs({ seed: 4 }, 999)).toEqual({ baseFrequency: 0.5, seed: 4 });
  });

  it('maps tileSize to the reciprocal baseFrequency', () => {
    expect(grainTurbulenceAttrs({ tileSize: 8 }, 0).baseFrequency).toBe(0.125);
    expect(grainTurbulenceAttrs({ tileSize: 4 }, 0).baseFrequency).toBe(0.25);
  });

  it('renders the media plus a sibling layer, leaving the media untouched', () => {
    frameState.frame = 3;
    const { container } = render(<GrainEffect {...props({ type: 'grain', amount: 0.5 })} />);
    expect(container.querySelector('[data-w="media"]')).not.toBeNull();
    // Additive: the media is a SIBLING of the overlay, not wrapped by it.
    expect(container.querySelector('[data-w="media"] div')).toBeNull();
    expect(container.querySelector('feTurbulence')?.getAttribute('seed')).toBe('3');
  });
});

describe('scanlines', () => {
  it('produces a repeating gradient at the entry spacing and opacity', () => {
    expect(scanlinesLayerStyle({ spacingPx: 6, opacity: 0.25 })).toEqual({
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      opacity: 0.25,
      backgroundImage:
        'repeating-linear-gradient(to bottom, rgba(0,0,0,1) 0px, rgba(0,0,0,1) 3px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 6px)',
    });
  });

  it('omits mixBlendMode entirely unless the entry asks for one', () => {
    expect(scanlinesLayerStyle({ spacingPx: 2, opacity: 0.1 })).not.toHaveProperty('mixBlendMode');
    expect(scanlinesLayerStyle({ spacingPx: 2, opacity: 0.1, blend: 'multiply' }).mixBlendMode).toBe('multiply');
  });

  it('renders the media plus a sibling layer', () => {
    const { container } = render(<ScanlinesEffect {...props({ type: 'scanlines', spacingPx: 4, opacity: 0.2 })} />);
    expect(container.querySelector('[data-w="media"]')).not.toBeNull();
    expect(container.querySelectorAll('div')).toHaveLength(1);
  });
});

describe('vignette', () => {
  it('darkens to the entry strength from the entry radius outward', () => {
    expect(vignetteLayerStyle({ strength: 0.7, radiusPct: 40 })).toEqual({
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.7) 100%)',
    });
  });

  it('defaults the radius to the geometrically neutral 50%', () => {
    expect(vignetteLayerStyle({ strength: 0.5 }).background).toBe(
      'radial-gradient(ellipse at center, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)',
    );
  });

  it('renders the media plus a sibling layer', () => {
    const { container } = render(<VignetteEffect {...props({ type: 'vignette', strength: 0.6 })} />);
    expect(container.querySelector('[data-w="media"]')).not.toBeNull();
  });
});

describe('grade', () => {
  it('reads the grade off the entry, dropping only the type discriminant', () => {
    expect(gradeFromEffect({ type: 'grade', brightness: 1.1, contrast: 0.9, temperature: 0.4 })).toEqual({
      brightness: 1.1,
      contrast: 0.9,
      temperature: 0.4,
    });
  });

  it('ENCLOSES the media in a filtered wrapper (delegating to reel-config-base/grade)', () => {
    const { container } = render(
      <GradeEffect {...props({ type: 'grade', brightness: 1.2, contrast: 1.5, saturation: 0.5 })} />,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.filter).toBe('brightness(1.2) contrast(1.5) saturate(0.5)');
    // Enclosing, not additive: the media is INSIDE the filtered wrapper.
    expect(wrapper.querySelector('[data-w="media"]')).not.toBeNull();
  });

  it('emits the white-balance feColorMatrix only when temperature/tint are set', () => {
    const plain = render(<GradeEffect {...props({ type: 'grade', brightness: 1.2 })} />);
    expect(plain.container.querySelector('feColorMatrix')).toBeNull();

    const wb = render(<GradeEffect {...props({ type: 'grade', temperature: 1 })} />);
    const matrix = wb.container.querySelector('feColorMatrix');
    expect(matrix).not.toBeNull();
    // gradeWbGains: r = 1 + 1*0.3, b = 1 - 1*0.3
    expect(matrix!.getAttribute('values')).toBe('1.3 0 0 0 0  0 1 0 0 0  0 0 0.7 0 0  0 0 0 1 0');
    expect((wb.container.firstElementChild as HTMLElement).style.filter).toBe('url(#grade-effect-v1)');
  });
});

describe('transform', () => {
  it('emits translate, rotate and scale in a fixed order', () => {
    expect(transformString({ scale: 1.2, translateXPct: 5, translateYPct: -3, rotateDeg: 10 })).toBe(
      'translate(5%, -3%) rotate(10deg) scale(1.2)',
    );
  });

  it('emits ONLY the parts the entry carries', () => {
    expect(transformString({ scale: 2 })).toBe('scale(2)');
    expect(transformString({ rotateDeg: 90 })).toBe('rotate(90deg)');
    expect(transformString({ translateXPct: 4 })).toBe('translate(4%, 0%)');
    expect(transformString({ translateYPct: 4 })).toBe('translate(0%, 4%)');
  });

  it('produces no transform at all for an empty entry', () => {
    expect(transformString({ type: 'transform' })).toBeUndefined();
    expect(transformLayerStyle({ type: 'transform' })).toEqual({ position: 'absolute', inset: 0 });
  });

  it('ENCLOSES the media in the transformed wrapper', () => {
    const { container } = render(<TransformEffect {...props({ type: 'transform', scale: 1.5 })} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toBe('scale(1.5)');
    expect(wrapper.querySelector('[data-w="media"]')).not.toBeNull();
  });
});
