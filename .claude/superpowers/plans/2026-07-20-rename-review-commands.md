# Rename review/design commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `/toolkit:scene-review`→`/toolkit:slide-review`, `/toolkit:design`→`/toolkit:slide-design`, `/toolkit:fine-tune`→`/toolkit:cut-tune`, updating every live reference while leaving history and false-positives untouched.

**Architecture:** Hard, pure rename — `git mv` the three command files, fix their own content + the registry, then update live cross-references in the other docs and add one CHANGELOG entry. Markdown + JSON only; no behavior or code changes.

**Tech Stack:** Markdown command docs, `_internal/toolkit-registry.json`, `perl -pi -e` for scoped replacements, `git mv`.

## Global Constraints

- **Mapping (exact):** `scene-review`→`slide-review`, `design`→`slide-design`, `fine-tune`→`cut-tune`. `cut-tune` keeps `status: "beta"`.
- **Pure rename:** no behavior change, no code, no lineage guards, no deprecation stubs.
- **Never touch these false-positives:** the word "design" in prose, the `frontend-design` skill name, the `## Design Refinement with frontend-design Skill` section header in `CLAUDE.md`, and "fine-**tuned** model" in `skills/elevenlabs/reference.md:61`.
- **Leave history as-is:** `_internal/CHANGELOG.md` existing entries, `_internal/ROADMAP.md` (all its refs are completed `[x]` items / inventory snapshots), and `commands/versions.md` (historical release notes). Only ADD one new CHANGELOG entry.
- **Only the `design` *command* is renamed** — i.e. `/toolkit:design`, the registry key `"design"`, and `commands/design.md`. Bare "design" is off-limits.
- Commit messages: no `Co-Authored-By`.
- macOS/BSD environment: use `perl -pi -e` (portable), not `sed -i`.

---

## File Structure

- **Rename:** `commands/scene-review.md`→`commands/slide-review.md`, `commands/design.md`→`commands/slide-design.md`, `commands/fine-tune.md`→`commands/cut-tune.md`.
- **Modify (registry):** `_internal/toolkit-registry.json` — three entries.
- **Modify (live cross-refs):** `CLAUDE.md`, `README.md`, `docs/getting-started.md`, `commands/{video,cut,add-music,sync,render,generate-voiceover}.md`.
- **Modify (add entry):** `_internal/CHANGELOG.md`.

---

## Task 1: Rename the three command files + their content + registry

**Files:**
- Rename: `commands/scene-review.md` → `commands/slide-review.md`
- Rename: `commands/design.md` → `commands/slide-design.md`
- Rename: `commands/fine-tune.md` → `commands/cut-tune.md`
- Modify: `_internal/toolkit-registry.json`

**Interfaces:** none (docs/config). Verification is by grep + `json.tool`.

- [ ] **Step 1: `git mv` the three files**

```bash
cd /Users/xaralis/Workspace/progpce/core
git mv commands/scene-review.md commands/slide-review.md
git mv commands/design.md       commands/slide-design.md
git mv commands/fine-tune.md    commands/cut-tune.md
```

- [ ] **Step 2: Update each renamed file's own H1 + self-references**

`slide-review.md`: change the H1 and every self slash-command reference.

```bash
perl -pi -e 's|/toolkit:scene-review|/toolkit:slide-review|g; s|^# Scene Review$|# Slide Review|' commands/slide-review.md
```

`slide-design.md`:

```bash
perl -pi -e 's|/toolkit:design|/toolkit:slide-design|g; s|^# Design Refinement$|# Slide Design|' commands/slide-design.md
```

`cut-tune.md`:

```bash
perl -pi -e 's|/toolkit:fine-tune|/toolkit:cut-tune|g; s|^# Fine-tune$|# Cut Tune|' commands/cut-tune.md
```

- [ ] **Step 3: Verify the three files' own content is clean**

```bash
grep -n 'scene-review\|/toolkit:design\|fine-tune\|# Scene Review\|# Design Refinement\|# Fine-tune' \
  commands/slide-review.md commands/slide-design.md commands/cut-tune.md
```
Expected: **no output** (all self-references and H1s updated).

- [ ] **Step 4: Update the registry entries**

In `_internal/toolkit-registry.json`, replace the `scene-review` entry:

