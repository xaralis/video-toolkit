# Layered Minimal

The shortest honest demonstration of the toolkit's rendering contract: a
**`CompositionTheme`** (the brand's look), a **`LayeredReel`** literal (the data),
and **`LayeredReelComposition`** (core's one assembly for every brand).

No API keys, no Python, no external services — it renders from two committed
placeholder images.

## Run it

```bash
npm install
npm run studio   # preview in Remotion Studio
npm run still    # one PNG → out/frame.png
npm run render   # 6s MP4 → out/reel.mp4
```

## The four files

| File | What it teaches |
|------|-----------------|
| `src/Root.tsx` | The `Composition` **and the reel data**, inline in `defaultProps`. Video / audio / music / overlays / brand tracks on one absolute-millisecond timeline; `durationInFrames` derived from `meta.totalDurationMs`. |
| `src/MinimalReel.tsx` | The wrapper that binds the theme. `defaultProps` must stay JSON-serializable (Studio and the toolkit editor read and rewrite them), so components and functions are bound in code and only DATA travels through props. |
| `src/theme.tsx` | The brand: `accentSlots`, `background`, one custom text renderer, and `renderBrandTrack`. Everything except the first two is optional — drop the text renderer and core's `GenericTextOverlay` draws the overlays instead. |
| `remotion.config.ts` | The `@video-toolkit/lib` alias **and the `resolve.modules` line every consuming project needs** (see `lib/render/README.md`). |

## What the render proves

- **Footage kinds render themselves.** `photo`/`clip`/`broll` fall back to core's
  `SegmentMedia`, so trim, crop, focal point, grade and the Ken Burns effect work
  with no brand code at all.
- **Transitions are real.** The `wipe` is declared once, by the item *leaving* the
  cut; the next item borrows handle frames automatically, so it plays across both
  clips rather than degrading to a fade.
- **Colour belongs to the brand.** Both the wipe's `color` and the `{accent:…}`
  markup in the overlay text name an accent-slot KEY, never a hex. Core never
  enumerates a palette — count, keys and colours are the brand's to choose.
- **Overlays are independent.** Their `[startMs, endMs)` windows are their own;
  they neither follow nor are clipped by the cuts underneath them.

## Growing it

- Add a `clip` item with `source`/`sourceInMs`/`sourceOutMs` and drop an MP4 into
  `public/`.
- Add an audio item and link it to a clip with `followsVideoId`.
- Register a `card` or `outro` renderer under `theme.video` — non-footage kinds
  render only when the brand supplies one.
- To build a full project rather than read one, run `/toolkit:video` in a brand
  repo; templates live there, not in core.

## One known rough edge

`npx tsc --noEmit` typechecks `src/` cleanly, but reports unresolved `react` /
`remotion` imports for the files under `../../lib`. That is structural to the
alias approach and identical in the brand repos: `lib/` sits outside this
project's tree, so TypeScript's upward module walk never reaches the
`node_modules` where those packages are installed. The renderer resolves them via
the `resolve.modules` line in `remotion.config.ts`.
