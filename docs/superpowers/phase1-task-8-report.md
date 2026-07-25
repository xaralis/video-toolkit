# Task 8 report — replace hello-world, retire the legacy theming system

(Phase 1 subtract, branch `refactor/phase1-subtract`. This file previously held an unrelated
`LayeredRoostReel` report from an earlier plan; overwritten per the task brief.)

Base `9f3194d`, one commit: **`8558873`**.

## 1. The new example: `examples/layered-minimal`

Written fresh (not a port of hello-world) against the CURRENT contract.

### What it demonstrates

- A **`CompositionTheme`** with brand-owned **accent slots** (`accent`, `cool` — count and keys
  are the brand's), a background, one custom text renderer, and a `renderBrandTrack` hook.
- A **`LayeredReel` literal inline in `defaultProps`** — the convention real projects follow,
  because Studio and the toolkit editor read that literal out of the file and write edits back
  into it in place.
- A **wrapper component** (`MinimalReel.tsx`) that binds the theme. This is the load-bearing
  lesson my first draft got wrong: `defaultProps` must stay JSON-serializable, so a theme passed
  through `defaultProps` is silently dropped at render (verified — the first render showed no
  watermark and no accent colour). Theme in code, data in props.
- **Two `photo` video items** rendered by core's generic `SegmentMedia` (no brand video renderer
  registered) with `ken-burns` effects — footage kinds work with zero brand code.
- **A real at-the-cut transition**: `wipe`, declared once on the item LEAVING the cut, its colour
  named by **accent-slot key** (`color: 'accent'`), never a hex.
- **Two overlay items** with `{accent:…}` markup, `reveal`/`hide`, `lower-left` placement, and
  their own independent absolute windows.
- **A brand-track watermark** via core's `GenericWatermark`.
- `remotion.config.ts` carries the `resolve.modules` line `lib/render/README.md` requires, with a
  comment explaining why every consuming project needs it.

### Files

```
examples/layered-minimal/
├── README.md                  # what it teaches + the one known rough edge
├── package.json               # its own Remotion 4.0.425 deps (core has none)
├── package-lock.json
├── remotion.config.ts         # @video-toolkit/lib alias + resolve.modules
├── tsconfig.json              # paths: @video-toolkit/lib/* → ../../lib/*
├── public/photos/dawn.jpg     # generated placeholders (ffmpeg gradients), ~28 KB each
├── public/photos/dusk.jpg
├── public/brand/logo.png      # 1.8 KB placeholder mark
└── src/
    ├── index.ts               # registerRoot
    ├── Root.tsx               # <Composition> + the reel literal
    ├── MinimalReel.tsx        # binds the theme
    └── theme.tsx              # the CompositionTheme + BrandText renderer
```

### Proof it renders

From `examples/layered-minimal/` after `npm install`:

```
$ npx remotion render src/index.ts MinimalReel out/reel.mp4
…
Rendered 180/180
Encoded 180/180
+                    out/reel.mp4 1.1 MB

$ npx remotion still src/index.ts MinimalReel out/frame-30.png --frame=30
Rendered 1/1
+                    out/frame-30.png

$ npx remotion still src/index.ts MinimalReel out/frame-mid.png --frame=95
Rendered 1/1
+                    out/frame-mid.png
```

Both stills inspected visually:
- **frame 30** — dawn photo, watermark top-right, overlay text with `Independent` rendered in the
  accent-slot colour `#f2b544` (accent-slot resolution proven end to end).
- **frame 95** (mid-cut; the wipe spans ≈ frames 80–100) — the accent-coloured wipe band sweeping
  across with the dusk photo behind it: a REAL cross-item transition with borrowed handles, not a
  degraded fade.

`out/` and `node_modules/` are gitignored (`examples/*/out/`, `examples/*/node_modules/`).

### Known rough edge (documented in the example's README)

