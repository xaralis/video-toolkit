# Brand-repo bootstrap: `npx github:xaralis/video-toolkit init`

**Date:** 2026-07-18
**Status:** Approved (brainstorming) → ready for plan

## Problem

After the brand/core split, there is **no clear, simple path to create a new brand repo**.
A brand repo vendors this core as a `toolkit/` git submodule and consumes its
skills/commands as the `toolkit@video-toolkit` Claude Code plugin. Setting one up by hand
means: `git init`, `git submodule add`, hand-writing `workspace.json`, `.claude/settings.json`
(marketplace + enabled plugin + SessionStart hook), a brand scaffold, `projects/`, a thin
`CLAUDE.md`, `.gitignore`, then installing the Python toolkit. That is fiddly and undocumented.

**Goal:** one command that scaffolds a ready-to-use brand repo, **without first cloning core**
and **without manual submodule linking**.

## Command & UX

```bash
npx github:xaralis/video-toolkit init my-brand-videos
```

- **`init` subcommand** via a tiny subcommand router (leaves room for `update`/`doctor` later).
  Target directory is the positional arg after `init`; if omitted, prompt for it.
- **Node CLI** at `scripts/bootstrap/cli.mjs`, **zero runtime npm dependencies** (only Node
  built-ins: `fs`, `child_process`, `path`, `readline`, `os`). npx therefore has nothing to
  install → fast and robust.
- **Cross-platform by construction.** Node is already a hard requirement (Remotion render needs
  Node 18+), so `npx` runs identically on Windows/macOS/Linux — this is *why* npx beats
  `curl | bash` (which has no native Windows story). All file ops go through Node `fs`
  (`fs.cpSync`), never shell `cp -r`; git runs via `child_process`.
- Exposed by a **new root `package.json`** with a `bin` field — that is what makes
  `npx github:xaralis/video-toolkit` work. It is independent of the plugin
  (`.claude-plugin/`) and the Python package (`pyproject.toml`); nothing else depends on the
  absence of a root `package.json`. Structured so it can later be published as
  `create-video-toolkit` for a `npm create video-toolkit` UX (rename + publish).

### Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `[target-dir]` | prompt | Directory to create the brand repo in |
| `--brand <slug>` | prompt (default derived from dir) | Brand slug for `brands/<slug>/` |
| `--toolkit-url <url>` | `https://github.com/xaralis/video-toolkit.git` | Submodule source |
| `--ssh` | off | Use SSH form `git@github.com:xaralis/video-toolkit.git` |
| `--ref <branch/tag>` | `main` | Toolkit submodule pin |
| `--skip-install` | off | Skip the Python install phase (CI/tests/offline) |
| `--yes` | off | Non-interactive; accept all defaults |

## What `init` produces

Preflight first: verify `git` on PATH, Node ≥ 18, and that the target dir is empty/nonexistent.
Fail early with a clear message otherwise.

Then scaffold (the exact manual steps, automated):

1. `git init` + `git submodule add --depth 1 <url> toolkit` (+ `git -C toolkit checkout <ref>`).
2. `workspace.json` → `{ "name": "<brand>-videos", "kind": "brand" }` — the marker
   `paths.workspace_root()` walks up to find.
3. `brands/<brand>/` = recursive copy of `toolkit/brands/default` (brand.json with `name`
   filled in, voice.json) + a minimal `BRAND-RULES.md` stub pointing at the toolkit's
   brand/timing docs. (Deep brand identity is deferred to `/toolkit:brand`.)
4. `projects/.gitkeep`.
5. `.claude/settings.json` — marketplace `video-toolkit` with source directory `./toolkit`,
   `enabledPlugins: { "toolkit@video-toolkit": true }`, and the SessionStart hook running
   `.venv/bin/python -m video_toolkit.check_stale_projects` (mirrors core exactly). **This file
   is what lights up the `/toolkit:*` commands inside the brand repo.**
6. Thin root `CLAUDE.md` layered on top of `toolkit/CLAUDE.md`, pointing at the brand's own
   `brands/<brand>/BRAND-RULES.md`.
7. `.gitignore` (node_modules, .venv, .env, out/, .DS_Store, per-project media) and
   `.env.example` copied from `toolkit/.env.example`; a short brand-repo `README.md` stub.
8. Initial `git commit`.

### Install phase (best-effort, streamed output; skipped by `--skip-install`)

- **Python toolkit** (the primary dependency): if `python3` ≥ 3.10 is present, create `.venv`
  at the brand-repo root and `pip install -e toolkit` — this exposes every `video_toolkit.*`
  CLI tool and makes the SessionStart hook work. If Python is missing/too old, skip and record
  it as a TODO in the final next-steps output.
- **Node deps**: nothing is installed at the brand-repo root. Node deps are per-project and get
  installed when a project is created (`/toolkit:video` copies a template and runs
  `npm install`). Stated explicitly in next-steps so it isn't surprising.
- Any phase that is skipped (no python / no ffmpeg) surfaces as a TODO line, not a silent gap.

### Final next-steps output

Must make clear that **`/toolkit:*` slash commands only exist inside Claude Code** — the user
has to launch `claude` in the new directory first. Example:

```
✓ Brand repo ready at my-brand-videos/

Next steps:
  cd my-brand-videos
  claude                  # launch Claude Code — the /toolkit:* commands live INSIDE it
                          # (the plugin is already wired up in .claude/settings.json)

  Then, inside Claude Code:
    /toolkit:brand        # fill in your brand colors, fonts, voice
    /toolkit:video        # start your first video project

  Python tools installed into .venv (activate: source .venv/bin/activate)
  Optional: ffmpeg for media; RunPod/ElevenLabs keys in .env for AI voice
```

## Testing

Pytest (existing `tests/` infra) invokes the Node CLI via `subprocess`:
`node scripts/bootstrap/cli.mjs init <tmpdir> --yes --skip-install --toolkit-url <local-core-path>`
so no network and no heavy pip run. Asserts the full scaffold exists and is correct:
`toolkit/` submodule present, `workspace.json` has `kind: "brand"`, `.claude/settings.json`
enables the plugin and points the marketplace at `./toolkit`, `brands/<brand>/` copied,
`projects/.gitkeep` present, and an initial commit was made.

## Assumptions / trade-offs

- **Core repo `xaralis/video-toolkit` is public** (or the user's git is authenticated) so
  `npx github:` and the HTTPS submodule fetch succeed.
- `npx github:` downloads the whole core tarball to run the script (then the submodule
  re-fetches). Source is media-free (media lives in R2) so size is acceptable — the price of
  zero publishing.
- A new root `package.json` exists solely for the `bin`; it introduces no npm dependencies and
  does not change how the repo is otherwise used.

## Out of scope

- Publishing `create-video-toolkit` to the npm registry (future; structure is ready for it).
- Interactive brand wizard during bootstrap (deferred to `/toolkit:brand`).
- Auto-installing system tools (ffmpeg, cloud GPU) — reported as next-steps TODOs only.
