# Reel editor — visual and UX overhaul

**Date:** 2026-08-03 · **Status:** approved, ready for planning

## Problem

1. Chrome looks generic — default dark greys + one lime accent (`#b6ff5a`).
2. 38 `NumberField` sites in `LayeredInspector.tsx` are raw decimal text boxes.
3. Seven shortcuts scattered across three files, no registry, prose legend that
   can drift.
4. Timeline block colours are an unplanned rainbow.
5. The project screen never says what format is being edited.
6. Zoom drifts — the playhead leaves the viewport on every step.

Behind (1): styling lives in **three mechanisms that never meet** —
`EditorShell.module.css`, `CSSProperties` constants in `host/ui.ts`, and ten
inline style objects in `LayeredInspector.tsx`. No tokens. The accent lime is
written twice.

## Non-goals

- Editor chrome does **not** adopt brand colours. `EDITOR_ACCENT` is core's tool
  identity; a brand reaches the editor only via `accentSlots`.
- No keyframe editing. No new timeline model surface.

## 1 — Tokens and palette

### Styling mechanism: Tailwind, compiled at core

Utility classes replace the three ad-hoc mechanisms and cut the line count the
brief asks for. But Tailwind **cannot be a runtime dependency of the editor**:

- `vite-config.mts:15-17` states it outright — `@tailwindcss/vite` is a
  brand-side choice, "some brands use Tailwind, some don't", passed in via
  `opts.plugins`.
- Verified: **PP has Tailwind, ROOST does not** (`plugins: [react()]`, no
  `tailwind` in any of its package.json files).

If core's editor emitted Tailwind classes expecting the brand to compile them,
ROOST's editor would render **completely unstyled — and silently**, because
unstyled markup throws no error.

So: **core compiles its own Tailwind to a static stylesheet and commits it.**

- `@tailwindcss/cli` is a core devDependency. An npm script scans
  `lib/editor/**/*.tsx` (Tailwind v4 `@source`) and emits
  `lib/editor/app/editor.css`, committed to the repo.
- `EditorShell` imports that CSS. A brand needs **nothing** — no plugin, no
  config, no content path. ROOST keeps working unchanged.
- **Utilities are prefixed `ed:`** (`ed:flex`, `ed:bg-panel`). PP runs its own
  Tailwind in the same page; a prefix makes a collision between core's
  generated utilities and the brand's structurally impossible, rather than
  relying on both resolving to identical rules.
- **Gate:** the build script is deterministic, so CI-free verification is
  `npm run editor:css && git diff --exit-code lib/editor/app/editor.css`.
  Without it, someone adds a class, forgets to rebuild, and the style silently
  does not apply — the same failure class this whole choice avoids.

Design tokens stay CSS custom properties (`lib/editor/app/tokens.css`) and are
wired into Tailwind's theme, so `ed:bg-panel` resolves to `var(--ed-bg-2)`.
That keeps the token table below as the single source of colour, and lets any
inline style that survives the migration read the same variables.

| Token | Value | Use |
|---|---|---|
| `--ed-bg-0/1/2/3` | `#0e0e12` / `#131318` / `#1a1a21` / `#22222b` | stage · shell · panels · controls |
| `--ed-line`, `--ed-line-strong` | `#2a2a35`, `#3a3a48` | hairline, hover |
| `--ed-text-1/2/3` | `#e6e6ea` / `#a0a0ae` / `#6a6a78` | primary · label · micro |
| `--ed-accent` | `#7c5cff` | the single accent |
| `--ed-accent-ink` | `#12101f` | text on accent fill |
| `--ed-accent-soft` | `#2e2547` | accent-tinted **UI** fill — never a timeline block |
| `--ed-warn`, `--ed-danger` | `#ffb454`, `#ff5c5c` | unsaved/starvation, destructive |
| `--ed-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | every numeric value |

`EDITOR_ACCENT` changes `#b6ff5a` → `#7c5cff`; the duplicate lime literal in the
CSS module becomes `var(--ed-accent)`.

Personality comes from mono tabular numerals, letter-spaced 10px micro-labels,
and lane colour — not from tinting large surfaces, which sit beside the video.

### Lane colours

Current set clashes: gold `#8a6d1f` and green `#2f7d4f` fight the accent, and
`music` `#7a5cae` / `video-multi-clip` `#6a4fa5` sit **on** the accent hue.

1. **No lane may occupy the accent hue** — the accent means selected. Load-bearing;
   holds even at the cost of lane separation.
