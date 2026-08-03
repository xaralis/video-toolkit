# Reel editor — visual and UX overhaul

**Date:** 2026-08-03
**Status:** approved, ready for planning

## Problem

Six complaints. The first three are the original brief; the last three were
raised while this spec was being written and are folded in because they are the
same surface.

1. **The editor looks generic.** A default dark dashboard (`#17181c` / `#1e1f24`
   / `#26282f`) with one bright lime accent (`#b6ff5a`) — the exact combination
   any model emits by default.
2. **Numeric parameters are raw decimal text boxes.** 38 `NumberField` call
   sites in `LayeredInspector.tsx`, each a `type="number"` with a decimal
   `step`. Setting opacity means typing `0.85`; setting a fade means typing
   `1.35` seconds.
3. **Keyboard shortcuts are undocumented and scattered.** Seven shortcuts across
   three files with no shared source, and a hand-written prose legend in the
   timeline that does not know about them.
4. **Timeline block colours clash with the palette** — an unplanned rainbow that
   will fight whatever accent is chosen (Section 1).
5. **The project screen is thin** — it never says what format is being edited
   (Section 4).
6. **Zoom drifts.** Zooming pushes the playhead out of view, so every zoom step
   costs a scroll to find your place again (Section 5).

The root shared by (1) is that editor styling lives in **three mechanisms that
do not talk to each other**:

- `lib/editor/app/EditorShell.module.css` — a CSS module
- `lib/editor/host/ui.ts` — exported `CSSProperties` constants (`zoomBtn`, `toggleBtn`)
- 10 more inline `React.CSSProperties` objects inside `LayeredInspector.tsx`
  (`field`, `label`, `input`, `panel`, `section`, `heading`, `note`, …), plus
  ad-hoc inline styles in `LayeredTimeline.tsx`

There are no design tokens. Any repaint applied on top of this fragmentation
stays fragmented — the accent lime alone is written twice, once as the `ui.ts`
constant and once as a literal in the CSS module.

## Non-goals

- **The editor chrome does not adopt brand colours.** `EDITOR_ACCENT` is
  core's tool identity, and stays core's; a brand's palette continues to reach
  the editor only through `accentSlots`. A tool looks like itself regardless of
  the footage in it.
- **No keyframe editing.** `ParamField.animatable` remains reserved.
- **No new timeline model surface.** Every shortcut added here drives an
  operation that already exists.

## Section 1 — Token layer and palette

### Mechanism

CSS custom properties declared on the shell root. This is the one carrier both
CSS modules and inline `CSSProperties` objects can read (`background:
'var(--ed-bg-2)'` is valid in a React style object), so the three styling
mechanisms converge on one source of truth **without** rewriting the
1315-line inspector into CSS modules.

Tokens live in `lib/editor/app/tokens.css`, imported once by `EditorShell`.

### Palette — graphite with a violet accent

