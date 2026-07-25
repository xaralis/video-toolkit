# Handoff — core architecture rework

**Last updated:** 2026-07-25, after Phase 1 merged to `main` (`73bd891`).

This file is the durable record across sessions. The working ledger
(`.superpowers/sdd/progress.md`) is **gitignored** and will not survive a
`git clean` — anything that must outlive a session belongs here instead.

---

## The programme

The toolkit is an AI-native video framework: the AI does the heavy lifting (cut,
theming, media handling, rendering) and the editor exists only for final tuning.
For that to hold, **core must own every reusable mechanism**, and a brand repo
must contribute only theming plus genuinely exotic one-off components.

The full audit and phase plan live at
`~/.claude/plans/vyvijime-tu-framework-kter-luminous-salamander.md`. Phases:

| Phase | What | Status |
|---|---|---|
| 0 | Unblock (fast-forward core, pin zod) | ✅ core done; **zod pin still open** |
| 1 | Subtract — remove drift surfaces | ✅ merged `73bd891` |
| 2 | Core owns the brand shell (editor host, composition wiring, config, fonts) | ⬜ next |
| 3 | Close the extension contract (registries, effects, generators, captions) | ⬜ |
| 4 | Tighten the model (real schemas, pre-save validation) | ⬜ |
| 5 | NLE alignment (effect stack, music track, transition entities, media pool) | ⬜ |
| 6 | `brand.json` becomes the theming contract | ⬜ |

---

## Phase 1 outcome

18 commits, 116 files, **+4197 / −6998 (net −2801)**. 47 test files / **485 tests**
green. `tsc --noEmit` holds at its 34-error pre-existing baseline — verified by
diffing error *sets* against a worktree at the branch point, not by comparing counts.

What landed: the retired segment-era editor and the entire legacy theming system
deleted; four definitions of a transition collapsed into one `CATALOG` in
`lib/reel-config-base/transition-schema.ts`; six previously-unreachable transitions
wired in; every brand constant evicted from core's schema, derivation and editor UI;
duplicated `AccentColor`/`Crop` declarations collapsed; `examples/hello-world`
replaced by `examples/layered-minimal`, which renders and is pinned by a test that
runs the real `readDefaultProps` against it.

Two live bugs fixed: montage transitions were silently dropped at every boundary,
and editing an array in the editor destroyed authored comments and `as const`.

---

## ⚠️ Pending brand migrations — apply when the submodule pin bumps

Phase 1 was deliberately **core-only**. Five migrations are queued. Three are caught
by `tsc` and announce themselves; **two are silent**. Paste-ready diffs are in the
per-task reports under `.superpowers/sdd/task-{3,5,6,8}-report.md` — copy them
somewhere durable before cleaning that directory.

1. **roost — `withTransitionOverrides`** *(tsc-caught)*
   `projects/roost-reel-01/src/LayeredRoostReel.tsx:110` spreads `Transition | undefined`,
   which yields `kind?:` and no longer satisfies the tightened `VideoItem['transitionOut']`.
   Core now exports `withTransitionOverrides()` for exactly this. One file — the template
   is a shim with no spread. Rendering is unaffected; nothing parses at render time.

2. **PP — union mirror** *(tsc-caught)*
   `projects/pp-05-zastupitelsky-klub/src/config/types.ts:18` hand-mirrors the transition
   union and needs `color?: string`. Only that project; the template has no such mirror.

3. **roost — drop `applyEndpoint`** *(tsc-caught)*
   `templates/roost-reels/src/overlays/TextOverlay.tsx:43` and its vendored copy in
   `projects/roost-reel-01/`. **This is a PURE DELETION of `applyEndpoint={false}`.**
   Do **not** pass an `endpointKey`: roost deliberately has the endpoint rule off, and
   absent `endpointKey` now means off. Passing one would switch on an accent rule roost
   disabled and change its rendered captions. PP needs nothing.

4. **All editor hosts — pass `meta`** *(SILENT — no compile error)*
   **14 call sites**: 12 PP (`templates/campaign-reels/.editor` + 11 `projects/*/.editor`)
   and 2 roost. `video_toolkit/sync_template.py` mirrors only `templates/<t>/src → projects/<p>/src`,
   so it does **not** carry `.editor/` — this migration is manual, per file.
   Un-migrated hosts keep working but lose brand lane colours and labels. Roost also loses
   its accent buttons — though note it was previously being shown PP's `lime`/`teal`, so
   that is a fix, not a regression.

