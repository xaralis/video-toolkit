# Reel Editor — Session Handoff / Continuation

Read this first to resume the reel-editor work in a fresh session. Everything below is durable
(committed) unless marked *(scratch)*.

## Current state (2026-07-21)

- **core** branch `feat/reel-editor-skeleton` (NOT merged, NOT pushed). Latest commits are docs
  (specs/plans); the last CODE commit is `ceb7106`.
- **video-toolkit** (brand repo) branch `feat/reel-editor-skeleton`, HEAD `1407663`. Its `toolkit/`
  submodule is locally checked out to core `ceb7106` (the last core CODE commit); the submodule
  pointer is intentionally **not committed**.
- **Commit signing is DISABLED** in both repos (`commit.gpgsign false`) so unattended commits don't
  hang on 1Password biometric. Re-enable with `git config commit.gpgsign true` when you want it back.
- **Node quirk:** the shell's default `node` is a stale v10; prepend the newest
  `~/.nvm/versions/node/v20*/bin` to PATH for any npm/vitest/tsc.
- Editor is vendored (uncommitted) into `projects/pp-program-klima-reel/.editor/` and
  `projects/pp-05-zastupitelsky-klub/.editor/` for browser demos.
- Stray untracked `lib/editor/src/layered-schema.test.ts` may exist — it's Plan-1 Task-1 scratch;
  the plan recreates it precisely, so delete it before executing Task 1.

## What is DONE — the reel editor (feature-complete, browser-verified, usable)

A non-technical browser reel editor (`npm run editor` in a campaign-reels project → localhost:3100),
built skeleton → CP1 → CP2 → CP3 + a UX pass, all browser-verified over REAL projects. Covers:
timeline transport (ruler/playhead/seek/scrub/play), select+seek, drag-trim with floor clamp,
Inspector (chevron/topic, audio, source picker, WYSIWYG accents, transitions, multi-clip), on-frame
focus dot, transition junction badges, unsaved-changes guard, and a surgical Prettier-clean Save that
preserves comments + `as const`. Core `lib/editor` suite was 209/209, `tsc` clean.

Reusable pieces that STAY in the redesign: `EditorShell`, `Inspector`, `AccentEditor`,
`TransitionPicker`, `FrameOverlay`, the surgical Save (`updateDefaultPropsSurgically` + format hook),
the template-hosted Vite architecture (`templates/campaign-reels/.editor/`).

The findings write-up (bugs caught, architecture decisions, landing steps) is in
[handoff/FINDINGS-reel-editor.md](handoff/FINDINGS-reel-editor.md).

## What is IN PROGRESS — the layered timeline redesign (new epic)

CP2/CP3 exposed that the model is **segment-centric / single-track**, but a real editor is
**multi-track / layered**. Approved redesign:

- **Spec:** [specs/2026-07-21-layered-timeline-model-design.md](specs/2026-07-21-layered-timeline-model-design.md)
  — track-native model (video / audio+music / overlays / brand layers), independent absolute-timed
  overlays, chevron as an overlay item, editable brand layers, audio = clip/broll audio items
  (independently slippable) + music base + per-clip `musicBoost` → **derived, visualized** envelope,
  timeline with **snapping (toggleable)** + slip + select-item→inspector. **Staged migration** via a
  derivation, **piloted on `pp-namesti-republiky`**, **"close" parity (not 1:1)**, branch latitude
  (temporary breakage OK on the branch). Decomposed into 3 sub-specs: (1) model+render+derivation+
  pilot, (2) multi-track UI, (3) audio subsystem.

- **Plan 1 (written, NOT executed):**
  [plans/2026-07-21-layered-model-schema-derivation.md](plans/2026-07-21-layered-model-schema-derivation.md)
  — the groundable foundation: T1 `LayeredReel` Zod schema (`lib/reel-config-base/layered-schema.ts`),
  T2 `deriveLayered(oldConfig)` (`lib/reel-config-base/derive-layered.ts`), T3 derive the real
  `pp-namesti-republiky` config (smoke). All TDD, tested from `lib/editor` via the `@video-toolkit/lib`
  alias. Complete code is in the plan.

## IMMEDIATE NEXT STEP

Execute **Plan 1** via `superpowers:subagent-driven-development` (user's default). Base commit for the
run: `c228576` (or current HEAD). After Plan 1 lands, write + execute the **next plan**: "layered
composition + pilot" — port `CampaignReel` to render from `LayeredReel` ("close" parity), render
`pp-namesti-republiky` from the derived model, and validate editing it. That plan must be authored
against the composition tree (`templates/campaign-reels/src/CampaignReel.tsx` + `src/layers/`,
`src/overlays/`, `src/segments/`), which was not yet explored.

## Working conventions (important)

- Core editor code lives in `core/lib/editor/`; the template Vite host + wiring in
  `video-toolkit/templates/campaign-reels/.editor/`. After any core commit the template consumes,
  **re-sync the submodule**: `cd video-toolkit/toolkit && git checkout -- . && git fetch
  <core-path> feat/reel-editor-skeleton && git checkout <new core sha>` (don't commit the pointer).
- Browser-verify editor changes over a REAL project (`pp-program-klima-reel` = 19 clip/broll+outro;
  `pp-05-zastupitelsky-klub` = has a multi-clip; `pp-namesti-republiky` = the redesign pilot).
- Durable progress ledger *(scratch, also copied here for safety)*:
  [handoff/progress.md](handoff/progress.md).

## Full spec/plan index (all committed on the branch)

Specs: `2026-07-20-reel-editor-design`, `2026-07-21-brand-driven-accents-design`,
`2026-07-21-layered-timeline-model-design`.
Plans: `2026-07-20-reel-editor-skeleton`, `…-save-spine`, `…-direct-manipulation`,
`2026-07-21-layered-model-schema-derivation`.
Memory (in `~/.claude/.../memory/`): `reel-editor-ui-english`, `brand-driven-accent-palette`.
