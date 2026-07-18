# Brand-repo-first setup flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/toolkit:setup` configure a brand repo (not the core) — brand-repo-aware paths, detect-or-deploy cloud tools — and steer fresh brand repos + `/toolkit:video` toward it.

**Architecture:** Two small Python/JS code changes (verify_setup reads `.env` from the workspace root; the `init` CLI's generated strings recommend `/toolkit:setup`), plus edits to the `commands/setup.md` and `commands/video.md` plugin commands and core `CLAUDE.md` that resolve toolkit assets under `toolkit_root()` while writing config to `workspace_root()`, gate on being inside a brand repo, and document the canonical order.

**Tech Stack:** Python 3.13+ (`video_toolkit`, `python-dotenv`, `pytest`), Node ≥18 ESM (`scripts/bootstrap/cli.mjs`), Markdown command docs, `video_toolkit.paths` (`workspace_root()` / `toolkit_root()`).

## Global Constraints

- **Config installs only into the brand repo, never the core:** `.env` and cloud endpoints target `workspace_root()`; toolkit assets (Docker apps, requirements) resolve under `toolkit_root()`. In the core repo the two roots are identical, so single-repo behavior must stay unchanged (backward compatible).
- **Providers are Modal + RunPod only** — no Replicate, no new provider.
- **Nothing builds Docker locally.** Modal builds remotely in Modal's cloud on `modal deploy` (recipe in `toolkit/docker/modal-*/app.py`); RunPod uses prebuilt GHCR images (`ghcr.io/conalmullan/video-toolkit-*`), `--setup` only registers an endpoint.
- **Detect-or-deploy:** deploy/register a cloud tool only if the account doesn't already have it; otherwise record the existing endpoint in the brand repo's `.env`.
- **Brand-repo Python is `.venv/bin/python`** (created by `npx … init`); fall back to `python3` only in the core / when the venv is active.
- **`workspace.json` `kind`**: `"brand"` = brand repo (proceed), `"core"` or none = redirect to a brand repo.
- Commit messages: no `Co-Authored-By`.

---

## File Structure

- **Modify `video_toolkit/verify_setup.py`** — load `.env` from `workspace_root()` (was a bare, CWD-relative `load_dotenv()`), tolerant of no-workspace.
- **Create `video_toolkit/tests/test_verify_setup_env.py`** — unit test for the workspace-relative env load.
- **Modify `scripts/bootstrap/cli.mjs`** — `printNextSteps`, `claudeMd`, `readmeMd` recommend `/toolkit:setup`.
- **Modify `video_toolkit/tests/test_bootstrap_init.py`** — assert `/toolkit:setup` appears in next-steps + generated README/CLAUDE.md.
- **Modify `commands/setup.md`** — Phase 0 workspace gate; path resolution (`TOOLKIT`/`WS`); pip + R2 snippet fixes; Phase 4 detect-or-deploy.
- **Modify `commands/video.md`** — Step 0 brand-repo guard.
- **Modify `CLAUDE.md`** — canonical first-run order + the "config only into the brand repo" principle.

---

## Task 1: `verify_setup.py` loads `.env` from the workspace root

**Files:**
- Modify: `video_toolkit/verify_setup.py:20-23`
- Test: `video_toolkit/tests/test_verify_setup_env.py`

**Interfaces:**
- Produces: `_load_workspace_env() -> None` in `video_toolkit/verify_setup.py` — loads `.env` from `workspace_root()`, falling back to a bare `load_dotenv()` when no workspace is found. Called at module import (replacing the current bare `load_dotenv()`).

- [ ] **Step 1: Write the failing test**

Create `video_toolkit/tests/test_verify_setup_env.py`:

```python
"""verify_setup must read .env from the brand-repo (workspace) root, not CWD.

Setup runs commands from various dirs (e.g. cd into the toolkit for deploys), so
verification has to resolve .env the same way config.py does — via workspace_root().
"""
import os


def test_load_workspace_env_reads_env_from_workspace_root(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    (tmp_path / ".env").write_text("VTK_SENTINEL=hello-brand\n")
    sub = tmp_path / "projects" / "reel"
    sub.mkdir(parents=True)
    monkeypatch.chdir(sub)  # run from a subdir, not the workspace root
    monkeypatch.delenv("VTK_SENTINEL", raising=False)

    from video_toolkit.verify_setup import _load_workspace_env
    _load_workspace_env()

    assert os.environ.get("VTK_SENTINEL") == "hello-brand"


def test_load_workspace_env_tolerates_no_workspace(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # no workspace.json anywhere above
    # Must not raise even though there is no workspace.
    from video_toolkit.verify_setup import _load_workspace_env
    _load_workspace_env()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/test_verify_setup_env.py -v`
Expected: FAIL — `ImportError: cannot import name '_load_workspace_env'`.

- [ ] **Step 3: Implement the workspace-relative env load**

In `video_toolkit/verify_setup.py`, replace the current module-level env-load lines. The current code (around lines 20-23) is:

```python
sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv

load_dotenv()
```

Replace the bare `load_dotenv()` call with a function and its invocation:

```python
sys.path.insert(0, str(Path(__file__).parent))
from dotenv import load_dotenv


def _load_workspace_env() -> None:
    """Load .env from the workspace (brand-repo) root, so verification doesn't
    depend on the directory a command happens to run from. Falls back to a
    plain load_dotenv() when there is no workspace (e.g. a bare checkout)."""
    try:
        from video_toolkit.paths import workspace_root, WorkspaceNotFound
    except ImportError:
        load_dotenv()
        return
    try:
        load_dotenv(workspace_root() / ".env")
    except WorkspaceNotFound:
        load_dotenv()


_load_workspace_env()
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/test_verify_setup_env.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Confirm no regression in the broader suite**

Run: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/ -q`
Expected: all pass (existing count + 2).

- [ ] **Step 6: Commit**

```bash
git add video_toolkit/verify_setup.py video_toolkit/tests/test_verify_setup_env.py
git commit -m "fix(verify-setup): load .env from workspace root, not cwd"
```

---

## Task 2: `init` generated output recommends `/toolkit:setup`

**Files:**
- Modify: `scripts/bootstrap/cli.mjs` (functions `printNextSteps`, `claudeMd`, `readmeMd`)
- Test: `video_toolkit/tests/test_bootstrap_init.py`

**Interfaces:**
- Consumes: existing `printNextSteps`, `claudeMd`, `readmeMd` in `scripts/bootstrap/cli.mjs`.
- Produces: the scaffolded brand repo's next-steps stdout, `README.md`, and `CLAUDE.md` each mention `/toolkit:setup`.

- [ ] **Step 1: Write the failing test**

Append to `video_toolkit/tests/test_bootstrap_init.py`:

```python
def test_setup_is_recommended(tmp_path):
    target = tmp_path / "brand-e"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr
    # next-steps output points at setup
    assert "/toolkit:setup" in r.stdout
    # and so do the generated docs
    assert "/toolkit:setup" in (target / "README.md").read_text()
    assert "/toolkit:setup" in (target / "CLAUDE.md").read_text()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_setup_is_recommended -v`
Expected: FAIL — `/toolkit:setup` is absent from stdout / generated files.

- [ ] **Step 3: Add the `/toolkit:setup` line to next-steps**

In `scripts/bootstrap/cli.mjs`, in `printNextSteps`, change the "Then, inside Claude Code:" block. Current:

```js
    '  Then, inside Claude Code:',
    '    /toolkit:brand        # fill in your brand colors, fonts, voice',
    '    /toolkit:video        # start your first video project',
    '',
```

to:

```js
    '  Then, inside Claude Code:',
    '    /toolkit:brand        # fill in your brand colors, fonts, voice',
    '    /toolkit:setup        # configure env + deploy cloud AI tools (Modal/RunPod)',
    '    /toolkit:video        # start your first video project',
    '',
```

- [ ] **Step 4: Add `/toolkit:setup` to the generated `CLAUDE.md`**

In `scripts/bootstrap/cli.mjs`, in `claudeMd`, change the `## Start` block. Current:

```js
## Start
- \`/toolkit:brand\` — fill in brand identity.
- \`/toolkit:video\` — create or resume a video project.
`;
```

to:

```js
## Start
- \`/toolkit:brand\` — fill in brand identity.
- \`/toolkit:setup\` — configure \`.env\` and deploy/register cloud AI tools (Modal/RunPod). Rendering works without it (Node only); AI tools need it.
- \`/toolkit:video\` — create or resume a video project.
`;
```

- [ ] **Step 5: Add `/toolkit:setup` to the generated `README.md`**

In `scripts/bootstrap/cli.mjs`, in `readmeMd`, change the `## Getting started` list. Current:

```js
## Getting started
1. Launch Claude Code in this directory: \`claude\`
2. The \`/toolkit:*\` commands are available inside Claude Code (the plugin is
   pre-wired in \`.claude/settings.json\`).
3. Run \`/toolkit:brand\` to fill in brand identity, then \`/toolkit:video\`.
```

to:

```js
## Getting started
1. Launch Claude Code in this directory: \`claude\`
2. The \`/toolkit:*\` commands are available inside Claude Code (the plugin is
   pre-wired in \`.claude/settings.json\`).
3. Run \`/toolkit:brand\` (brand identity), then \`/toolkit:setup\` (configure
   \`.env\` + deploy cloud AI tools), then \`/toolkit:video\`. Rendering works with
   just Node; the AI cloud tools need \`/toolkit:setup\`.
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_setup_is_recommended -v`
Expected: PASS.

- [ ] **Step 7: Run the full bootstrap test file (no regressions)**

Run: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/test_bootstrap_init.py -v`
Expected: all pass (prior count + 1).

- [ ] **Step 8: Commit**

```bash
git add scripts/bootstrap/cli.mjs video_toolkit/tests/test_bootstrap_init.py
git commit -m "feat(bootstrap): recommend /toolkit:setup in next-steps and generated docs"
```

---

## Task 3: `commands/setup.md` — brand-repo-aware + detect-or-deploy

**Files:**
- Modify: `commands/setup.md`

**Interfaces:** none (command markdown executed by Claude). Verification is by grep/inspection; no unit test.

**How to apply:** each step below quotes an exact anchor already in the file. Locate it with Grep/Read first; if wording differs, place the new content at the semantically correct spot and note the deviation. Do not force a non-matching edit.

- [ ] **Step 1: Insert Phase 0 (workspace gate) before "### Step 1: Detect Current State"**

Find the line `### Step 1: Detect Current State` under `## Entry Point`. Immediately **before** it, insert:

````markdown
### Step 0: Workspace check (configure the brand repo, not the core)

Everything this wizard writes — `.env`, cloud endpoints — belongs to a **brand repo**, never to the
toolkit core. Use the brand repo's Python (`.venv/bin/python`, created by `npx … init`; fall back to
`python3` in the core or an activated venv). Resolve the workspace first:

