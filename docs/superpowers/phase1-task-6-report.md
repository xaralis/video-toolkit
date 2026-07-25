# Task 6 report — Evict brand constants from core (editor UI)

Branch `refactor/phase1-subtract`. Core-only; neither brand repo was edited.

## The one new mechanism

`lib/editor/app/editor-meta.ts` (new) — `EditorMeta`, the brand-supplied editor
vocabulary, passed as ONE optional prop (`meta`) to both `LayeredInspector` and
`LayeredTimeline`. Every field is optional and every consumer has a neutral core
default, so **a host that passes nothing still gets a fully working,
brand-neutral inspector and timeline** — nothing is disabled, only un-branded.

```ts
interface EditorMeta {
  effects?: readonly EffectDefinition[];               // "+ Add effect" catalog, on top of core's
  videoProps?: Record<string, readonly ParamField[]>;  // declared fields of a video kind's `props`
  laneColors?: Record<string, string>;                 // timeline block colour per effectId
  overlayLabels?: Record<string, string>;              // timeline block label per overlay content.kind
}
interface ParamField { prop: string; label?: string; options?: readonly string[];
                       type?: 'number' | 'string' | 'boolean' }
interface EffectDefinition { type: string; label?: string; defaults?: Record<string, unknown>; params?: readonly ParamField[] }
```

Deliberately NOT the Phase 3 registry redesign: no Zod param schemas, no
self-rendering inspector. Just enough shape to carry today's four leaks.

## Each constant removed, and the mechanism that replaced it

