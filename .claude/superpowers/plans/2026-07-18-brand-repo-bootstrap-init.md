# Brand-repo bootstrap (`npx github:xaralis/video-toolkit init`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a zero-dependency Node CLI, invoked as `npx github:xaralis/video-toolkit init <dir>`, that scaffolds a ready-to-use brand repo (toolkit submodule + workspace + brand + plugin wiring), installs the Python toolkit, and prints next steps — plus the docs that make it the obvious path.

**Architecture:** A single ESM file `scripts/bootstrap/cli.mjs` (Node built-ins only) exposed via a new root `package.json` `bin`. A tiny subcommand router runs `init`, which preflights, scaffolds files/git, best-effort installs Python into `.venv`, then prints guidance. Everything is verified end-to-end by a pytest that runs the CLI against a **local** toolkit path with `--skip-install` (no network, no pip).

**Tech Stack:** Node ≥18 (ESM, `node:fs`/`node:child_process`/`node:path`/`node:readline/promises`), git, Python 3.13+ (target of the editable install), pytest (existing `video_toolkit/tests/` infra) driving the CLI via `subprocess`.

## Global Constraints

- **Node floor: ≥18.** Preflight must reject older Node (dev machines here have nvm defaults as old as v10 on PATH). The pytest test must locate a Node ≥18 itself or skip.
- **Zero runtime npm dependencies** in the CLI — Node built-ins only. No `package.json` `dependencies`/`devDependencies` added.
- **CLI file is `.mjs`** (explicit ESM). Do **not** add `"type": "module"` to the root `package.json` (would reinterpret other root `.js` files).
- **Cross-platform:** all filesystem work via Node `fs` (`cpSync`), never shell `cp`/`mkdir -p`; git via `child_process`. venv python path differs by platform (`.venv/bin/python` vs `.venv\Scripts\python.exe`).
- **Toolkit submodule URL default (HTTPS):** `https://github.com/xaralis/video-toolkit.git`; SSH form `git@github.com:xaralis/video-toolkit.git`.
- **Local-path submodule sources** (used by tests / offline) MUST be added with `git -c protocol.file.allow=always` (modern git blocks local-transport submodules by default, CVE-2022-39253).
- **Generated `.claude/settings.json`** marketplace source path is `./toolkit` (NOT `./`), else `/toolkit:*` won't resolve in the brand repo.
- **`workspace.json` `kind` MUST be `"brand"`** (core's own is `"core"`).
- Commit messages: no `Co-Authored-By` line.

---

## File Structure

- **Create `package.json`** (repo root) — npm manifest whose only job is the `bin` mapping that makes `npx github:...` work. No dependencies.
- **Create `scripts/bootstrap/cli.mjs`** — the entire CLI: router, arg parsing, preflight, scaffold, install, next-steps. One focused file (~260 lines).
- **Create `video_toolkit/tests/test_bootstrap_init.py`** — pytest that runs the CLI end-to-end against the local repo as the toolkit source.
- **Modify `README.md`** — add the "Create a new brand repo" section; reconcile the manual submodule prose.
- **Modify `docs/getting-started.md`** — add `init` as the brand-repo entry point.
- **Modify `docs/creating-brands.md`** — cross-link `init` ↔ `/toolkit:brand`.
- **Modify `CLAUDE.md`** (core) — one pointer in the brand-repo/submodule discussion.
- **Modify `_internal/toolkit-registry.json`** — register the bootstrap CLI under `tools`.

Rationale: the CLI is one cohesive unit (a linear scaffold script), so it stays in one file rather than being split by technical layer. Generated file *contents* are string-builder functions inside `cli.mjs` — small enough to co-locate, and they read top-to-bottom in scaffold order.

---

## Task 1: Root `package.json` + CLI skeleton (router, args, preflight, helpers)

**Files:**
- Create: `package.json`
- Create: `scripts/bootstrap/cli.mjs`
- Test: `video_toolkit/tests/test_bootstrap_init.py`

**Interfaces:**
- Produces (consumed by later tasks, all in `cli.mjs`):
  - `parseArgs(argv: string[]) -> { targetDir, brand, toolkitUrl, ssh, ref, skipInstall, yes }`
  - `fail(msg)`, `info(msg)`, `commandExists(cmd) -> bool`, `git(args: string[], cwd)`,
    `writeJson(path, obj)`, `slugify(s) -> string`, `isLocalPath(url) -> bool`,
    `ask(rl, question, def) -> Promise<string>`
  - `runInit(argv: string[]) -> Promise<void>` — at this task does: preflight → resolve dir → empty-check → `mkdir` → `git init`. Later tasks append steps.

- [ ] **Step 1: Write the failing test (skeleton behaviors)**

Create `video_toolkit/tests/test_bootstrap_init.py`:

```python
"""End-to-end tests for the brand-repo bootstrap CLI (scripts/bootstrap/cli.mjs).

Runs the real Node CLI via subprocess against THIS repo as a local toolkit
source, so no network and (with --skip-install) no pip. Skips cleanly when no
Node >= 18 is available.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CLI = REPO_ROOT / "scripts" / "bootstrap" / "cli.mjs"


def _node18() -> str | None:
    """First Node >= 18 on PATH or in common locations, else None."""
    candidates = []
    which = shutil.which("node")
    if which:
        candidates.append(which)
    candidates.append("/opt/homebrew/bin/node")
    candidates.append("/usr/local/bin/node")
    nvm = Path.home() / ".nvm" / "versions" / "node"
    if nvm.is_dir():
        for d in sorted(nvm.iterdir(), reverse=True):
            candidates.append(str(d / "bin" / "node"))
    for node in candidates:
        try:
            out = subprocess.run([node, "-p", "process.versions.node"],
                                 capture_output=True, text=True, timeout=15)
        except (OSError, subprocess.SubprocessError):
            continue
        if out.returncode == 0 and int(out.stdout.strip().split(".")[0]) >= 18:
            return node
    return None


NODE = _node18()
pytestmark = pytest.mark.skipif(NODE is None, reason="no Node >= 18 available")


def _run(args, cwd=None):
    return subprocess.run([NODE, str(CLI), *args], cwd=cwd,
                          capture_output=True, text=True, timeout=120)


def test_no_subcommand_prints_usage_and_fails():
    r = _run([])
    assert r.returncode != 0
    assert "init" in (r.stdout + r.stderr)


def test_unknown_subcommand_fails():
    r = _run(["frobnicate"])
    assert r.returncode != 0


def test_init_into_nonempty_dir_fails(tmp_path):
    (tmp_path / "occupied.txt").write_text("x")
    r = _run(["init", str(tmp_path), "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode != 0
    assert "not empty" in (r.stdout + r.stderr).lower()


def test_init_creates_git_repo(tmp_path):
    target = tmp_path / "brand-a"
    r = _run(["init", str(target), "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr
    assert (target / ".git").exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py -v`
Expected: FAIL — CLI file does not exist (`_run` errors / non-zero), or all tests error because `scripts/bootstrap/cli.mjs` is missing.

- [ ] **Step 3: Create the root `package.json`**

Create `package.json`:

```json
{
  "name": "video-toolkit",
  "version": "0.1.0",
  "description": "AI-native video production toolkit. Bootstrap a brand repo: npx github:xaralis/video-toolkit init <dir>",
  "bin": {
    "video-toolkit": "scripts/bootstrap/cli.mjs"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "scripts/bootstrap"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/xaralis/video-toolkit.git"
  }
}
```

- [ ] **Step 4: Create `scripts/bootstrap/cli.mjs` skeleton**

Create `scripts/bootstrap/cli.mjs`:

```js
#!/usr/bin/env node
// Bootstrap a brand repo that vendors this toolkit as a `toolkit/` submodule.
// Zero runtime dependencies — Node built-ins only. Invoked as:
//   npx github:xaralis/video-toolkit init <dir>
import {
  existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, cpSync,
} from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const TOOLKIT_HTTPS = 'https://github.com/xaralis/video-toolkit.git';
const TOOLKIT_SSH = 'git@github.com:xaralis/video-toolkit.git';

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }
function info(msg) { console.log(msg); }

function commandExists(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function isLocalPath(url) {
  return !/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/.test(url);
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) fail(`git ${args.join(' ')} failed`);
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function ask(rl, question, def) {
  if (!rl) return def;
  const a = (await rl.question(`${question}${def ? ` (${def})` : ''}: `)).trim();
  return a || def;
}

function parseArgs(argv) {
  const opts = {
    targetDir: null, brand: null, toolkitUrl: null,
    ssh: false, ref: 'main', skipInstall: false, yes: false,
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ssh') opts.ssh = true;
    else if (a === '--skip-install') opts.skipInstall = true;
    else if (a === '--yes' || a === '-y') opts.yes = true;
    else if (a === '--brand') opts.brand = argv[++i];
    else if (a === '--toolkit-url') opts.toolkitUrl = argv[++i];
    else if (a === '--ref') opts.ref = argv[++i];
    else if (a.startsWith('-')) fail(`unknown flag: ${a}`);
    else positionals.push(a);
  }
  opts.targetDir = positionals[0] ?? null;
  return opts;
}

function nodeMajor() { return parseInt(process.versions.node.split('.')[0], 10); }

function assertPreflight() {
  if (nodeMajor() < 18) fail(`Node 18+ required (found ${process.versions.node}).`);
  if (!commandExists('git')) fail('git is required but was not found on PATH.');
}

async function runInit(argv) {
  const opts = parseArgs(argv);
  assertPreflight();

  const rl = opts.yes ? null : createInterface({ input: stdin, output: stdout });
  try {
    let targetDir = opts.targetDir || await ask(rl, 'Target directory', 'my-brand-videos');
    targetDir = resolve(targetDir);
    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
      fail(`target directory is not empty: ${targetDir}`);
    }
    const guess = slugify(basename(targetDir).replace(/-videos$/, '')) || 'my-brand';
    const brand = slugify(opts.brand || await ask(rl, 'Brand slug', guess));
    if (!brand) fail('brand slug is required');
    const toolkitUrl = opts.toolkitUrl || (opts.ssh ? TOOLKIT_SSH : TOOLKIT_HTTPS);

    info(`\nCreating brand repo at ${targetDir} …`);
    mkdirSync(targetDir, { recursive: true });
    git(['init', '-q'], targetDir);

    // --- later tasks append scaffold + install + next-steps here ---
  } finally {
    rl?.close();
  }
}

function printUsage() {
  info(`video-toolkit — AI-native video production toolkit

Usage:
  npx github:xaralis/video-toolkit init [dir] [options]

Options:
  --brand <slug>        brand slug for brands/<slug>/ (default: derived from dir)
  --toolkit-url <url>   toolkit submodule source (default: ${TOOLKIT_HTTPS})
  --ssh                 use the SSH submodule URL instead of HTTPS
  --ref <branch|tag>    toolkit submodule pin (default: main)
  --skip-install        skip the Python toolkit install
  --yes, -y             non-interactive; accept defaults
`);
}

const [, , subcommand, ...rest] = process.argv;
if (!subcommand || subcommand === '-h' || subcommand === '--help') {
  printUsage();
  process.exit(subcommand ? 0 : 1);
} else if (subcommand === 'init') {
  await runInit(rest);
} else {
  console.error(`Unknown command: ${subcommand}`);
  printUsage();
  process.exit(1);
}
```

Then make it executable: `chmod +x scripts/bootstrap/cli.mjs`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py -v`
Expected: PASS (4 tests). `test_init_creates_git_repo` proves the skeleton reaches `git init`.

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/bootstrap/cli.mjs video_toolkit/tests/test_bootstrap_init.py
git commit -m "feat(bootstrap): CLI skeleton for npx video-toolkit init"
```

---

## Task 2: Scaffold submodule + workspace + brand + projects

**Files:**
- Modify: `scripts/bootstrap/cli.mjs`
- Test: `video_toolkit/tests/test_bootstrap_init.py`

**Interfaces:**
- Consumes: `git`, `writeJson`, `isLocalPath`, `info` (Task 1).
- Produces: `addToolkitSubmodule(targetDir, url, ref)`, `scaffoldWorkspace(targetDir, brand)`,
  `scaffoldBrand(targetDir, brand)`, `scaffoldProjects(targetDir)` — all called from `runInit`
  after `git init`. After this task, `runInit` produces `toolkit/`, `workspace.json`,
  `brands/<brand>/`, `projects/.gitkeep` (still no commit).

- [ ] **Step 1: Add the failing test (scaffold assertions)**

Append to `video_toolkit/tests/test_bootstrap_init.py`:

```python
def test_scaffold_files(tmp_path):
    target = tmp_path / "brand-b"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr

    # submodule present
    assert (target / "toolkit" / "brands" / "default" / "brand.json").exists()
    assert (target / ".gitmodules").exists()

    # workspace marker with kind=brand
    ws = json.loads((target / "workspace.json").read_text())
    assert ws["kind"] == "brand"
    assert ws["name"] == "acme-videos"

    # brand copied from default, name overridden
    bj = json.loads((target / "brands" / "acme" / "brand.json").read_text())
    assert bj["name"] == "acme"
    assert (target / "brands" / "acme" / "voice.json").exists()
    assert (target / "brands" / "acme" / "BRAND-RULES.md").exists()

    # projects dir kept
    assert (target / "projects" / ".gitkeep").exists()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_scaffold_files -v`
Expected: FAIL — `toolkit/` and `workspace.json` do not exist yet (assertion errors).

- [ ] **Step 3: Add scaffold functions and wire them into `runInit`**

In `scripts/bootstrap/cli.mjs`, add these functions (e.g. above `printUsage`):

```js
function addToolkitSubmodule(targetDir, url, ref) {
  info(`• Adding toolkit submodule (${url}) …`);
  const pre = isLocalPath(url) ? ['-c', 'protocol.file.allow=always'] : [];
  git([...pre, 'submodule', 'add', '--depth', '1', url, 'toolkit'], targetDir);
  if (ref && ref !== 'main') {
    git([...pre, '-C', 'toolkit', 'fetch', '--depth', '1', 'origin', ref], targetDir);
    git(['-C', 'toolkit', 'checkout', ref], targetDir);
  }
}

function scaffoldWorkspace(targetDir, brand) {
  writeJson(join(targetDir, 'workspace.json'), {
    name: `${brand}-videos`,
    kind: 'brand',
    comment: 'Marks this brand workspace. video_toolkit.paths.workspace_root() walks up to find it.',
  });
}

function scaffoldBrand(targetDir, brand) {
  const src = join(targetDir, 'toolkit', 'brands', 'default');
  const dst = join(targetDir, 'brands', brand);
  cpSync(src, dst, { recursive: true });
  const bjPath = join(dst, 'brand.json');
  const bj = JSON.parse(readFileSync(bjPath, 'utf8'));
  bj.name = brand;
  bj.description = `Brand profile for ${brand}`;
  writeJson(bjPath, bj);
  writeFileSync(join(dst, 'BRAND-RULES.md'), brandRulesStub(brand));
}

function brandRulesStub(brand) {
  return `# ${brand} — Brand Rules

Authoritative, machine- and human-enforced rules for this brand's videos. Every
rule here should be learned from a real defect; \`/toolkit:cut\` and
\`/toolkit:narrate\` load this file to enforce discipline.

Start by running \`/toolkit:brand\` to fill in colors, fonts, and voice, then add
rules as you go. Baseline conventions inherited from the toolkit:

- Accent color is for **emphasis only**, never large fills.
- Segments run **≥ 3s** on screen.
- Audio inherits across L-cuts unless explicitly overridden.

See \`toolkit/docs/video-timing.md\` and \`toolkit/docs/remotion-patterns.md\`.
`;
}