```json
    "scene-review": {
      "path": "commands/scene-review.md",
      "description": "Scene-by-scene review in Remotion Studio before voiceover",
      "status": "stable",
      "created": "2025-12-10",
      "updated": "2025-12-10"
    },
```
with:
```json
    "slide-review": {
      "path": "commands/slide-review.md",
      "description": "Scene-by-scene review of a slide deck in Remotion Studio, before voiceover",
      "status": "stable",
      "created": "2025-12-10",
      "updated": "2026-07-20"
    },
```

Replace the `design` entry:

```json
    "design": {
      "path": "commands/design.md",
      "description": "Focused design refinement session for a scene",
      "status": "stable",
      "created": "2025-12-10",
      "updated": "2025-12-13"
    },
```
with:
```json
    "slide-design": {
      "path": "commands/slide-design.md",
      "description": "Focused visual-design refinement of a slide scene (frontend-design skill)",
      "status": "stable",
      "created": "2025-12-10",
      "updated": "2026-07-20"
    },
```

Replace the `fine-tune` entry:

```json
    "fine-tune": {
      "path": "commands/fine-tune.md",
      "description": "Launch Remotion Studio for slider + text-input iteration on a cut reel; Save persists to Root.tsx",
      "status": "beta",
      "created": "2026-05-20",
      "updated": "2026-05-20"
    },
```
with:
```json
    "cut-tune": {
      "path": "commands/cut-tune.md",
      "description": "Launch Remotion Studio to tune a cut reel's timing + overlay text; Save persists to Root.tsx",
      "status": "beta",
      "created": "2026-05-20",
      "updated": "2026-07-20"
    },
```

- [ ] **Step 5: Verify registry**

```bash
python3 -m json.tool _internal/toolkit-registry.json > /dev/null && echo "JSON OK"
grep -c '"slide-review":\|"slide-design":\|"cut-tune":' _internal/toolkit-registry.json   # expect 3
grep -c '"scene-review":\|"design":\|"fine-tune":' _internal/toolkit-registry.json        # expect 0
grep -n 'commands/scene-review.md\|commands/design.md\|commands/fine-tune.md' _internal/toolkit-registry.json  # expect none
```
Expected: `JSON OK`, `3`, `0`, and no stale paths.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(commands): rename scene-review/design/fine-tune → slide-review/slide-design/cut-tune (files + registry)"
```

---

## Task 2: Update live cross-references + CHANGELOG entry

**Files:**
- Modify: `commands/video.md`, `commands/generate-voiceover.md`, `commands/render.md`, `commands/sync.md`, `commands/add-music.md`, `commands/cut.md`, `docs/getting-started.md`
- Modify: `CLAUDE.md`, `README.md`
- Modify: `_internal/CHANGELOG.md`

**Interfaces:** none. Verification by grep.

- [ ] **Step 1: Replace `/toolkit:<old>` forms in the "pure" files**

These files reference the commands only in `/toolkit:<name>` form, so a scoped replacement is safe:

```bash
perl -pi -e 's|/toolkit:scene-review|/toolkit:slide-review|g; s|/toolkit:fine-tune|/toolkit:cut-tune|g; s|/toolkit:design|/toolkit:slide-design|g' \
  commands/video.md commands/generate-voiceover.md commands/render.md commands/sync.md commands/add-music.md commands/cut.md docs/getting-started.md
```

- [ ] **Step 2: Replace command tokens in `CLAUDE.md` and `README.md`**

Here `scene-review` also appears bare ("in scene-review", the codex path `scene-review/`), all of which are the command with no false-positives, so replace the bare hyphen-token; keep `fine-tune`/`design` to their command forms only:

```bash
perl -pi -e 's|scene-review|slide-review|g; s|/toolkit:fine-tune|/toolkit:cut-tune|g; s|/toolkit:design|/toolkit:slide-design|g' \
  CLAUDE.md README.md
```

- [ ] **Step 3: Update the prose step-labels (explicit — must not hit the skill-section header)**

The numbered-list labels use spaced words ("Scene review", "Design refinement") that Step 2 did not change. Update them explicitly. **Do NOT touch** the `## Design Refinement with frontend-design Skill` section header.

`CLAUDE.md` — three edits:
- `4. **Scene review** - Run` → `4. **Slide review** - Run`
- `5. **Design refinement** - Use` → `5. **Slide design** - Use`
- `- **During scene review** (` → `- **During slide review** (`

