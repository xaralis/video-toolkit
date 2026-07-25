# Brand Theming Module — Design Spec

**Date:** 2026-07-24
**Status:** Approved (design), pending implementation plan
**Repos touched:** core (`progpce/core`), campaign brand repo (`progpce/video-toolkit`), roost brand repo (`roost/video-toolkit`)

## Problem

The reel editor's text-accent system is hardcoded to Progresivní Pardubice's
palette. In the roost editor, the `Text` overlay inspector shows PP's **Lime /
Teal** accent buttons instead of roost's own colors, because:

- `lib/editor/app/AccentEditor.tsx` defaults its palette to `[Lime, Teal]` and
  its CSS (`AccentEditor.module.css`) has only hardcoded `.lime` / `.teal`
  swatch classes.
- `lib/editor/app/LayeredInspector.tsx` passes **no** brand palette to
  `AccentEditor` (line ~419).
- The editor host (`.editor/main.tsx`) never loads any brand config; it only
  fetches the reel JSON from `/props`.
- Roost's brand-custom `Text` overlay renderer *strips* accent colors entirely
  (`line.map((t) => t.text).join('')`), so accents don't render even at video
  time.

The accent **parser** is already brand-agnostic (`AccentColor = string`;
`parseAccents` accepts any `{key:…}`). Only the UI/render layer bakes in
lime/teal.

This is the toolkit-wide "brand-driven accent palette" change flagged in
project memory (`brand-driven-accent-palette`). This spec generalizes it: the
same **generic-or-brand-custom renderer + brand palette + shared component
props** pattern will recur for other overlay/component kinds, so it is
encapsulated once in a reusable core **theming module**, with the Text overlay
as the first (and only, for now) consumer wired through it.

## Goals

1. **Fix the bug:** the accent palette shown in the editor and rendered in the
   video is the *brand's*, not a hardcoded lime/teal. Roost shows its rasta
   slots (gold / rust / green); campaign keeps lime / teal.
2. **Encapsulate the pattern** in a core `lib/theming/` module so future
   component kinds adopt it uniformly, not via one-off Text plumbing.
3. **Generic-or-brand-custom rendering:** a component is rendered either by a
   core **generic** renderer (sane defaults — positioned plain text, no
   accents, no animation) or by a **brand-custom** renderer. No third "base
   that always needs a brand render-prop" state.
4. **Shared component props:** the core Text-overlay properties — positioning,
   timing, text, reveal, and accent palette resolution — are shared and consumed
   identically by whichever renderer draws the overlay.
5. **No visual regression:** PP's decoder-scramble + per-line pill look and
   roost's cream-stroke + spring-rise look are preserved (they remain distinct
   brand-custom renderers).

## Non-Goals (deferred)

- **Schema-enum accent fields.** `stat-callout.color` and `wipe.color` in the
  campaign schema hardcode `'lime' | 'teal'` (and `'coal'`). These are
  campaign-only and unrelated to the Text overlay. They are **not** migrated in
  this spec; noted as a follow-up.
- **Endpoint (`.`) rule.** `applyBrandEndpoint` keeps its current behavior
  (campaign default slot `'teal'`; roost teaser passes `applyEndpoint={false}`).
  Unchanged.
- **Other component kinds.** The theming module is built general, but only the
  `text` overlay kind is wired through it now. Stat-callout, chevron, card,
  etc. adopt it in later, separate work.
- **Legacy `lib/theme/`.** The existing `lib/theme/` (ThemeProvider + web-slide
  theme types, unused by any reel template) is left untouched. The new module is
  `lib/theming/`, deliberately distinct.

## Architecture

### The core theming module — `lib/theming/`

A single module owning the palette, the renderer-resolution switch, and the
shared cross-renderer component utilities. Everything a brand needs to declare
its look, and everything a renderer needs to honor it, lives here.

```
lib/theming/
├── index.ts          # public exports
├── palette.ts        # AccentSlot, paletteMap, resolveAccentColor
├── placement.ts      # Placement enum + placementGeometry()
├── brand-theme.ts    # BrandTheme contract + resolveOverlayRenderer()
├── generic/
│   └── GenericTextOverlay.tsx   # core default text renderer
└── *.test.ts
```

#### 1. Palette — `palette.ts`