```bash
PY="$([ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)"
"$PY" - <<'EOF'
import json, sys
from video_toolkit.paths import workspace_root, WorkspaceNotFound
try:
    ws = workspace_root()
except WorkspaceNotFound:
    print("NO_WORKSPACE"); sys.exit(0)
kind = json.loads((ws / "workspace.json").read_text()).get("kind", "")
print(f"{kind}\t{ws}")
EOF
```

- `brand<TAB><path>` → you're in a brand repo. Proceed to Step 1.
- `core<TAB><path>` or `NO_WORKSPACE` → **stop; do not configure the current directory.** Tell the user:

  > Setup configures a *brand repo* — its `.env` and cloud endpoints live there, not in the core.
  > Create one and run setup inside it:
  >
  >     npx github:xaralis/video-toolkit init my-brand-videos
  >     cd my-brand-videos
  >     claude          # then run /toolkit:setup here
  >
  > (Or `cd` into an existing brand repo and re-run /toolkit:setup.)

---
````

- [ ] **Step 2: Add path resolution at the top of "### Step 1: Detect Current State"**

Directly under the `### Step 1: Detect Current State` heading (before its existing numbered list), insert:

````markdown
Resolve both roots up front and use them for every path below. In the core repo they are the same
directory, so single-repo setup is unchanged:

