# Brand-repo-first setup flow (`/toolkit:setup` in a brand repo)

**Date:** 2026-07-18
**Status:** Approved (brainstorming) → ready for plan
**Builds on:** [2026-07-18-brand-repo-bootstrap-init-design.md](2026-07-18-brand-repo-bootstrap-init-design.md) (the `npx … init` bootstrap that this flow follows)

## Problem

`npx github:xaralis/video-toolkit init <dir>` now scaffolds a fresh brand repo with the Python
toolkit installed into `.venv`. But a fresh brand repo has **no `.env` and no cloud tools
configured** — env vars and the Modal/RunPod endpoints needed for AI voiceover, image gen, music,
etc. are missing. That configuration is exactly what `/toolkit:setup` does — but `/toolkit:setup`
today assumes it runs from the toolkit **core** (CWD = toolkit root): it references
`docker/modal-*/app.py`, `video_toolkit/requirements.txt`, and `sys.path.insert(0,'tools')`
relative to CWD. In a brand repo those live under `toolkit/`, so setup would fail to find them.

Nothing currently tells a freshly-bootstrapped brand repo to run `/toolkit:setup`, nothing stops
`/toolkit:video` from trying to create a project inside the core, and setup itself is not
brand-repo-aware.

## Guiding principle: configuration installs only into the brand repo

All per-project configuration lives in the **brand repo**, never in the core/toolkit:

- `.env` (provider creds, R2, voice, endpoint URLs/IDs) → the brand repo root (`workspace_root()`).
- Python `.venv` → the brand repo (already done by `init` via `pip install -e toolkit`).
- The core/toolkit stays a clean shared submodule with no per-user config.

Cloud GPU tools are **account-level**, so "install into the brand repo" means: record the
resulting endpoint identifiers in the brand repo's `.env`. The build/deploy is triggered from the
brand repo but the artifact lives on the provider account (see next section).

## How cloud tools actually build (informs the deploy phase)

Nothing builds Docker locally on the user's machine.

- **Modal** (`toolkit/docker/modal-*/`): each dir is a single `app.py` — an "app", not a prebuilt
  image. It embeds the image recipe (`modal.Image.debian_slim().apt_install(...).pip_install(...)`)
  **and** the serving code. `modal deploy` builds the image **remotely in Modal's cloud** on first
  deploy, cached per Modal account. So the Modal "build" = the remote build that `modal deploy`
  triggers.
- **RunPod** (`toolkit/docker/runpod-*/`): `Dockerfile` + `handler.py` are the *source*, but the
  running images are **prebuilt and published to GHCR** by upstream
  (`ghcr.io/conalmullan/video-toolkit-*`). RunPod `--setup` only registers an endpoint pointing at
  that tag — no local build, no push.

Therefore "build at the brand-repo level if not already installed" means, per provider:

- **Modal — detect-or-deploy:** if the app is not on the account, `modal deploy` it (remote build),
  triggered from the brand-repo context; else reuse. Endpoint URL → brand `.env`.
- **RunPod — detect-or-register:** if no template/endpoint exists, `--setup` creates one from the
  GHCR image; else reuse. Endpoint ID → brand `.env`. (Never builds.)

**Provider scope:** the toolkit integrates **Modal + RunPod** only. No Replicate integration
exists and none is added here (a new provider would be a separate, larger feature).

## Deliverables

### 1. `commands/setup.md` — brand-repo-aware, detect-or-deploy

- **Phase 0 — Workspace check (new, runs first).** Resolve the workspace:
  `python3 -c "from video_toolkit.paths import workspace_root; ..."` and read its `workspace.json`.
  - `kind == "brand"` → proceed with setup in this repo.
  - `kind == "core"` or no workspace found → **do not configure the core.** Explain that env/cloud
    config lives in a brand repo, and point the user to
    `npx github:xaralis/video-toolkit init <dir>` (then `cd <dir>` and launch `claude`), or to
    `cd` into an existing brand repo. Stop.
- **Path resolution — toolkit assets vs workspace config.** Compute both roots up front and use
  them throughout instead of CWD-relative paths:
  - `TOOLKIT="$(python3 -c 'from video_toolkit.paths import toolkit_root; print(toolkit_root())')"`
  - `WS="$(python3 -c 'from video_toolkit.paths import workspace_root; print(workspace_root())')"`
  - Deploy commands run from the toolkit root: `cd "$TOOLKIT" && modal deploy docker/modal-<tool>/app.py`
    (running from `$TOOLKIT` avoids any CWD-relative build-context assumptions in `app.py`).
  - `pip install` targets `"$TOOLKIT"` (editable install already done by `init`; only re-run if the
    import check fails).
  - All `.env` reads/writes target `"$WS/.env"`.
  - In the core repo `TOOLKIT == WS`, so existing single-repo behavior is unchanged (backward
    compatible).