2. Hues from a restricted cool arc (~190°–280°, guard band around the accent) at
   common S/L. Warm hues leave; `video-outro` and brand lanes stay slate.
3. **Selection is an accent ring, never a fill swap** — the fill carries lane
   identity now.

⚠️ **Tension to resolve, not discover:** `stableColor` (`editor-meta.ts:253`)
colours unknown brand kinds, and its test asserts a *minimum hue separation*
(it exists because two overlay kinds once landed 6° apart). A narrower arc
shrinks that room. Resolution: lean separation on the `SATURATIONS` /
`LIGHTNESSES` axes and **lower the threshold deliberately, stating the new
value**. Deleting the assertion is not acceptable.

## 2 — Controls

New `lib/editor/app/controls/`.

- **`ScrubField`** — drag to change, click to type. The foundation, because
  **zero core catalog fields declare `min`/`max`** (`ParamField` has had them
  since Phase 4; nothing populates them) and a slider needs a range.
  `scrubValue(start, dx, step, {min, max, fine})` is pure and tested: one step
  per 4px, Shift = ÷10, snapped to the step grid (keeps `0.30000000000000004`
  out of the config).
- **`SliderField`** — scrub + track, where `min` and `max` are known.
- **`TimecodeField`** — `mm:ss.ff` for every ms value (trim, fades, start/end).
  `parseTimecode(text, fps): number | null` / `formatTimecode(ms, fps)`;
  permissive (`1:02.15`, `62.5`, `:02`, `90`), returns `null` on reject.
- **`SegmentedField`** — enums ≤4 choices. Above that `SelectField` stays.

`ScrubField` keeps the `useLiveField` contract (commit on change, resync only
while unfocused). A drag's commit stream collapses into one undo step via
`useHistory`'s existing 450 ms coalescing — no new mechanism.

| Parameter | Control | Range |
|---|---|---|
| `brightness`, `contrast`, `saturation` | Slider | 0–2, step 0.05 |
| `temperature`, `tint` | Slider | −1 to 1, step 0.05 |
| `sepia` | Slider | 0–1, step 0.05 |
| `hueRotateDeg` | Slider | 0–360, step 1 |
| `focalX`, `focalY`, Ken Burns `fromX`/`toX` | Slider | 0–1, step 0.01 |
| `backdropBlur` / `backdropDim` | Slider | 0–80 / 0–1 (already declared) |
| `volumeDb` | Slider | −60 to +12, step 0.5 |
| Crop zoom | Scrub | min 1, step 0.05 |
| Ken Burns `fromScale`/`toScale` | Scrub | min 0.5, step 0.05 |
| `fontSize` | Scrub | min 8, step 1 |
| `sourceInMs`, `sourceOutMs`, `startMs`, `endMs`, `fadeInMs`, `fadeOutMs` | Timecode | — |
| `fit`, Ken Burns `direction` | Segmented | — |
| Brand `ParamField` with min **and** max | Slider | from declaration |
| Brand `ParamField` without both | Scrub | `step` from declaration |

`TextField`, `SelectField`, `ColorField` and accent controls are restyled only.

## 3 — Shortcuts

`lib/editor/app/shortcuts.ts` is the single source:
`{ id, keys, match(e), label, group }`, groups
`Playback | Editing | Timeline | File | Help`. One `useShortcuts(handlers)` hook
replaces the three scattered listeners (the timeline's Alt tracking stays — it
tracks a held modifier, not a shortcut). The typing guard moves into the hook;
`⌘S` keeps its exception and fires even in a focused field.

`?` opens an overlay **generated from the registry**, so it cannot drift. The
prose legend at `LayeredTimeline.tsx:994` is replaced by the same data filtered
to the timeline group. `?` is itself registered.

Existing bindings move into the registry unchanged. Added — each drives an
operation that already exists:

| Key | Action | Backed by |
|---|---|---|
| `←` `→` / `⇧←` `⇧→` | ±1 / ±10 frames | `playerRef.seekTo` |
| `Home` / `End` | start / end | `playerRef.seekTo` |
| `S` | split at playhead | `splitItem` (`layered-adapter.ts:703`) |
| `⌘D` | duplicate | `duplicateItem` (`layered-adapter.ts:735`) |
| `+` / `-` | zoom | existing `zoomBy` |

`+` / `-` ship in phase 4 against left-edge zoom and gain centre anchoring in
phase 5 — anchoring belongs to `zoomBy`, not to the binding.