```ts
/** One brand-declared accent slot: the {key:…} markup key, its editor label,
 *  and the hex color an accented run renders in. */
export interface AccentSlot {
  key: string;    // markup key, e.g. 'gold' — matches {gold:…}
  label: string;  // editor button text, e.g. 'Gold'
  color: string;  // hex, e.g. '#f6aa1c'
}

/** Build a key→hex lookup from a brand's slots. */
export function paletteMap(slots: AccentSlot[]): Record<string, string>;

/** Resolve one accent key to its hex, or null when the key is unknown / the
 *  run is unaccented. Unknown keys resolve to null (render inherits color). */
export function resolveAccentColor(
  slots: AccentSlot[],
  key: string | null,
): string | null;
```

This is the shared accent logic — **no brand and no renderer reimplements
key→hex**. `parseAccents` (existing, in `lib/transcripts/accent-parser.ts`)
stays the tokenizer; `palette.ts` is the color resolver layered on top.

#### 2. Positioning — `placement.ts`

The shared positioning vocabulary, lifted from campaign's
`QuotePullOverlay.PLACEMENT` so it is not lost when that overlay stops owning
it. Every renderer (generic and brand-custom) positions via this.

```ts
export type Placement =
  | 'upper-third' | 'center' | 'lower-third'          // full-width bands
  | 'upper-left' | 'upper-center' | 'upper-right'     // anchored zones
  | 'mid-left' | 'mid-right'
  | 'lower-left' | 'lower-center' | 'lower-right';

export interface PlacementGeometry {
  containerStyle: React.CSSProperties; // top/left/right/maxWidth
  textAlign: 'left' | 'right' | 'center';
}

export function placementGeometry(p: Placement): PlacementGeometry;

export const DEFAULT_PLACEMENT: Placement = 'center';
```

Roost's teaser, which was always centered, defaults to `'center'` — no visual
change. Campaign's zones map 1:1 to the values it already used.

#### 3. Brand theme contract + renderer resolution — `brand-theme.ts`

```ts
import type { AccentSlot } from './palette';

/** A brand-custom renderer for one overlay kind. Receives the shared,
 *  already-resolved overlay props (see OverlayRenderProps). */
export type OverlayRenderer = React.FC<OverlayRenderProps>;

/** The theming contract a brand's theme satisfies. Extensible: new keys are
 *  added as future component kinds adopt the module. */
export interface BrandTheme {
  accentSlots: AccentSlot[];
  /** Per-kind brand-custom renderer overrides. Absent kind → core generic. */
  overlayRenderers?: Partial<Record<OverlayKind, OverlayRenderer>>;
}

export type OverlayKind = 'text'; // widened as kinds are added

/** Pick the brand-custom renderer for a kind, or the core generic fallback.
 *  This is the "generic OR brand-custom" switch, reusable for any kind. */
export function resolveOverlayRenderer(
  theme: BrandTheme,
  kind: OverlayKind,
): OverlayRenderer;
```

`resolveOverlayRenderer` returns `theme.overlayRenderers?.[kind]` when present,
else the registered core generic for that kind (`GenericTextOverlay` for
`'text'`).

#### 4. Shared overlay render props — the contract every renderer consumes

Whether generic or brand-custom, a text-overlay renderer receives the **same**
prop bag: the overlay's shared content + the brand palette + clip-local frame
context. This is what "the core Text overlay properties must be shared" means
concretely — the *props* are the contract, and every renderer sources its
colors and geometry from the same core helpers.

```ts
export interface OverlayRenderProps {
  /** Shared, brand-agnostic content (from the reel model). */
  text: string;                 // accent markup, e.g. 'A {gold:B}.'
  placement: Placement;
  fontSize?: number;
  reveal?: 'line' | 'all';
  /** The brand palette, so the renderer resolves keys → hex via the core
   *  helper (resolveAccentColor / paletteMap). No renderer hardcodes hex. */
  palette: AccentSlot[];
  /** Clip-local animation state. */
  localFrame: number;
  totalFrames: number;
  fps: number;
}
```

The prop bag deliberately carries **content + palette**, not pre-resolved
tokens, so the two very different brand renderers integrate at whatever depth
suits them without being forced through one pipeline:

- **Deep integration (roost):** its renderer wraps the existing
  `TextOverlayBase` convenience (see §5), which gates + parses + resolves
  key→hex from `palette` + splits lines, and hands a per-token resolved
  `render` callback. Roost stops mapping key→hex itself.