```bash
PY="$([ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)"
TOOLKIT="$("$PY" -c 'from video_toolkit.paths import toolkit_root; print(toolkit_root())')"
WS="$("$PY" -c 'from video_toolkit.paths import workspace_root; print(workspace_root())')"
```

- Toolkit assets (Docker apps, requirements) live under `$TOOLKIT`.
- All `.env` reads and writes target `$WS/.env`.

````

- [ ] **Step 3: Fix the pip-packages install path (Phase 1)**

Find this line under `## Phase 1` → `### Recommended`:

```
- **pip packages**: `python3 -c "import dotenv; import requests"`. If missing: guide through `pip install -r video_toolkit/requirements.txt` (or venv setup)
```

Replace it with:

```
- **pip packages**: `"$WS/.venv/bin/python" -c "import dotenv; import requests"`. If missing: the toolkit is normally installed by `npx … init` into `.venv`; (re)install with `"$WS/.venv/bin/pip" install -e "$TOOLKIT"`.
```

- [ ] **Step 4: Fix the stale R2 connectivity test (Phase 3)**

In `## Phase 3` → `### Verify`, find the first two lines inside the `python3 -c "` block:

```
import sys; sys.path.insert(0, 'tools')
from file_transfer import upload_to_r2, delete_from_r2
```

Replace those two lines with a single proper module import:

```
from video_toolkit.file_transfer import upload_to_r2, delete_from_r2
```

