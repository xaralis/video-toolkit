#!/usr/bin/env python3
"""Mirror a template's vendored surface into a project — without clobbering the project's own config.

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

`src/` is not the whole vendored surface, though. A project also vendors the reel editor
(`.editor/`) and the build config (`remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`), and
those are mirrored the same way. `package.json` is MERGED, never overwritten: `dependencies`,
`devDependencies` and any script the project does not already define come from the template (the
template is the source of truth for the toolchain, so a dependency pinned at a different version is
updated to the template's), while `name`, `version` and existing scripts are the project's and are
left alone. Every merged key is reported.

Usage:
    python3 -m video_toolkit.sync_template <project>                   # sync
    python3 -m video_toolkit.sync_template <project> --dry-run         # preview (nothing written)
    python3 -m video_toolkit.sync_template <project> --template <name> # if project.json has no `template`
    python3 -m video_toolkit.sync_template <project> --strict          # also delete project files the template no longer has
    python3 -m video_toolkit.sync_template <project> --src-only        # legacy: mirror src/ only

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

from video_toolkit.paths import NotFound, find_template, workspace_root

# Files the PROJECT owns. The template ships its own versions (a demo cut), but a project's copies are
# its actual content — overwriting them destroys the user's work. Never written, never deleted.
PROJECT_OWNED = frozenset({"Root.tsx", "config/demo.config.json"})

# Vendored directories beyond src/ that are mirrored wholesale. The reel editor lives here; a
# project whose .editor/ drifted behind the template's cannot start at all.
MIRROR_DIRS = (".editor",)

# Vendored single files at the project root — the build config. Mirrored like src files.
MIRROR_FILES = ("remotion.config.ts", "vitest.config.ts", "tsconfig.json")

# package.json sections merged key-by-key from the template. The template owns the toolchain, so a
# version mismatch resolves to the template's.
MERGED_DEP_SECTIONS = ("dependencies", "devDependencies")

# package.json keys that are the PROJECT's identity and are never written.
PACKAGE_OWNED_KEYS = frozenset({"name", "version"})


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


def sync_template(
    src: Path,
    dst: Path,
    dry_run: bool = False,
    strict: bool = False,
    protected: frozenset[str] = PROJECT_OWNED,
) -> dict[str, list[str]]:
    """Mirror template src -> project src. Returns the report; `protected` files are never touched.

    Pure w.r.t. the repo layout (takes explicit dirs) so it's testable and reusable. `protected`
    defaults to the src-relative PROJECT_OWNED set; other mirrored trees (`.editor/`) pass an empty
    set — a project owns nothing in there.
    """
    # NOT under dry-run: a dry run must leave no trace, and now that `.editor/` is mirrored too,
    # an unconditional mkdir would materialise an empty directory in a real project.
    if not dry_run:
        dst.mkdir(parents=True, exist_ok=True)
    src_files = _rel_files(src) if src.is_dir() else {}
    dst_files = _rel_files(dst) if dst.is_dir() else {}

    copied: list[str] = []
    updated: list[str] = []
    skipped: list[str] = []
    preserved: list[str] = []
    removed: list[str] = []

    for rel, src_path in sorted(src_files.items()):
        if rel in protected:
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
            if rel in src_files or rel in protected:
                continue
            if not dry_run:
                (dst / rel).unlink()
            removed.append(rel)

    return {"copied": copied, "updated": updated, "skipped": skipped, "preserved": preserved, "removed": removed}


def _empty_report() -> dict[str, list[str]]:
    return {"copied": [], "updated": [], "skipped": [], "preserved": [], "removed": []}


def _mirror_file(src_path: Path, dst_path: Path, rel: str, report: dict[str, list[str]], dry_run: bool) -> None:
    """One file, same copied/updated/skipped semantics as the tree mirror."""
    if not dst_path.exists():
        if not dry_run:
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dst_path)
        report["copied"].append(rel)
    elif _digest(dst_path) != _digest(src_path):
        if not dry_run:
            shutil.copy2(src_path, dst_path)
        report["updated"].append(rel)
    else:
        report["skipped"].append(rel)


def sync_extras(
    template_dir: Path,
    project_dir: Path,
    dry_run: bool = False,
    strict: bool = False,
) -> dict[str, list[str]]:
    """Mirror the vendored surface OUTSIDE src/: `.editor/` and the build-config files.

    Paths in the report are relative to the project root, so `.editor/vite.config.mts` reads the
    same in the output as it does on disk. A template that ships none of these yields an empty
    report — nothing here is required.
    """
    report = _empty_report()

    for name in MIRROR_DIRS:
        sub = template_dir / name
        if not sub.is_dir():
            continue
        # A project owns nothing inside .editor/ — the whole tree is the template's.
        sub_report = sync_template(sub, project_dir / name, dry_run=dry_run, strict=strict, protected=frozenset())
        for key, values in sub_report.items():
            report[key].extend(f"{name}/{v}" for v in values)

    for name in MIRROR_FILES:
        src_path = template_dir / name
        if not src_path.is_file():
            continue
        _mirror_file(src_path, project_dir / name, name, report, dry_run)

    return report


def check_identity_preserved(before: dict, after: dict) -> None:
    """Belt and braces: the merge never assigns PACKAGE_OWNED_KEYS. If a future edit ever does,
    fail loudly rather than silently renaming a project."""
    for key in PACKAGE_OWNED_KEYS:
        if before.get(key) != after.get(key):
            raise RuntimeError(
                f"refusing to write package.json: `{key}` would change ({before.get(key)!r} -> {after.get(key)!r})"
            )


def merge_package_json(
    template_dir: Path,
    project_dir: Path,
    dry_run: bool = False,
) -> dict[str, list[str]]:
    """Merge the template's package.json into the project's. NEVER overwrites it.

    The template owns the toolchain; the project owns its identity:

    * `dependencies` / `devDependencies` — every template key is applied. Missing -> added; present
      at a different version -> updated to the template's; identical -> untouched. A dependency only
      the project has is left alone (a project may legitimately add one).
    * `scripts` — a script the project does not define is added; one it does define is KEPT, however
      it differs (projects tune e.g. `test` for their own node layout).
    * `name` / `version` — never written. Overwriting `name` would rename every project.

    A project with no package.json gets the template's, with `name` set to the project directory
    name so it is not born carrying the template's identity.
    """
    report: dict[str, list[str]] = {"added": [], "updated": [], "kept": [], "created": []}
    template_pkg = template_dir / "package.json"
    if not template_pkg.is_file():
        return report

    template_data = json.loads(template_pkg.read_text())
    project_pkg = project_dir / "package.json"

    if not project_pkg.is_file():
        merged = dict(template_data)
        merged["name"] = project_dir.name
        report["created"].append(f"package.json  (name={project_dir.name})")
        if not dry_run:
            project_dir.mkdir(parents=True, exist_ok=True)
            project_pkg.write_text(json.dumps(merged, indent=2, ensure_ascii=False) + "\n")
        return report

    project_data = json.loads(project_pkg.read_text())
    identity = {k: project_data.get(k) for k in PACKAGE_OWNED_KEYS}
    changed = False

    for section in MERGED_DEP_SECTIONS:
        template_section = template_data.get(section) or {}
        if not template_section:
            continue
        project_section = project_data.setdefault(section, {})
        for key, version in template_section.items():
            if key not in project_section:
                project_section[key] = version
                report["added"].append(f"{section}.{key}@{version}")
                changed = True
            elif project_section[key] != version:
                report["updated"].append(f"{section}.{key}: {project_section[key]} -> {version}")
                project_section[key] = version
                changed = True

    template_scripts = template_data.get("scripts") or {}
    if template_scripts:
        project_scripts = project_data.setdefault("scripts", {})
        for key, command in template_scripts.items():
            if key not in project_scripts:
                project_scripts[key] = command
                report["added"].append(f"scripts.{key}")
                changed = True
            elif project_scripts[key] != command:
                report["kept"].append(f"scripts.{key}  (project's own, differs from template)")

    check_identity_preserved(identity, project_data)

    if changed and not dry_run:
        project_pkg.write_text(json.dumps(project_data, indent=2, ensure_ascii=False) + "\n")

    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Mirror a template's vendored surface into a project, preserving the project's own config.")
    ap.add_argument("project", help="Project name under projects/")
    ap.add_argument("--template", help="Template name under templates/ (default: project.json `template`)")
    ap.add_argument("--dry-run", action="store_true", help="report planned actions; write nothing")
    ap.add_argument("--strict", action="store_true", help="also delete mirrored project files the template no longer has")
    ap.add_argument(
        "--src-only",
        action="store_true",
        help="mirror src/ only — skip .editor/, the build config and the package.json merge",
    )
    args = ap.parse_args()

    proj = workspace_root() / "projects" / args.project
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

    try:
        template_dir = find_template(template)
    except NotFound as e:
        print(f"!! {e}", file=sys.stderr)
        return 1
    src = template_dir / "src"
    if not src.is_dir():
        print(f"!! template src not found: {src}", file=sys.stderr)
        return 1

    dst = proj / "src"
    report = sync_template(src, dst, dry_run=args.dry_run, strict=args.strict)

    if args.src_only:
        extras = _empty_report()
        pkg = {"added": [], "updated": [], "kept": [], "created": []}
    else:
        extras = sync_extras(template_dir, proj, dry_run=args.dry_run, strict=args.strict)
        pkg = merge_package_json(template_dir, proj, dry_run=args.dry_run)

    # src entries are src-relative; extras are project-relative. Print everything project-relative.
    for key in report:
        report[key] = [f"src/{rel}" for rel in report[key]] + extras[key]
    copied, updated = report["copied"], report["updated"]
    skipped, preserved, removed = report["skipped"], report["preserved"], report["removed"]

    root = workspace_root()

    def _rel(p: Path) -> Path:
        try:
            return p.relative_to(root)
        except ValueError:
            return p

    scope = "src/" if args.src_only else "src/ + .editor/ + build config + package.json"
    print(f"-> template={template}  from={_rel(template_dir)}  into={_rel(proj)}  [{scope}]")
    for rel in copied:
        print(f"   copied     {rel}")
    for rel in updated:
        print(f"   updated    {rel}  (content differs)")
    for rel in removed:
        print(f"   removed    {rel}  (--strict, not in template)")
    for rel in preserved:
        print(f"   preserved  {rel}  (project-owned, never overwritten)")
    for entry in pkg["created"]:
        print(f"   created    {entry}")
    for entry in pkg["added"]:
        print(f"   pkg add    {entry}")
    for entry in pkg["updated"]:
        print(f"   pkg update {entry}")
    for entry in pkg["kept"]:
        print(f"   pkg keep   {entry}")
    print(
        f"-> {len(copied)} copied, {len(updated)} updated, {len(removed)} removed, "
        f"{len(skipped)} unchanged, {len(preserved)} preserved"
        + (
            ""
            if args.src_only
            else f"; package.json: {len(pkg['added'])} added, {len(pkg['updated'])} updated, "
            f"{len(pkg['kept'])} kept (name/version never touched)"
        )
        + (" [DRY RUN]" if args.dry_run else "")
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
