---
description: Push / pull a reel project (git source + R2 media) — one step for non-technical collaborators
---

# Sync

Move both the source files (Root.tsx, SCREENPLAY.md, project.json, transcripts, brand assets) **and** the heavy media (raw footage, music, renders) between the local project, the toolkit git remote, and Cloudflare R2 — in one command. Non-technical collaborators must never run raw `git` commands; `/toolkit:sync` handles them.

## Quick start

```
/toolkit:sync                            # interactive: ask push or pull + scope
/toolkit:sync push                       # commit projects/<name>/, push to git, then upload media to R2
/toolkit:sync pull                       # git pull --rebase, then download media from R2
/toolkit:sync list                       # git pull --rebase, then show R2 inventory
/toolkit:sync share                      # git pull --rebase, then generate presigned public URL
/toolkit:sync push out                   # just the renders (after /toolkit:render) — still does git step
/toolkit:sync push recordings,broll      # just raw footage — still does git step
/toolkit:sync push --dry-run             # preview both git diff and R2 transfer
/toolkit:sync <project-name> ...         # explicit project
```

Subdir aliases (used in `--only`): `recordings` → `public/recordings`, `broll` → `public/broll`, `audio` → `public/audio`, `out` → `out`.

## What `/toolkit:sync` covers

| Operation | Step 1 (git)                                            | Step 2 (R2)            |
|-----------|---------------------------------------------------------|------------------------|
| `pull`    | `pull --rebase` + auto-stash                            | R2 pull                |
| `list`    | `pull --rebase` + auto-stash                            | R2 list                |
| `share`   | `pull --rebase` + auto-stash                            | R2 share (URL)         |
| `push`    | `pull --rebase` + auto-stash → stage `projects/<name>/` → commit (if any) → `push` | R2 push |

Order is git → R2 in every case. On `push`, git first because if it fails R2 never starts. On `pull`/`list`/`share`, git first because the code (Root.tsx, project.json) describes which media to expect.

## Flow

### Step 1: Detect project

1. If invoked from inside `projects/<name>/`, use that project.
2. Else if first arg is a project folder name, use it.
3. Else scan `projects/` for active projects; if multiple, ask.

### Step 2: Resolve direction + scope

| Arg pattern | Action |
|---|---|
| `push` or `pull` or `list` or `share` | direction |
| Anything else (no commas, no flags) | subdir filter — `recordings,broll`, `out`, etc. |
| `--dry-run` | preview only |
| `--overwrite` | force re-transfer ignoring size match |
| `--file <path>` | (share only) file to share (default `out/reel.mp4`) |
| `--expires-days N` | (share only) URL validity in days (max 7) |

If no direction given: ask "push, pull, or list?"

### Step 3: Verify R2 config

```bash
grep -E "^R2_" .env >/dev/null || echo "R2 not configured"
```

If missing: stop and tell the user to set `R2_BUCKET_NAME`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` in `.env` (or run `/toolkit:setup`).

### Step 4: Git preflight (every operation)

This is shared by `pull`, `list`, `share`, and `push`. Auto-stash → pull --rebase → pop.

```bash
# 4a. Capture any in-flight work
if [ -n "$(git status --porcelain)" ]; then
  STASH_MSG="auto-stash by /toolkit:sync at $(date -u +%FT%TZ)"
  git stash push -u -m "$STASH_MSG"
  STASHED=1
else
  STASHED=0
fi

# 4b. Pull latest
git pull --rebase
PULL_RC=$?

# 4c. Restore in-flight work if we stashed
if [ "$STASHED" = "1" ] && [ "$PULL_RC" = "0" ]; then
  git stash pop
  POP_RC=$?
fi
```

Failure modes:

- **Rebase conflict** (`PULL_RC != 0`): abort the entire `/toolkit:sync` operation. Do not proceed to R2. Report:
  > "Rozdělaná práce v konfliktu s pullem. Stash zůstává jako `stash@{0}` (`<STASH_MSG>`). Ozvi se xaralisovi."
  Never drop the stash automatically.

- **Stash pop conflict** (`POP_RC != 0`): same as above. Stash remains as `stash@{0}`.

For `pull` / `list` / `share`: continue to Step 6 (R2). For `push`: continue to Step 5.

### Step 5: Git commit + push (push only)

Two commits, in this order, then one push:

1. **Toolkit commit** — shared code/assets the project's render depends on
   (`lib/` primitives, `brands/<brand>/` assets). A project that uses a new
   `lib/` primitive (crop, grade, party-logos, a fixed transition, …) is broken
   for anyone who pulls unless that `lib/` code ships too — so `/toolkit:sync push`
   commits it. Separate commit so history stays readable (toolkit vs reel).
2. **Project commit** — `projects/<name>/`, the reel itself.

Resolve `<brand>` from `projects/<name>/project.json` (`.brand`). Never stage
`video_toolkit/`, `docs/`, or *other* projects — those remain the author's separate
concern. Both commit messages use a fixed template (no per-file categorization).

```bash
# 5a. Toolkit commit — lib/ primitives + this project's brand assets.
git add lib/ "brands/<brand>/"
if git diff --cached --quiet; then
  echo "git: no toolkit changes"
else
  TOOLKIT_STAGED=$(git diff --cached --name-only)
  git commit -m "chore(toolkit): sync deps for <name>" \
    -m "$(printf 'Files:\n'; printf -- '- %s\n' $TOOLKIT_STAGED)"
fi

# 5b. Project commit — scoped to the active project.
git add "projects/<name>/"
if git diff --cached --quiet; then
  echo "git: no project source changes"
