---
description: Produce a brand-colored Lottie motion graphic and place it on the reel timeline as a custom overlay
---

# Add Lottie Graphic

Produce a Lottie motion-graphic overlay (loader, checkmark, confetti, progress bar, arrow…) — built
from a curated template or sourced from a file — brand-colored, and drop it onto the current
project's timeline as a custom overlay.

**Invoke the `lottie` skill** for component/tool/template details before running this workflow.

## Usage

```
/toolkit:add-lottie-graphic                 # discover project, then choose source or build
/toolkit:add-lottie-graphic <template>      # jump straight to building a curated template
```

---

## Step 1: Discover the project

Same discovery as `/toolkit:cut` / `/toolkit:render`:

1. If cwd is a project (has `project.json` or `src/Root.tsx`), use it.
2. Else scan `projects/` for projects; if several, ask which.
3. Read the brand: `project.json → brand`, resolving to `brands/<brand>/brand.json`. If none is set,
   ask which brand (or fall back to `brands/default/brand.json`).

## Step 2: Choose source or build

Ask the user:

```
How should I create the Lottie?

1. Build from a curated template (spinner, pulse, arrow, confetti, check, cross, progress)
2. Source an existing file (LottieFiles URL or local path)
```

### Build path

1. Run `python3 -m video_toolkit.lottie list` and show the templates + their color/value slots.
2. Let the user pick a template and (optionally) a name (default = template id).
3. For `progress`, ask for a `value` (0–100).
4. Build, auto-coloring from the brand:

   ```bash
   python3 -m video_toolkit.lottie build <template> \
     --brand brands/<brand>/brand.json \
     [--set value=<n>] \
     -o projects/<name>/public/lottie/<asset>.json
   ```

   Offer an explicit `--color <slot>=<hex>` override if the user wants a non-brand color.

### Source path

1. Ask for a LottieFiles URL or a local path.
2. **If a URL:** downloading is a file download — state the filename + source and **ask permission**
   before fetching. Then save the raw JSON to `projects/<name>/public/lottie/<asset>.json`.
   **If a local path:** copy it there.
3. Inspect and recolor to brand:

   ```bash
   python3 -m video_toolkit.lottie info projects/<name>/public/lottie/<asset>.json --colors
   ```

   Show the colors, propose a `--map old=new` to the brand palette, confirm, then:

   ```bash
   python3 -m video_toolkit.lottie colorize projects/<name>/public/lottie/<asset>.json \
     --map "<old>=<brandhex>" [...] \
     -o projects/<name>/public/lottie/<asset>.json
   ```

## Step 3: Report metadata

```bash
python3 -m video_toolkit.lottie info projects/<name>/public/lottie/<asset>.json
```

Tell the user the duration (frames/seconds), dimensions, and where the asset landed.

## Step 4: Place on the timeline as a custom overlay

Detect how the project registers overlays:

- **If the template exposes a custom-overlay mechanism** (e.g. a `customOverlays` array or a `lottie`
  overlay type in `src/config/schema.ts` / `Root.tsx` defaultProps): add an entry referencing
  `public/lottie/<asset>.json`, on the segment/time range the user wants. Keep edits minimal — do not
  invent schema.
- **Otherwise (fallback):** write the asset (already done) and hand back a ready-to-paste snippet plus
  where to put it:

  ```tsx
  import { LottieAnimation } from '../../../lib/components'; // adjust depth

  <LottieAnimation src="lottie/<asset>.json" size={240} x={50} y={50} loop />
  ```

  Tell the user which segment/component to drop it into.

## Step 5: Next steps

Point the user to preview + tune:

```
Lottie ready at public/lottie/<asset>.json and placed as a custom overlay.
Preview and time it with /toolkit:cut-tune (Remotion Studio hot-reloads).
```

## Notes

- Assets are materialized JSON in `public/lottie/` so a custom-overlay editor can pick them up.
- Keep `loop` on for continuous graphics (spinner/pulse/arrow); one-shots (check/cross/confetti)
  play once — give them a segment at least as long as the animation.
- Re-run this command to add more; each writes its own `public/lottie/<name>.json`.