- **Shallow integration (campaign):** `QuotePullOverlay` keeps its own tuned
  pipeline (endpoint rule, word/char gluing, decoder) and simply pulls its
  colors from `paletteMap(palette)` instead of the inline `ACCENT_COLOR`
  const, and its geometry from the core `placementGeometry`. Lowest risk to
  its finely-tuned reveal.

Both satisfy the contract: nobody hardcodes accent hex, everybody positions via
the shared `placementGeometry`.

`TextOverlayBase` (existing, `lib/components/TextOverlay.tsx`) is the **optional
convenience** for deep integration. It is refactored to additionally resolve
token color keys → hex from a `palette: AccentSlot[]` prop, so its `render`
callback receives tokens whose `color` is already hex. The generic renderer and
roost use it; campaign does not.

#### 5. Generic renderer — `generic/GenericTextOverlay.tsx`

The core default: positioned plain text using `placementGeometry`, sane
typography defaults, **no accent coloring, no animation**. A brand that
registers no `text` renderer still gets correct, positioned, readable text.
This is the zero-config baseline the resolution switch falls back to.

### Text = the pilot consumer

#### Shared content model

The `text` overlay content schema (in `lib/reel-config-base/layered-schema.ts`)
carries the shared, brand-agnostic props:

```ts
{ kind: 'text', text: string, position?: Placement,
  fontSize?: number, reveal?: 'line' | 'all' }
```

`position` is new and optional (defaults to `DEFAULT_PLACEMENT`). Timing is the
overlay item's existing `startMs` / `endMs`.

#### Brand-custom renderers

- **Roost `overlays/TextOverlay.tsx` (`Text`)** — registers as
  `overlayRenderers.text` in roost's theme. Consumes the shared props: positions
  via `placement`, colors each token span with `t.color` (now resolved hex),
  keeps its brown stroke + per-line spring rise. This is what makes roost
  *honor* accents (the "functional roost slots" decision).
- **Campaign `brand-lib/overlays/QuotePullOverlay.tsx`** — registers as
  `overlayRenderers.text` in campaign's theme (shallow integration). Its inline
  `const ACCENT_COLOR = { lime, teal }` is **deleted**; colors come from
  `paletteMap(props.palette)`. Its local `Token.color` type widens from
  `'lime' | 'teal'` to `string`. Decoder-scramble, pills, endpoint rule, and
  word/char gluing are otherwise untouched; it now reads `placement` from the
  shared prop and positions via the core `placementGeometry` (its local
  `PLACEMENT` const is removed in favor of the core one).

#### Brand themes declare slots + register renderers

Each brand's `src/config/theme.ts` satisfies `BrandTheme`:

```ts
// roost
accentSlots: [
  { key: 'gold',  label: 'Gold',  color: '#f6aa1c' },
  { key: 'rust',  label: 'Rust',  color: '#7b190a' },
  { key: 'green', label: 'Green', color: '#334f14' },
],
overlayRenderers: { text: RoostText },

// campaign
accentSlots: [
  { key: 'lime', label: 'Lime', color: '#c6f432' },
  { key: 'teal', label: 'Teal', color: '#2ad4c5' },
],
overlayRenderers: { text: QuotePullOverlay },
```

The brand theme is the **single source** consumed by both the render path
(`LayeredXReel` resolves the renderer + palette from it) and the editor (host
passes `theme.accentSlots` to the inspector).

### Editor changes

- **`AccentEditor.tsx`:** `AccentEditorColor` gains `color`. The toolbar renders
  one button per brand slot with a **color swatch + label**. Accent spans in the
  contenteditable are colored inline from the resolved hex, replacing the
  hardcoded `.lime` / `.teal` classes (removed from `AccentEditor.module.css`).
  Unknown keys fall back to inherited color.
- **`LayeredInspector.tsx`:** new `accentSlots: AccentSlot[]` prop, threaded to
  `AccentEditor`. Adds a **placement dropdown** bound to the shared `Placement`
  enum, editing the overlay's `position`.
- **Editor hosts (`roost` + `campaign` `.editor/main.tsx`):** import
  `theme.accentSlots` and pass to `LayeredInspector`. Same code path in both;
  brand-driven output. Preview still renders via each host's `LayeredXReel`, so
  brand-custom visuals appear in the Player unchanged.