function scaffoldProjects(targetDir) {
  const dir = join(targetDir, 'projects');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.gitkeep'), '');
}
```

Then, in `runInit`, replace the `// --- later tasks ... ---` placeholder with:

```js
    addToolkitSubmodule(targetDir, toolkitUrl, opts.ref);
    scaffoldWorkspace(targetDir, brand);
    scaffoldBrand(targetDir, brand);
    scaffoldProjects(targetDir);

    // --- later tasks append config-files + commit + install + next-steps here ---
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_scaffold_files -v`
Expected: PASS. (First run clones the local toolkit as a submodule — may take a few seconds.)

- [ ] **Step 5: Run the full test file (no regressions)**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap/cli.mjs video_toolkit/tests/test_bootstrap_init.py
git commit -m "feat(bootstrap): scaffold submodule, workspace, brand, projects"
```

---

## Task 3: Config files, commit, and next-steps output

**Files:**
- Modify: `scripts/bootstrap/cli.mjs`
- Test: `video_toolkit/tests/test_bootstrap_init.py`

**Interfaces:**
- Consumes: `git`, `writeJson`, `cpSync`, `existsSync`, `info` (Tasks 1–2).
- Produces: `scaffoldClaudeSettings(targetDir)`, `scaffoldTopLevelFiles(targetDir, brand)`,
  `commitScaffold(targetDir, brand)`, `printNextSteps(targetDir, brand, {skipInstall, pyOk})` —
  called from `runInit`. After this task `runInit` finishes a committed repo and prints the
  next-steps block (install still stubbed → treat as skipped when `--skip-install`).

- [ ] **Step 1: Add the failing test (config + commit + next-steps)**

Append to `video_toolkit/tests/test_bootstrap_init.py`:

```python
def test_plugin_wiring_and_commit_and_nextsteps(tmp_path):
    target = tmp_path / "brand-c"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr

    # .claude/settings.json lights up the plugin, marketplace points at ./toolkit
    settings = json.loads((target / ".claude" / "settings.json").read_text())
    assert settings["enabledPlugins"]["toolkit@video-toolkit"] is True
    mp = settings["extraKnownMarketplaces"]["video-toolkit"]["source"]
    assert mp["path"] == "./toolkit"

    # thin CLAUDE.md references the toolkit + brand
    claude = (target / "CLAUDE.md").read_text()
    assert "toolkit/CLAUDE.md" in claude
    assert "acme" in claude

    # supporting files
    assert (target / ".gitignore").exists()
    assert (target / ".env.example").exists()
    assert (target / "README.md").exists()

    # an initial commit exists
    log = subprocess.run(["git", "-C", str(target), "log", "--oneline"],
                         capture_output=True, text=True)
    assert log.returncode == 0 and log.stdout.strip()

    # next-steps insists on launching Claude Code; commands live inside
    out = r.stdout
    assert "claude" in out
    assert "/toolkit:brand" in out
    assert "/toolkit:video" in out
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_plugin_wiring_and_commit_and_nextsteps -v`
Expected: FAIL — `.claude/settings.json`, `CLAUDE.md`, etc. not created; no commit; stdout lacks the next-steps block.

- [ ] **Step 3: Add config/commit/next-steps functions and wire them in**

In `scripts/bootstrap/cli.mjs`, add:

```js
function scaffoldClaudeSettings(targetDir) {
  const dir = join(targetDir, '.claude');
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'settings.json'), {
    hooks: {
      SessionStart: [{
        hooks: [{
          type: 'command',
          command: '.venv/bin/python -m video_toolkit.check_stale_projects 2>/dev/null || true',
        }],
      }],
    },
    extraKnownMarketplaces: {
      'video-toolkit': { source: { source: 'directory', path: './toolkit' } },
    },
    enabledPlugins: { 'toolkit@video-toolkit': true },
  });
}

