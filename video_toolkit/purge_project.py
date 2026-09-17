#!/usr/bin/env python3
"""Free disk space: delete local project media that R2 provably holds.

Deletion is irreversible, so a file goes only when ALL of these hold:
  - an object exists at the matching R2 key (same layout `sync_project` pushes to)
  - its size equals the local size
  - its ETag equals the local checksum (plain MD5, or the multipart md5-of-md5s)
  - the file is NOT tracked by git (music beds, transcripts, brand assets live in git
    and take no real space — deleting them would only dirty the working tree)

Anything else is kept and reported with the reason. Only the media subdirs
`sync_project` syncs are ever touched. Without an explicit project, only projects
whose project.json says `phase: complete` are considered.

Usage (via sync_project):
    python3 -m video_toolkit.sync_project --purge                # dry run, all complete projects
    python3 -m video_toolkit.sync_project --purge pp-smoke-03    # dry run, one project (any phase)
    python3 -m video_toolkit.sync_project --purge --yes          # actually delete
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from video_toolkit import sync_project
from video_toolkit.paths import workspace_root

MiB = 1024 * 1024
# Part sizes seen in practice: boto3 upload_file (8 MiB), the S3 minimum many
# browser uploaders use (5 MiB), and common larger chunkings.
COMMON_PART_SIZES = [8 * MiB, 5 * MiB, 10 * MiB, 16 * MiB, 64 * MiB, 100 * MiB]
_READ = 4 * MiB


@dataclass
class Entry:
    subdir: str
    rel: str
    path: Path
    size: int
    reason: str = ""


@dataclass
class Plan:
    project: str
    delete: list[Entry] = field(default_factory=list)
    keep: list[Entry] = field(default_factory=list)
    skipped_tracked: int = 0

    @property
    def delete_bytes(self) -> int:
        return sum(e.size for e in self.delete)


def _md5_file(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        while chunk := f.read(_READ):
            h.update(chunk)
    return h.hexdigest()


def _multipart_etag(path: Path, part_size: int) -> str:
    digests = []
    with path.open("rb") as f:
        while chunk := f.read(part_size):
            digests.append(hashlib.md5(chunk).digest())
    return f"{hashlib.md5(b''.join(digests)).hexdigest()}-{len(digests)}"


def etag_matches(path: Path, etag: str) -> bool:
    """True when the local file's content reproduces the S3/R2 ETag.

    A plain ETag is the object's MD5. A multipart ETag (`<hex>-<N>`) is the MD5 of
    the N part MD5s, which depends on the uploader's part size — try the size
    implied by N (rounded up to a whole MiB) and the common chunkings, keeping only
    candidates that actually yield N parts. No candidate matching means "cannot
    verify", which callers must treat as a mismatch.
    """
    etag = etag.strip('"')
    if "-" not in etag:
        return _md5_file(path) == etag
    try:
        parts = int(etag.rsplit("-", 1)[1])
    except ValueError:
        return False
    size = path.stat().st_size
    implied = math.ceil(size / parts / MiB) * MiB if parts else 0
    candidates = dict.fromkeys([implied, *COMMON_PART_SIZES])
    for part in candidates:
        if part and math.ceil(size / part) == parts and _multipart_etag(path, part) == etag:
            return True
    return False


def _git_tracked(root: Path, proj: Path) -> set[Path]:
    """Absolute paths git tracks under `proj`; empty when `root` is not a git repo."""
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z", "--", str(proj.relative_to(root))],
            cwd=root, capture_output=True, check=True,
        ).stdout
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return set()
    return {(root / p).resolve() for p in out.decode().split("\0") if p}


def _remote_index(client, bucket: str, name: str) -> dict[str, tuple[int, str]]:
    index: dict[str, tuple[int, str]] = {}
    paginator = client.get_paginator("list_objects_v2")
    for subdir in sync_project.SUBDIRS:
        for page in paginator.paginate(Bucket=bucket, Prefix=sync_project.r2_prefix(name, subdir)):
            for o in page.get("Contents", []) or []:
                index[o["Key"]] = (o["Size"], o.get("ETag", ""))
    return index


def select_projects(explicit: str | None) -> list[str]:
    if explicit:
        sync_project.project_path(explicit)  # raises SystemExit when missing
        return [explicit]
    names = []
    for d in sorted((workspace_root() / "projects").iterdir()):
        try:
            phase = json.loads((d / "project.json").read_text()).get("phase")
        except (OSError, ValueError):
            continue
        if phase == "complete":
            names.append(d.name)
    return names


def plan_project(name: str) -> Plan:
    client, config = sync_project.get_r2_client()
    if not client:
        raise SystemExit("ERROR: R2 not configured — refusing to delete anything without verifying the cloud copy")
    root = workspace_root()
    proj = sync_project.project_path(name)
    remote = _remote_index(client, config["bucket_name"], name)
    tracked = _git_tracked(root, proj)

    plan = Plan(project=name)
    for subdir, path, rel, size in sync_project.list_local_files(proj, sync_project.SUBDIRS):
        if path.resolve() in tracked:
            plan.skipped_tracked += 1
            continue
        entry = Entry(subdir, rel, path, size)
        obj = remote.get(sync_project.r2_prefix(name, subdir) + rel)
        if obj is None:
            entry.reason = "not on R2"
        elif obj[0] != size:
            entry.reason = "size mismatch"
        elif not etag_matches(path, obj[1]):
            entry.reason = "checksum mismatch"
        (plan.keep if entry.reason else plan.delete).append(entry)
    return plan


def cmd_purge(explicit: str | None, confirm: bool) -> int:
    names = select_projects(explicit)
    if not names:
        print("-> no projects to purge (none with phase: complete)")
        return 0
    total = 0
    for name in names:
        plan = plan_project(name)
        print(f"\n== {name}: {len(plan.delete)} file(s) verified on R2, {sync_project.humansize(plan.delete_bytes)}"
              f" (kept {len(plan.keep)}, git-tracked {plan.skipped_tracked})")
        for e in plan.keep:
            print(f"   KEEP     {e.subdir}/{e.rel}  ({e.reason})")
        for e in plan.delete:
            if confirm:
                e.path.unlink()
            print(f"   {'deleted' if confirm else 'would delete'}  {e.subdir}/{e.rel}  ({sync_project.humansize(e.size)})")
        if plan.keep:
            print(f"   -> push the kept files first: /toolkit:sync push {name}")
        total += plan.delete_bytes
    verb = "freed" if confirm else "would free (dry run — pass --yes to delete)"
    print(f"\n-> {verb} {sync_project.humansize(total)} across {len(names)} project(s)")
    if confirm and total:
        print("   restore any project's media with /toolkit:sync pull <project>")
    return 0