Leave the rest of the snippet unchanged, and prefix the whole command so it runs with the workspace's
Python from the workspace root: change the leading `python3 -c "` to `"$WS/.venv/bin/python" -c "`.

- [ ] **Step 5: Make the Modal deployment flow detect-or-deploy (Phase 4)**

In `## Phase 4` → `### Modal Deployment Flow`, replace the block that begins "For each selected tool, run `modal deploy` and capture the endpoint URL:" together with its fenced list of `modal deploy docker/modal-*/app.py` commands, with:

````markdown
For each selected tool, **deploy only if it isn't already on the account.** The image builds remotely
in Modal's cloud and is cached per account, so a second brand repo usually deploys nothing and just
records the existing endpoints.

```bash
# What's already deployed on this Modal account:
modal app list

# Deploy a tool only when its app is missing. Run from the toolkit root so the
# app.py build context resolves. Repeat per selected tool:
cd "$TOOLKIT" && modal deploy docker/modal-qwen3-tts/app.py
#   docker/modal-flux2/app.py
#   docker/modal-image-edit/app.py
#   docker/modal-upscale/app.py
#   docker/modal-music-gen/app.py
#   docker/modal-propainter/app.py
```

If a tool's `MODAL_<TOOL>_ENDPOINT_URL` is already set in `$WS/.env` (or its app appears in
`modal app list`), skip the deploy and keep the existing URL. Otherwise parse the `.modal.run` URL
from the deploy output and write it to `$WS/.env`.
````

- [ ] **Step 6: Make the RunPod deployment flow detect-or-register (Phase 4)**

In `## Phase 4` → `### RunPod Deployment Flow`, replace the block beginning "For each selected tool, run the `--setup` command:" together with its fenced `python3 -m video_toolkit.*_setup` list and the trailing "Each `--setup` command creates a RunPod template + endpoint and saves the endpoint ID to .env automatically." line, with:

````markdown
RunPod tools use **prebuilt images published to GHCR** (`ghcr.io/conalmullan/video-toolkit-*`) —
nothing builds locally. `--setup` reuses an existing template/endpoint if one is already registered
on the account and only creates a new one otherwise. Run per selected tool (from `$WS`, using the
workspace Python):

```bash
"$WS/.venv/bin/python" -m video_toolkit.qwen3_tts --setup
#   video_toolkit.flux2 --setup
#   video_toolkit.image_edit --setup
#   video_toolkit.upscale --setup
#   video_toolkit.music_gen --setup
#   video_toolkit.dewatermark --setup
```

Each `--setup` writes the endpoint ID to the workspace `.env` (`$WS/.env`), creating it only if
missing — so re-running in a second brand repo just re-registers/records the endpoint, it never
rebuilds an image.
````

- [ ] **Step 7: Validate the edits**

Run:
```bash
cd /Users/xaralis/Workspace/progpce/core
grep -n "Step 0: Workspace check" commands/setup.md
grep -n 'TOOLKIT="' commands/setup.md
grep -n "video_toolkit.file_transfer" commands/setup.md
grep -n "modal app list" commands/setup.md
! grep -n "sys.path.insert(0, 'tools')" commands/setup.md && echo "stale tools-path removed"
! grep -nE "^modal deploy docker/" commands/setup.md && echo "unconditional modal deploy removed"
```
Expected: the first four greps print matching lines; the last two print the "removed" confirmations (exit 0).

- [ ] **Step 8: Commit**

```bash
git add commands/setup.md
git commit -m "feat(setup): brand-repo-aware paths + detect-or-deploy cloud tools"
```

---

## Task 4: `commands/video.md` guard + `CLAUDE.md` canonical order

**Files:**
- Modify: `commands/video.md`
- Modify: `CLAUDE.md`

**Interfaces:** none (docs). Verified by grep/inspection.

- [ ] **Step 1: Add the brand-repo guard to `commands/video.md`**

Find the line `### Step 1: Scan Projects` under `## Entry Point Logic`. Immediately **before** it, insert:

````markdown
### Step 0b: Brand-repo check (projects live in a brand repo)

Before scanning, confirm this is a brand repo — projects belong in a brand repo, not the toolkit core:

```bash
PY="$([ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)"
"$PY" - <<'EOF'
import json, sys
from video_toolkit.paths import workspace_root, WorkspaceNotFound
try:
    ws = workspace_root()
except WorkspaceNotFound:
    print("NO_WORKSPACE"); sys.exit(0)
print(json.loads((ws / "workspace.json").read_text()).get("kind", ""))
EOF
```

