#!/usr/bin/env python3
"""Render a campaign-reels project with optional versioning + history log.

A thin wrapper around `npx remotion render` that adds:
  - `--keep`: if the target output already exists, find the next available
    `<basename>-vN.<ext>` filename instead of overwriting
  - History log: appends an entry to `<project>/out/HISTORY.md` per render so
    iteration history is durable (size, duration, mode, when)
  - `--preview`: half-scale render to `out/preview.mp4`

Usage:
    python3 tools/render_reel.py                          # full quality, overwrites
    python3 tools/render_reel.py --project pp-smoke-02    # explicit project
    python3 tools/render_reel.py --preview                # half-scale
    python3 tools/render_reel.py --keep                   # auto-version
    python3 tools/render_reel.py --output reel-final.mp4  # explicit name
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def detect_project(explicit: str | None) -> Path:
    if explicit:
        p = REPO_ROOT / "projects" / explicit
        if not p.exists():
            raise SystemExit(f"ERROR: project not found: {p}")
        return p
    cwd = Path.cwd().resolve()
    projects_dir = REPO_ROOT / "projects"
    try:
        rel = cwd.relative_to(projects_dir)
        return projects_dir / rel.parts[0]
    except ValueError:
        pass
    candidates = [
        (p, (p / "src" / "Root.tsx").stat().st_mtime)
        for p in projects_dir.iterdir()
        if (p / "src" / "Root.tsx").exists()
    ]
    if not candidates:
        raise SystemExit("ERROR: no reel projects with src/Root.tsx found")
    candidates.sort(key=lambda kv: kv[1], reverse=True)
    return candidates[0][0]


def pick_next_version(default_path: Path) -> Path:
    """If default_path exists, return the next available `<stem>-vN<suffix>`."""
    if not default_path.exists():
        return default_path
    stem = default_path.stem
    suffix = default_path.suffix
    parent = default_path.parent
    # Strip any existing `-vN` suffix from stem so increments don't compound
    base_match = re.match(r"^(.*?)(?:-v\d+)?$", stem)
    base = base_match.group(1) if base_match else stem
    n = 2
    while (parent / f"{base}-v{n}{suffix}").exists():
        n += 1
    return parent / f"{base}-v{n}{suffix}"


def humansize(bytes_: int) -> str:
    n = float(bytes_)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def detect_brand_lut(project_path: Path) -> Path | None:
    """Read project.json's `brand`, return path to `brands/<brand>/grading/default.cube` if it exists."""
    project_json = project_path / "project.json"
    if not project_json.exists():
        return None
    try:
        import json
        data = json.loads(project_json.read_text(encoding="utf-8"))
        brand = data.get("brand")
    except Exception:
        return None
    if not brand:
        return None
    lut_path = REPO_ROOT / "brands" / brand / "grading" / "default.cube"
    return lut_path if lut_path.exists() else None


def apply_lut(input_path: Path, lut_path: Path) -> bool:
    """Apply a 3D LUT to a video in-place via ffmpeg lut3d. Returns True on success."""
    if not shutil.which("ffmpeg"):
        print("WARN: ffmpeg not found — skipping color grade", file=sys.stderr)
        return False
    tmp = input_path.with_suffix(input_path.suffix + ".tmp.mp4")
    # libx264 re-encode (lut3d requires a re-encode anyway). Match a sane
    # default quality; audio passthrough so we don't degrade the mix.
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vf", f"lut3d=file={lut_path.as_posix()}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p",       # QuickTime / Finder preview compatibility
        "-profile:v", "high", "-level", "4.0",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(tmp),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        print(f"WARN: ffmpeg lut3d failed (exit {proc.returncode}); leaving render ungraded", file=sys.stderr)
        print(proc.stderr[-500:], file=sys.stderr)
        if tmp.exists():
            tmp.unlink()
        return False
    tmp.replace(input_path)
    return True