## Data Flow

```
brand theme.ts ─accentSlots─▶ editor host ─▶ LayeredInspector ─▶ AccentEditor
    │                                                             (swatch buttons,
    │                                                              inline-colored spans)
    │
    │            ┌─ resolveOverlayRenderer(theme,'text') ─┐
    │            │                                        │
    └─ LayeredXReel ─ renders chosen renderer with OverlayRenderProps { content, palette, frames }
                 │                                        │
        brand-custom                               core generic
        ├ Roost Text  → TextOverlayBase (deep: resolves key→hex, splits)
        ├ QuotePull   → paletteMap(palette) + placementGeometry (shallow)
        └ (future kinds…)                          GenericTextOverlay
```

## Back-compat & Migration

- Existing reel JSON uses `content.kind: 'text'` already (prior unification).
  Adding optional `position` is non-breaking; absent → `'center'`.
- Roost teaser stays centered (default placement) and its text is unaccented
  today, so functional slots are additive — no existing roost content changes.
- Campaign content keeps `{lime:…}` / `{teal:…}` — the slot keys are unchanged;
  only the *source* of their hex moves from an inline const to the brand theme.
- `applyBrandEndpoint` and the schema enums are untouched (deferred), so no
  campaign project needs re-derivation for this change.

## Testing

- **`palette.test.ts`:** `paletteMap` builds the lookup; `resolveAccentColor`
  returns hex for known keys, null for unknown/null.
- **`placement.test.ts`:** every `Placement` value yields geometry;
  `DEFAULT_PLACEMENT` is `'center'`.
- **`brand-theme.test.ts`:** `resolveOverlayRenderer` returns the registered
  brand renderer when present, the generic fallback when absent.
- **`AccentEditor.test.tsx`:** renders one button per supplied slot with its
  label; applying a slot wraps the selection in `{key:…}`; spans get the slot's
  color; unknown/no-palette falls back gracefully.
- **`GenericTextOverlay.test.tsx`:** renders plain text at the placement, with
  accents stripped and no animation.
- **Render verification:** roost frame with an accented teaser word renders that
  word in the roost slot color (still cream-stroked); campaign quote-pull
  renders lime/teal unchanged (decoder intact). Verified via `remotion still`.
- Core suite stays green (currently 331 tests).

## File Map

**core (`progpce/core`)**
- Create: `lib/theming/{index,palette,placement,brand-theme}.ts`,
  `lib/theming/generic/GenericTextOverlay.tsx`, + tests.
- Modify: `lib/components/TextOverlay.tsx` (palette prop, resolve token colors,
  emit `OverlayRenderProps`); `lib/reel-config-base/layered-schema.ts` (`text`
  content `position`); `lib/editor/app/AccentEditor.tsx` +
  `AccentEditor.module.css`; `lib/editor/app/LayeredInspector.tsx`.

**campaign (`progpce/video-toolkit`)**
- Modify: `templates/campaign-reels/src/config/theme.ts` (`accentSlots`,
  register `QuotePullOverlay`); `brand-lib/overlays/QuotePullOverlay.tsx` (drop
  inline `ACCENT_COLOR`, widen `Token.color`, read shared `placement`);
  `templates/campaign-reels/.editor/main.tsx` (pass `accentSlots`).
- Sync template changes into the campaign projects that carry copies.

**roost (`roost/video-toolkit`)**
- Modify: `templates/roost-reels/src/config/theme.ts` (`accentSlots`, register
  `Text`); `templates/roost-reels/src/overlays/TextOverlay.tsx` (palette prop,
  color tokens instead of stripping, read shared `placement`);
  `templates/roost-reels/.editor/main.tsx` (pass `accentSlots`).
- Sync template changes into `projects/roost-reel-01`. Re-bump `toolkit/`
  submodule to the new core SHA.

## Open Decisions (resolved)

- **Roost accents:** functional — roost declares slots and its renderer colors
  accented words (not display-only, not zero-slots).
- **Boundary:** shared accent logic + shared props (positioning etc.) in core;
  brand keeps its distinct visual renderer.
- **Encapsulation:** a reusable `lib/theming/` module, Text as the pilot.
- **Positioning vocabulary:** lift campaign's 11-zone set into core.
- **Editor:** include the placement dropdown now.
