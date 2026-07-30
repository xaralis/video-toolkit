// lib/theming/tokens.ts — the typed home for the LOOK CONSTANTS a core generic
// renderer needs.
//
// Why this exists: a generic that hardcodes `#0a0a0a` or `Geist 700/120px` is
// not generic — it is one brand's component wearing a neutral name, and the
// next brand has to copy-paste it to change a border colour. That is the
// copy-paste channel Phase 3 closes. So every literal a generic draws with
// lives here as an OPTIONAL field with a documented NEUTRAL default.
//
// The discipline, stated once and applying to every field below:
//   - optional, always. A theme that declares no `tokens` still renders.
//   - the default is NEUTRAL (black / white / `sans-serif` / `monospace`), never
//     a brand's value. Where a real brand's value is known it is named in the
//     doc comment as an EXAMPLE, so a brand migrating knows what to set — it is
//     never the default.
// This mirrors what editor-meta.ts already states: "everything here is optional
// and every consumer has a neutral core default".
//
// How a generic receives these: `BrandTheme.tokens` → threaded to every video
// renderer as `VideoRenderProps.tokens` by `renderVideoItemNode`, and to every
// brand-layer renderer as `BrandRenderProps.tokens` by
// `defaultRenderBrandTrack`. Deliberately ONE narrow typed field in both
// cases, not the whole theme — neither prop bag carries a `CompositionTheme`.
//
// A THIRD axis threads the two OVERLAY blocks: `text` via `TrackTextOverlay`
// and — since Phase 4 Task 4.3 — `caption` via `TrackCaptionsOverlay`, both in
// lib/render/layered-composition.tsx, both reading the block straight off the
// theme at the overlay dispatch. As of 4.3 EVERY block below is threaded by
// core; `caption` was the last one that was not. Keep it that way when adding a
// field here: a token nothing threads is a promise the module cannot keep.

/** Look constants for {@link GenericMultiClip}. */
export interface MultiClipTokens {
  /** Divider thickness between panes, in composition px. Default 4. */
  borderPx?: number;
  /** Divider colour. Default `#000000` (campaign-reels uses its coal `#0a0a0a`). */
  borderColor?: string;
  /** PIP inset box geometry, in composition px (defaults sized for 1080x1920:
   *  360x480 at right 60 / bottom 280, 4px border). The border colour defaults
   *  to `#ffffff` — campaign-reels uses its accent `#c6f432` there. */
  pip?: {
    width?: number;
    height?: number;
    right?: number;
    bottom?: number;
    borderPx?: number;
    borderColor?: string;
  };
  /** Per-pane label typography. Defaults: `monospace`, 700, 22px, `#ffffff`,
   *  inset 24/24 (campaign-reels uses `JetBrains Mono` in its accent `#c6f432`). */
  label?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    color?: string;
    top?: number;
    left?: number;
    letterSpacing?: string;
    textShadow?: string;
  };
  /** Gap between the four quad panes, in composition px. Default 4. */
  quadGapPx?: number;
  /** Colour behind the panes (shows through the gaps). Default `#000000`. */
  background?: string;
  /** Fraction of the frame the FIRST pane takes in `split-h` / `split-v`; the
   *  second pane gets the remainder. Expressed as a ratio (CSS `flex-grow`,
   *  itself scale-free) rather than a px width, so it never decouples from the
   *  frame size. Default 0.5 — an even split, campaign-reels' only split. */
  splitRatio?: number;
  /** `quad`'s two column weights, as CSS grid `fr` units (already a ratio, not
   *  a px width). Default `[1, 1]` — two equal columns. */
  quadColumns?: [number, number];
  /** `quad`'s two row weights, as CSS grid `fr` units. Default `[1, 1]` — two
   *  equal rows. */
  quadRows?: [number, number];
}

/** Look constants for {@link GenericTextOverlay}.
 *
 *  UNLIKE every other field on {@link ThemeTokens}, this one threads through
 *  `OverlayRenderProps.tokens` (see `TrackTextOverlay` in
 *  lib/render/layered-composition.tsx), not `VideoRenderProps`/
 *  `BrandRenderProps` — text is an overlay-track kind, not a video or
 *  brand-layer kind.
 *
 *  Defaults reproduce the pre-tokens hardcoded literals EXACTLY (`#ffffff` /
 *  `sans-serif` / 700 / 1.3), so an unthemed brand renders byte-identically. */
