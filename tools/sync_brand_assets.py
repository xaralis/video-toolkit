#!/usr/bin/env python3
"""Mirror brand assets into a project's public/brand/ directory.

Brand-level assets live in `brands/<brand>/assets/` (watermark, skyline,
outro, logos, …). Projects reference them via `staticFile('brand/...')`
which resolves to `projects/<name>/public/brand/`. This tool keeps those
two in sync — idempotent, size-based skip, surface drift in a brand asset
gets picked up next sync.

Usage:
    python3 tools/sync_brand_assets.py <project>           # sync
    python3 tools/sync_brand_assets.py <project> --dry-run # preview
    python3 tools/sync_brand_assets.py <project> --strict  # also delete files in public/brand/ that aren't in brand/

Reads `brand` field from `projects/<name>/project.json` to locate the
source. Called from `/cut` (workflow step 2b) and safe to run any time.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("project", help="Project name under projects/")
    ap.add_argument("--dry-run", action="store_true", help="report planned actions; don't copy")
    ap.add_argument("--strict", action="store_true", help="also delete files in public/brand/ that aren't in brand/assets/")
    args = ap.parse_args()

    proj = REPO_ROOT / "projects" / args.project
    project_json = proj / "project.json"
    if not project_json.exists():
        print(f"!! {project_json} not found", file=sys.stderr)
        return 1

    brand_name = json.loads(project_json.read_text()).get("brand")
    if not brand_name:
        print(f"!! no `brand` field in {project_json}", file=sys.stderr)
        return 1

    src = REPO_ROOT / "brands" / brand_name / "assets"
    if not src.is_dir():
        print(f"!! brand assets dir not found: {src}", file=sys.stderr)
        return 1

    dst = proj / "public" / "brand"
    dst.mkdir(parents=True, exist_ok=True)

    src_files: dict[str, Path] = {
        p.name: p for p in src.iterdir() if p.is_file()
    }
    dst_files: dict[str, Path] = {
        p.name: p for p in dst.iterdir() if p.is_file()
    }

    copied: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    removed: list[str] = []

    for name, src_path in sorted(src_files.items()):
        dst_path = dst / name
        if not dst_path.exists():
            if not args.dry_run:
                shutil.copy2(src_path, dst_path)
            copied.append(name)
        elif dst_path.stat().st_size != src_path.stat().st_size:
            if not args.dry_run:
                shutil.copy2(src_path, dst_path)
            updated.append(name)
        else:
            skipped.append(name)

    if args.strict:
        for name in sorted(dst_files):
            if name not in src_files:
                if not args.dry_run:
                    (dst / name).unlink()
                removed.append(name)

    print(f"-> brand={brand_name}  src={src.relative_to(REPO_ROOT)}  dst={dst.relative_to(REPO_ROOT)}")
    for name in copied:
        print(f"   copied   {name}")
    for name in updated:
        print(f"   updated  {name}  (size mismatch)")
    for name in removed:
        print(f"   removed  {name}  (--strict, not in brand)")
    print(f"-> {len(copied)} copied, {len(updated)} updated, {len(removed)} removed, {len(skipped)} unchanged" + (" [DRY RUN]" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
