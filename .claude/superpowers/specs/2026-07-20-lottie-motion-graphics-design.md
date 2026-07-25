# Lottie motion graphics: skill, shared component, curated library, tool, command

**Date:** 2026-07-20
**Status:** Approved (brainstorming) → ready for plan

## Problem

The toolkit can produce AI video (`ltx2`), music (`add-music`), voiceover, and transitions, but it
has no first-class way to add **Lottie motion graphics** — lightweight vector animation overlays
(loaders, checkmarks, confetti, progress bars, directional arrows). These are the small,
brand-colored motion accents that make a reel feel finished, and they render deterministically
frame-by-frame through `@remotion/lottie`.

The official `remotion-official` skill already ships `remotion-markup/lottie.md` covering the raw
`@remotion/lottie` install + `<Lottie>` API. What's missing is: (1) toolkit-specific knowledge
(frame-sync convention, brand-color patching, sizing for 9:16, sourcing, gotchas), (2) a reusable
component, (3) ready-to-use animation data, (4) a tool to assemble/recolor Lottie JSON, and (5) a
command that produces one and drops it on the timeline.

## Decision

Ship the **machinery in core** (skill, shared component, curated Lottie data, Python tool) and a
**command that produces an asset and places it as a "custom overlay"** on the current project's
timeline. No schema/editor coupling — a dedicated custom-overlay editor is being built separately;
this command only needs to materialize a concrete JSON asset and register it on the timeline.

### The `add-*` command convention (documented here, applied to this command)

An **`add-*` command generates or sources a discrete *asset* and places it on the timeline.** Each
`add-*` command produces a concrete file that lands as a timeline element.

| Command | Produces | Backed by | Status |
|---|---|---|---|
| `add-music` | background audio track | ACE-Step / `addmusic` | exists |
| `add-motion-graphic` | Lottie overlay (loader, check, confetti…) | new `lottie` skill + `video_toolkit.lottie` | **this task** |
| `add-video-from-text` | AI video clip / b-roll | existing `ltx2` skill + tool | next iteration (not built here) |

**Excluded from the family, deliberately:** animated components (`AnimatedBackground`,
`PointingHand`, `Envelope`…) and transitions (`glitch`, `lightLeak`…). Those are **code-level
primitives** composed while cutting/designing (`/toolkit:cut`, `/toolkit:slide-design`), not
generated assets dropped on the timeline. Keeping them out is what keeps `add-*` meaningful.

**Naming split:** the **skill is `lottie`** (skills are named after the tech — `ltx2`, `acestep`,
`ffmpeg`); the **command is the accessible verb `add-motion-graphic`** (`/toolkit:add-motion-graphic`).

## Components to build

### 1. Skill — `skills/lottie/SKILL.md`

Toolkit-specific only. **Defers framework basics** to
`skills/remotion-official/remotion-markup/lottie.md` (install + `<Lottie>` API), exactly as
`skills/remotion/SKILL.md` defers to `remotion-official`. Covers:

