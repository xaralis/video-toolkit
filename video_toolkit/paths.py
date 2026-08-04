"""Locate the workspace and the toolkit.

`REPO_ROOT = Path(__file__).parent.parent` conflated two roots that were the
same directory only while the toolkit and the projects lived in one repo:

  * the **workspace** — where `projects/` and `brands/` live
  * the **toolkit**   — where `templates/` and `lib/` live

A brand repo consumes the toolkit as a `toolkit/` submodule, so they differ.
"""

from pathlib import Path

MARKER = "workspace.json"


class WorkspaceNotFound(RuntimeError):
    """No workspace.json found walking up from the start directory."""


def workspace_root(start: Path | None = None) -> Path:
    """Nearest ancestor of `start` (default CWD) containing workspace.json."""
    current = (Path.cwd() if start is None else Path(start)).resolve()
    for candidate in (current, *current.parents):
        if (candidate / MARKER).is_file():
            return candidate
    raise WorkspaceNotFound(
        f"no {MARKER} found in {current} or any parent — "
        f"run this from inside a workspace"
    )


def toolkit_root() -> Path:
    """Directory holding the toolkit's templates/ and lib/."""
    return Path(__file__).resolve().parent.parent


ENV_FILE = ".env"


def find_env_file(start: Path | None = None) -> Path | None:
    """The `.env` the tools should read, or None when there is none.

    `Path(__file__).parent.parent / ".env"` was wrong for every vendored
    toolkit: it points at `<brand-repo>/toolkit/.env`, and per-repo
    configuration installs only into the brand repo, never into the toolkit.

    So the workspace root wins — that is where setup writes it, and a file
    left behind in the toolkit submodule must never shadow the repo you are
    working in. Failing that, walk UP from the package and take the first
    hit, which covers a standalone checkout with no workspace marker.
    """
    try:
        candidate = workspace_root() / ENV_FILE
    except WorkspaceNotFound:
        pass
    else:
        if candidate.is_file():
            return candidate

    start_dir = (Path(__file__).parent if start is None else Path(start)).resolve()
    for directory in (start_dir, *start_dir.parents):
        candidate = directory / ENV_FILE
        if candidate.is_file():
            return candidate
    return None


def env_file_for_write(start: Path | None = None) -> Path:
    """Where to save an endpoint so the readers above will find it.

    Writing a fresh `.env` into the toolkit submodule would be invisible to
    every tool and lost on the next submodule bump, so prefer the workspace.
    """
    existing = find_env_file(start)
    if existing is not None:
        return existing
    try:
        return workspace_root() / ENV_FILE
    except WorkspaceNotFound:
        return toolkit_root() / ENV_FILE


class NotFound(RuntimeError):
    """A named template or brand exists in neither the workspace nor the toolkit."""


def _find(kind: str, name: str) -> Path:
    """Nearest-wins lookup: the workspace's own copy beats the toolkit's.

    `templates/` and `brands/` legitimately exist in both repos — a brand ships
    its own template (ROOST has templates/roost-reels) while core ships the
    shared ones. Binding either to a single root would hide the other.
    """
    candidates = []
    try:
        candidates.append(workspace_root() / kind / name)
    except WorkspaceNotFound:
        pass
    candidates.append(toolkit_root() / kind / name)

    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise NotFound(
        f"no {kind[:-1]} named {name!r} — looked in: "
        + ", ".join(str(c) for c in candidates)
    )


def find_template(name: str) -> Path:
    """Locate a template by name, preferring the workspace's own."""
    return _find("templates", name)


def find_brand(name: str) -> Path:
    """Locate a brand by name, preferring the workspace's own."""
    return _find("brands", name)