`npx tsc --noEmit` typechecks `src/` **clean**, but reports unresolved `react`/`remotion` for the
files under `../../lib`. Structural to the alias approach and **identical in the brand repos**
(verified: `progpce/video-toolkit/node_modules` contains only `zod`, so `toolkit/lib/**` has no
resolvable `react`/`remotion` there either). Rendering resolves them via webpack
`resolve.modules`. I deliberately did not paper over it with `paths` mappings into package
internals — that would teach a worse pattern in a file people copy.

## 2. Deleted — each confirmed to have no live importer

Grep across all `*.ts`/`*.tsx`/`*.md`/`*.json` (excluding `node_modules` and `.claude` worktrees)
before deleting; the only code importers were inside `examples/hello-world` and `lib/` itself.

| Deleted | Importer(s) before deletion |
|---|---|
| `examples/hello-world/` (23 files) | — |
| `lib/theme/` (`ThemeProvider.tsx`, `index.ts`, `types.ts`) | hello-world + the five components below |
| `lib/brand.ts` | hello-world; one doc mention (`docs/creating-brands.md`, rewritten) |
| `lib/generate-brand-ts.ts` | none — no code, no script, no Python |
| `lib/components/AnimatedBackground.tsx` | `lib/components/index.ts`, hello-world |
| `lib/components/Label.tsx` | `index.ts`, `SplitScreen.tsx`, hello-world |
| `lib/components/LogoWatermark.tsx` | `index.ts`, hello-world |
| `lib/components/NarratorPiP.tsx` | `index.ts`, hello-world |
| `lib/components/SplitScreen.tsx` | `index.ts`, hello-world |

Post-deletion grep for `AnimatedBackground|LogoWatermark|NarratorPiP|SplitScreen|useTheme|ThemeProvider|lib/brand`
over all TS/TSX: **no hits**.

`lib/components/index.ts` rewritten: the five exports dropped, the rest unchanged, plus a header
note that these are stand-alone primitives and that `TextOverlay.tsx` is deliberately NOT
re-exported (it is imported by path; its move to `lib/theming` is Phase 3).

**Kept at their current paths, as required:** `lib/components/TextOverlay.tsx` (roost imports
`@video-toolkit/lib/components/TextOverlay` — untouched, no brand migration forced),
`LottieAnimation`, `FilmGrain`, `Vignette`.

## 3. Docs

- **`docs/creating-templates.md` — rewritten.** It taught the superseded shape (`useTheme`,
  hand-driven `TransitionSeries`, per-slide components). It now teaches: the reel-data /
  theme-code split and why the wrapper component exists; the template file layout; the
  `resolve.modules` requirement; how to write a `CompositionTheme` (accent slots, `overlays`,
  `video`, `overlayItems` routing, `renderBrandTrack`); a "what core already does for you" table
  so templates stop re-implementing the assembly; the once-per-cut transition rule and how to add
  a kind to the catalog; frame-based animation + the `<OffthreadVideo>` rule; and a 6-step
  "starting a new template" that ends in *render*, not typecheck.
- `README.md` — quick-render pointer, examples list, and the `lib/` tree (render / theming /
  reel-config-base instead of `theme/`).
- `docs/getting-started.md` — first-video walkthrough points at the new example.
- `docs/creating-brands.md` — the `loadBrand` snippet (dead import) replaced with importing
  `brand.json` directly, plus the accent-slot explanation.
- `examples/README.md` — table row + copy instructions.
- `CLAUDE.md` — example name in the tree; the `lib/components` import line no longer names
  deleted components.
- `skills/remotion/SKILL.md` — component table pruned to what exists, with a pointer to
  `lib/theming` / `lib/render` as the actual rendering contract.

## 4. Registry (`_internal/toolkit-registry.json`)

- `components`: removed `AnimatedBackground`, `Label`, `LogoWatermark`, `SplitScreen`,
  `NarratorPiP`; added a `_note` recording that they retired with `lib/theme/` and pointing at
  `lib/theming` / `lib/render` for the real contract. The remaining 7 entries are untouched.
