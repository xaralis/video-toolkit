#!/usr/bin/env python3
"""Calibrate musicVolumeDb for a campaign-reels project.

Measures integrated LUFS (EBU R128) of every talking-head clip referenced
from src/Root.tsx defaultProps.segments[] and the bg music file. Computes
the musicVolumeDb baseline that puts music TARGET_DIFF LU below the mean
voice level during voice segments.

Usage:
    python3 -m video_toolkit.audio_calibrate <project>            # measure + recommend
    python3 -m video_toolkit.audio_calibrate <project> --apply    # also patch Root.tsx
    python3 -m video_toolkit.audio_calibrate <project> --target-diff 12   # tighter ducking

Brand rule #34: music sits TARGET_DIFF=15 LU below voice during voice
segments. Re-run whenever the music track changes or new voice clips drop in.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from video_toolkit.paths import workspace_root

TARGET_DIFF_LU = 15  # music sits this many LU below voice during voice segments


def measure_lufs(path: Path) -> float:
    """Return integrated LUFS (input_i) for an audio or video file."""
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-nostats",
            "-i", str(path),
            "-af", "loudnorm=I=-23:LRA=7:TP=-2:print_format=json",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    text = proc.stderr
    match = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", text, re.DOTALL)
    if not match:
        raise RuntimeError(f"loudnorm JSON not found for {path}")
    data = json.loads(match.group(0))
    return float(data["input_i"])


def extract_voice_clip_sources(root_tsx: Path) -> list[str]:
    """Return recordings/* sources for every clip segment in defaultProps."""
    text = root_tsx.read_text()
    sources: list[str] = []
    for match in re.finditer(
        r"type:\s*'clip'[^}]*?source:\s*'([^']+)'", text, re.DOTALL
    ):
        sources.append(match.group(1))
    return sources


def extract_music_source(root_tsx: Path) -> str | None:
    text = root_tsx.read_text()
    match = re.search(r"audio:\s*\{\s*music:\s*'([^']+)'", text)
    return match.group(1) if match else None


def extract_current_volume(root_tsx: Path) -> float | None:
    text = root_tsx.read_text()
    match = re.search(r"musicVolumeDb:\s*(-?\d+(?:\.\d+)?)", text)
    return float(match.group(1)) if match else None


def patch_volume(root_tsx: Path, new_db: float) -> None:
    text = root_tsx.read_text()
    new_text = re.sub(
        r"(musicVolumeDb:\s*)(-?\d+(?:\.\d+)?)",
        lambda m: f"{m.group(1)}{new_db}",
        text, count=1,
    )
    root_tsx.write_text(new_text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--apply", action="store_true", help="patch Root.tsx with the recommended value")
    ap.add_argument("--target-diff", type=float, default=TARGET_DIFF_LU,
                    help=f"target music-below-voice differential in LU (default {TARGET_DIFF_LU})")
    args = ap.parse_args()

    proj = workspace_root() / "projects" / args.project
    root_tsx = proj / "src" / "Root.tsx"
    if not root_tsx.exists():
        print(f"!! {root_tsx} not found", file=sys.stderr)
        return 1

    # Find voice clips
    clip_sources = extract_voice_clip_sources(root_tsx)
    if not clip_sources:
        print("!! no clip segments found in Root.tsx defaultProps", file=sys.stderr)
        return 1

    # Find music
    music_src = extract_music_source(root_tsx)
    if not music_src:
        print("!! no audio.music found in Root.tsx defaultProps", file=sys.stderr)
        return 1

    print("=== Voice clips (integrated LUFS) ===")
    voice_lufs: list[float] = []
    for src in clip_sources:
        path = proj / "public" / "recordings" / src
        if not path.exists():
            print(f"  !! missing: {src}")
            continue
        lufs = measure_lufs(path)
        voice_lufs.append(lufs)
        print(f"  {src:30s}  {lufs:+.2f} LUFS")
    if not voice_lufs:
        print("!! no measurable voice clips", file=sys.stderr)
        return 1
    voice_mean = sum(voice_lufs) / len(voice_lufs)
    print(f"  mean: {voice_mean:+.2f} LUFS")

    print("\n=== Music (integrated LUFS) ===")
    music_path = proj / "public" / music_src
    if not music_path.exists():
        print(f"!! music file not found: {music_path}", file=sys.stderr)
        return 1
    music_lufs = measure_lufs(music_path)
    print(f"  {music_src:30s}  {music_lufs:+.2f} LUFS")

    # Recommended musicVolumeDb so that:
    # music_perceived_during_voice = voice_mean - target_diff
    # i.e. music_lufs + musicVolumeDb = voice_mean - target_diff
    recommended = round(voice_mean - args.target_diff - music_lufs)
    current = extract_current_volume(root_tsx)

    print("\n=== Calibration ===")
    print(f"  target voice→music differential: -{args.target_diff} LU")
    print(f"  current  musicVolumeDb: {current:+} dB" if current is not None else "  current  musicVolumeDb: (unset)")
    print(f"  recommended musicVolumeDb: {recommended:+} dB")
    if current is not None:
        delta = recommended - current
        print(f"  delta: {delta:+} dB ({'quieter' if delta < 0 else 'louder' if delta > 0 else 'no change'})")

    if args.apply:
        patch_volume(root_tsx, recommended)
        print(f"\n-> patched {root_tsx.relative_to(workspace_root())} musicVolumeDb = {recommended}")
    else:
        print("\n  (dry run; pass --apply to patch Root.tsx)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