If the output is not `brand` (it's `core`, or `NO_WORKSPACE`), **do not scan or create projects here.**
Tell the user projects live in a brand repo:

> Video projects live in a *brand repo*. Create one:
>
>     npx github:xaralis/video-toolkit init my-brand-videos
>     cd my-brand-videos && claude
>
> then run /toolkit:setup (cloud tools) and /toolkit:video here. Or `cd` into an existing brand repo.

Otherwise proceed to Step 1.

---
````

- [ ] **Step 2: Add the canonical order + principle to `CLAUDE.md`**

In `CLAUDE.md`, find the paragraph in the Overview that begins "A new brand repo is bootstrapped with `npx github:xaralis/video-toolkit init <dir>`" and ends "No manual cloning or submodule linking." Immediately **after** that paragraph, insert a new paragraph:

```markdown
**First-run order (canonical):** `npx github:xaralis/video-toolkit init <dir>` → `cd <dir>` + `claude`
→ `/toolkit:setup` (writes `.env` and deploys/registers the cloud GPU tools — Modal/RunPod — for this
brand repo) → `/toolkit:video`. Per-repo configuration (`.env`, cloud endpoints, `.venv`) installs
**only into the brand repo, never into the core**. Cloud images are account-level (Modal builds
remotely on deploy; RunPod uses prebuilt GHCR images), so setup records the resulting endpoints in the
brand repo's `.env` and only deploys what the account is missing.
```

- [ ] **Step 3: Validate the edits**

Run:
```bash
cd /Users/xaralis/Workspace/progpce/core
grep -n "Step 0b: Brand-repo check" commands/video.md
grep -n "First-run order (canonical)" CLAUDE.md
grep -n "only into the brand repo, never into the core" CLAUDE.md
```
Expected: each grep prints a matching line.

- [ ] **Step 4: Commit**

```bash
git add commands/video.md CLAUDE.md
git commit -m "docs(setup): brand-repo guard in /toolkit:video + canonical first-run order"
```

---

## Final verification (after all tasks)

- [ ] Full suite: `/Users/xaralis/Workspace/progpce/core/.venv/bin/python -m pytest video_toolkit/tests/ -q` → all pass.
- [ ] **Manual dry-run (covers the command-markdown deliverables the unit tests can't):** in a scratch brand repo (reuse the bootstrap E2E approach — `node scripts/bootstrap/cli.mjs init <tmp>/demo --brand demo --yes --toolkit-url "$(pwd)"` with a Node ≥18), then from inside it verify:
  - `.venv/bin/python -c "from video_toolkit.paths import toolkit_root, workspace_root; print(toolkit_root()); print(workspace_root())"` prints `<tmp>/demo/toolkit` and `<tmp>/demo` (they differ — path resolution is correct).
  - the Phase 0 workspace snippet prints `brand<TAB><path>`.
  - running the same Phase 0 snippet from the *core* repo prints `core<TAB><path>` (the redirect branch).
  Clean up the scratch dir afterward.

---

## Self-Review

**Spec coverage:**
- Principle "config only into brand repo" → Global Constraints + Task 3 (paths) + Task 4 (CLAUDE.md). ✓
- Modal/RunPod build model, detect-or-deploy → Task 3 Steps 5-6. ✓
- Phase 0 workspace gate (brand vs core/none) → Task 3 Step 1. ✓
- Path resolution `toolkit_root()`/`workspace_root()`; `.env` at WS → Task 3 Steps 2-6. ✓
- Ordering (env first, then deploy) → preserved by existing phase order; Phase 4 edits keep deploy after env phases. ✓
- Stale R2 test fix → Task 3 Step 4. ✓
- `/toolkit:video` guard → Task 4 Step 1. ✓
- `init` next-steps + generated README/CLAUDE.md recommend setup → Task 2. ✓
- Core CLAUDE.md canonical order + principle → Task 4 Step 2. ✓
- verify_setup `.env` from workspace_root + test → Task 1. ✓
- Provider scope Modal+RunPod (no Replicate) → Global Constraints; no task adds a provider. ✓

**Placeholder scan:** No "TBD"/"handle edge cases". Every code step shows the exact old→new content; every doc step quotes the anchor and the full replacement. The `<TAB>` in expected output denotes a literal tab character (the `\t` printed by the snippet), not a placeholder. ✓

**Type/name consistency:** `_load_workspace_env` used consistently in Task 1 (definition, call, test). Shell vars `PY`/`TOOLKIT`/`WS` named identically across Task 3 steps and the Task 4 guard. `MODAL_<TOOL>_ENDPOINT_URL` matches the env-var convention already used in `verify_setup.check_modal_env_vars`. Generated-string assertions in Task 2's test match the exact `/toolkit:setup` strings added in Steps 3-5. ✓