5. **PP web-program-intro — pass the palette** *(SILENT, latent)*
   `projects/pp-program-{klima,obvody,verejny-prostor}/src/WebProgramIntro.tsx:26` calls
   `presentationFor(t, { width, height })` with no palette, so a `wipe` carrying an accent
   key would resolve to `#000` instead of the brand colour. Latent only — there is currently
   zero `kind: 'wipe'` in any project. Pass `palette: theme.accentSlots`.
   Related: the old wipe presentation defaulted an unset colour to **lime**; it is now `#000`.
   Intended (core must not default to a brand colour), affects nothing today.

---

## Carried into later phases

**Phase 2 is next.** Its scope, from the plan: a core editor host
(`createEditorHost` + `createEditorViteConfig` + the dev-server plugin),
`layeredCompositionProps` owning `calculateMetadata` and the duration floor,
build-config presets, and `loadBrandFonts`. Feasibility was established during the
audit: core already ships `EditorShell`/`LayeredTimeline`/`LayeredInspector` as raw
`.tsx` consumed through the `@video-toolkit/lib` alias and bundled by the brand's own
Vite, so a host in core is one more file on a proven path — core never needs `remotion`
installed. The two hosts diverge by **63 diff lines out of 1489**, all configuration.
Note two files cannot fully leave the brand repo: `vite.config.mts` (it *creates* the
alias, so it can't be imported through it — shrinks to ~8 lines) and `index.html`.

**Fix early in Phase 2 or 3, root cause of migration 4:**
`video_toolkit/sync_template.py:136,141` hardcodes the `src`-only mirror. Teaching it to
carry `.editor/` collapses a 14-file manual migration to two template edits plus a sync,
and stops the next editor-host change hitting the same wall.

**Phase 0 leftover:** zod is pinned `^4.3.6` in roost and `^3.22.0` in both PP templates,
against the same core schema module. Latent break; core should pin it.

**Deferred, judged genuinely fine to carry:**
- The `AccentKey` marker in `transition-schema.ts` patches zod's `describe()` so clones stay
  marked. Tested and correct for its one use, but `.min()`, `.nullable()`, `.readonly()` and
  `.catch()` chains silently lose the mark — and the failure mode is a field with *no editor
  control at all*, with no warning. Replace with an `_def` mark (every zod-3 clone path spreads
  `_def`) or a declarative `ACCENT_FIELDS` set beside the existing `PROP_LABELS`.
- Test fixtures still speak PP's `{lime:…}`/`{teal:…}` vocabulary. Mechanical rename — worth
  doing because that very vocabulary is what hid the `ACCENT_RE` leak Phase 1 found in
  production code.
- `LayeredTimeline.tsx:25-32` media-path conventions (`/recordings/`, `/broll/`) → Phase 3's
  `resolveMediaSource`. Deliberately not half-solved in Phase 1.
- From the writer rework: inline arrays reflow on insert; `lcsAnchors` allocates n×m; one
  asymmetric filter typing. All bounded, reels are tens of items.
- `fade-coal` is a brand-derived **kind name**. Renaming touches every baked `Root.tsx`, so it
  is deliberately kept — see the NAME NOTE on its catalog entry.

**Open risk, needs a brand repo to close:** 11 transition kinds have **no at-cut visual
confirmation** — the six newly wired ones plus `wipe`, `glitch`, `whip-pan`, `zoom-through`,
`gradient-wipe`, which were previously marked verified only by inference from the
`TransitionSeries` path. Only `burn` is at-cut confirmed. At-cut composites differently
(handle-borrowed overlap, not a shrinking sequence), so a presentation that looks right in
`showcase/transitions` can still misbehave at a cut. Specific suspects: `checkerboard`'s
direction-branching cell clipping, `pixelate`'s opaque black root. Core cannot render (no
`remotion`), so this needs a render-parity pass in a brand repo. **Nothing that renders today
can regress** — every one of those kinds was unreachable before Phase 1.

---

## Working conventions established

- **Source of truth for a project's cut is the `defaultProps` literal in `src/Root.tsx`.**
  `reel.config.json` is a one-way authoring INPUT and is *expected* to diverge once the cut
  is hand-tuned. Never validate against it; never re-sync it over a tuned literal. A review
  reached a false conclusion this way during Phase 1.
- **Rendering an existing baked literal is frozen; derivation output is free to change.**
  Improving what `deriveLayered`/`deriveMontageLayered` emit is intended.
- **Signing is never a blocker.** If a commit fails on a 1Password error, re-commit with
  `--no-gpg-sign` immediately. (Also recorded in `~/.claude/CLAUDE.md`.)
- Core has no `remotion` installed, so anything importing it cannot be unit tested here.
  Keep the pure/JSX split documented in `lib/render/README.md`.
- The brand-leak gate needs its exclusions or it walks `node_modules` and is permanently red:
  `grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'`
