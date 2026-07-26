// lib/theming/brand-track.tsx — the brand layer as a REGISTRY, not a hook.
//
// Before Phase 3 Task 4 the only way to paint reel.tracks.brand was
// `CompositionTheme.renderBrandTrack`, so every brand wrote its own whole-track
// component and NONE of them used core's GenericWatermark — three independent
// implementations of corner anchoring existed. Registering per kind instead
// gets the Sequencing, config threading and token plumbing from core, and
// leaves a brand writing only what its mark actually looks like.
//
// `.tsx`, not `.ts`, because the generics below are JSX components — the same
// reason brand-theme.ts (JSX-free) can NOT host this axis's resolver.
import React from 'react';
import { Sequence } from 'remotion';
import type { BrandLayerItem } from '../reel-config-base/layered-schema';
import type { BrandKind, BrandRenderProps, BrandRenderer, BrandTheme, CompositionTheme } from './types';
import type { Registry } from './registry';
import { resolveRegistered, registrationConfig } from './registry';
import { GenericWatermark, type WatermarkProps } from './generic/GenericWatermark';
import { GenericDisclaimer, type DisclaimerProps } from './generic/GenericDisclaimer';

// ---- core generics ----------------------------------------------------------
// The adapters that turn a raw BrandLayerItem into core's generic components.
// Precedence: the theme's TOKENS supply the look, the ITEM's own props win over
// them — tokens are theme-wide, props are per item.

const WatermarkBrandItem: BrandRenderer = ({ item, tokens }) => (
  <GenericWatermark {...(tokens?.watermark as WatermarkProps | undefined)} {...(item.props as WatermarkProps)} />
);

const DisclaimerBrandItem: BrandRenderer = ({ item, tokens }) => (
  <GenericDisclaimer {...tokens?.disclaimer} {...(item.props as DisclaimerProps)} />
);

/** Core generic fallback per brand-layer kind. THIS TABLE IS THE CONTRACT: a
 *  brand that registers nothing at all still paints its watermark and
 *  disclaimer. A brand registration still wins over any entry here. */
const GENERIC_BRAND_RENDERERS: Record<string, BrandRenderer> = {
  watermark: WatermarkBrandItem,
  disclaimer: DisclaimerBrandItem,
};

/** The "generic OR brand-custom" switch for the brand axis, resolved by the
 *  SAME rule as every other axis (see registry.ts): brand registration wins,
 *  core generic beneath, `undefined` only when neither side has the kind. */
export function resolveBrandRenderer(theme: BrandTheme, kind: BrandKind): BrandRenderer | undefined {
  return resolveRegistered(theme.brand as Registry<BrandRenderProps> | undefined, kind, GENERIC_BRAND_RENDERERS);
}

/** The brand config registered for a brand-layer kind (undefined when none). */
export function brandConfig(theme: BrandTheme, kind: BrandKind): unknown {
  return registrationConfig(theme.brand, kind);
}

/** The DEFAULT brand track: one Sequence per item, dispatched by kind through
 *  the brand-layer registry.
 *
 *  SPAN SEMANTICS, chosen deliberately: each item spans its OWN
 *  `[startMs, endMs)`, exactly like the overlay track. Both brands shipping at
 *  the time this landed instead span `[0, max(endMs))` for every brand item —
 *  neither is wrong, but adopting this default changes WHEN a brand item
 *  appears if it does not start at 0. A brand that needs the old whole-track
 *  behaviour keeps `CompositionTheme.renderBrandTrack`, which wins outright. */
export function defaultRenderBrandTrack(
  items: BrandLayerItem[],
  theme: CompositionTheme,
  fps: number,
): React.ReactNode {
  if (items.length === 0) return null;
  const msToFrames = (ms: number) => Math.round((ms / 1000) * fps);

  return (
    <>
      {items.map((item) => {
        // A kind neither the brand nor core knows is SKIPPED, not thrown —
        // same as the video and overlay tracks.
        const Renderer = resolveBrandRenderer(theme, item.kind);
        if (!Renderer) return null;
        const from = msToFrames(item.startMs);
        const durationInFrames = msToFrames(item.endMs) - from;
        if (durationInFrames <= 0) return null;
        return (
          <Sequence key={item.id} from={from} durationInFrames={durationInFrames} name={item.id}>
            <Renderer item={item} config={brandConfig(theme, item.kind)} tokens={theme.tokens} />
          </Sequence>
        );
      })}
    </>
  );
}