export interface TextTokens {
  /** Text colour. Default `#ffffff`. */
  color?: string;
  /** Font family. Default `sans-serif`. */
  fontFamily?: string;
  /** Font weight. Default `700`. */
  fontWeight?: number;
  /** Line height. Default `1.3`. */
  lineHeight?: number;
}

/** Look constants for {@link GenericCard}. */
export interface CardTokens {
  /** Plate background. Default `#000000` (campaign-reels uses coal `#0a0a0a`). */
  background?: string;
  /** The CSS-gradient pattern layer drawn over the background. */
  pattern?: {
    /** Colour of the `grid` dots and the `diagonals` rules. Default `#ffffff`
     *  (campaign-reels uses its paper `#f5f5f0`). */
    color?: string;
    /** Colour of the denser `pixels` / `dots` variants. Default `#ffffff`
     *  (campaign-reels uses its accent `#c6f432`). */
    accentColor?: string;
    /** Opacity of the whole pattern layer, 0..1. Default 0.36. */
    opacity?: number;
    /** `pixels` dot radius and repeat pitch, in composition px. Neither scales
     *  against another token (a pattern's own density is not tied to type
     *  size), so both stay absolute px. Defaults 1.5 / 36 — campaign-reels'
     *  tuned values. */
    pixels?: { radiusPx?: number; pitchPx?: number };
    /** `dots` dot radius and repeat pitch, in composition px. Defaults 1 / 60. */
    dots?: { radiusPx?: number; pitchPx?: number };
    /** `grid` dot radius and repeat pitch, in composition px. Defaults 1 / 60. */
    grid?: { radiusPx?: number; pitchPx?: number };
    /** `diagonals` rule angle (degrees) and repeat pitch (composition px).
     *  Defaults 135 / 24. The 1px rule THICKNESS itself is not exposed — it is
     *  a hairline stroke width, genuinely absolute, not a pattern density. */
    diagonals?: { angleDeg?: number; pitchPx?: number };
  };
  /** Line typography. Defaults: `sans-serif`, 700, 120px, `#ffffff`,
   *  line-height 1.05, letter-spacing -0.02em, 80px horizontal padding
   *  (campaign-reels uses `Geist` in its paper `#f5f5f0`). */
  text?: {
    fontFamily?: string;
    fontWeight?: number;
    fontSize?: number;
    color?: string;
    lineHeight?: number;
    letterSpacing?: string;
    paddingX?: number;
  };
  /** The stagger of the line reveal, in frames/px. Defaults: 6 frames between
   *  lines, a 12-frame reveal, rising 40px. */
  stagger?: { stepFrames?: number; revealFrames?: number; risePx?: number };
  /** OPT-IN full stop appended after the last line. Absent (the default) draws
   *  nothing — campaign-reels sets `{ text: '.', color: '#2ad4c5' }`. It is a
   *  brand flourish, so core does not turn it on for anyone. */
  endpoint?: { text?: string; color?: string };
}

/** Look constants for {@link GenericWatermark}, threaded by
 *  {@link defaultRenderBrandTrack}. A brand item's own `props` win over these
 *  for the same field — tokens are the theme-wide look, props are per item. */
export interface WatermarkTokens {
  /** 'image' (default): an `<Img>` of the asset. 'tint': the PNG as an alpha
   *  mask over a solid colour, so one asset renders in any brand colour. */
  mode?: 'image' | 'tint';
  /** Required when mode is 'tint'; ignored otherwise. Default `#000000` (a
   *  brand shipping today tints its one mark black / cream / brown). */
  color?: string;
  /** Per-axis margins from the frame edge. A single number sets both (the
   *  back-compat meaning of `marginPx`). Default 40 on both axes — a brand
   *  with a tightly-cropped mark uses `{ vertical: 40, horizontal: 36 }`. */
  margin?: number | { vertical: number; horizontal: number };
}

/** Look constants for {@link GenericDisclaimer}, threaded by
 *  {@link defaultRenderBrandTrack}. Defaults: `monospace` 400/20px `#ffffff`,
 *  centred, 40px from the bottom and 40px in from each side, no background. */
export interface DisclaimerTokens {
  bottomOffsetPx?: number;
  paddingX?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  letterSpacing?: string;
  textAlign?: 'left' | 'center' | 'right';
  alpha?: number;
}