| Removed | Was | Replaced by | With no `meta` a host sees |
|---|---|---|---|
| `OUTRO_STYLES = ['organic','fade','bloom','static','heartbeat']`, `OUTRO_VARIANTS = ['sand-brown','white-black']`, and the hardcoded `Logo delay (s)` field (`LayeredInspector.tsx:324-325, 468`) | roost's outro vocabulary, hardcoded as two dropdowns gated on `v.kind === 'outro'` | New `ParamFields` — a **generic opaque-bag editor**. Renders a video item's `props` for ANY kind: brand-declared fields first (a dropdown when they declare `options`, shown even when the item doesn't carry the key yet), then every remaining key typed by the value it holds (number→NumberField, boolean→CheckboxField, string→TextField). Section heading is `humanizeKey(v.kind)`. | Every prop is still reachable and editable — `style`/`variant` as text inputs, `logoDelaySec` as a number field labelled "Logo delay sec". No brand values are *offered as choices*. |
| `EFFECT_DEFAULTS = { vintage, 'ken-burns' }` (`:253`) and the `type === 'vintage'` branch of `EffectEditor` | the two brands' effects, as core's entire add-catalog | `CORE_EFFECTS` = **only what core itself renders** (`ken-burns` — SegmentMedia implements it). `effectCatalog(meta)` = core + brand, a brand entry replacing a core one of the same `type` in place. `EffectEditor` keeps bespoke editors for the two effects core OWNS (`ken-burns`, whose two legitimate shapes need the dual branch; `blend`, emitted by core's own `derive-layered`) and routes every other type through `ParamFields`. | "+ Add effect" offers "Ken Burns" only. An existing `vintage` effect on a clip still opens and its `mode` is still editable (generic text field) — it degrades, it does not break. |
| `DEFAULT_COLORS = [lime, teal]` (`AccentEditor.tsx:24`) | PP's palette as core's default | `colors` defaults to an **empty palette** — the same rule `TransitionFields` already applied to its `accent` sub-option (no palette → no control). The toolbar renders one button per supplied slot, plus Clear. | Only the **Clear** button, which still strips accents from text that already carries them. Existing accent spans still render (uncoloured). |
| `EFFECT_COLOR`'s `overlay-stat-callout` / `overlay-chevron` / `overlay-quote-pull // legacy` / `overlay-title` / `overlay-text` / `overlay-update-badge` / `overlay-source-tag` (`LayeredTimeline.tsx:48-65`) | template overlay-kind names | `CORE_LANE_COLOR` keeps **only the kinds core's own schema defines** — the `VideoItemSchema` union (incl. `video-photo`, which was missing), `audio`, `music`, the `BrandLayerItemSchema` enum. Overlay content kinds are open in the schema ("core knows modes, not names"), so anything unlisted gets `stableColor(effectId)`, a deterministic muted HSL hashed from the id. `meta.laneColors` overrides both. | Every overlay kind gets a stable, distinct colour instead of the old all-unknowns-are-grey `#5a5c64`. |
| `OVERLAY_KIND_LABEL` (`text` / `quote-pull` / `chevron` / `title` / `stat-callout` / `update-badge` / `source-tag` / `party-logos`) | template overlay-kind names | `meta.overlayLabels?.[kind] ?? humanizeKey(kind)` | `stat-callout` → "Stat callout", `chevron` → "Chevron" — readable, never blank, never an opaque id. |

### One leak fixed beyond the brief

`lib/editor/app/accent.ts:9` — `ACCENT_RE = /\{(?:lime|teal):([^}]*)\}/g`. A
genuine brand value in production code, in the same directory and the same class
as the listed four, and cheap to fix. Now `/\{[A-Za-z][\w-]*:([^}]+)\}/g` (the
`+` corrected in the follow-up pass below, see §5), the exact grammar
`lib/transcripts/accent-parser.ts:52` already uses. Without
it a third brand's `{gold:…}` caption showed literal braces in every timeline
block label (`stripAccents` feeds `timelineLabel`).

Also: `NumberField` / `TextField` / `SelectField` gained `aria-label={lbl}` —
their `<label>` had no `htmlFor`, so no field was reachable by its visible name.

## Migration for the brand hosts (paste-ready)

**Nothing breaks without these** — both hosts keep working, just brand-neutral.
Apply them to get the branded inspector/timeline back.

`meta` must be a module-level const, not an inline literal: `LayeredTimeline` is
`memo`ized and a fresh object each render would defeat it.

### Blast radius — WHICH files, and who applies them (read this first)

**`/toolkit:sync-template` does NOT carry this.** `video_toolkit/sync_template.py`
mirrors `templates/<t>/src/` → `projects/<p>/src/` and nothing else (`src =
template_dir / "src"`, `dst = proj / "src"`). `.editor/` sits *beside* `src/`, so
no `.editor/main.tsx` is ever copied, in either direction. **The migration below
is manual, per file.** (Vendored project editors have also drifted from their
template, so even a hypothetical `.editor`-aware sync would not be safe to
blanket-apply.)

Every file carrying an old, meta-less `LayeredInspector` / `LayeredTimeline` call
site — **14 in total**, not the 2 templates alone:

*PP repo (`/Users/xaralis/Workspace/progpce/video-toolkit`)* — 1 template + 11
vendored project editors, each `<path>/.editor/main.tsx`:

```
templates/campaign-reels
projects/pp-05-zastupitelsky-klub      projects/pp-plovarna-napojeni
projects/pp-cyklostezka-chrudimka      projects/pp-program-klima-reel
projects/pp-druzstevni-parkovani       projects/pp-program-mobilita-reel
projects/pp-mov-koalice                projects/pp-rezidentni-parkovani
projects/pp-namesti-republiky          projects/pp-ricni-sauna
projects/pp-paro-2026
```

*roost repo (`/Users/xaralis/Workspace/roost/video-toolkit`)* — 1 template + 1
project:

```
templates/roost-reels/.editor/main.tsx
projects/roost-reel-01/.editor/main.tsx
```

(plus whatever copies live under that repo's `.claude/worktrees/`.)

**Applying only the two template files leaves 12 project editors un-branded**
(humanized lane labels + deterministic colours, generic text/number fields) while
their template looks fixed. That is a degradation, not a breakage — every value
stays reachable — but it is silent, so decide it deliberately: either apply the
same edit to each project editor, or accept that finished/frozen projects keep
the neutral editor (which is the usual right call for a delivered reel).

Nothing here was applied — Phase 1 is core-only.

### roost — `templates/roost-reels/.editor/main.tsx`

Roost passes NO `accentSlots` today, so it loses its Gold/Rust/Red/Green accent
buttons until this lands. The palette goes on the **dedicated `accentSlots`
prop** — `EditorMeta` deliberately does not carry one (one source of truth, no
precedence rule). Add near the top:

```tsx
import { theme } from '../src/config/theme';
import type { EditorMeta } from '@video-toolkit/lib/editor/app/editor-meta';

// Roost's editor vocabulary — core knows the mechanisms, these are our values.
const editorMeta: EditorMeta = {
  effects: [
    { type: 'vintage', label: 'Vintage', defaults: { mode: 'film' },
      params: [{ prop: 'mode', label: 'Mode', options: ['film', 'vhs'] }] },
  ],
  videoProps: {
    outro: [
      { prop: 'style', label: 'Style', options: ['organic', 'fade', 'bloom', 'static', 'heartbeat'] },
      { prop: 'variant', label: 'Variant', options: ['sand-brown', 'white-black'] },
      // `type` is REQUIRED here: no `options` to type the field, and an outro
      // that doesn't carry the key yet would otherwise commit the string "0.5".
      { prop: 'logoDelaySec', label: 'Logo delay (s)', type: 'number' },
    ],
  },
};
```

Inspector — before:

```tsx
        <LayeredInspector
          reel={reel}
          selectedId={selectedId}
          onChange={setReel}
          onSeek={(f) => playerRef.current?.seekTo(f)}
          fps={fps}
        />
```

after:

```tsx
        <LayeredInspector
          reel={reel}
          selectedId={selectedId}
          onChange={setReel}
          onSeek={(f) => playerRef.current?.seekTo(f)}
          fps={fps}
          accentSlots={theme.accentSlots}
          meta={editorMeta}
        />
```

Timeline — before:

```tsx
              savedReel={savedReel}
              guidesMs={reel?.meta.guidesMs}
            />
```

after:

```tsx
              savedReel={savedReel}
              guidesMs={reel?.meta.guidesMs}
              meta={editorMeta}
            />
```

### PP campaign — `templates/campaign-reels/.editor/main.tsx`

Campaign already passes `accentSlots={brandTheme.accentSlots}`, so its accent
toolbar is unaffected. Its outro is parameterless (no `props`) and it uses no
brand clip effects, so it only needs its overlay labels/colours back. Add near
the top:

```tsx
import type { EditorMeta } from '@video-toolkit/lib/editor/app/editor-meta';

// Campaign's timeline vocabulary. Without it every overlay kind still gets a
// humanized label and a deterministic colour — these are just the tuned ones.
const editorMeta: EditorMeta = {
  overlayLabels: {
    text: 'Text', 'quote-pull': 'Text', chevron: 'Chevron', title: 'Title',
    'stat-callout': 'Stat', 'update-badge': 'Badge', 'source-tag': 'Source',
    'party-logos': 'Logos',
  },
  laneColors: {
    'overlay-title': '#a5432f', 'overlay-text': '#9a7d1f',
    'overlay-quote-pull': '#9a7d1f', 'overlay-stat-callout': '#2f7f9a',
    'overlay-update-badge': '#9a2f63', 'overlay-source-tag': '#5a5c64',
    'overlay-chevron': '#7a8f1f',
  },
};
```

Timeline — before:

```tsx
              onZoom={(dir) => zoomBy(dir > 0 ? 1.15 : 1 / 1.15)}
              savedReel={savedReel}
            />
```

after:

```tsx
              onZoom={(dir) => zoomBy(dir > 0 ? 1.15 : 1 / 1.15)}
              savedReel={savedReel}
              meta={editorMeta}
            />
```

Inspector — before:

```tsx
          accentSlots={brandTheme.accentSlots}
        />
```

after:

```tsx
          accentSlots={brandTheme.accentSlots}
          meta={editorMeta}
        />
```

## Acceptance grep

Production code (`.ts` / `.tsx` / `.css`, tests excluded):

```
$ grep -rinE 'lime|teal|sand-brown|organic|heartbeat|roost|progresivn|quote-pull|stat-callout|chevron' \
    lib/editor --exclude-dir=node_modules --include='*.tsx' --include='*.ts' --include='*.css' | grep -v '\.test\.'
lib/editor/app/Collapsible.tsx:4:// disclosure chevron + title + an optional right-aligned slot (e.g. a remove
```

**The single remaining hit is not a brand value** — "disclosure chevron" is the
UI-affordance noun for the ▸ triangle in the generic `Collapsible`, an unrelated
homonym of campaign's `chevron` overlay kind. Left as is.

The `.lime` / `.teal` classes the brief mentions in `AccentEditor.module.css`
were already gone before this task; that file needed no change.

### What I could not remove, and why

- **Test fixtures.** The grep matches ~120 lines across `lib/editor/**/*.test.ts(x)`
  (`accent.test.ts`, `accent-runs.test.ts`, `derive-layered*.test.ts`,
  `default-props-writer.test.ts`, `derive-montage.test.ts`, …). These are *test
  data* standing in for a brand's input — exactly what a core test of a
  brand-agnostic mechanism needs. I did de-brand the fixtures of the files this
  task touched (`AccentEditor.test.tsx` now uses a neutral `primary`/`secondary`
  palette; the new inspector/timeline tests name roost's values only where the
  point is that core does **not** offer them). Bulk-renaming the rest would be
  churn with no behaviour claim behind it.
- **`lib/transcripts/accent-parser.ts` `applyBrandEndpoint`** still defaults to
  `'teal'` for back-compat on a one-arg call, and
  `lib/reel-config-base/derive-montage.ts` still names `vintage` in its config
  type. Both are outside `lib/editor` and outside this task (Task 5 / Phase 3
  territory) — flagging, not touching.
- **The media-path conventions** in `LayeredTimeline.tsx:25-32` (`/recordings/`,
  `/broll/`) — deliberately untouched per the brief; Phase 3's
  `resolveMediaSource` owns them.

## Verification

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run
 Test Files  46 passed (46)
      Tests  478 passed (478)
```

Baseline 45 files / 453 tests → +1 file (`app/editor-meta.test.ts`), +25 tests,
0 failures. No coverage lost: the 3 rewritten `AccentEditor` cases are still
asserted, on a supplied palette instead of a hardcoded default.

```
$ npx tsc --noEmit 2>&1 | grep -c "error TS"
34
```

Unchanged from the 34 pre-existing baseline errors. **Correction to an earlier
draft of this report: they are not all missing-React/JSX noise.** 30 are (`Cannot
find module 'react'` / `JSX.IntrinsicElements` — core installs no react/remotion
types); the other **4 are genuine pre-existing type errors**, none of them this
task's and none of them fixed here:

```
app/LayeredInspector.tsx(635,51)  TS2339  Property 'hide' does not exist on type {kind?,text?,lines?,reveal?,fontSize?}
app/LayeredInspector.tsx(639,54)  TS2339  ditto
src/derive-layered.test.ts(277,29)         TS2345  literal not assignable to CutConfig
../theming/generic/GenericWatermark.tsx(33,9) TS2739 '{}' missing left/right/top/bottom
```

The count and the "no new errors" claim stand; only the gloss was wrong. The two
`hide` ones are a real gap — the overlay `content` type does not declare `hide`
though the inspector edits it — and belong on the Phase 3 list.

The pure/JSX split holds: `editor-meta.ts` is pure TS with no JSX and no Remotion
import; its JSX consumers (`LayeredInspector`, `LayeredTimeline`, `AccentEditor`)
were already on the app side.

### Test-design note

The four new `LayeredTimeline` assertions run against the now-exported pure
helpers `colorFor` / `timelineLabel`, not the rendered DOM: xzdarcy virtualizes
its rows, so under jsdom (zero measured height) **no action block ever mounts** —
a DOM-level assertion there can only ever pass vacuously.

---

## Review follow-up pass

Six review findings on the commit above, all fixed in core. Rendering an existing
baked literal is unchanged; only editor-side authoring behaviour and lane colours
move.

### 1. `ParamField.type` — a declared field can now say what it holds

`lib/editor/app/editor-meta.ts` + `LayeredInspector.tsx` (`ParamFields.renderOne`).

**The bug.** A `ParamField` with no `options` was typed *only* by the value the
item currently holds. So a field that is declared but **absent from the item's
bag** had nothing to be typed from and fell through to `TextField`, whose
`onCommit` writes `e.target.value` — a string. Concretely: roost declares
`{ prop: 'logoDelaySec', label: 'Logo delay (s)' }`, an outro that doesn't carry
the key yet, user types `0.5` → `props.logoDelaySec === "0.5"`. `layered-schema.ts:58`
is `z.record(z.string(), z.unknown())` so it validates, and the renderer coerces,
so nothing visibly breaks — but the saved config is type-dirty, and the field only
turns into a number input after a reload re-types it from its (now string) value.

**The fix.** `ParamField` gains `type?: 'number' | 'string' | 'boolean'`. Precedence
in `renderOne` is `options` → `type` → `typeof val`. Same tier of descriptor as the
existing `options` — deliberately NOT the Phase 3 registry redesign (no Zod param
schemas, no self-rendering inspector).

Four new tests in `LayeredInspector.test.tsx` (`declared param type (absent key)`),
the load-bearing one being: declared-number + `props: {}` + typing `0.5` commits
`0.5` as a **number**. Plus the boolean case, and that a declared type doesn't
break a value the item already carries.

Brands must add `type: 'number'` to `logoDelaySec` — reflected in the migration
snippet above.

### 2. `stableColor` collided perceptually

`editor-meta.ts`. The old body was `hue = hash % 360` at a fixed S 42% / L 34%,
over a `*31` accumulator with almost no low-bit mixing. Across the ~11 lane kinds
the brands actually use, that put `overlay-chevron` (350°) and `overlay-lottie`
(356°) **6° apart**, and `overlay-update-badge` (236°) / `overlay-text` (250°)
14° apart — indistinguishable blocks.

Now: murmur3 `fmix32` avalanche on the hash, then hue = `m % 360` plus **two
further axes** from independent bits — saturation ∈ {34, 42, 50} and lightness ∈
{28, 36, 44, 52}. Near-hue neighbours separate by weight instead of reading as
one colour.

The old test asserted only `a !== b`, which passes vacuously on a 6° gap. Replaced
with a **minimum-separation** assertion over 16 real lane kinds, under a weighted
metric (`Δhue + 4·Δlightness + 2·Δsaturation ≥ 24`); worst observed pair is 26.

Existing lane colours therefore change — that is the point; `meta.laneColors` and
`CORE_LANE_COLOR` still win over the fallback, so nothing a brand pinned moves.

### 3. `EditorMeta.accentSlots` removed

It duplicated `LayeredInspector`'s dedicated `accentSlots` prop, which meant two
sources of truth plus a precedence rule (`accentSlots ?? meta?.accentSlots`) for
one value. Gone from the interface; hosts pass the dedicated prop. The `AccentSlot`
import in `editor-meta.ts` went with it, leaving that module free of any palette
dependency.

### 4. Memoization warning moved to where an integrator reads it

The "module-level const, not an inline literal" advice existed only in this report.
It is now in `LayeredTimeline`'s own JSDoc on the `meta` prop, naming the reason:
`memo` + shallow compare on a component re-rendered every playhead frame.

### 5. `accent.ts` regex aligned with the parser

`ACCENT_RE` used `([^}]*)` where `lib/transcripts/accent-parser.ts:52` uses
`([^}]+)`, despite a comment claiming they match. Divergence on the empty phrase:
`{gold:}` was **stripped** from a timeline block label but the parser leaves it as
plain text, so it **renders literally on screen**. Now `([^}]+)` in both.

### 6. tsc gloss corrected

See the corrected Verification block above: 34 baseline errors, of which 4 are
genuine type errors rather than missing-React/JSX noise. Count and "no new errors"
were and remain correct.

### Deferred to Phase 3 (deliberately not touched)

- **`lib/transcripts/accent-parser.ts:42`** — `applyBrandEndpoint`'s `'teal'`
  default on a one-arg call. Genuine back-compat: closing it correctly requires
  the brand repo to pass its own endpoint key **first**, so core cannot go first
  without breaking a caller. Phase 3, after the brand-side edit.
- **`LayeredTimeline.tsx:25-32`** media-path conventions (`/recordings/`,
  `/broll/`) — `resolveMediaSource` owns them.
- **`LayeredInspector.tsx:635,639`** — overlay `content` type lacks `hide` though
  the inspector edits it (2 of the 4 genuine baseline tsc errors).

### Verification

```
$ cd lib/editor && npx vitest run
 Test Files  46 passed (46)
      Tests  483 passed (483)

$ npx tsc --noEmit 2>&1 | grep -c "error TS"
34
```

478 → 483 tests (+1 stableColor separation, +4 declared-param-type), same 46
files, 34 tsc errors unchanged. Core-only: neither brand repo was touched.
