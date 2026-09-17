---
description: Free disk space — delete local project media that R2 provably holds (size + checksum verified)
---

# Purge

Heavy media (raw footage, b-roll, music, renders) is backed up to Cloudflare R2 by
`/toolkit:sync push`, but the local copies stay and eat gigabytes. `/toolkit:purge`
deletes local media **only after verifying each file on R2** — same key, same size,
and a matching checksum (the R2 ETag reproduced from the local bytes, including
multipart uploads). Anything that can't be verified stays, with the reason.

Restore any time with `/toolkit:sync pull <project>`.

## Quick start

```
/toolkit:purge                  # every project with phase: complete
/toolkit:purge <project>        # one project, any phase
```

## What it touches — and what never

| Deleted (after verification) | Never deleted |
|---|---|
| untracked files under `public/recordings`, `public/broll`, `public/audio`, `out` | anything git tracks (transcripts, brand assets, committed music) |
| | files missing on R2, or differing in size / checksum |
| | anything outside those four subdirs (e.g. `SOURCE/`, `src/`) |
| | projects not `phase: complete`, unless named explicitly |

## Flow

### Step 1: Resolve scope

- An argument naming a folder in `projects/` → that project.
- No argument → all `phase: complete` projects (the tool selects them).

### Step 2: Dry run — always first

Run from the repo root:

```bash
python3 -m video_toolkit.sync_project --purge [<project>]
```

It prints, per project, every `would delete` file, every `KEEP` file with its reason,
and the total space it would free. Checksumming reads every file, so large projects
take a while — run it in the background when the total is many GB.

If R2 is not configured the tool exits with an error and deletes nothing.

### Step 3: Confirm with the user

Show the summary (projects, file count, space to free, kept files and why) and ask
for an explicit yes. Deletion is irreversible locally; do not proceed on silence or
on an earlier approval for a different scope.

If files are `KEEP (not on R2 / size mismatch / checksum mismatch)` and the user
wants them purged too, run `/toolkit:sync push <project>` first, then repeat Step 2.

### Step 4: Delete

```bash
python3 -m video_toolkit.sync_project --purge [<project>] --yes
```

The tool re-verifies everything before deleting (the dry-run result is not reused),
so a file that changed in between is kept.

### Step 5: Report

```
Purge complete.

Projects:  7 (phase: complete)
Freed:     2.4 GB (412 files)
Kept:      3 files — pp-foo: out/reel-v2.mp4 (not on R2)
Restore:   /toolkit:sync pull <project>
```