function scaffoldTopLevelFiles(targetDir, brand) {
  writeFileSync(join(targetDir, 'CLAUDE.md'), claudeMd(brand));
  writeFileSync(join(targetDir, '.gitignore'), gitignore());
  const envSrc = join(targetDir, 'toolkit', '.env.example');
  if (existsSync(envSrc)) cpSync(envSrc, join(targetDir, '.env.example'));
  writeFileSync(join(targetDir, 'README.md'), readmeMd(brand));
}

function claudeMd(brand) {
  return `# ${brand} — video projects

Brand repo for **${brand}**. It vendors the shared video toolkit as the
\`toolkit/\` submodule and consumes its skills/commands as the
\`toolkit@video-toolkit\` plugin (invoked as \`/toolkit:<name>\`).

## Read first
- \`toolkit/CLAUDE.md\` — the authoritative toolkit guidance (workflow, tools, patterns).
- \`brands/${brand}/BRAND-RULES.md\` — this brand's authoritative video rules.

## Layout
- \`toolkit/\` — shared core (git submodule; update its pin to take upstream fixes).
- \`brands/${brand}/\` — this brand's colors, fonts, voice, BRAND-RULES.md.
- \`projects/\` — this brand's video projects (source in git; heavy media via \`/toolkit:sync\` to R2).

## Start
- \`/toolkit:brand\` — fill in brand identity.
- \`/toolkit:video\` — create or resume a video project.
`;
}

