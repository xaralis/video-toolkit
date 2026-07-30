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

## The files

| File | What it teaches |
|------|-----------------|
| `src/Root.tsx` | The `Composition` **and the reel data**, inline in `defaultProps`, for BOTH compositions below. Video / audio / music / overlays / brand tracks on one absolute-millisecond timeline; composition length derived from `meta.totalDurationMs` via the `calculateMetadata` that `layeredCompositionProps` (`lib/render/layered-composition-props.ts`) supplies, so editing the timeline moves it. |
| `src/MinimalReel.tsx` | The wrapper that binds the theme. `defaultProps` must stay JSON-serializable (Studio and the toolkit editor read and rewrite them), so components and functions are bound in code and only DATA travels through props. |
| `src/theme.tsx` | The **minimal** brand: `accentSlots`, `background`, `tokens`, and one custom text renderer — most of the extension surface is left at its core default. Everything except the first two is optional — drop the text renderer and core's `GenericTextOverlay` draws the overlays instead; this theme declares no brand-layer code at all, and core paints `tracks.brand` itself through its generics. |
| `src/conformance-theme.tsx` + `src/ConformanceReel.tsx` | **The worked example — every extension axis, in one theme.** A SECOND composition (`ConformanceReel`, alongside `MinimalReel` in `Root.tsx`) whose theme registers all six axes a brand can extend — a video kind, a non-`text` anchored overlay, both effect scopes (`clip`/`media`), a brand-layer kind, a brand-authored transition (with `params`), and a wholesale media-source override — each with a deliberately non-core look, so you can tell at a glance which renderer actually ran. Copy registrations FROM here, not from `theme.tsx`, when adding a NEW axis rather than recolouring an existing one. Pinned end-to-end by `lib/editor/src/conformance-example.test.tsx`, including two mutations per registration and the negative rules (a `config`-only registration never masks the core generic beneath it; an unknown kind/type is silently skipped, never thrown) — see `.superpowers/sdd/2026-07-26-phase4-node-contract/task-6.2-report.md` for the full account, including one contract finding (`BrandKind` is documented as open but the schema currently closes brand-layer `kind` to two literals — see `lib/theming/types.ts`). |
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
- **The render is silent.** The audio track is empty and the music bed carries an
  envelope but no `source`, so the MP4 has no sound. Everything above is picture.

## Growing it

- Add a `clip` item with `source`/`sourceInMs`/`sourceOutMs` and drop an MP4 into
  `public/`.
- Add an audio item and link it to a clip with `followsVideoId`.
- Register a `card` or `outro` renderer under `theme.video` to REPLACE core's
  own look for that kind — every video kind already has a core generic
  renderer (`SegmentMedia` for footage, `GenericMultiClip`/`GenericCard`/
  `GenericOutro` for the rest), so a brand that registers nothing still
  renders a whole reel; see `src/conformance-theme.tsx` for a worked `card`
  override.
- To build a full project rather than read one, run `/toolkit:video` in a brand
  repo; templates live there, not in core.

## It is also core's type-check gate

This example is the only place in core with a real Remotion install, so it is
what type-checks `lib/render/` and `lib/transitions/` — neither of which is in
`lib/editor`'s `include`.

```bash
npm run typecheck    # tsc --noEmit — baseline: 0 errors
```

Any error is a regression. The `paths` block in `tsconfig.json` is what makes it
work — `lib/` sits outside this project's tree, so TypeScript's upward
`node_modules` walk never reaches the packages those files import. See
[`docs/superpowers/core-typecheck-gate.md`](../../docs/superpowers/core-typecheck-gate.md)
before touching it (in particular: `react` must map to `@types/react`).
