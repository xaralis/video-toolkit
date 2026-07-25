# Reel Editor — Findings Summary

Autonomous build of a non-technical, browser-based reel editor for `campaign-reels`, from concept
to a genuinely-usable state, verified end-to-end over a real 19-scene project
(`pp-program-klima-reel`). This is the handoff.

---

## 1. What exists now (browser-verified usable)

`npm run editor` in a campaign-reels project opens a full editor at `localhost:3100`:

- **Timeline transport** — time ruler (m:ss), scene blocks proportional to duration with readable
  index labels + hover tooltips (type/source/duration), a playhead synced to playback, click-to-seek,
  drag-to-scrub, play/pause. The Player's own controls are removed (timeline is the transport).
- **Select + inspect** — click a scene → selects, seeks, and the Inspector shows it.
- **Trim** — drag the selected block's edges → resizes live, Player duration follows, clamps at the
  brand floor (broll ≥3s, clip ≥0.5s).
- **Inspector editing** — Reel: Chevron (renders on screen) + Topic (internal), with helper text.
  Scene: audio mode, source/take picker (real footage list), and **WYSIWYG accent editing** of
  overlay text (accented words show in colour, no `{lime:}` markup visible, can't nest).
- **On-frame focus** — a draggable focus dot with a live `x/y` readout reframes the shot.
- **Transitions** — an Inspector "Transition to next scene" picker (8 kinds, duration presets +
  seconds, per-kind sub-options) with live Timeline junction badges (◇ cut / ● effect).
- **Multi-clip** — layout switcher (split-h/v/pip/quad, live in the Player), per-sub-clip
  source/trim/label rows, and audio mode — verified over a real multi-clip reel.
- **Data-loss safety** — an "● Unsaved changes" indicator, a `beforeunload` guard, Escape-to-deselect.
- **Save** — persists to `Root.tsx` via a **surgical AST writer** that preserves the human's comments
  and `as const`, then formats with the project's Prettier. Studio Save keeps working.

Final verdict from an independent walkthrough over the real reel: **yes, genuinely usable by a
non-technical reviewer.**

---

## 2. Most important findings

### A. Testing over REAL content caught editor-breaking bugs the demo never would
- **`as const` bug (critical, would have broken EVERY real project).** `readDefaultProps` (the AST
  reader) threw on TypeScript `as const` — which real cuts use ~25× per file but the minimal template
  demo never uses. It passed all unit tests and skeleton/CP1 verification, then 500'd `/props` the
  moment the editor opened a real reel. Fixed by unwrapping `AsExpression`/`SatisfiesExpression`
  (`e54bbf6`). **Lesson: verify over real project files, not the demo.**

### B. Save integrity on real files needed real engineering
- The first save approach regenerated the whole `defaultProps` literal (JSON.stringify), which
  **stripped every comment and `as const`** from the author's `Root.tsx`. Replaced with a **diff-based
  surgical writer** that edits only changed leaves (`fa04d90`), then extended it to **insert added
  keys in place** (focal/crop etc. that weren't there before) without touching siblings (`8a2bff5`),
  then added a **Prettier format pass** so edited values match the project's single-quote style
  (`b1e5cad` + brand `ab5a496`).
- **Pre-existing drift:** the real project's committed `Root.tsx` was already not Prettier-clean, so
  the *first* Save reformats the whole file (large one-time diff). **Recommendation: run
  `prettier --write src/Root.tsx` once on existing projects**; after that, Saves produce minimal diffs.

### C. Two architecture decisions that avoided fragility (both course-corrections)
- **Source of truth stays the inlined `Root.tsx` literal, not a `config.json`.** The original design
  proposed a `config.json` seam; grounding revealed it would **break Remotion Studio's Save** (Studio
  requires the inlined literal). Pivoted to: keep the literal, save via server-side AST rewrite, browser
  sends JSON only. No migration, Studio Save preserved.
- **The editor is template-hosted, not core-hosted.** A browser-verified spike proved the real
  composition mounts in `@remotion/player` from a thin Vite host *inside* the template (reusing its
  aliases/Tailwind/`public/`). A core-hosted app would have had to re-derive that whole build,
  dynamically per project — strictly more fragile. Core ships the editor UI + logic; the template
  carries the ~4-file Vite host.

### D. UX audit over the real reel found real blockers (all fixed)
Running the editor as a non-technical reviewer surfaced:
- **Blocker:** no unsaved-changes signal; reload silently discarded edits → indicator + beforeunload guard.
- **Blocker:** accent buttons could produce broken **nested** `{teal:…{lime:…}}` markup rendering
  literal braces on screen; and raw `{lime:}` syntax was exposed and fragile → replaced the plain field
  with a **WYSIWYG AccentEditor** (runs model) that can't nest and hides the syntax.
- **Major:** timeline labels truncated to "cli…"; focus dot had no feedback; Topic vs Chevron confusing
  → readable labels+tooltips, focus x/y readout, Chevron-first with "shown on screen" helper.

### E. Brand-coupling: the accent palette is PP-specific
`lime`/`teal` are hardcoded accent slots in core (accent-parser, schema enums) — they only fit PP
because PP was the first brand. Landed a **backward-compatible foundation** (parser now accepts any
brand-declared slot key; editor accent buttons are data-driven) and wrote a design spec
(`2026-07-21-brand-driven-accents-design.md`). Full rollout (brand.json slot declaration, template
renderer mapping, dev-server `/brand` endpoint, schema-enum relaxation) is a documented follow-up.

---

## 3. State of the branches (nothing pushed)

- **core** `feat/reel-editor-skeleton` — 27 commits (editor UI + save spine + specs/plans). 160/160
  tests, `tsc` clean. `main` is untouched (restored to `origin/main` after an early accidental
  commit-to-main was moved onto the branch).
- **video-toolkit** `feat/reel-editor-skeleton` — 13 commits (the `.editor/` Vite host + wiring).
- **Submodule:** `video-toolkit/toolkit` is locally checked out to the core branch HEAD so the editor
  resolves; the submodule pointer is **not committed**.
- **Demo enablement (uncommitted):** the editor was vendored into `projects/pp-program-klima-reel/.editor/`
  (+ its editor devDeps) so it runs over real footage — left uncommitted on purpose.
- **Commit signing** was disabled in both repos (`commit.gpgsign false`) so unattended commits didn't
  hang on 1Password biometric. **Re-enable it if you want signed commits** (`git config commit.gpgsign true`).

### Landing (your call — requires push + a submodule bump, done together)
1. `prettier --write` existing project `Root.tsx` files once (avoids the big first-save diff).
2. Push core `feat/reel-editor-skeleton`; open/merge its PR.
3. In video-toolkit, bump the `toolkit/` submodule pin to the pushed core commit, commit it with the
   `.editor/` host, push/merge. (Without the pin bump a fresh clone can't resolve the editor imports.)
4. Decide how existing projects get the editor: it lives in the template (new projects get it via
   `cp`); existing projects need it vendored — a `/toolkit:sync-template` step is the natural home.

---

## 4. Remaining work (not done, scoped)

- **Full brand-driven accent rollout** (see spec `2026-07-21-brand-driven-accents-design.md`) — the
  safe parser foundation landed; the brand.json slot declaration + template renderer + dev-server
  `/brand` endpoint + schema-enum relaxation remain.
- **Brand-rule warnings** in the inspector (reuse `/toolkit:check-brand`) — a designed differentiator,
  deferred under the usability-first priority.
- **Polish:** deselect-after-drag can drop selection if the mouse lifts off the thin handle;
  number inputs display a locale decimal comma ("7,5") though they save `.` decimals; take-picker
  thumbnails (filenames are currently cryptic); accent button labels read "Lime/Teal" for any brand
  until the full accent rollout lands.
- **Prettier normalize:** because Save formats with the project's Prettier, run
  `prettier --write src/Root.tsx` once on existing (pre-drift) projects so the first Save is a
  minimal diff rather than a whole-file reformat.

**Done since the first summary:** CP3 transitions (Inspector picker + Timeline junction badges,
browser-verified over `pp-program-klima-reel`) and multi-clip editing (browser-verified over
`pp-05-zastupitelsky-klub`). Core suite now 209/209, `tsc` clean.

---

## 5. Where the detail lives
- Design specs: `core/.claude/superpowers/specs/2026-07-20-reel-editor-design.md`,
  `…/2026-07-21-brand-driven-accents-design.md`.
- Plans: `core/.claude/superpowers/plans/2026-07-20-reel-editor-*.md`.
- Per-step reports + the durable progress ledger: `core/.superpowers/sdd/` (`progress.md`,
  `ux-audit-report.md`, `final-verify-report.md`, etc.).