function gitignore() {
  return `# Environment and secrets
.env
.env.local
.env.*.local
*.pem
*.key

# Python
.venv/
venv/
__pycache__/
*.py[cod]
*.egg-info/
.pytest_cache/

# Node.js
node_modules/
npm-debug.log*

# Build outputs / heavy media (kept in R2 via /toolkit:sync)
out/
*.mp4
*.webm
*.gif
*.mov

# OS
.DS_Store
`;
}

function readmeMd(brand) {
  return `# ${brand} — video projects

Brand repo scaffolded by the video toolkit. See \`CLAUDE.md\` for how it fits together.

## Getting started
1. Launch Claude Code in this directory: \`claude\`
2. The \`/toolkit:*\` commands are available inside Claude Code (the plugin is
   pre-wired in \`.claude/settings.json\`).
3. Run \`/toolkit:brand\` to fill in brand identity, then \`/toolkit:video\`.

## Python tools
The toolkit's Python CLI is installed into \`.venv\` (\`source .venv/bin/activate\`).
To reinstall: \`python3 -m venv .venv && .venv/bin/pip install -e toolkit\`.

## Updating the toolkit
\`git submodule update --remote toolkit\` then commit the new pin.
`;
}

function commitScaffold(targetDir, brand) {
  git(['add', '-A'], targetDir);
  const idFlags = [];
  const hasEmail = spawnSync('git', ['config', 'user.email'], { cwd: targetDir, stdio: 'ignore' }).status === 0;
  if (!hasEmail) idFlags.push('-c', 'user.email=bootstrap@video-toolkit.local', '-c', 'user.name=video-toolkit');
  git([...idFlags, 'commit', '-q', '-m', `chore: bootstrap ${brand} brand repo via video-toolkit init`], targetDir);
}