- **Ordering (make explicit).** Env vars first (provider auth in Phase 2, R2 in Phase 3, written to
  `$WS/.env`), **then** the deploy/register phase (Phase 4) — cloud tools are only deployed after
  the env is in place, at the brand-repo level.
- **Phase 4 — detect-or-deploy per tool** (replaces the unconditional deploy list):
  - Modal: check whether each tool's app is already on the account (`modal app list`, or an existing
    `MODAL_<TOOL>_ENDPOINT_URL` in `$WS/.env`). Deploy only the missing ones
    (`cd "$TOOLKIT" && modal deploy docker/modal-<tool>/app.py`); capture the printed `.modal.run`
    URL → `$WS/.env`. Already-deployed tools: reuse the URL, no redeploy.
  - RunPod: reuse an existing template/endpoint if present (the tools' `find_template`); else run the
    tool's `--setup`. Endpoint ID → `$WS/.env`. Never builds.
  - A second brand repo therefore usually deploys nothing — it inherits the account's existing
    endpoints into its own `.env`.
- **Fix the stale R2 connectivity test** in the doc: replace `sys.path.insert(0, 'tools')` +
  `from file_transfer import …` with a proper module import
  (`from video_toolkit.file_transfer import upload_to_r2, delete_from_r2`), run with CWD at `$WS`.

### 2. `commands/video.md` — Step 0 brand-repo guard

Before scanning/creating projects, check the workspace. If not in a brand repo (`kind != "brand"`
or no workspace), **do not** fall into "No projects found, let's create one" (which would create a
project inside the core). Instead point the user to `npx … init` (new repo) or `cd` into a brand
repo, and mention `/toolkit:setup`. Inside a brand repo, behave exactly as today.

### 3. `scripts/bootstrap/cli.mjs` next-steps + generated brand `README`/`CLAUDE.md`

Recommend running `/toolkit:setup` right after bootstrap, inside Claude Code, to configure env vars
and deploy the cloud tools. Make clear rendering works without it (Node only), but AI cloud tools
(voiceover, image gen, music, upscale, watermark removal) need it. Insert this into:
- `printNextSteps` output (a line between the `/toolkit:brand` and `/toolkit:video` guidance).
- the generated brand-repo `README.md` (`readmeMd`) getting-started list.
- the generated brand-repo `CLAUDE.md` (`claudeMd`) "Start" section.

### 4. Core `CLAUDE.md` — canonical first-run order + principle

Document the canonical order and the principle in the brand-repo/submodule discussion:
`npx … init` → `cd <dir>` + `claude` → `/toolkit:setup` (env + cloud tools) → `/toolkit:video`,
and "per-repo configuration (`.env`, endpoints, `.venv`) installs only into the brand repo, never
into the core."

## Testing

Most deliverables are command markdown (executed by Claude, not unit-testable) plus generated
strings. Concrete, testable pieces:

- **`video_toolkit/verify_setup.py`**: it currently does a bare `load_dotenv()` (CWD-relative).
  Change it to load `.env` from `workspace_root()` (matching `config.py._load_dotenv()`), so
  verification finds the brand repo's `.env` regardless of the CWD `/toolkit:setup` runs commands
  from. Add a unit test (extend `video_toolkit/tests/`) that, given a temp brand workspace
  (`workspace.json` kind=brand + a `.env` with a sentinel var) and a different CWD, `verify_setup`
  reads the sentinel from the workspace `.env`.
- **Generated strings** (`printNextSteps`/`readmeMd`/`claudeMd`): extend
  `video_toolkit/tests/test_bootstrap_init.py` to assert the scaffolded brand repo's next-steps
  output and generated `README.md`/`CLAUDE.md` mention `/toolkit:setup`.
- **Command markdown** (`setup.md` Phase 0/path-resolution, `video.md` guard): verified by a manual
  dry-run in a scratch brand repo (like the bootstrap's manual E2E) — confirm setup's Phase 0
  detects the brand workspace and resolves `toolkit_root()`/`workspace_root()` correctly, and that
  `/toolkit:video`'s guard fires in the core. State this manual-verification step explicitly.

## Out of scope

- Adding Replicate (or any new cloud provider).
- Reconciling the upstream (`conalmullan`) GHCR image tags with this fork's `docker/runpod-*/`
  source — pre-existing, unrelated.
- Auto-running `/toolkit:setup` from `init` (it's interactive and account-level; `init` only
  recommends it).