`README.md` — two edits:
- `4. **Scene review** — Run` → `4. **Slide review** — Run`
- `5. **Design refinement** — Use` → `5. **Slide design** — Use`

- [ ] **Step 4: Verify cross-references (and false-positives intact)**

```bash
# Zero live refs to old command names outside history:
grep -rn 'scene-review\|/toolkit:fine-tune\|/toolkit:design' \
  --include='*.md' --include='*.json' . 2>/dev/null \
  | grep -vE 'node_modules|\.venv|/\.git/|superpowers/|_internal/CHANGELOG.md|_internal/ROADMAP.md|commands/versions.md'
# Expected: NO OUTPUT

# False-positives MUST still be present:
grep -c 'frontend-design' CLAUDE.md README.md          # each > 0
grep -n 'Design Refinement with frontend-design Skill' CLAUDE.md   # still present
grep -n 'fine-tuned model' skills/elevenlabs/reference.md          # still present
```
Expected: the first grep prints nothing; the false-positive greps all still match.

- [ ] **Step 5: Add one CHANGELOG entry**

In `_internal/CHANGELOG.md`, insert immediately after the `---` line that follows the intro (before the first `## 2026-04-09 (v0.14.2)` heading):

```markdown
## 2026-07-20

### Changed
- **Renamed review/design commands by template lineage** (hard rename, no behavior change):
  `/toolkit:scene-review` → `/toolkit:slide-review`, `/toolkit:design` → `/toolkit:slide-design`
  (both slide-template commands), and `/toolkit:fine-tune` → `/toolkit:cut-tune` (campaign-reels).
  Reload Claude Code to pick up the new slash commands; the old names no longer resolve.

---
```

- [ ] **Step 6: Verify CHANGELOG JSON-free + full suite unaffected**

```bash
grep -n '## 2026-07-20' _internal/CHANGELOG.md   # new entry present
/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/ -q 2>&1 | tail -2  # unchanged: all pass
```
Expected: entry present; tests still pass (this change touches no Python, so the count is unchanged).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: update all references to renamed commands + changelog entry"
```

---

## Final verification (after all tasks)

- [ ] `git log --oneline` shows the two commits; `git show --stat` on Task 1 confirms the three files are **renames** (R), not delete+add (history preserved).
- [ ] Repo-wide: `grep -rn 'scene-review\|/toolkit:fine-tune\|/toolkit:design' --include='*.md' --include='*.json' . | grep -vE 'node_modules|\.venv|superpowers/|_internal/CHANGELOG.md|_internal/ROADMAP.md|commands/versions.md'` → no output.
- [ ] `python3 -m json.tool _internal/toolkit-registry.json` succeeds; the three new command keys exist, old ones gone.
- [ ] Spot-check: `frontend-design` skill name, the `## Design Refinement with frontend-design Skill` header, and "fine-tuned model" are all still present.

---

## Self-Review

**Spec coverage:**
- Rename 3 files (git mv, history) → Task 1 Step 1. ✓
- Each file's H1 + self-refs → Task 1 Step 2-3. ✓
- Registry keys/paths/descriptions, `cut-tune` beta → Task 1 Step 4-5. ✓
- Live cross-refs (CLAUDE, README, getting-started, 6 command files) → Task 2 Steps 1-3. ✓
- Prose step-labels + phase-table link → Task 2 Steps 2-3 (the phase-table `/toolkit:scene-review` is caught by Step 2's bare `scene-review` replace in CLAUDE.md). ✓
- History left intact (CHANGELOG/ROADMAP/versions.md) + one new CHANGELOG entry → Global Constraints + Task 2 Step 5. ✓
- False-positive guards (frontend-design, section header, fine-tuned model, bare "design") → Global Constraints + Task 2 Step 4 verify. ✓
- Reload-Claude-Code note → in the CHANGELOG entry (Task 2 Step 5). ✓

**Placeholder scan:** No "TBD"/"handle edge cases". Every step is an exact command or an explicit old→new edit.

**Consistency:** New names used identically everywhere — `slide-review`, `slide-design`, `cut-tune`. The `/toolkit:design`→`/toolkit:slide-design` replacement is always command-form-only; bare "design" is never matched. `perl -pi -e` used throughout (no `sed -i`). Registry `updated` bumped to `2026-07-20` for the three; `cut-tune` retains `status: "beta"`.
