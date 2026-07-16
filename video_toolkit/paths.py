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