function printNextSteps(targetDir, brand, { skipInstall, pyOk }) {
  const dir = basename(targetDir);
  const lines = [
    '',
    `✓ Brand repo ready at ${dir}/`,
    '',
    'Next steps:',
    `  cd ${dir}`,
    '  claude                  # launch Claude Code — the /toolkit:* commands live INSIDE it',
    '                          # (the plugin is already wired up in .claude/settings.json)',
    '',
    '  Then, inside Claude Code:',
    '    /toolkit:brand        # fill in your brand colors, fonts, voice',
    '    /toolkit:video        # start your first video project',
    '',
  ];
  if (skipInstall) {
    lines.push('  ! Dependencies not installed (--skip-install). To install the Python tools:');
    lines.push('      python3 -m venv .venv && .venv/bin/pip install -e toolkit');
  } else if (pyOk) {
    lines.push('  Python tools installed into .venv (activate: source .venv/bin/activate)');
  } else {
    lines.push('  ! Python toolkit not installed. Install Python 3.13+, then:');
    lines.push('      python3 -m venv .venv && .venv/bin/pip install -e toolkit');
  }
  lines.push('  Optional: ffmpeg for media; RunPod/ElevenLabs keys in .env for AI voice');
  console.log(lines.join('\n'));
}
```

Then update `runInit`: replace the `// --- later tasks append config-files ... ---`
placeholder with:

