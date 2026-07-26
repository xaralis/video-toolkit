// The brand LOOK — a `CompositionTheme`. This is the whole surface a brand
// plugs into: core owns the assembly (which track renders when, how a cut
// borrows handles, how music ducks), the theme owns nothing but appearance.
//
// Everything below is optional except `accentSlots` and `background`. Drop the
// text renderer and core's `GenericTextOverlay` draws the overlays instead;
// drop `renderBrandTrack` and the brand layer simply doesn't paint.
import React from 'react';
import type { CompositionTheme, OverlayRenderProps } from '@video-toolkit/lib/theming';
import { GenericWatermark, paletteMap, placementGeometry, useOverlayEnvelope } from '@video-toolkit/lib/theming';
import { parseAccents } from '@video-toolkit/lib/transcripts/accent-parser';
import type { BrandLayerItem } from '@video-toolkit/lib/reel-config-base/layered-schema';
import type { WatermarkProps } from '@video-toolkit/lib/theming';

// The brand's accent palette. The COUNT and the KEYS are the brand's to choose
// — core never enumerates them. Anything that names a colour (accent markup in
// overlay text, a `wipe` transition's `color`) names one of these keys.
const ACCENT_SLOTS = [
  { key: 'accent', label: 'Accent', color: '#f2b544' },
  { key: 'cool', label: 'Cool', color: '#5ec8d8' },
] as const;

/** A brand text renderer: accent-coloured runs plus a fade envelope. Roughly
 *  the smallest renderer worth writing — core hands it the parsed props and the
 *  palette, and it decides only how the words look. */
const BrandText: React.FC<OverlayRenderProps> = ({ text, placement, fontSize = 76, reveal, hide, palette, durationMs }) => {
  const { opacity, enterProgress } = useOverlayEnvelope({ durationMs, reveal, hide });
  const geo = placementGeometry(placement);
  const colors = paletteMap(palette);
  return (
    <div
      style={{
        position: 'absolute',
        ...geo.containerStyle,
        textAlign: geo.textAlign,
        color: '#ffffff',
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontWeight: 800,
        fontSize,
        lineHeight: 1.15,
        letterSpacing: '-0.02em',
        whiteSpace: 'pre-wrap',
        opacity,
        transform: `translateY(${(1 - enterProgress) * 24}px)`,
        textShadow: '0 4px 32px rgba(0,0,0,0.45)',
      }}
    >
      {parseAccents(text).map((token, i) => (
        <span key={i} style={token.color ? { color: colors[token.color] ?? '#ffffff' } : undefined}>
          {token.text}
        </span>
      ))}
    </div>
  );
};

export const theme: CompositionTheme = {
  accentSlots: ACCENT_SLOTS,
  background: '#07090f',
  // LOOK CONSTANTS for core's GENERIC renderers (multi-clip, card, outro — see
  // lib/theming/tokens.ts). This is the whole reason a brand does not have to
  // copy those three components to recolour them: registering nothing under
  // `video` still renders them, and everything below is optional — delete this
  // block and they render in core's neutral black-and-white defaults.
  tokens: {
    multiClip: {
      borderColor: '#07090f',
      label: { fontFamily: 'Helvetica, Arial, sans-serif', color: ACCENT_SLOTS[0].color, fontSize: 30 },
      pip: { borderColor: ACCENT_SLOTS[0].color },
      background: '#07090f',
    },
    card: {
      background: '#07090f',
      pattern: { color: ACCENT_SLOTS[1].color, accentColor: ACCENT_SLOTS[0].color, opacity: 0.25 },
      text: { fontFamily: 'Helvetica, Arial, sans-serif', fontSize: 96, color: '#ffffff' },
      // Opt-in flourish: core draws no endpoint unless a brand asks for one.
      endpoint: { text: '.', color: ACCENT_SLOTS[0].color },
    },
  },
  // Per-kind renderer registration. Omit `overlays` entirely and every text
  // overlay falls back to core's GenericTextOverlay.
  overlays: { text: { renderer: BrandText } },
  // The brand layer, rendered as one node — the brand decides how many
  // components that is. `GenericWatermark` is core's ready-made corner logo.
  renderBrandTrack: (items: BrandLayerItem[]) => (
    <>
      {items
        .filter((item) => item.kind === 'watermark')
        .map((item) => (
          <GenericWatermark key={item.id} {...(item.props as WatermarkProps)} />
        ))}
    </>
  ),
};