- The shared `LottieAnimation` wrapper and the **frame-sync convention** (drive the animation off
  Remotion's frame so renders are deterministic, never wall-clock playback).
- The **curated template catalog** (what ships, each template's params + color slots).
- **Brand-color patching** — mapping a brand's colors onto a template's named color slots.
- **Sourcing** from LottieFiles (or a local file) and normalizing to brand.
- **Sizing for 9:16** (1080×1920) — scale/position guidance for overlays.
- **Placing as a custom overlay** on the timeline (asset in `public/lottie/`, referenced by the
  overlay).
- Gotchas: `staticFile` vs fetch, dotLottie-vs-JSON, loop/seek determinism.

Registered in the registry `skills` map with `status: "beta"`.

### 2. Shared component — `lib/components/LottieAnimation.tsx`

Frame-synced wrapper over `@remotion/lottie`'s `<Lottie>`. Exported from `lib/components/index.ts`
under a new "Motion graphics" grouping.

Props (shape, not final signature):
- `src?: string` (a `staticFile()` path) **or** `animationData?: object` — one is required.
- `loop?: boolean` (default `true`), `speed?: number` (default `1`), `direction?: 1 | -1`.
- `recolor?: Record<string, string>` — optional **runtime** color remap for quick tweaks.
- Positioning: `x?`, `y?`, `size?` (or width/height) for overlay placement.

Imports `@remotion/lottie` as an **ambient peer** — resolved in the consuming template's
`node_modules`, exactly like the existing components import `remotion`. **No dependency is added to
core** (core has no root `package.json` deps; `lib/` is typechecked in the consuming template).
Component header follows the existing JSDoc `@example` style used by `PointingHand.tsx` et al.

### 3. Curated Lottie library — `lib/lottie/`

- `lib/lottie/templates/*.json` — hand-authored, parametrized **real Lottie** animation data.
- `lib/lottie/catalog.json` — per-template metadata: `id`, `description`, `params` (e.g. size,
  speed, duration, and template-specific like `progress` 0–100), and `colorSlots` mapping named
  color roles (e.g. `accent`, `fg`) → JSON color paths inside the template.

**Starter set (7):** `spinner`, `check`, `cross`, `confetti`, `pulse`, `progress`, `arrow`.

### 4. Python tool — `video_toolkit/lottie.py` (`python3 -m video_toolkit.lottie`)

CLI following the toolkit's Python-tool conventions (invoked from toolkit root; `--help` on every
subcommand). Subcommands:

- `list` — print the catalog (id + description + params).
- `build <template> [--color <slot=hex> …] [--size <px>] [--speed <x>] [--duration <sec>]
  [--brand <brand.json>] -o <out.json>` — assemble a brand-colored Lottie from a curated template.
  `--brand` auto-maps a brand's colors onto the template's color slots; explicit `--color` wins.
- `colorize <in.json> [--map <hex=hex> …] [--brand <brand.json>] -o <out.json>` — recolor a
  **sourced** Lottie (LottieFiles / local) to brand.
- `info <file.json>` — metadata (width, height, fps, in/out frames, duration) + basic validation
  (is it valid Lottie JSON?).

Color patching operates on Lottie's normalized `[r,g,b,a]` color arrays at the paths declared by
each template's `colorSlots` (for `build`) or matched by value (for `colorize --map`).

Pytest coverage in `video_toolkit/tests/test_lottie.py`: catalog loads; `build` patches the right
slots and emits valid JSON; `colorize` maps values; `info` reports correct metadata; unknown
template / malformed input error cleanly.

### 5. Command — `commands/add-motion-graphic.md` (`/toolkit:add-motion-graphic`)

Workflow doc in the style of `add-music.md` / `slide-design.md`:

1. **Detect the project** (same discovery pattern as `cut` / `render`: cwd or scan projects).
2. **Branch — source or build:**
   - **Source** → user gives a LottieFiles URL or local path. Downloading a URL is a file download
     → **ask permission** (state filename + source) per the safety rules; a local path is read
     directly. Then optionally `colorize` to brand.
   - **Build** → pick a curated template (show `list`), gather params, apply brand colors via
     `build --brand`.
3. **Materialize** the result to `public/lottie/<name>.json` in the project.
4. **Register on the timeline as a custom overlay** referencing the asset via the shared
   `<LottieAnimation>` component. Because the custom-overlay convention lives in the brand repo's
   template (and is being built in a separate session), the command must **detect** the project's
   overlay mechanism and register into it **if present**; otherwise it **falls back** to writing the
   asset to `public/lottie/` and handing back a ready-to-paste `<LottieAnimation src=… />` snippet
   plus placement guidance. No editor/schema work either way — the overlay just needs the asset path
   + placement.
5. **Report** metadata (`info`) and next steps (preview in Studio via `cut-tune`, tune timing).

Registered in the registry `commands` map with `status: "beta"`.

### 6. Registry + docs

- `_internal/toolkit-registry.json`: add `skills.lottie`, `commands.add-motion-graphic`,
  a `tools` entry for `lottie`, and a `components` entry for `LottieAnimation`. Keep surrounding
  shape/order.
- `CLAUDE.md`: add `LottieAnimation` to the Shared Components table; add `lottie` to the Python
  Tools table (Utility/Project row); optionally note the `add-*` convention near the campaign-reels
  workflow.
- `docs/tools-reference.md`: add a copy-ready cheat-sheet block for `python3 -m video_toolkit.lottie`.

## Materialize-vs-recolor (rejected alternative)

Considered doing color **only at render time** via the component's `recolor` prop (ship raw
templates, never write patched JSON). **Rejected:** the custom-overlay model and the upcoming
editor both want a **concrete static asset** on disk, and sourced files behave the same way.
Materializing a brand-colored JSON keeps one consistent model for every path (build or source).
The `recolor` prop stays as a convenience for quick, non-destructive tweaks — not the primary flow.

## Out of scope (this task)

- `add-video-from-text` (LTX-2 wrapper) — **next iteration**, slots into the documented `add-*`
  family.
- Any custom-overlay **editor**/schema work — owned by a separate session.
- Renaming existing commands — `add-music` is already convention-conformant.
- A programmatic Lottie *generator* — the curated template library is the chosen build mechanism.

## Success criteria

- `/toolkit:add-motion-graphic` produces a brand-colored `public/lottie/<name>.json` and places it
  as a timeline custom overlay, from either the source or build path.
- `LottieAnimation` renders a curated template frame-synced in a Remotion composition.
- `python3 -m video_toolkit.lottie {list,build,colorize,info}` work with `--help`; tests pass.
- The `lottie` skill and `add-motion-graphic` command are discoverable via the registry and docs;
  the `add-*` convention is written down for the next iteration to follow.
