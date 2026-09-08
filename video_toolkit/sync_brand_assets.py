#!/usr/bin/env python3
"""Mirror brand assets into a project's public/brand/ directory.

Brand-level assets live in `brands/<brand>/assets/` (watermark, skyline,
outro, logos, …). Projects reference them via `staticFile('brand/...')`
which resolves to `projects/<name>/public/brand/`. This tool keeps those
two in sync — idempotent, size-based skip, surface drift in a brand asset
gets picked up next sync.

Usage:
    python3 -m video_toolkit.sync_brand_assets <project>           # sync
    python3 -m video_toolkit.sync_brand_assets <project> --dry-run # preview
    python3 -m video_toolkit.sync_brand_assets <project> --strict  # also delete files in public/brand/ that aren't in brand/

Reads `brand` field from `projects/<name>/project.json` to locate the
source. Called from `/cut` (workflow step 2b) and safe to run any time.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from video_toolkit.paths import NotFound, find_brand, workspace_root


# Source code is never a static asset. A brand may keep design components
# (`assets/components/*.tsx`) next to its artwork, but `public/brand/` is a
# web-served directory — mirroring source into it ships code to every project
# and serves no one.
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("project", help="Project name under projects/")
    ap.add_argument("--dry-run", action="store_true", help="report planned actions; don't copy")
    ap.add_argument("--strict", action="store_true", help="also delete files in public/brand/ that aren't in brand/assets/")
    args = ap.parse_args()

    proj = workspace_root() / "projects" / args.project
    project_json = proj / "project.json"
    if not project_json.exists():
        print(f"!! {project_json} not found", file=sys.stderr)
        return 1

    brand_name = json.loads(project_json.read_text()).get("brand")
    if not brand_name:
        print(f"!! no `brand` field in {project_json}", file=sys.stderr)
        return 1

    try:
        brand_dir = find_brand(brand_name)
    except NotFound as e:
        print(f"!! {e}", file=sys.stderr)
        return 1
    src = brand_dir / "assets"
    if not src.is_dir():
        print(f"!! brand assets dir not found: {src}", file=sys.stderr)
        return 1

    dst = proj / "public" / "brand"
    dst.mkdir(parents=True, exist_ok=True)

    # Keyed by path RELATIVE to the assets root, not by bare filename: brands
    # organise assets into subdirectories (`logos/parties/`, `components/`) and
    # a top-level-only mirror delivered none of them while still reporting
    # success. Two assets sharing a basename in different folders also stay
    # distinct this way.
    def _tree(root: Path) -> dict[str, Path]:
        out: dict[str, Path] = {}
        for p in sorted(root.rglob("*")):
            if not p.is_file():
                continue
            rel = p.relative_to(root)
            if any(part.startswith(".") for part in rel.parts):
                continue
            if p.suffix.lower() in SOURCE_SUFFIXES:
                continue
            out[rel.as_posix()] = p
        return out

    src_files = _tree(src)
    dst_files = _tree(dst)

    copied: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    removed: list[str] = []

    for name, src_path in sorted(src_files.items()):
        dst_path = dst / name
        if not dst_path.exists():
            if not args.dry_run:
                dst_path.parent.mkdir(parents=True, exist_ok=True)
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

    root = workspace_root()

    def _rel(p: Path) -> Path:
        try:
            return p.relative_to(root)
        except ValueError:
            return p

    print(f"-> brand={brand_name}  src={_rel(src)}  dst={_rel(dst)}")
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