| Token | Value | Use |
|---|---|---|
| `--ed-bg-0` | `#0e0e12` | Stage void behind the preview frame |
| `--ed-bg-1` | `#131318` | Shell background |
| `--ed-bg-2` | `#1a1a21` | Panels — header, inspector, timeline |
| `--ed-bg-3` | `#22222b` | Controls — inputs, buttons, tracks |
| `--ed-line` | `#2a2a35` | Default hairline |
| `--ed-line-strong` | `#3a3a48` | Hover / emphasis |
| `--ed-text-1` | `#e6e6ea` | Primary |
| `--ed-text-2` | `#a0a0ae` | Labels, secondary |
| `--ed-text-3` | `#6a6a78` | Micro-labels, hints |
| `--ed-accent` | `#7c5cff` | The single accent |
| `--ed-accent-ink` | `#12101f` | Text on accent fill |
| `--ed-accent-soft` | `#2e2547` | Accent-tinted UI fill (active toggle) — never a timeline block, see rule 1 |
| `--ed-warn` | `#ffb454` | Unsaved, starvation |
| `--ed-danger` | `#ff5c5c` | Destructive |
| `--ed-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | Every numeric value |

`EDITOR_ACCENT` in `lib/editor/host/ui.ts` changes from `#b6ff5a` to
`#7c5cff` and becomes a re-export of the token value for the few consumers
that need a JS string (e.g. `MediaLoading.tsx`'s spinner border). The
duplicate lime literal in `EditorShell.module.css` is replaced by
`var(--ed-accent)`.

### Where the personality comes from

Not from tinting large surfaces — the chrome sits beside the video, and a
colour cast on big areas is what makes a grading suite untrustworthy. It comes
from three cheap, high-signal moves:

- **Mono numerals.** Every value — timecode, dB, scrub readouts, the ruler —
  in `--ed-mono` with `font-variant-numeric: tabular-nums`, so digits stop
  jittering as they change.
- **Micro-labels.** Section headings at 10px, `--ed-text-3`, letter-spaced.
  (The inspector's `section` style already does this; it becomes the system.)
- **Lane identity in the timeline.** Colour is allowed to be loud where it
  encodes meaning. Blocks keep a saturated 2px left border over a desaturated
  fill of the same hue — readable at a glance, quiet in bulk. Which hues, and
  the rule that governs them, is the subsection below.

### Lane colours must harmonise with the accent

The current `CORE_LANE_COLOR` set (`LayeredTimeline.tsx:98`) is an unplanned
rainbow: blue `#3b6ea5`, green `#2f7d4f`, steel `#3f6a7d`, purple `#6a4fa5`,
gold `#8a6d1f`, teal `#2a8f8f`, violet `#7a5cae`. Against a violet accent this
fails twice over — the gold and green clash outright, and **`music` (`#7a5cae`)
and `video-multi-clip` (`#6a4fa5`) sit essentially on the accent hue**, so a
lane permanently wears the colour that is supposed to mean *selected*.

Two rules, in priority order:

1. **No lane may occupy the accent hue.** The accent means active/selected; a
   lane wearing it destroys that signal. This is the load-bearing rule — it
   holds even if it costs separation between lanes.
2. **Hues are drawn from a restricted arc**, cool and adjacent to the accent
   (roughly indigo → blue → teal → slate, ~190°–280°, excluding a guard band
   around the accent's own hue), at a common saturation and lightness so no
   single lane shouts louder than its neighbours.

Warm hues (gold, green) leave the palette. The kinds that used them are
re-sited within the arc; `video-outro` and the brand lanes stay neutral slate,
which is already correct.

**Selection is an outline, never a fill swap.** Since the fill now carries lane
identity, a selected block cannot indicate selection by turning
`--ed-accent-soft` — that would erase the very information the fill exists to
convey, and would collide with rule 1 by putting the accent hue on a block
after all. Selection is an accent ring around the block, leaving the fill
alone. `--ed-accent-soft` is therefore for accent-tinted UI surfaces (an active
toggle's background), not for timeline blocks.

**A tension this creates, to be resolved during implementation, not
discovered:** `stableColor` (`editor-meta.ts:253`) generates colours for lane
kinds core has never heard of, and its test asserts a *minimum hue separation*
over the real kind set — a threshold that exists because two overlay kinds once
came out 6° apart and read as one colour. Narrowing the hue arc directly
reduces the room that test needs. The resolution is to lean the separation
harder on the saturation and lightness axes (`SATURATIONS`, `LIGHTNESSES`),
which the function already varies independently, and to lower the hue-distance
threshold to match the narrower arc — deliberately, with the new value stated
in the test. Silently deleting the assertion is not acceptable; it is guarding
a real defect that already happened once.

### Brand-leak constraint

`#7c5cff` is a hex, so it does not move the brand-leak grep count. That gate
stays at exactly **2** hits and is unrelated to this work — but it must be run,
because this touches many files under `lib/`.

## Section 2 — Control vocabulary

New directory `lib/editor/app/controls/`, one file per control.

### The primitive: `ScrubField`

Drag horizontally on the value to change it; click to place a caret and type.
This is the After Effects / Blender / Resolve idiom, and it is the only
replacement that works for a parameter with **no declared range** — which
matters because **zero fields in the core catalog currently declare
`min`/`max`** (verified: `ParamField` has had `min`/`max`/`step` since Phase 4,
and nothing populates them).

Pointer math is extracted as a pure function so it is testable without a DOM:

```ts
scrubValue(start: number, dx: number, step: number, opts?: { min?: number; max?: number; fine?: boolean }): number
```

- `dx` is pixels travelled; sensitivity is one `step` per 4px, so a 0.05-step
  field crosses its usual working range in a comfortable drag.
- `fine` (Shift held) divides the rate by 10.
- Result is snapped to the `step` grid and clamped to `min`/`max` when given.
  Snapping is what keeps `0.30000000000000004` out of the config.

`ScrubField` keeps the existing `useLiveField` contract exactly: commit on
every valid change (so the preview follows the drag), resync from the external
value only while unfocused. A drag emits a stream of commits, which
`useHistory` already collapses into one undo step via its 450 ms coalescing
window — the same mechanism the volume-line drag relies on today. **No new
history mechanism is needed.**

### `SliderField`

`ScrubField` plus a track, for parameters with a known `min` and `max`. The
track is the readout; the number sits beside it in `--ed-mono`. Used where a
bounded value benefits from seeing position-within-range at a glance.

### `TimecodeField`

For millisecond-valued parameters, displayed and edited as `mm:ss.ff` (frames,
at the composition's fps). Replaces every `(x / 1000)` seconds field — trim
in/out, fades, start/end. This is the control that removes decimal typing
entirely from the most-used fields.

Parsing is permissive and tested as a pure function: `1:02.15`, `62.5`, `:02`
and `90` all resolve; anything else leaves the value untouched.

```ts
parseTimecode(text: string, fps: number): number | null   // → ms
formatTimecode(ms: number, fps: number): string
```

### `SegmentedField`

For enums with up to 4 choices — a row of pill buttons instead of a
`<select>`. Above 4 choices, `SelectField` remains correct and stays.

### Control assignment

| Parameter group | Control | Range |
|---|---|---|
| `brightness`, `contrast`, `saturation` | Slider | 0–2, step 0.05 |
| `temperature`, `tint` | Slider | −1 to 1, step 0.05 (neutral at 0) |
| `sepia` | Slider | 0–1, step 0.05 |
| `hueRotateDeg` | Slider | 0–360, step 1 |
| `focalX`, `focalY` | Slider | 0–1, step 0.01 |
| `backdropBlur` | Slider | 0–80, step 1 (already declares min/max) |
| `backdropDim` | Slider | 0–1, step 0.05 (already declares min/max) |
| Crop zoom | Scrub | min 1, step 0.05 |
| Ken Burns `fromX`/`toX` | Slider | 0–1, step 0.01 |
| Ken Burns `fromScale`/`toScale` | Scrub | min 0.5, step 0.05 |
| `volumeDb` | Slider | −60–+12, step 0.5 |
| `sourceInMs`, `sourceOutMs`, `startMs`, `endMs`, `fadeInMs`, `fadeOutMs` | Timecode | — |
| `fontSize` | Scrub | min 8, step 1 |
| `fit`, Ken Burns `direction` | Segmented | — |
| Brand-declared `ParamField` with `min` **and** `max` | Slider | from the declaration |
| Brand-declared `ParamField` without both | Scrub | `step` from the declaration |

The last two rows are why the scrub primitive is the foundation rather than an
extra: a brand's declared parameter that omits a range still gets a modern
control instead of degrading to a text box.

`TextField`, `SelectField` (>4 choices), `ColorField` and the accent controls
keep their current behaviour and are restyled only.

## Section 3 — Keyboard shortcuts

### Registry

`lib/editor/app/shortcuts.ts` holds the single source of truth:

```ts
interface Shortcut {
  id: string;
  keys: string;          // display form, e.g. '⌘Z' / '⇧←'
  match: (e: KeyboardEvent) => boolean;
  label: string;
  group: 'Playback' | 'Editing' | 'Timeline' | 'File' | 'Help';
}
```

`?` itself is a registered shortcut in the `Help` group — the overlay lists the
key that opens it, which is the first thing anyone looks for after closing it
once.

One `useShortcuts(handlers)` hook replaces the three scattered `keydown`
listeners (`EditorShell.tsx:94`, `EditorHost.tsx:128`, plus the timeline's
Alt tracking, which stays where it is — it tracks a modifier's held state, not
a shortcut). The existing "ignore while typing" guard moves into the hook, and
`⌘S` keeps its deliberate exception: it fires even while a field has focus.

### The `?` overlay

Pressing `?` opens a panel **generated from the registry**, grouped by
`group`. It cannot drift from the implementation, because the registry is what
binds the keys. The hand-written prose legend at `LayeredTimeline.tsx:994` is
replaced by the same data, filtered to the timeline group.

### Bindings

Existing, now registered rather than inline: `⌘S` save, `Space` play/pause,
`Esc` deselect, `⌘Z` / `⌘⇧Z` undo/redo, `Delete` / `Backspace` delete,
`⌘`+wheel zoom, `⌥`+drag slip.

Added — each drives an operation that already exists:

| Key | Action | Backed by |
|---|---|---|
| `←` / `→` | Step 1 frame | `playerRef.seekTo` |
| `⇧←` / `⇧→` | Step 10 frames | `playerRef.seekTo` |
| `Home` / `End` | Jump to start / end | `playerRef.seekTo` |
| `S` | Split selected at playhead | `splitItem` (`layered-adapter.ts:703`) |
| `⌘D` | Duplicate selected | `duplicateItem` (`layered-adapter.ts:735`) |
| `+` / `-` | Zoom timeline in / out | the existing `zoomBy` |
| `?` | Open the shortcut overlay | this section |

`+` / `-` ship in phase 4 against the current left-edge zoom and gain centre
anchoring in phase 5. That ordering is deliberate — anchoring is a property of
`zoomBy`, not of the binding — but it does mean keyboard zoom drifts until
phase 5 lands, exactly as the wheel does today.

### Deliberately excluded

- **J/K/L shuttle.** Verified against `@remotion/player`'s
  `player-methods.d.ts`: `PlayerRef` exposes no playback-rate method —
  `playbackRate` is a `<Player>` prop only. Wiring it would mean lifting rate
  into React state and re-rendering the Player, against the explicit design
  note at `EditorHost.tsx:151` that playback must not re-render the editor. In
  a 15–60 s reel whose whole timeline is on screen, shuttle earns nothing.
- **I/O mark in/out.** No mark model exists, and a work area over 30 seconds of
  material solves no real problem here.

## Section 4 — The project overview panel

With nothing selected, the inspector shows four things: topic, total duration,
music, and track counts (`LayeredInspector.tsx:820`). It is the first screen of
every session and the only one that describes the project as a whole, and it
omits everything about the *format* being edited.

`EditorHost` already receives `fps`, `width` and `height` as options and
computes `durationInFrames` (`EditorHost.tsx:26-28, 292`) — the inspector
simply is not given them. Threading those three as props is the whole
mechanism.

Shown, all derivable from data already in hand:

| Field | Source | Note |
|---|---|---|
| Resolution | `width` × `height` props | e.g. `1080 × 1920` |
| Aspect | derived from the same | e.g. `9:16`, reduced by GCD |
| Frame rate | `fps` prop | |
| Duration | `reel.meta.totalDurationMs` | as `mm:ss.ff`, matching `TimecodeField` |
| Total frames | `framesForReel(reel, fps)` | |
| Distinct media sources | count of unique `source` across video + audio tracks | |
| **Sources that failed to load** | the `durations` map, where a probed source resolved to `0` | |
| Track counts | as today | |
| Music | as today | |

The failed-source row is the one that earns its place beyond decoration. The
editor **already distinguishes a failed decode from an unprobed source** — the
metadata hook writes `0` for a file it could not read, which is exactly the
distinction `pendingSources` relies on to avoid spinning forever
(`MediaLoading.tsx:6`). That information is currently computed and then
discarded. Surfacing it turns a silent black clip into a named cause, and it
costs nothing to derive. When the count is zero the row is omitted entirely —
a healthy project shows no diagnostic, consistent with how the header's
diagnostics badge already behaves.

Layout follows the token system: micro-label above value, values in
`--ed-mono`, grouped into *Format* (resolution, aspect, fps, frames) and
*Content* (duration, sources, tracks, music).

## Section 5 — Zoom anchors on the pointer

Zooming today changes `scaleWidth` and leaves `scrollLeft` untouched. The
timeline therefore grows and shrinks around its **left edge**, so whatever the
user was looking at — usually the playhead — slides out of view, and they have
to chase it with a scroll after every zoom step. Every NLE anchors zoom on the
pointer instead; the frame under the cursor stays under the cursor.

One pure function, sitting beside `zoomFactorFor` and `followScrollLeft` in
`LayeredTimeline.tsx`:

```ts
zoomAnchorScrollLeft(
  anchorX: number,        // pointer offset within the scroll viewport, px
  view: { scrollLeft: number; scrollWidth: number; clientWidth: number },
  factor: number,         // the same multiplicative factor zoomFactorFor returns
): number
```

The invariant it preserves: the timeline position under `anchorX` before the
zoom is under `anchorX` after it. With `TIMELINE_START_LEFT` as the ruler's
left inset, the content offset under the pointer is
`scrollLeft + anchorX - TIMELINE_START_LEFT`; multiplying by `factor` gives
where that same content lands afterwards, and the new `scrollLeft` is that
value minus `anchorX - TIMELINE_START_LEFT`, clamped to `[0, scrollWidth ×
factor − clientWidth]`.

Applying it needs an ordering the implementation must respect: `scaleWidth`
lives in `EditorHost` and the scroll element in `LayeredTimeline`, so the new
`scrollLeft` has to be written **after** React has re-laid-out at the new
scale, not in the wheel handler. Writing it in the same tick sets a scroll
position against the old `scrollWidth` and the browser clamps it — which reads
exactly like the bug being fixed. A layout effect keyed on `scaleWidth`, using
the anchor recorded by the wheel handler, is the correct seam.

**Keyboard zoom (`+` / `-`) anchors on the viewport centre** — `anchorX =
clientWidth / 2`, one argument into the same function. There is no cursor to
anchor to and no requirement that it match the pointer behaviour; centre is
simply the cheapest thing that is not the left edge. No playhead tracking, no
second code path.

## Testing

jsdom cannot deliver pointer gestures, and the timeline's rows are virtualised
so its action blocks never mount — the same limitation documented for earlier
timeline work. The design therefore puts the load-bearing logic in pure
functions and tests those directly:

- `scrubValue` — step snapping, clamping, fine mode, negative travel.
- `parseTimecode` / `formatTimecode` — round-trip, permissive forms, rejection
  returning `null` rather than `0` (a rejected parse must not zero the value).
- The registry — **no two shortcuts anywhere match the same event**, checked
  across the whole registry rather than within a group. Grouping is a display
  concern; a `Timeline` binding shadowing an `Editing` one is exactly the
  collision worth catching, and a per-group check would miss it. Plus: every
  registered shortcut appears in the overlay (the anti-drift guarantee is
  itself asserted).
- Controls render and commit through Testing Library where the interaction is a
  click or a keystroke (`SegmentedField`, typing into `ScrubField`).
- **Lane colours** — the two rules are asserted, not eyeballed: no entry in
  `CORE_LANE_COLOR` falls within the guard band around the accent hue, and
  every entry lies inside the declared arc. `stableColor`'s existing separation
  test keeps its guarantee at the new, explicitly stated threshold.
- **Project panel** — `aspectLabel(width, height)` (GCD reduction: 1080×1920 →
  `9:16`) and the failed-source count are pure functions tested directly. The
  panel's own test pins that a project with no failed sources renders **no**
  diagnostic row, which is the behaviour most likely to regress into an
  always-visible `0 failed`.
- **`zoomAnchorScrollLeft`** — the invariant stated directly: for a range of
  anchors and factors, the content offset under the anchor is unchanged across
  the zoom. Plus the clamps (never negative; never past the new maximum) and
  the degenerate cases (`factor` 1 returns the current `scrollLeft`;
  `clientWidth` 0 does not divide by zero). The layout-effect ordering is not
  unit-testable in jsdom — no layout runs — and is called out here as a
  hand-verification item instead of being falsely pinned.

Visual restyling is not pixel-tested. The pixel harness renders **composition**
stills and knows nothing about editor chrome; asserting hex values in a test
would only restate the token file.

## Gates

Run before the work is done: editor tests, editor `tsc --noEmit` (compared by
identity against the 3 known errors, exit code read separately), and the
brand-leak grep (exactly 2). The pixel harness, the example typecheck and the
Python suite are untouched by this work — none of it reaches `lib/render`,
`lib/transitions` or `video_toolkit` — and may be skipped with that reason
stated.

## Phasing

Five phases, in order. Each leaves the editor working and is independently
reviewable.

1. **Tokens and repaint.** `tokens.css`, `EDITOR_ACCENT`, and converting the
   three styling mechanisms to read tokens. No behaviour change.
2. **Lane colours.** The harmonised arc, the no-accent-hue rule, and the
   `stableColor` threshold adjustment with its restated test. Separate from
   phase 1 because it is the one part of the repaint that changes a *rule*
   rather than a value, and it carries the one test tension in the whole spec.
3. **Controls.** `scrubValue` and the timecode helpers first (pure, tested),
   then the four controls, then the 38 call-site conversions.
4. **Shortcuts.** Registry and hook, then the overlay and the legend
   replacement, then the new bindings.
5. **Zoom anchoring and the project panel.** Two small, independent additions
   that both depend on the token system being in place.

Phase 1 must land first — every later phase styles what it introduces. Phases
2–5 are otherwise independent of each other.