def append_history(project_path: Path, output_path: Path, mode: str, duration_sec: float, render_seconds: float) -> None:
    history_path = project_path / "out" / "HISTORY.md"
    history_path.parent.mkdir(parents=True, exist_ok=True)
    if not history_path.exists():
        history_path.write_text(
            "# Render history\n\nAuto-appended by `tools/render_reel.py`. One row per successful render.\n\n"
            "| When | Output | Mode | Size | Render time |\n"
            "|---|---|---|---|---|\n",
            encoding="utf-8",
        )
    size = humansize(output_path.stat().st_size) if output_path.exists() else "?"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    rel = output_path.relative_to(project_path) if output_path.is_relative_to(project_path) else output_path
    row = f"| {timestamp} | `{rel}` | {mode} | {size} | {render_seconds:.0f}s |\n"
    with history_path.open("a", encoding="utf-8") as f:
        f.write(row)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", help="Project name under projects/")
    ap.add_argument("--preview", action="store_true", help="Half-scale render (540x960)")
    ap.add_argument("--keep", action="store_true", help="Auto-version output instead of overwriting")
    ap.add_argument("--output", help="Explicit output filename (relative to project's out/ or absolute)")
    ap.add_argument("--no-lut", action="store_true", help="Skip the brand LUT grade pass (for projects with already-graded footage, e.g. web-intro-sourced reels)")
    args = ap.parse_args()

    project_path = detect_project(args.project)
    project_name = project_path.name

    # Resolve the default name based on mode
    default_name = "preview.mp4" if args.preview else "reel.mp4"
    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = project_path / "out" / output_path
    else:
        output_path = project_path / "out" / default_name
        if args.keep:
            output_path = pick_next_version(output_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build the remotion render command. Invoke the @remotion/cli entry
    # directly via `node <entry>` rather than `npx remotion`: under Node 22 the
    # generated node_modules/.bin/remotion ESM shim resolves './dist/index'
    # relative to .bin/ and dies with ERR_MODULE_NOT_FOUND. The direct entry
    # works on every Node version; fall back to `npx remotion` only if the
    # entry file is missing (e.g. a future package layout change).
    rel_out = output_path.relative_to(project_path) if output_path.is_relative_to(project_path) else output_path
    remotion_cli = project_path / "node_modules" / "@remotion" / "cli" / "remotion-cli.js"
    if remotion_cli.is_file():
        cmd = ["node", str(remotion_cli), "render", "src/index.ts", "CampaignReel", str(rel_out)]
    else:
        cmd = ["npx", "remotion", "render", "src/index.ts", "CampaignReel", str(rel_out)]
    if args.preview:
        cmd.append("--scale=0.5")
    browser_exe = os.environ.get("REMOTION_BROWSER_EXECUTABLE")
    if browser_exe:
        cmd.append(f"--browser-executable={browser_exe}")

    mode = "preview (540×960)" if args.preview else "full (1080×1920)"
    print(f"-> rendering {project_name} → {rel_out}  [{mode}]")
    start = time.monotonic()
    proc = subprocess.run(cmd, cwd=project_path)
    elapsed = time.monotonic() - start
    if proc.returncode != 0:
        print(f"ERROR: render failed with exit code {proc.returncode}", file=sys.stderr)
        return proc.returncode

    # Brand color grading: apply <brand>/grading/default.cube if present
    lut_path = detect_brand_lut(project_path)
    if lut_path and not args.no_lut:
        print(f"-> applying brand LUT: {lut_path.relative_to(REPO_ROOT)}")
        grade_start = time.monotonic()
        if apply_lut(output_path, lut_path):
            print(f"   graded in {time.monotonic() - grade_start:.0f}s")
    elif lut_path and args.no_lut:
        print("-> skipping brand LUT (--no-lut)")

    duration_sec = 0.0
    # Try ffprobe (optional, just for the history log) — fail silently
    if shutil.which("ffprobe"):
        try:
            r = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", str(output_path),
                ],
                capture_output=True, text=True, timeout=10,
            )
            duration_sec = float(r.stdout.strip()) if r.returncode == 0 else 0.0
        except Exception:
            pass

    append_history(project_path, output_path, mode, duration_sec, elapsed)
    size = humansize(output_path.stat().st_size)
    print(f"   wrote {rel_out} ({size}, ~{duration_sec:.1f}s, render took {elapsed:.0f}s)")
    print(f"   logged to out/HISTORY.md")

    # Auto-export SRT alongside (Task 1)
    srt_script = REPO_ROOT / "video_toolkit" / "export_srt.py"
    if srt_script.exists():
        subprocess.run(
            ["python3", str(srt_script), "--project", project_name],
            check=False,
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