```js
    scaffoldClaudeSettings(targetDir);
    scaffoldTopLevelFiles(targetDir, brand);
    commitScaffold(targetDir, brand);

    const pyOk = opts.skipInstall ? false : false; // install lands in Task 4
    printNextSteps(targetDir, brand, { skipInstall: opts.skipInstall, pyOk });
```

(The temporary `pyOk` line is replaced in Task 4.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_plugin_wiring_and_commit_and_nextsteps -v`
Expected: PASS.

- [ ] **Step 5: Run the full test file (no regressions)**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py -v`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap/cli.mjs video_toolkit/tests/test_bootstrap_init.py
git commit -m "feat(bootstrap): plugin wiring, thin CLAUDE.md, commit, next-steps"
```

---

## Task 4: Python install phase

**Files:**
- Modify: `scripts/bootstrap/cli.mjs`
- Test: `video_toolkit/tests/test_bootstrap_init.py`

**Interfaces:**
- Consumes: `commandExists`, `info`, `spawnSync` (Task 1).
- Produces: `findPython() -> string|null`, `installPython(targetDir) -> bool`. `runInit` now
  calls `installPython` unless `--skip-install`, passing the result to `printNextSteps`.

- [ ] **Step 1: Add the failing test (skip-install leaves no venv; note surfaces)**

Append to `video_toolkit/tests/test_bootstrap_init.py`:

```python
def test_skip_install_leaves_no_venv_and_notes_it(tmp_path):
    target = tmp_path / "brand-d"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr
    assert not (target / ".venv").exists()
    assert "--skip-install" in r.stdout
    assert "pip install -e toolkit" in r.stdout
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_skip_install_leaves_no_venv_and_notes_it -v`
Expected: FAIL — the current next-steps text for `--skip-install` already mentions
`pip install -e toolkit`, but if it does not yet render that exact branch it fails; primarily
this locks the behavior in before adding the install code so Task 4 cannot regress it.

> Note: this test may already pass from Task 3's next-steps branch. That is fine — it guards the
> contract while we add the real install path below. If it passes at Step 2, still complete
> Steps 3–5 to add `installPython` and re-verify no regression.

- [ ] **Step 3: Add the install functions and wire them into `runInit`**

In `scripts/bootstrap/cli.mjs`, add:

```js
function findPython() {
  for (const c of ['python3', 'python']) if (commandExists(c)) return c;
  return null;
}

function installPython(targetDir) {
  const py = findPython();
  if (!py) {
    info('\n• Python 3 not found — skipping toolkit install (see next steps).');
    return false;
  }
  info(`\n• Installing Python toolkit into .venv (using ${py}) …`);
  const venv = join(targetDir, '.venv');
  const mk = spawnSync(py, ['-m', 'venv', venv], { cwd: targetDir, stdio: 'inherit' });
  if (mk.status !== 0) {
    info('  ! venv creation failed — skipping (see next steps).');
    return false;
  }
  const venvPy = process.platform === 'win32'
    ? join(venv, 'Scripts', 'python.exe')
    : join(venv, 'bin', 'python');
  const pip = spawnSync(venvPy, ['-m', 'pip', 'install', '-e', 'toolkit', '-q'],
    { cwd: targetDir, stdio: 'inherit' });
  if (pip.status !== 0) {
    info('  ! pip install -e toolkit failed — see next steps.');
    return false;
  }
  return true;
}
```

Then in `runInit`, replace the temporary `pyOk` line from Task 3:

```js
    const pyOk = opts.skipInstall ? false : false; // install lands in Task 4
```

with:

```js
    let pyOk = false;
    if (opts.skipInstall) info('\n• Skipping dependency install (--skip-install).');
    else pyOk = installPython(targetDir);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py::test_skip_install_leaves_no_venv_and_notes_it -v`
Expected: PASS.

- [ ] **Step 5: Run the full test file (no regressions)**

Run: `python -m pytest video_toolkit/tests/test_bootstrap_init.py -v`
Expected: PASS (7 tests).

> **Coverage note (state explicitly, do not silently skip):** the automated tests exercise the
> `--skip-install` path only. The *positive* install (`.venv` + `pip install -e toolkit`) and the
> `findPython()==null` degradation are verified once manually at the verification step below,
> because a real editable install needs Python 3.13+ and is too slow/network-bound for a unit
> test.

- [ ] **Step 6: Commit**

```bash
git add scripts/bootstrap/cli.mjs video_toolkit/tests/test_bootstrap_init.py
git commit -m "feat(bootstrap): best-effort Python toolkit install into .venv"
```

---

## Task 5: Documentation + registry

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/creating-brands.md`
- Modify: `CLAUDE.md`
- Modify: `_internal/toolkit-registry.json`

**Interfaces:** none (docs only). No test; verified by inspection + `python -m json.tool` on the
registry.

- [ ] **Step 1: README — add "Create a new brand repo" section**

In `README.md`, immediately after the intro paragraph that describes the shared-core/submodule
model (the paragraph ending "…each vendoring this repo as a `toolkit/` git submodule — see
[Project Structure](#project-structure) below."), insert:

```markdown
## Create a new brand repo

You do **not** clone this core or wire up submodules by hand. From an empty directory name, run:

```bash
npx github:xaralis/video-toolkit init my-brand-videos
```

This scaffolds a ready-to-use brand repo: the toolkit vendored as a `toolkit/` submodule, a
`workspace.json` marker, a starter brand copied from the neutral default, the `projects/` folder,
and `.claude/settings.json` that pre-enables the `toolkit@video-toolkit` plugin. It then installs
the Python toolkit into `.venv`. Node 18+ and git are required (both are already needed to render).

When it finishes, `cd` into the new directory and **launch Claude Code** (`claude`) — the
`/toolkit:*` slash commands live inside Claude Code. Then run `/toolkit:brand` to fill in your
colors/fonts/voice and `/toolkit:video` to start your first video.
```

Then, in the existing plugin-install / Project Structure prose, adjust the wording so the manual
`git submodule add` steps read as "what `init` does for you" rather than the primary path. Change
the line that currently reads (around the plugin-install block):

> A per-brand repo consumes the exact same plugin by vendoring this repo as a `toolkit/` submodule; the commands are identical, invoked as `/toolkit:<name>` everywhere. See a brand repo's own README for that setup.

to:

> A per-brand repo consumes the exact same plugin by vendoring this repo as a `toolkit/` submodule; the commands are identical, invoked as `/toolkit:<name>` everywhere. **`npx github:xaralis/video-toolkit init` sets all of this up for you** — see [Create a new brand repo](#create-a-new-brand-repo).

- [ ] **Step 2: getting-started — add the brand-repo entry point**

In `docs/getting-started.md`, directly after the "## Your First Video in 2 Minutes" block
(the `cd examples/hello-world` quick start), add:

```markdown
## Starting your own brand repo

The quick start above renders a bundled example straight from this core. To make **your own**
videos, create a brand repo (a separate repo that vendors this toolkit):

```bash
npx github:xaralis/video-toolkit init my-brand-videos
cd my-brand-videos
claude    # the /toolkit:* commands live inside Claude Code
```

`init` adds the toolkit as a `toolkit/` submodule, scaffolds a starter brand and `projects/`,
pre-wires the `toolkit@video-toolkit` plugin, and installs the Python tools into `.venv`. Inside
Claude Code, run `/toolkit:brand` then `/toolkit:video`.
```

- [ ] **Step 3: creating-brands — cross-link init and /toolkit:brand**

In `docs/creating-brands.md`, directly under the top `> **Quick Start:**` callout, add:

```markdown
> **New repo?** `npx github:xaralis/video-toolkit init my-brand-videos` scaffolds the whole brand
> repo (toolkit submodule + a starter brand). Then `/toolkit:brand` fills in the brand's colors,
> fonts, and voice. Use `init` once per repo; use `/toolkit:brand` to create/edit brands within it.
```

- [ ] **Step 4: CLAUDE.md — pointer to init as the bootstrap entry point**

In `CLAUDE.md`, in the Overview section, at the end of the paragraph that describes the brand-repo
layout (the block showing `my-brand-videos/ … └── CLAUDE.md`), add this sentence after the code
fence:

```markdown
A new brand repo is bootstrapped with `npx github:xaralis/video-toolkit init <dir>` (Node CLI in
`scripts/bootstrap/`): it adds the `toolkit/` submodule, scaffolds `workspace.json`
(`kind: "brand"`), a starter brand, `projects/`, and `.claude/settings.json` (which enables the
`toolkit@video-toolkit` plugin), then installs the Python toolkit into `.venv`. No manual cloning
or submodule linking.
```

- [ ] **Step 5: registry — register the bootstrap CLI**

In `_internal/toolkit-registry.json`, add an entry under the top-level `"tools"` object (match the
sibling entries' shape). Insert:

```json
    "bootstrap": {
      "path": "scripts/bootstrap/cli.mjs",
      "type": "cli",
      "description": "Scaffold a new brand repo (toolkit submodule + brand + plugin wiring) and install deps. Run via: npx github:xaralis/video-toolkit init <dir>",
      "runtime": "node",
      "status": "stable"
    }
```

(If `tools` entries use different keys, mirror them; keep `path`, `description`, `status`.)

- [ ] **Step 6: Validate registry JSON**

Run: `python -m json.tool _internal/toolkit-registry.json > /dev/null && echo OK`
Expected: `OK` (valid JSON).

- [ ] **Step 7: Commit**

```bash
git add README.md docs/getting-started.md docs/creating-brands.md CLAUDE.md _internal/toolkit-registry.json
git commit -m "docs(bootstrap): document npx video-toolkit init as the brand-repo entry point"
```

---

## Final verification (after all tasks)

- [ ] Run the whole bootstrap test file: `python -m pytest video_toolkit/tests/test_bootstrap_init.py -v` → all PASS (7 tests) or SKIP if no Node ≥18.
- [ ] Run the broader suite to confirm no regressions: `python -m pytest video_toolkit/tests/ -q`.
- [ ] **Manual end-to-end (covers the install path the unit tests skip):** from a scratch dir,
  run with a Node ≥18 binary and NO `--skip-install` against the local toolkit:
  `/opt/homebrew/bin/node scripts/bootstrap/cli.mjs init /tmp/vtk-smoke --brand demo --yes --toolkit-url "$(pwd)"`
  Confirm: `.venv/bin/python -c "import video_toolkit"` works inside `/tmp/vtk-smoke`, the
  next-steps block says the Python tools were installed, and `git -C /tmp/vtk-smoke log --oneline`
  shows the bootstrap commit. Clean up `/tmp/vtk-smoke` afterward.

---

## Self-Review

**Spec coverage:**
- `init` subcommand + npx-from-GitHub + Node zero-dep + flags → Tasks 1 (skeleton/flags), 2–4 (behavior). ✓
- Root `package.json` `bin` → Task 1. ✓
- Preflight (git, Node ≥18, empty dir) → Task 1. ✓
- Submodule (+ local-path `protocol.file.allow`), `workspace.json` kind=brand, brand copy, `projects/` → Task 2. ✓
- `.claude/settings.json` marketplace `./toolkit` + enabled plugin + hook, thin CLAUDE.md, .gitignore/.env.example/README, commit → Task 3. ✓
- Install phase (venv + `pip install -e toolkit`, `--skip-install`, degradation/TODO surfacing) → Task 4. ✓
- Next-steps output insisting on launching `claude` (commands live inside) → Task 3 (asserted), refined in Task 4. ✓
- Docs (README, getting-started, creating-brands, CLAUDE.md) + registry → Task 5. ✓
- Testing via local `--toolkit-url` + `--skip-install`, Node≥18 discovery → Tasks 1–4 test file. ✓
- Assumptions (public repo, tarball size, root package.json harmlessness) → documented in spec; no code needed.

**Placeholder scan:** No "TBD"/"handle edge cases" — every step has concrete code/commands. The two intentional in-code markers (`// --- later tasks ... ---` and the temporary `pyOk` line) are explicitly created and later replaced with shown code. ✓

**Type/name consistency:** Function names are stable across tasks — `runInit`, `parseArgs`, `git`, `writeJson`, `isLocalPath`, `commandExists`, `ask`, `slugify`, `addToolkitSubmodule`, `scaffoldWorkspace`, `scaffoldBrand`, `brandRulesStub`, `scaffoldProjects`, `scaffoldClaudeSettings`, `scaffoldTopLevelFiles`, `claudeMd`, `gitignore`, `readmeMd`, `commitScaffold`, `printNextSteps`, `findPython`, `installPython`. `printNextSteps` signature `(targetDir, brand, {skipInstall, pyOk})` is consistent between Task 3 (definition + call) and Task 4 (updated call). ✓