- `examples`: `hello-world` → `layered-minimal`.
- `transitions`: re-checked (not assumed) against `lib/reel-config-base/transition-schema.ts` and
  `lib/transitions/presentations/` — **all 12 catalog kinds present, every entry carries a
  `kind`, every path resolves, statuses consistent**; earlier tasks' work holds, no status change
  needed. One fix: `wipe`'s description still read "in a brand color (lime/teal/coal)" — a brand
  vocabulary this phase evicted — now "Directional sweep in a brand accent-slot colour (the key
  resolves via the theme's accentSlots)".

## 5. Verification

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx vitest run
 Test Files  46 passed (46)
      Tests  483 passed (483)
   Duration  4.33s
```

Baseline 46 files / 483 tests — **unchanged, green**.

```
$ cd /Users/xaralis/Workspace/progpce/core/lib/editor && npx tsc --noEmit | grep -c "error TS"
34
```

**34 — identical to baseline; none added.** The deletions don't lower it: `lib/editor`'s tsconfig
includes only `src`, `app` and `../theming`, so hello-world and `lib/components` were never part
of that program.

Example typecheck: `npx tsc --noEmit` in `examples/layered-minimal` reports **zero** errors for
`src/**` (see the rough edge above for the `../../lib` ones).

No test was added: this task is deletion plus an example whose gate is a real render, and the
behaviour it exercises (`computeVideoLayout`, `overlayEnvelope`, `transition-record`,
`music-envelope`) is already unit-pinned in `lib/editor`.

## 6. Brand repos

**Not touched.** No brand migration is forced: nothing deleted here was imported by either brand
repo (`TextOverlay.tsx`, the one shared import, deliberately stayed put), so there is no
before/after snippet to record.

## 7. Notes for later tasks

- **CORRECTION (follow-up pass).** The claim that the phase gate
  `grep -riE 'lime|teal|coal|roost|progresivn|sand-brown' lib/` hits only
  `lib/transcripts/accent-parser.*` was wrong. The gate also hits, and mostly still does:
  `fade-coal` (a real transition KIND name — `lib/reel-config-base/transition-schema.ts`,
  `lib/render/at-cut-transitions.tsx`, editor tests, `timeline/layered-adapter.*`), brand
  names in explanatory comments (`lib/theming/segment/SegmentMedia.tsx`,
  `lib/transitions/presentations/burn.tsx`), Czech/`{lime:…}` fixtures throughout
  `lib/editor/app/*.test.ts` and `lib/editor/src/derive-*.test.ts`, and `COALESCE_MS` noise
  in `lib/editor/app/useHistory.ts`. The follow-up pass closed only `accent-parser.*` and
  `lib/components/TextOverlay.tsx`; the rest is either a legitimate kind name, a comment, or
  test fixtures, and wants its own deliberate pass.
- `_internal/ROADMAP.md`'s "Current inventory" table (~line 218) names deleted components and
  examples, but was ALREADY badly stale before this task (it lists templates
  `sprint-review`/`product-demo`, brand `digital-samba`, 6 transitions). Left alone rather than
  half-refreshed; it wants one deliberate pass.
- `_internal/BACKLOG.md` still has two items about `NarratorPiP`, now deleted. Left as historical
  log.

---

# Task 8 — review-findings follow-up pass

## User directive: the last brand value leaves core

`lib/transcripts/accent-parser.ts` no longer injects any accent key.

```ts
// before
export function applyBrandEndpoint(text: string, ...rest: [endpointKey?: string]): string {
  const endpointKey = rest.length === 0 ? 'teal' : rest[0];   // PP's slot, silently
// after
export function applyBrandEndpoint(text: string, endpointKey: string | undefined): string {
```

`endpointKey` is now a REQUIRED positional parameter with no default; passing `undefined`/`''`
disables the rule. The doc comments (the `AccentColor` type note and the function's) were
rewritten to name no brand, and their examples use a neutral `sig`/`gold` key set. The Czech
`{lime:…}`/`{teal:…}` fixtures in `accent-parser.test.ts` and the editor's mirror
(`lib/editor/app/accent-parser-brand-keys.test.ts`) were de-branded too, so the phase gate is
clean for `accent-parser.*`.

The single caller, `lib/components/TextOverlay.tsx`, threads the key from the brand:
its `applyEndpoint?: boolean` prop is replaced by `endpointKey?: string` (absent = rule off),
and `TextRenderCtx`'s doc comment no longer says `'lime' | 'teal'`. Two new tests in
`lib/editor/src/text-overlay-base.test.tsx` pin both directions of the threading.

### Brand migration this forces (NOT applied — Phase 1 is core-only)

One call site in each roost copy — `templates/roost-reels/src/overlays/TextOverlay.tsx` and the
vendored `projects/roost-reel-01/src/overlays/TextOverlay.tsx`, both at ~line 43. Roost disables
the rule, which is now the default, so the fix is a deletion:

```tsx
      durationMs={durationMs}
-     applyEndpoint={false}
      palette={palette}
```

A brand that WANTS the endpoint rule passes its own key instead, e.g. `endpointKey="teal"` for
PP. No other brand file calls `applyBrandEndpoint` or `TextOverlayBase` (PP's campaign template
does not use either; `projects/pp-05-*/src/lib/accent-parser.ts` is that project's own vendored
copy, unaffected). Behaviour is unchanged for both brands.

## Important 1 — the example is now editor-readable

`examples/layered-minimal/src/Root.tsx` wrote `totalDurationMs: TOTAL_MS` and `endMs: TOTAL_MS`,
identifiers that `readDefaultProps` rejects (`unsupported expression "TOTAL_MS"`) — the one reel
literal in the repo the editor could not open, in the file that teaches why it must be. Both are
now the inline literal `6000`, with a comment saying why every value here must be a literal.

New regression test `lib/editor/src/example-default-props.test.ts` runs the real
`readDefaultProps` against the shipped file (located by walking up from the runner's cwd, since
`import.meta.url` is not a `file:` URL under jsdom) and asserts a lossless JSON round-trip.

## Important 2 — duration derived from the data

The composition now uses the same `calculateMetadata` pattern as both brand templates:

```tsx
calculateMetadata={({ props }: { props: { reel: { meta: { totalDurationMs: number } } } }) => ({
  durationInFrames: Math.max(60, Math.round((props.reel.meta.totalDurationMs / 1000) * FPS)),
})}
durationInFrames={180}   // placeholder Remotion requires; calculateMetadata overrides it
```

`TOTAL_MS` is gone. The misleading comment ("Derived from the reel's own timeline below") is
replaced by one that describes what the code actually does and points at core's
`computeTotalDurationMs`/`withTotalDuration` (`lib/reel-config-base/total-duration.ts`), which
were previously unmentioned. Render verified: 180 frames, 6.06 s MP4.

## Minor fixes

- `examples/README.md` + `docs/creating-templates.md`: the copy instructions now repoint BOTH
  paths into `lib/` — `tsconfig.json` and `remotion.config.ts`'s `process.cwd()` resolve — with
  the note that webpack does not read tsconfig paths.
- `CLAUDE.md` lib/ tree line: `theme` → `theming, render`.
- The example's music layer keeps its envelope but the comment (and the README's "what the render
  proves" list) now says plainly that the example renders SILENT, and how to add a real bed.
- `_internal/toolkit-registry.json`: the `_note` pseudo-entries were hoisted out of the
  `components` AND `transitions` maps to sibling `componentsNote` / `transitionsNote` keys, so
  iterating either map yields only real entries (verified: every component entry has a `path`).
- Section 7's phase-gate note corrected in place (see above).

## Verification

- `cd lib/editor && npx vitest run` → **47 files / 485 tests, all passing** (baseline 46/483;
  +1 file for the example reader test, net +2 tests).
- `cd lib/editor && npx tsc --noEmit` → **34 errors**, identical to baseline (all pre-existing
  `react`/`remotion` resolution + `LayeredInspector` `hide` errors).
- `npx remotion still … --frame=45` and `npx remotion render` in `examples/layered-minimal`:
  both succeed; the MP4 is 180 frames / 6.06 s, derived through `calculateMetadata`.
- Brand repos untouched (`git status` clean of them; roost's uncommitted work left alone).