/** Look constants for {@link GenericCaptions}.
 *
 *  A NOTE ON PROVENANCE, because this axis had three disagreeing sources when
 *  it was written: the brand that ships burned-in captions today had (a) live
 *  module constants inside its `CaptionStrip.tsx`, (b) a `caption` block in its
 *  template `theme.ts` that NOTHING imported, and (c) a `reels.caption` block in
 *  its `brand.json` that no TS/TSX read. Only (a) renders. So the DEFAULTS below
 *  are (a)'s magnitudes — notably `bottomPct` 0.20, not the dead `theme.ts`'s
 *  0.28, which would move that brand's captions 8% of frame height — while the
 *  FIELD NAMES follow (b)/(c)'s richer vocabulary, which is where brand config is
 *  heading. The dead blocks are migration cleanup, tracked separately.
 *
 *  Colours: neutral, as everywhere in this file. The default `activeColor` is
 *  pure yellow, the long-standing karaoke-subtitle convention — it has to differ
 *  from `color` or the mode's whole point (a word lighting up) is a no-op under
 *  defaults, and yellow is the one choice that is a convention rather than
 *  somebody's brand. */
export interface CaptionTokens {
  /** `pop-focus` (default): one phrase chunk at a time as a `nowrap` pill, the
   *  active word flips to `activeColor`. `highlight`: the whole line, inactive
   *  words receding by opacity, the active word scaled up with a halo. */
  mode?: 'pop-focus' | 'highlight';
  /** Default `monospace` (the shipping brand uses `JetBrains Mono, monospace`). */
  fontFamily?: string;
  /** Default 52. `pop-focus` draws it 1.04x larger inside the pill. */
  fontSize?: number;
  /** Default 700. */
  fontWeight?: number;
  /** Inactive word. Default `#ffffff` (the shipping brand uses its linen `#f5f5f0`). */
  color?: string;
  /** Active word. Default `#ffff00` (the shipping brand uses its accent `#c6f432`). */
  activeColor?: string;
  /** The `pop-focus` pill behind the chunk. Default `#000000` (the shipping
   *  brand uses its coal `#0a0a0a`). */
  background?: string;
  /** Outline colour. Default `#000000` (the shipping brand uses coal `#0a0a0a`). */
  strokeColor?: string;
  /** Outline radius in px. Default 4 — which is `(2·4+1)² − 1` = **80 stacked
   *  text-shadows per span**. Lower it if render time matters more than the
   *  outline; see `strokeShadow`'s cost note. */
  strokeWidthPx?: number;
  /** `highlight` line width as a fraction of frame width. Default 0.86. */
  maxWidthPct?: number;
  /** Characters a line may reach before the grouper breaks. Default 28. */
  maxChars?: number;
  /** Baseline bottom position as a fraction of frame height. Default 0.20 — NOT
   *  the dead `theme.ts` block's 0.28. */
  bottomPct?: number;
  /** Bottom position while inside a lift window. Default 0.42. Captions LIFT to
   *  clear bottom-anchored chrome; they are never suppressed. */
  liftBottomPct?: number;
  /** An inter-word gap longer than this forces a line break. Default 350. */
  gapBreakMs?: number;
  /** Grace added to the last line's `endMs` and its last word's. Default 600. */
  lastLineGraceMs?: number;
  /** Upper bound on a `pop-focus` phrase chunk. Default 4. */
  maxWordsPerChunk?: number;
  /** Half-width of the linear fade ramp around a word's active window, in ms.
   *  Default 30 — {@link DEFAULT_CAPTION_WORD_FADE_MS} in `./generic/caption-lines`,
   *  which had no token field until Task 5.1 even though its four siblings
   *  (`maxChars`, `gapBreakMs`, `lastLineGraceMs`, `maxWordsPerChunk`) all did. */
  wordFadeMs?: number;
  /** `pop-focus` pill font-size multiplier over {@link fontSize}. Default 1.04
   *  — already scale-free (a multiplier), so no unit conversion needed. */
  popFontMultiplier?: number;
  /** `pop-focus` pill's vertical/horizontal padding, each expressed as a
   *  RATIO of {@link fontSize} (not px) — this is the exact `POP_PAD_X`/
   *  `POP_PAD_Y` bug this task exists to fix: they used to be flat px against
   *  a token-driven font size, so raising `fontSize` shrank the padding
   *  proportionally instead of scaling with it. Defaults `10/52` and `22/52`
   *  — both round-trip to the pre-Task-5.1 literals (10px, 22px) exactly at
   *  the default `fontSize` of 52. */
  popPadYEm?: number;
  popPadXEm?: number;
  /** Brief tail past a `pop-focus` chunk's last word so it does not snap out
   *  before the next one takes over, in ms. Default 30 — a duration, not a
   *  geometry magnitude, so it stays absolute. */
  popTailMs?: number;
  /** `pop-focus` letter-spacing. CSS `em`, already relative to the pill's own
   *  computed font-size by definition — no ratio math needed. Default
   *  `'0.02em'`. */
  popLetterSpacing?: string;
  /** `pop-focus` line-height. Unitless CSS multiplier — already relative to
   *  font-size by definition. Default 1.1. */
  popLineHeight?: number;
  /** Gap between words, shared by BOTH modes. CSS `em`. Default `'0.4em'`.
   *
   *  RECONCILED at Task 5.1: `pop-focus` used `0.4em`, `highlight` used
   *  `0.45em` — two values for the same "space between words" concept. Core
   *  now has one token. `0.4em` (pop-focus's value) wins because pop-focus is
   *  the shipping brand's LIVE mode; `highlight` is ported but dead in that
   *  brand's code (see `GenericCaptions`'s own docblock). So this is a pixel
   *  change ONLY for `highlight` mode (0.45em → 0.4em) — a mode no known
   *  reel renders — and exact parity for `pop-focus`. */
  wordGap?: string;
  /** `highlight` mode: opacity of an inactive word, 0..1. Default 0.55 —
   *  already a dimensionless ratio. */
  highlightOpacityInactive?: number;
  /** `highlight` mode: how much the active word scales up, added to 1.
   *  Default 0.08 — already a dimensionless ratio. */
  highlightScaleBump?: number;
  /** `highlight` mode: the active word's halo radius at full envelope,
   *  expressed as a RATIO of {@link fontSize} (not px) — the halo is a text
   *  effect that should grow with type size, same reasoning as the pop-focus
   *  padding. Default `10/52`, round-tripping to the pre-Task-5.1 10px
   *  literal exactly at the default `fontSize`. */
  highlightHaloMaxEm?: number;
  /** `highlight` mode: the halo's peak alpha, 0..1. Default 0.5 — already a
   *  dimensionless ratio. */
  highlightHaloAlpha?: number;
  /** `highlight` mode letter-spacing. CSS `em`. Default `'0.02em'`. */
  highlightLetterSpacing?: string;
  /** `highlight` mode line-height. Unitless CSS multiplier. Default 1.2. */
  highlightLineHeight?: number;
}