**Excluded:** J/K/L shuttle — `PlayerRef` exposes no playback-rate method
(`playbackRate` is a `<Player>` prop), so it would force a Player re-render
against the explicit note at `EditorHost.tsx:151`, and shuttle earns nothing in
a 15–60 s reel. I/O marks — no mark model exists, and a work area over 30 s of
material solves nothing.

## 4 — Project panel

`EditorHost` already has `fps`, `width`, `height` and `durationInFrames`
(`EditorHost.tsx:26-28, 292`); the inspector is simply not given them.
Threading those props is the whole mechanism.

Adds: resolution, aspect (GCD-reduced, `9:16`), fps, total frames, duration as
`mm:ss.ff`, distinct media source count, and **sources that failed to load** —
the metadata hook already writes `0` for an unreadable file (the distinction
`pendingSources` relies on, `MediaLoading.tsx:6`) and that information is
currently discarded. Omitted entirely when zero. Grouped *Format* / *Content*.

## 5 — Zoom anchoring

Zoom changes `scaleWidth` and leaves `scrollLeft`, so the timeline grows around
its left edge. Anchor it on the pointer instead:

```ts
zoomAnchorScrollLeft(anchorX, { scrollLeft, scrollWidth, clientWidth }, factor): number
```

Invariant: content under `anchorX` stays under `anchorX`. With
`TIMELINE_START_LEFT` as the ruler inset, the offset under the pointer is
`scrollLeft + anchorX - TIMELINE_START_LEFT`; scale by `factor`, subtract
`anchorX - TIMELINE_START_LEFT`, clamp to `[0, scrollWidth × factor − clientWidth]`.

⚠️ **Ordering matters.** `scaleWidth` lives in `EditorHost`, the scroll element
in `LayeredTimeline`. The new `scrollLeft` must be written **after** re-layout —
a same-tick write hits the old `scrollWidth`, gets clamped, and looks exactly
like the bug. Use a layout effect keyed on `scaleWidth` with the anchor recorded
by the wheel handler.

Keyboard zoom anchors on viewport centre (`anchorX = clientWidth / 2`) — no
cursor to anchor to, no second code path.

## Testing

jsdom delivers no pointer gestures and the timeline's rows are virtualised, so
load-bearing logic goes in pure functions:

- `scrubValue` — snapping, clamping, fine mode, negative travel.
- `parseTimecode` / `formatTimecode` — round-trip, permissive forms, reject
  returns `null` not `0` (a bad parse must not zero the value).
- Registry — **no two shortcuts anywhere match the same event** (across the
  whole registry, not per group: a `Timeline` binding shadowing an `Editing` one
  is the collision worth catching), and every shortcut appears in the overlay.
- Lane colours — no `CORE_LANE_COLOR` entry inside the accent guard band; all
  inside the arc. `stableColor` separation holds at its new stated threshold.
- Project panel — `aspectLabel` and the failed-source count as pure functions;
  a project with zero failures renders **no** diagnostic row.
- `zoomAnchorScrollLeft` — the invariant across anchors/factors, both clamps,
  and degenerate cases (`factor` 1, `clientWidth` 0). The layout-effect ordering
  is **not** unit-testable in jsdom — hand-verification item, not a false pin.
- Testing Library where the interaction is a click or keystroke.

Visual restyling is not pixel-tested — the harness renders composition stills
and knows nothing about editor chrome.

## Gates

`npm run editor:css && git diff --exit-code lib/editor/app/editor.css` (the
generated stylesheet is not stale), editor tests, editor `tsc --noEmit`
(identity against the 3 known errors, exit
code read separately), brand-leak grep (exactly 2 — `#7c5cff` is a hex and does
not move it). Pixel harness, example typecheck and Python are untouched — this
reaches neither `lib/render`, `lib/transitions` nor `video_toolkit` — skip with
that reason stated.

## Phasing

1. **Tailwind pipeline + tokens and repaint** — the `ed:`-prefixed build script,
   the committed `editor.css` and its staleness gate, then converting the three
   styling mechanisms. No behaviour change.
2. **Lane colours** — separate because it changes a *rule* and carries the
   `stableColor` tension.
3. **Controls** — pure helpers first, then the four controls, then 38 call sites.
4. **Shortcuts** — registry and hook, overlay and legend, new bindings.
5. **Zoom anchoring + project panel** — two small independent additions.

Phases 2–5 are independent of each other.