else
  STAGED=$(git diff --cached --name-only)
  BODY=$(printf "Files:\n"; printf -- "- %s\n" $STAGED)
  git commit -m "sync(<name>): update" -m "$BODY"
fi

# 5c. Push whatever commits were made (toolkit and/or project). `-u origin HEAD`
# sets upstream on first push and is a no-op otherwise. On non-fast-forward,
# pull --rebase and retry.
if ! git push -u origin HEAD; then
  git pull --rebase || { echo "git: rebase failed; commits kept locally"; exit 1; }
  git push -u origin HEAD || { echo "git: push retry failed; commits kept locally"; exit 1; }
fi
```

Commit message format:

- Subject: literal `sync(<project>): update` (replace `<project>` with the active project name).
- Body: literal `Files:` line, then one bullet per staged path as `- <path>`.

Examples:

```
sync(pp-smoke-03): update

Files:
- projects/pp-smoke-03/SCREENPLAY.md
```

```
sync(pp-smoke-03): update

Files:
- projects/pp-smoke-03/SCREENPLAY.md
- projects/pp-smoke-03/src/Root.tsx
```

### Step 6: R2 operation

```bash
python3 -m video_toolkit.sync_project --push <name> [--only <subdirs>] [--dry-run]
python3 -m video_toolkit.sync_project --pull <name> [--only <subdirs>] [--dry-run]
python3 -m video_toolkit.sync_project --list <name>
python3 -m video_toolkit.sync_project --share <name> [--file <path>] [--expires-days N]
```

Run from repo root (the tool's paths are repo-root relative).

For large pushes (>500 MB), use `run_in_background: true` and let the harness notify on completion. R2 multipart upload is automatic via boto3.

### Step 7: Report

For push:

```
Sync complete (push).

Project:    pp-smoke-03
Git:        committed 2 files → pushed to origin/main
  sync(pp-smoke-03): update
R2:         uploaded 3 files, 142.7 MB (skipped 72 size-match)
Subdirs:    out
```

For pull:

```
Sync complete (pull).

Project:    pp-smoke-03
Git:        pulled 4 commits onto main (auto-stash: none)
R2:         downloaded 75 files, 670.3 MB (skipped 0)
Local:      projects/pp-smoke-03/
```

For list:

```
Project:    pp-smoke-03
Git:        up to date
R2 inventory:
  public/recordings/  12 files, 4.3 GB
  public/broll/        8 files, 1.1 GB
  …
```

If git step had no remote (`origin` missing) or branch had no upstream and push set it, mention so on the Git line.

### Step 8: Workflow nudges

After a successful operation, hint at the next typical step:

- **Just pulled?** → "Footage in place. Run `/toolkit:cut` to (re)map clips, or `/toolkit:fine-tune` to iterate in Studio."
- **Pushed recordings only?** → "Footage backed up. Continue with `/toolkit:cut`."
- **Pushed out/ only?** → "Render in R2. Use `/toolkit:sync share` to get a public URL."
- **Pushed everything?** → "Project mirrored. Safe to clean the local copy if disk pressure."

## Workflow integration

`/toolkit:sync` is a regular part of the campaign-reels workflow — not optional. The per-project flow:

```
/toolkit:video                                    # create / resume project
/toolkit:narrate                                  # author SCREENPLAY.md
(film footage; drop into public/recordings + public/broll)
/toolkit:sync push recordings,broll               # ← code + raw footage to git+R2
/toolkit:cut                                      # map footage → defaultProps
/toolkit:fine-tune                                # iterate in Studio
/toolkit:add-music                                # generate bg.mp3 (optional)
/toolkit:render                                   # produce reel.mp4
/toolkit:sync push out                            # ← code + renders to git+R2
```

For collaborators joining mid-project:

```
/toolkit:video                                    # detects existing project (resume)
/toolkit:sync pull                                # ← code + all media in one step
/toolkit:fine-tune  (or wherever the work is)
```

## Notes

- **Both git and R2 in one step.** Non-technical collaborators never need to know git exists, and the author (xaralis) gets the same one-step convenience.
- **Commit scope: project + its toolkit deps.** `/toolkit:sync push` stages `projects/<name>/` (project commit) plus `lib/` and `brands/<brand>/` (a separate toolkit commit) — so a project that uses a new `lib/` primitive isn't broken for whoever pulls. `video_toolkit/`, `docs/`, and *other* projects are never auto-committed — the author's separate concern.
- **Commit message is fixed.** `sync(<project>): update` with the file list in the body. The diff describes what changed; the subject keeps history scannable by project name.
- **Size-based skip is conservative** (R2). Same size = same file is assumed. If someone replaces a clip with a re-edit at exactly the same size, force with `--overwrite`.
- **Same R2 bucket** already powers Modal transcription / image-edit / music-gen flows — no separate bucket needed, just a `projects/<name>/` prefix.
- **Brand-level assets** (outro.mp4, LUTs, watermark.png) stay in git directly — small enough, versioned.
- **New projects:** `/toolkit:sync list <name>` returns empty R2 inventory until the first push — that's expected.

## Re-run semantics

Running `/toolkit:sync push` twice in a row is safe: the second run has no source changes (git step skips commit+push) and R2 skips size-matched files. Same for `pull`. Use `--overwrite` to force R2 re-transfer.

## Failure cheatsheet

| Symptom | What to do |
|---|---|
| "Rozdělaná práce v konfliktu s pullem" | Tell the author (xaralis). Do not drop the stash. |
| "git: push retry failed" | Local commit is preserved; the author can resolve. |
| "R2 not configured" | Set `R2_*` env vars in `.env` or run `/toolkit:setup`. |
| "bez remotu — jen R2" | Toolkit has no `origin` remote configured. R2 ran; git step skipped. |