/** Look constants a theme hands to core's generic renderers. Every axis is
 *  optional and every consumer has a neutral core default, so `tokens` may be
 *  omitted entirely. */
export interface ThemeTokens {
  multiClip?: MultiClipTokens;
  card?: CardTokens;
  watermark?: WatermarkTokens;
  disclaimer?: DisclaimerTokens;
  /** Look constants for {@link GenericTextOverlay} — see {@link TextTokens}
   *  for why this one threads through `OverlayRenderProps` rather than
   *  `VideoRenderProps`/`BrandRenderProps`. */
  text?: TextTokens;
  /** Look constants for {@link GenericCaptions}.
   *
   *  THREADED SINCE PHASE 4 TASK 4.3, on the OVERLAY axis — like {@link text},
   *  and unlike the video/brand-layer blocks above. Captions are an overlay
   *  KIND (`content.kind === 'captions'`), so core's own mount
   *  (`TrackCaptionsOverlay`, lib/render/layered-composition.tsx) reads this
   *  block off the theme and hands it to `GenericCaptions`. Setting
   *  `theme.tokens.caption` now changes what renders; before 4.3 it changed
   *  nothing, because core had no mount site at all.
   *
   *  A brand mounting `GenericCaptions` from its OWN renderer still passes it
   *  straight through, exactly as before:
   *
   *  ```tsx
   *  <GenericCaptions words={words} tokens={theme.tokens?.caption} />
   *  ```
   *
   *  The routing decision this comment used to say was unmade is recorded, with
   *  its reasoning and the alternatives rejected, in
   *  docs/superpowers/phase4-extension-contract.md §6. */
  caption?: CaptionTokens;
}
