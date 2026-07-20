# Rename review/design commands by template lineage

**Date:** 2026-07-20
**Status:** Approved (brainstorming) → ready for plan

## Problem

Three commands overlap confusingly because their names don't encode which template lineage they
serve:

- `/toolkit:scene-review` and `/toolkit:design` operate on the **slide-based** templates
  (`sprint-config.ts` / `demo-config.ts`, slide components).
- `/toolkit:fine-tune` operates on the **campaign-reels** clip/segment schema (`Root.tsx`
  `defaultProps`, Zod `schema.ts`).

The names hide this split, and `fine-tune` in particular is misread as a review step when it is
actually interactive editing (timing sliders + overlay-text inputs in Studio, saved to
`Root.tsx`).

## Decision

Rename all three so the name carries the lineage, and pick an honest verb for the reel command
(it *tunes*, it does not *review*):

| Current | New | Slash command | Lineage |
|---|---|---|---|
| `commands/scene-review.md` | `commands/slide-review.md` | `/toolkit:slide-review` | slides |
| `commands/design.md` | `commands/slide-design.md` | `/toolkit:slide-design` | slides |
| `commands/fine-tune.md` | `commands/cut-tune.md` | `/toolkit:cut-tune` | campaign-reels |

`cut-tune` pairs with the `/toolkit:cut` step it follows ("cut, then tune the cut") and keeps the
"tune" semantics of `fine-tune`. It retains `status: beta`.

**Chosen constraints (from brainstorming):**
- **Hard rename** — no deprecation-stub commands left behind.
- **Pure rename** — behavior is identical; no lineage guards, no code changes. Markdown + JSON
  only.

Plugin commands auto-discover from `commands/` (there is no command list in
`.claude-plugin/plugin.json`), so renaming the file *is* the rename — nothing else wires them.

## Scope of changes

### 1. Rename the three command files (preserve git history)

`git mv` each file to its new name.

### 2. Update each renamed file's own content

- H1 titles: `# Scene Review` → `# Slide Review`; `# Design Refinement` → `# Slide Design`;
  `# Fine-tune` → `# Cut Tune`.
- `description:` frontmatter where present (scene-review, fine-tune have it; design.md has none —
  leave its structure as-is aside from the title).
- Self-references to the old slash command inside each file (usage examples like
  `/toolkit:scene-review title`, `/toolkit:fine-tune <project-name>`) → new names.
- In `slide-review.md`, the "Refine" option that points at `/toolkit:design` → `/toolkit:slide-design`.

### 3. Registry (`_internal/toolkit-registry.json`)

Rename the three keys (`scene-review`→`slide-review`, `design`→`slide-design`,
`fine-tune`→`cut-tune`), update each entry's `path` to the new filename and its `description` to
the new name/verb, and keep `cut-tune` at `status: "beta"`. Keep the surrounding key order/shape.

### 4. Live cross-references (update to new names)

Files that reference the old names in *current guidance* (not history):
`CLAUDE.md`, `README.md`, `docs/getting-started.md`,
`commands/{video,cut,add-music,sync,render,generate-voiceover,versions}.md`,
`skills/elevenlabs/reference.md`, and forward-looking entries in `_internal/ROADMAP.md`.

Also: in `CLAUDE.md`'s project-phase table, the `review` phase keeps its name, but its command
link becomes `/toolkit:slide-review`.

### 5. History left intact + one new entry

`_internal/CHANGELOG.md` historical entries stay verbatim — they record what shipped under the old
names, and rewriting them would falsify history. Add **one new CHANGELOG entry** documenting the
rename (old → new, hard rename).

## Reference-matching care (avoid over/under-replacing)

- `scene-review` and `fine-tune` are unambiguous tokens — safe to replace every live occurrence.
- **`design` is NOT** — the word "design" appears throughout the docs as ordinary prose
  (frontend-design skill, "design refinement", "design decisions"). Only replace the *command*
  references: `/toolkit:design`, the registry key `"design"`, the file `commands/design.md`, and
  prose that clearly names the command (e.g. "Use `/toolkit:design`"). Do NOT touch the
  `frontend-design` skill name or generic uses of the word.

## Post-change note

Renaming plugin command files changes the slash commands; **Claude Code must be reloaded** to pick
up `/toolkit:slide-review`, `/toolkit:slide-design`, `/toolkit:cut-tune` (and the old names stop
resolving). Call this out wherever the change is announced.

## Testing / verification

Markdown + JSON only — no unit tests. Verify by:
- `python3 -m json.tool _internal/toolkit-registry.json` succeeds, and the three new keys exist
  with correct `path`s while the old keys are gone.
- The three new command files exist; the three old ones do not (`git status` shows renames).
- `grep -rn` over the repo (excluding `_internal/CHANGELOG.md` history and `node_modules`/`.venv`)
  finds **zero** live references to `scene-review`, `fine-tune`, or `/toolkit:design`.
- The `frontend-design` skill name and generic prose uses of "design" are untouched (spot-check).

## Out of scope

- Template-lineage guards (making `slide-*` refuse a reel project, etc.) — deferred.
- Any behavior change to what the commands do.
- Renaming the underlying project phase `review` or the `frontend-design` skill.
