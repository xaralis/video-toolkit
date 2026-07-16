#!/usr/bin/env python3
"""Emit a banner if any local project lags behind R2.

Designed to be called from a SessionStart hook. Cheap (one list_objects_v2
call per project, no downloads), and degrades silently when R2 is not
configured or unreachable.

Behavior:
- Exits 0 with no output when everything is in sync, R2 isn't configured,
  or the connection times out. Never fails the hook.
- Otherwise prints a short Czech banner listing which projects have new or
  changed files on R2, so Claude can offer to pull on user request.

Comparison is size-based only — same heuristic as `sync_project.py`. Good
enough for the typical case (file added on a different machine, or a
larger re-render replaced the old one).
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "tools"))


SUBDIRS = ["public/recordings", "public/broll", "public/audio", "out"]
TIMEOUT_SECONDS = 5


def local_inventory(proj: Path) -> dict[str, int]:
    """{relative_key: size} for all syncable files in a project."""
    out: dict[str, int] = {}
    for subdir in SUBDIRS:
        d = proj / subdir
        if not d.is_dir():
            continue
        for f in d.iterdir():
            if not f.is_file() or f.name.startswith("."):
                continue
            key = f"projects/{proj.name}/{subdir}/{f.name}"
            out[key] = f.stat().st_size
    return out


def remote_inventory(client, bucket: str, name: str) -> dict[str, int]:
    """{key: size} for all objects under projects/<name>/ in R2."""
    out: dict[str, int] = {}
    paginator = client.get_paginator("list_objects_v2")
    for subdir in SUBDIRS:
        prefix = f"projects/{name}/{subdir}/"
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []) or []:
                out[obj["Key"]] = obj["Size"]
    return out


def stale_summary(local: dict[str, int], remote: dict[str, int]) -> tuple[int, int]:
    """(new_on_remote, size_changed) counts."""
    new = sum(1 for k in remote if k not in local)
    changed = sum(1 for k in remote if k in local and remote[k] != local[k])
    return new, changed


def main() -> int:
    try:
        from config import get_r2_config
        import boto3
        from botocore.config import Config
    except ImportError:
        return 0

    try:
        r2 = get_r2_config()
    except Exception:
        return 0
    if not r2:
        return 0

    # Tight timeout so a flaky network never blocks SessionStart for long.
    try:
        client = boto3.client(
            "s3",
            endpoint_url=r2["endpoint_url"],
            aws_access_key_id=r2["access_key_id"],
            aws_secret_access_key=r2["secret_access_key"],
            region_name="auto",
            config=Config(
                signature_version="s3v4",
                connect_timeout=TIMEOUT_SECONDS,
                read_timeout=TIMEOUT_SECONDS,
                retries={"max_attempts": 1},
            ),
        )
    except Exception:
        return 0

    bucket = r2["bucket_name"]
    projects_dir = REPO_ROOT / "projects"
    if not projects_dir.is_dir():
        return 0

    stale: list[tuple[str, int, int]] = []
    for proj in sorted(projects_dir.iterdir()):
        if not proj.is_dir() or proj.name.startswith("."):
            continue
        try:
            remote = remote_inventory(client, bucket, proj.name)
        except Exception:
            return 0  # silent — never block SessionStart
        if not remote:
            continue
        local = local_inventory(proj)
        new, changed = stale_summary(local, remote)
        if new or changed:
            stale.append((proj.name, new, changed))

    if not stale:
        return 0

    print("=== R2 STALE PROJECTS ===")
    print("Tyto projekty mají na R2 soubory, které lokálně chybí nebo se liší velikostí:")
    for name, new, changed in stale:
        bits = []
        if new:
            bits.append(f"{new} nový/ch")
        if changed:
            bits.append(f"{changed} změněný/ch")
        print(f"  - {name}: {', '.join(bits)}")
    print()
    print("Až uživatel zmíní práci na některém z nich, NEJDŘÍV zavolej:")
    print("  python3 tools/sync_project.py --pull <name>")
    print("a teprve potom dělej cokoli s jeho soubory.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
