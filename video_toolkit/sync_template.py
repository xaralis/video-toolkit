#!/usr/bin/env python3
"""Mirror a template's shared src into a project's src/ — without clobbering the project's own config.

Projects VENDOR their template's source: a project is a self-contained snapshot, so a later toolkit
upgrade can never break a finished render. That isolation is the point — but while a project is still
being worked on you sometimes want a template fix pulled in. Doing that by hand (`rsync`) reliably
destroys the project's own files; this tool exists so that can't happen.

PROJECT-OWNED files are NEVER written:
    Root.tsx                  the project's cut — defaultProps / segments / brand config
    config/demo.config.json   the project's Studio defaultProps sample

Everything else under `templates/<t>/src/` is mirrored into `projects/<p>/src/`, compared by content
hash (source files are small; size alone would miss same-length edits). Idempotent — unchanged files
are skipped, so re-running is free and drift shows up as `updated`.

Usage:
    python3 -m video_toolkit.sync_template <project>                   # sync
    python3 -m video_toolkit.sync_template <project> --dry-run         # preview (nothing written)
    python3 -m video_toolkit.sync_template <project> --template <name> # if project.json has no `template`
    python3 -m video_toolkit.sync_template <project> --strict          # also delete project src files the template no longer has

Template is read from `projects/<name>/project.json` (`template` field) unless --template is given.
Run from the toolkit root. Safe to run any time; run it before you edit a vendored component so you
don't fork from the template unknowingly.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Files the PROJECT owns. The template ships its own versions (a demo cut), but a project's copies are
# its actual content — overwriting them destroys the user's work. Never written, never deleted.
PROJECT_OWNED = frozenset({"Root.tsx", "config/demo.config.json"})


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _rel_files(root: Path) -> dict[str, Path]:
    """Every file under root, keyed by POSIX-style path relative to root."""
    return {p.relative_to(root).as_posix(): p for p in root.rglob("*") if p.is_file()}


def resolve_template(project_dir: Path, override: str | None) -> str | None:
    """Template name from --template, else the project.json `template` field."""
    if override:
        return override
    project_json = project_dir / "project.json"
    if not project_json.exists():
        return None
    try:
        return json.loads(project_json.read_text()).get("template")
    except json.JSONDecodeError:
        return None


def sync_template(src: Path, dst: Path, dry_run: bool = False, strict: bool = False) -> dict[str, list[str]]:
    """Mirror template src -> project src. Returns the report; PROJECT_OWNED files are never touched.

    Pure w.r.t. the repo layout (takes explicit dirs) so it's testable and reusable.
    """
    dst.mkdir(parents=True, exist_ok=True)
    src_files = _rel_files(src)
    dst_files = _rel_files(dst)

    copied: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    preserved: list[str] = []
    removed: list[str] = []

    for rel, src_path in sorted(src_files.items()):
        if rel in PROJECT_OWNED:
            preserved.append(rel)
            continue
        dst_path = dst / rel
        if not dst_path.exists():
            if not dry_run:
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)
            copied.append(rel)
        elif _digest(dst_path) != _digest(src_path):
            if not dry_run:
                shutil.copy2(src_path, dst_path)
            updated.append(rel)
        else:
            skipped.append(rel)

    if strict:
        for rel in sorted(dst_files):
            if rel in src_files or rel in PROJECT_OWNED:
                continue
            if not dry_run:
                (dst / rel).unlink()
            removed.append(rel)

    return {"copied": copied, "updated": updated, "skipped": skipped, "preserved": preserved, "removed": removed}


def main() -> int:
    ap = argparse.ArgumentParser(description="Mirror a template's src into a project, preserving the project's own config.")
    ap.add_argument("project", help="Project name under projects/")
    ap.add_argument("--template", help="Template name under templates/ (default: project.json `template`)")
    ap.add_argument("--dry-run", action="store_true", help="report planned actions; write nothing")
    ap.add_argument("--strict", action="store_true", help="also delete project src files the template no longer has")
    args = ap.parse_args()

    proj = REPO_ROOT / "projects" / args.project
    if not proj.is_dir():
        print(f"!! project not found: {proj}", file=sys.stderr)
        return 1

    template = resolve_template(proj, args.template)
    if not template:
        print(
            f"!! cannot determine template for '{args.project}': no --template and no `template` "
            f"field in {(proj / 'project.json')}",
            file=sys.stderr,
        )
        return 1

    src = REPO_ROOT / "templates" / template / "src"
    if not src.is_dir():
        print(f"!! template src not found: {src}", file=sys.stderr)
        return 1

    dst = proj / "src"
    report = sync_template(src, dst, dry_run=args.dry_run, strict=args.strict)
    copied, updated = report["copied"], report["updated"]
    skipped, preserved, removed = report["skipped"], report["preserved"], report["removed"]

    print(f"-> template={template}  src={src.relative_to(REPO_ROOT)}  dst={dst.relative_to(REPO_ROOT)}")
    for rel in copied:
        print(f"   copied     {rel}")
    for rel in updated:
        print(f"   updated    {rel}  (content differs)")
    for rel in removed:
        print(f"   removed    {rel}  (--strict, not in template)")
    for rel in preserved:
        print(f"   preserved  {rel}  (project-owned, never overwritten)")
    print(
        f"-> {len(copied)} copied, {len(updated)} updated, {len(removed)} removed, "
        f"{len(skipped)} unchanged, {len(preserved)} preserved"
        + (" [DRY RUN]" if args.dry_run else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
