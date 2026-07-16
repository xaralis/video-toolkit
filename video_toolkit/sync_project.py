#!/usr/bin/env python3
"""Sync a campaign-reels project's media to/from Cloudflare R2.

Convention: <bucket>/projects/<name>/{public/recordings,public/broll,public/audio,out}/*

The toolkit already keeps source code, configs, BRAND-RULES, and the
brand LUT in git. This tool handles the heavy stuff that doesn't go to
git per project policy:

- public/recordings/*.MP4: raw face / talking-head footage
- public/recordings/*.transcript.json: Whisper output (cached to avoid re-Modal)
- public/broll/*.MP4: raw b-roll
- public/audio/bg.mp3: AI-generated music
- out/*.mp4 / *.srt: final renders + captions

Usage:
    # Register a freshly-created project on R2 (run once when /video creates
    # a new project — uploads project.json so the Footage Manager UI sees it)
    python3 tools/sync_project.py --init pp-smoke-03

    # Push project media TO R2 (after recording / rendering)
    python3 tools/sync_project.py --push pp-smoke-03
    python3 tools/sync_project.py --push pp-smoke-03 --only out      # just renders
    python3 tools/sync_project.py --push pp-smoke-03 --dry-run

    # Pull project media FROM R2 (collaborator joining work)
    python3 tools/sync_project.py --pull pp-smoke-03
    python3 tools/sync_project.py --pull pp-smoke-03 --only recordings,broll

    # List what's in R2 for a project
    python3 tools/sync_project.py --list pp-smoke-03

Bucket and credentials come from .env (R2_BUCKET_NAME / R2_ACCESS_KEY_ID /
R2_SECRET_ACCESS_KEY / R2_ACCOUNT_ID). Set up via /setup or by hand.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Add parent to path for local imports
sys.path.insert(0, str(Path(__file__).parent))
from file_transfer import get_r2_client  # noqa: E402

# Subdirs of a project that get synced (relative to project root). Order
# matters only for display.
SUBDIRS = ["public/recordings", "public/broll", "public/audio", "out"]


def humansize(num: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if num < 1024:
            return f"{num:.1f}{unit}"
        num /= 1024
    return f"{num:.1f}TB"


def project_path(name: str) -> Path:
    p = REPO_ROOT / "projects" / name
    if not p.exists():
        raise SystemExit(f"ERROR: project not found: {p}")
    return p


def r2_prefix(name: str, subdir: str) -> str:
    return f"projects/{name}/{subdir}/"


def list_local_files(proj: Path, subdirs: list[str]) -> list[tuple[str, Path, int]]:
    """Return [(subdir, path, size)] for every file under selected subdirs."""
    out: list[tuple[str, Path, int]] = []
    for subdir in subdirs:
        d = proj / subdir
        if not d.is_dir():
            continue
        for f in sorted(d.iterdir()):
            if not f.is_file() or f.name.startswith("."):
                continue
            out.append((subdir, f, f.stat().st_size))
    return out


def list_remote_objects(client, bucket: str, name: str, subdirs: list[str]) -> list[tuple[str, str, int]]:
    """Return [(subdir, key, size)] for every object under selected subdir prefixes."""
    out: list[tuple[str, str, int]] = []
    paginator = client.get_paginator("list_objects_v2")
    for subdir in subdirs:
        prefix = r2_prefix(name, subdir)
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents", []) or []:
                out.append((subdir, obj["Key"], obj["Size"]))
    return out


def cmd_push(name: str, subdirs: list[str], dry_run: bool, overwrite: bool) -> int:
    proj = project_path(name)
    client, config = get_r2_client()
    if not client:
        raise SystemExit(
            "ERROR: R2 not configured\n"
            "  - ensure python-dotenv is installed: pip install -r tools/requirements.txt\n"
            "  - ensure .env at repo root has R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / "
            "R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME"
        )
    bucket = config["bucket_name"]

    local = list_local_files(proj, subdirs)
    if not local:
        print(f"-> nothing to push (no files under {', '.join(subdirs)})")
        return 0

    # Remote inventory to skip unchanged (size-based, simple)
    if not overwrite:
        remote = {key: size for _, key, size in list_remote_objects(client, bucket, name, subdirs)}
    else:
        remote = {}

    total_bytes = 0
    uploaded = 0
    skipped = 0
    for subdir, fpath, size in local:
        key = r2_prefix(name, subdir) + fpath.name
        if not overwrite and remote.get(key) == size:
            skipped += 1
            continue
        action = "would push" if dry_run else "pushing"
        print(f"   {action}  {subdir}/{fpath.name}  ({humansize(size)})")
        if not dry_run:
            client.upload_file(str(fpath), bucket, key)
        uploaded += 1
        total_bytes += size

    verb = "would upload" if dry_run else "uploaded"
    print(f"-> {verb} {uploaded} file(s), {humansize(total_bytes)} (skipped {skipped} unchanged)")
    return 0


def cmd_pull(name: str, subdirs: list[str], dry_run: bool, overwrite: bool) -> int:
    proj = project_path(name)
    client, config = get_r2_client()
    if not client:
        raise SystemExit(
            "ERROR: R2 not configured\n"
            "  - ensure python-dotenv is installed: pip install -r tools/requirements.txt\n"
            "  - ensure .env at repo root has R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / "
            "R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME"
        )
    bucket = config["bucket_name"]

    remote = list_remote_objects(client, bucket, name, subdirs)
    if not remote:
        print(f"-> nothing in R2 for project '{name}' under {', '.join(subdirs)}")
        return 0

    total_bytes = 0
    downloaded = 0
    skipped = 0
    for subdir, key, size in remote:
        # Key shape: projects/<name>/<subdir>/<filename>
        filename = key.split("/")[-1]
        local_path = proj / subdir / filename
        local_path.parent.mkdir(parents=True, exist_ok=True)
        if not overwrite and local_path.exists() and local_path.stat().st_size == size:
            skipped += 1
            continue
        action = "would pull" if dry_run else "pulling"
        print(f"   {action}  {subdir}/{filename}  ({humansize(size)})")
        if not dry_run:
            client.download_file(bucket, key, str(local_path))
        downloaded += 1
        total_bytes += size

    verb = "would download" if dry_run else "downloaded"
    print(f"-> {verb} {downloaded} file(s), {humansize(total_bytes)} (skipped {skipped} unchanged)")
    return 0


def shorten_url(long_url: str) -> str | None:
    """Shrink a long presigned URL via TinyURL's free API (no auth needed).
    Returns the short URL or None on failure (caller falls back to long URL).
    TinyURL links don't expire on their side; the underlying R2 presigned URL
    still expires after `--expires-days`, after which the short link returns
    an R2 error.
    """
    import urllib.parse
    import urllib.request
    try:
        api = f"https://tinyurl.com/api-create.php?url={urllib.parse.quote(long_url, safe='')}"
        with urllib.request.urlopen(api, timeout=8) as resp:
            short = resp.read().decode("utf-8").strip()
            if short.startswith("http"):
                return short
            return None
    except Exception:
        return None


def cmd_share(name: str, file_path: str, expires_seconds: int, short: bool) -> int:
    project_path(name)  # verify project exists
    client, config = get_r2_client()
    if not client:
        raise SystemExit(
            "ERROR: R2 not configured\n"
            "  - ensure python-dotenv is installed: pip install -r tools/requirements.txt\n"
            "  - ensure .env at repo root has R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / "
            "R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME"
        )
    bucket = config["bucket_name"]
    key = f"projects/{name}/{file_path}"
    try:
        head = client.head_object(Bucket=bucket, Key=key)
    except Exception as e:
        raise SystemExit(
            f"ERROR: object not found in R2: {key}\n"
            f"  ({e})\n"
            f"Did you forget to `--push` first?"
        )
    url = client.generate_presigned_url(
        "get_object",
        Params={"Bucket": bucket, "Key": key},
        ExpiresIn=expires_seconds,
    )
    short_url = None
    if short:
        short_url = shorten_url(url)
    days = expires_seconds / 86400
    exp_label = f"{days:.0f} day(s)" if days >= 1 else f"{expires_seconds / 3600:.1f} hours"
    print(f"\nShare URL (valid for {exp_label}):\n")
    if short_url:
        print(short_url)
        print(f"\n(long URL also available below if TinyURL goes down later)")
        print(f"\n{url}")
    else:
        if short:
            print("(TinyURL shortener failed, falling back to long URL)\n")
        print(url)
    print(f"\nR2 key:   {key}")
    print(f"Size:     {humansize(head['ContentLength'])}")
    print(f"\nPaste into IG/TikTok/email/Slack — anyone with the link can download.")
    return 0


def cmd_init(name: str) -> int:
    """Register a freshly-created project on R2 by uploading project.json.

    Without this, the Footage Manager UI (which lists projects from R2)
    has nothing to show and collaborators can't drop files for the new
    project. Idempotent — re-running it overwrites the metadata with the
    current local copy, which is fine for a small JSON file.
    """
    proj = project_path(name)
    meta = proj / "project.json"
    if not meta.is_file():
        raise SystemExit(
            f"ERROR: {meta} not found — project.json must exist before init"
        )

    client, config = get_r2_client()
    if not client:
        raise SystemExit(
            "ERROR: R2 not configured\n"
            "  - ensure python-dotenv is installed: pip install -r tools/requirements.txt\n"
            "  - ensure .env at repo root has R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / "
            "R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME"
        )
    bucket = config["bucket_name"]
    key = f"projects/{name}/project.json"
    try:
        client.upload_file(str(meta), bucket, key)
    except Exception as e:
        raise SystemExit(f"ERROR: failed to upload {key}: {e}")
    print(f"-> registered projects/{name}/ on R2 ({meta.stat().st_size} B project.json)")
    return 0


def cmd_list(name: str, subdirs: list[str]) -> int:
    client, config = get_r2_client()
    if not client:
        raise SystemExit(
            "ERROR: R2 not configured\n"
            "  - ensure python-dotenv is installed: pip install -r tools/requirements.txt\n"
            "  - ensure .env at repo root has R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / "
            "R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME"
        )
    bucket = config["bucket_name"]
    remote = list_remote_objects(client, bucket, name, subdirs)
    if not remote:
        print(f"(empty) no objects in R2 under projects/{name}/")
        return 0
    by_subdir: dict[str, list[tuple[str, int]]] = {}
    for subdir, key, size in remote:
        by_subdir.setdefault(subdir, []).append((key.split("/")[-1], size))
    grand_total = 0
    for subdir in subdirs:
        entries = by_subdir.get(subdir, [])
        if not entries:
            continue
        subtotal = sum(s for _, s in entries)
        grand_total += subtotal
        print(f"\n{subdir}/  ({len(entries)} files, {humansize(subtotal)})")
        for fname, size in entries:
            print(f"   {fname:<40s}  {humansize(size)}")
    print(f"\nTotal: {humansize(grand_total)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--push", metavar="PROJECT", help="Upload project media TO R2")
    grp.add_argument("--pull", metavar="PROJECT", help="Download project media FROM R2")
    grp.add_argument("--list", metavar="PROJECT", help="List objects in R2 for project")
    grp.add_argument("--share", metavar="PROJECT", help="Generate presigned public URL for a file in R2")
    grp.add_argument("--init", metavar="PROJECT", help="Register a new project on R2 (uploads project.json so the Footage Manager UI sees it)")
    ap.add_argument(
        "--only",
        help=f"(push/pull) comma-separated subdirs to include. Choices: {','.join(SUBDIRS)}",
    )
    ap.add_argument(
        "--file",
        default="out/reel.mp4",
        help="(share) path within project to share (default: out/reel.mp4)",
    )
    ap.add_argument(
        "--expires-days",
        type=int,
        default=7,
        help="(share) URL validity in days; R2 max is 7 (default: 7)",
    )
    ap.add_argument(
        "--no-short",
        dest="short",
        action="store_false",
        default=True,
        help="(share) skip is.gd shortener; print long presigned URL only",
    )
    ap.add_argument("--dry-run", action="store_true", help="Don't transfer, just print what would happen")
    ap.add_argument("--overwrite", action="store_true", help="Re-upload/re-download even if size matches")
    args = ap.parse_args()

    if args.only:
        requested = [s.strip() for s in args.only.split(",") if s.strip()]
        # Allow short names: "recordings" → "public/recordings"
        expanded: list[str] = []
        for r in requested:
            match = next((s for s in SUBDIRS if s == r or s.endswith("/" + r)), None)
            if match is None:
                raise SystemExit(f"ERROR: unknown subdir '{r}' (choices: {', '.join(SUBDIRS)})")
            expanded.append(match)
        subdirs = expanded
    else:
        subdirs = SUBDIRS

    if args.push:
        return cmd_push(args.push, subdirs, args.dry_run, args.overwrite)
    if args.pull:
        return cmd_pull(args.pull, subdirs, args.dry_run, args.overwrite)
    if args.list:
        return cmd_list(args.list, subdirs)
    if args.share:
        expires = min(max(1, args.expires_days), 7) * 86400  # clamp 1..7 days
        return cmd_share(args.share, args.file, expires, args.short)
    if args.init:
        return cmd_init(args.init)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
