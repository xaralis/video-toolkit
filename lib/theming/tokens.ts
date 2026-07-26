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
// renderer as `VideoRenderProps.tokens` by `renderVideoItemNode`. Deliberately
// ONE narrow typed field, not the whole theme — VideoRenderProps still carries
// no `CompositionTheme`.

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

/** Look constants a theme hands to core's generic renderers. Every axis is
 *  optional and every consumer has a neutral core default, so `tokens` may be
 *  omitted entirely.
 *
 *  Later Phase 3 tasks add their own axes here (`caption` — Task 5;
 *  `watermark` — Task 4); they are deliberately NOT declared yet, so this file
 *  never carries a type no consumer reads. */
export interface ThemeTokens {
  multiClip?: MultiClipTokens;
  card?: CardTokens;
}
