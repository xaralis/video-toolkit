---
name: lottie
description: Toolkit-specific Lottie motion-graphic patterns — the LottieAnimation component, the curated template library, brand-color patching, sourcing, and placing Lottie as a timeline overlay. Use when adding loaders, checkmarks, confetti, progress bars, or other vector motion overlays to a reel. Triggers include lottie, motion graphic, loader, spinner, checkmark, confetti, progress animation, overlay animation.
---

# Lottie — Toolkit Motion Graphics

> **Core framework knowledge** (installing `@remotion/lottie`, the raw `<Lottie>` component, fetch +
> `delayRender`) lives in `skills/remotion-official/remotion-markup/lottie.md`. This file covers
> **toolkit-specific** patterns only.

Lottie animations are lightweight vector motion graphics (JSON). The toolkit renders them
**frame-synced** to the Remotion timeline (deterministic, never wall-clock playback) via the shared
`LottieAnimation` component, and ships a curated, brand-colorable template library plus a Python
tool for building/recoloring them.

## The workflow

Use `/toolkit:add-lottie-graphic` — it produces a brand-colored Lottie in `public/lottie/` and drops
it on the timeline as a custom overlay. The pieces below are what it (and you) use directly.

## Shared component — `LottieAnimation`

```tsx
import { LottieAnimation } from '../../../lib/components'; // adjust depth to your project

// Materialized asset in public/lottie/
<LottieAnimation src="lottie/spinner.json" size={220} x={50} y={50} loop speed={1} />
```

| Prop | Purpose |
|------|---------|
| `src` | Path under the project's `public/` (e.g. `lottie/check.json`). |
| `animationData` | Inline Lottie JSON (takes precedence over `src`). |
| `loop` / `speed` / `direction` | Playback: loop (default true), rate multiplier, 1 or -1. |
| `recolor` | Runtime `{ '#old': '#new' }` remap of fills/strokes (quick tweak; prefer building brand-colored JSON). |
| `x` / `y` / `size` | Overlay placement (% center) and px size. Omit all three to render inline. |

It handles the `delayRender`/fetch/`continueRender` dance for you; you only pass a `src` or data.

## Curated template library

Build a brand-colored Lottie from a template:

```bash
# List templates (id, description, color/value slots)
python3 -m video_toolkit.lottie list

# Build one, auto-coloring from a brand profile
python3 -m video_toolkit.lottie build spinner \
  --brand brands/<brand>/brand.json \
  -o projects/<name>/public/lottie/spinner.json

# Override a specific slot, or set a value slot
python3 -m video_toolkit.lottie build progress --set value=60 --color accent=#1d4ed8 -o out.json
```

| Template | What it is | Color slots | Value slots |
|----------|-----------|-------------|-------------|
| `spinner` | Looping loader ring | `accent` | — |
| `pulse` | Pulsing dot (scale + fade) | `accent` | — |
| `arrow` | Directional arrow nudge | `accent` | — |
| `confetti` | Celebratory burst | `accent`, `accentLight` | — |
| `check` | Draw-on success check | `accent` | — |
| `cross` | Draw-on error X | `accent` | — |
| `progress` | Bar filling to a value | `accent`, `track` | `value` (0–100) |

Color slots map named roles to color paths inside the Lottie JSON; `--brand` maps brand palette
colors onto them (`accent`→`primary`, `accentLight`→`primaryLight`, `track`→`divider`, `fg`→`textDark`,
`bg`→`bgLight`). Explicit `--color` wins over `--brand`.

## Sourcing an existing Lottie (LottieFiles or local)

```bash
# Inspect what colors a sourced file uses
python3 -m video_toolkit.lottie info sourced.json --colors

# Recolor its brand-relevant colors explicitly
python3 -m video_toolkit.lottie colorize sourced.json \
  --map "#ff3b30=#ea580c" --map "#ffffff=#1e293b" \
  -o projects/<name>/public/lottie/branded.json
```

Downloading a remote Lottie is a file download — the command asks first and states the source.

## Sizing for 9:16 (1080×1920)

Video overlays read from farther away than web UI — size Lottie generously. A loader/check reads well
at `size={200–320}`; a full-width `progress` bar at `size` matching ~60–80% of the 1080px width.
Place with `x`/`y` as % of the parent `AbsoluteFill`.

## Placing as a custom overlay

The materialized JSON in `public/lottie/<name>.json` is referenced by a custom overlay on the
timeline. If the project template exposes a custom-overlay mechanism, register there; otherwise drop
a `<LottieAnimation src="lottie/<name>.json" … />` inside the target segment.

## Gotchas

- **`staticFile`, not raw URLs** for project assets — pass `src="lottie/x.json"`; the component wraps
  it in `staticFile`. Only fetch remote URLs for one-off sourcing.
- **`.json`, not `.lottie`** — the component expects Lottie JSON (`animationData`). Convert dotLottie
  archives to JSON before use.
- **Determinism** — always render through `LottieAnimation`/`<Lottie>` (frame-synced). Never embed a
  lottie-web player; it plays on wall-clock time and will not render frame-accurately.
- **Loop length** — templates author a natural loop (30–45 frames). For a longer on-screen hold, keep
  `loop` on and give the overlay a longer segment duration; don't stretch the JSON.
