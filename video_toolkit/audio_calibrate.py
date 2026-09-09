#!/usr/bin/env python3
"""Calibrate the background-music level for a reel project.

Measures integrated LUFS (EBU R128) of every talking-head clip the cut plays
and of the bg music file, then computes the music level that puts music
TARGET_DIFF LU below the mean voice level during voice segments.

Reads BOTH cut formats:

  layered  tracks.video[] items with kind: 'clip', trimmed by
           sourceInMs/sourceOutMs; music level is tracks.music.baseVolumeDb
  legacy   segments[] with type: 'clip'; music level is audio.musicVolumeDb

On a layered reel each clip is measured over the window the cut actually uses
and the mean is weighted by how long each bed is on screen. Measuring whole
files instead reports the loudness of material the viewer never hears — a take
is routinely several times longer than the piece used, the rest being silence
and discarded takes.

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
from dataclasses import dataclass
from pathlib import Path

from video_toolkit.paths import workspace_root
from video_toolkit.textio import write_text_lf

TARGET_DIFF_LU = 15  # music sits this many LU below voice during voice segments


@dataclass(frozen=True)
class VoiceBed:
    """One stretch of talking-head sound the reel actually plays.

    `start_ms`/`end_ms` are the window INTO THE SOURCE FILE. They are None for
    the legacy segment shape, which never recorded one — there, the whole file
    is the best available approximation.
    """

    source: str
    start_ms: int | None
    end_ms: int | None

    @property
    def duration_ms(self) -> int | None:
        if self.start_ms is None or self.end_ms is None:
            return None
        return self.end_ms - self.start_ms


def measure_lufs(path: Path, start_ms: int | None = None, end_ms: int | None = None) -> float:
    """Return integrated LUFS (input_i) for a file, or for a window inside it.

    The window is what makes this honest on layered reels: a take is routinely
    several times longer than the piece the cut uses, and the unused remainder
    is silence and discarded takes whose loudness nobody hears.
    """
    seek: list[str] = []
    if start_ms is not None:
        seek += ["-ss", f"{start_ms / 1000:.3f}"]
    if end_ms is not None:
        seek += ["-to", f"{end_ms / 1000:.3f}"]
    proc = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-nostats",
            *seek,
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


def _enclosing_object(text: str, index: int) -> str:
    """Return the brace-balanced `{...}` literal containing `index`.

    Field order inside a track item is not stable — /toolkit:cut writes one
    order, the editor's Save writes whatever the object holds — so the fields
    are read out of the whole item rather than matched in sequence.
    """
    depth = 0
    start = index
    while start >= 0:
        if text[start] == "}":
            depth += 1
        elif text[start] == "{":
            if depth == 0:
                break
            depth -= 1
        start -= 1
    depth = 0
    end = start + 1
    while end < len(text):
        if text[end] == "{":
            depth += 1
        elif text[end] == "}":
            if depth == 0:
                break
            depth -= 1
        end += 1
    return text[start : end + 1]


def extract_voice_beds(root_tsx: Path) -> list[VoiceBed]:
    """Return the talking-head beds the reel plays, newest model first.

    b-roll is deliberately excluded: under an L-cut its picture carries
    narration borrowed from a clip that is already counted, and its own sound
    is ambience or silence. Counting it would drag the voice mean down and the
    music up with it.
    """
    text = root_tsx.read_text()

    beds: list[VoiceBed] = []
    for match in re.finditer(r"kind:\s*'clip'", text):
        item = _enclosing_object(text, match.start())
        source = re.search(r"source:\s*'([^']+)'", item)
        if not source:
            continue
        start = re.search(r"sourceInMs:\s*(\d+)", item)
        end = re.search(r"sourceOutMs:\s*(\d+)", item)
        beds.append(
            VoiceBed(
                source.group(1),
                int(start.group(1)) if start else None,
                int(end.group(1)) if end else None,
            )
        )
    if beds:
        return beds

    # Legacy segment shape: `type: 'clip'`, trims in seconds, no source window
    # worth trusting (trimIn/trimOut were relative to the segment, not the file).
    for match in re.finditer(r"type:\s*'clip'[^}]*?source:\s*'([^']+)'", text, re.DOTALL):
        beds.append(VoiceBed(match.group(1), None, None))
    return beds


def extract_voice_clip_sources(root_tsx: Path) -> list[str]:
    """Back-compat shim: sources only, no windows."""
    return [bed.source for bed in extract_voice_beds(root_tsx)]


def weighted_mean_lufs(beds: list[VoiceBed], values: list[float]) -> float:
    """Mean voice loudness, each bed counting for as long as it is on screen.

    `values` is parallel to `beds` rather than keyed by filename: one take
    legitimately backs several beds at different trims, each with its own
    loudness. Falls back to a plain mean when no bed declares a window.
    """
    weights = [bed.duration_ms for bed in beds]
    if any(w is None or w <= 0 for w in weights):
        return sum(values) / len(values)
    total = sum(weights)
    return sum(v * w for v, w in zip(values, weights)) / total


def extract_music_source(root_tsx: Path) -> str | None:
    text = root_tsx.read_text()
    layered = re.search(r"music:\s*\{[^}]*?source:\s*'([^']+)'", text, re.DOTALL)
    if layered:
        return layered.group(1)
    legacy = re.search(r"audio:\s*\{\s*music:\s*'([^']+)'", text)
    return legacy.group(1) if legacy else None


def volume_field_name(root_tsx: Path) -> str:
    """Which key holds the music level in THIS project — for reporting.

    Naming the wrong one sends the reader hunting through Root.tsx for a key it
    does not contain.
    """
    text = root_tsx.read_text()
    return "baseVolumeDb" if re.search(r"baseVolumeDb:", text) else "musicVolumeDb"


def extract_current_volume(root_tsx: Path) -> float | None:
    text = root_tsx.read_text()
    # baseVolumeDb is the layered music level. musicBoostDb, which sits on
    # individual video items, is a per-clip offset and must never be read here.
    for pattern in (r"baseVolumeDb:\s*(-?\d+(?:\.\d+)?)", r"musicVolumeDb:\s*(-?\d+(?:\.\d+)?)"):
        match = re.search(pattern, text)
        if match:
            return float(match.group(1))
    return None


def patch_volume(root_tsx: Path, new_db: float) -> None:
    text = root_tsx.read_text()
    for pattern in (r"(baseVolumeDb:\s*)(-?\d+(?:\.\d+)?)", r"(musicVolumeDb:\s*)(-?\d+(?:\.\d+)?)"):
        if re.search(pattern, text):
            text = re.sub(pattern, lambda m: f"{m.group(1)}{new_db}", text, count=1)
            break
    write_text_lf(root_tsx, text)


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
    beds = extract_voice_beds(root_tsx)
    if not beds:
        print(
            "!! no clip segments found in Root.tsx — expected either layered "
            "tracks.video[] items with kind: 'clip', or legacy segments[] with "
            "type: 'clip'",
            file=sys.stderr,
        )
        return 1

    # Find music
    music_src = extract_music_source(root_tsx)
    if not music_src:
        print(
            "!! no music source found in Root.tsx — expected tracks.music.source "
            "(layered) or audio.music (legacy)",
            file=sys.stderr,
        )
        return 1

    print("=== Voice clips (integrated LUFS) ===")
    measured: list[VoiceBed] = []
    voice_lufs: list[float] = []
    for bed in beds:
        path = proj / "public" / "recordings" / bed.source
        if not path.exists():
            print(f"  !! missing: {bed.source}")
            continue
        lufs = measure_lufs(path, bed.start_ms, bed.end_ms)
        measured.append(bed)
        voice_lufs.append(lufs)
        if bed.duration_ms is None:
            window = "whole file"
        else:
            window = f"{bed.start_ms / 1000:6.2f}-{bed.end_ms / 1000:6.2f}s ({bed.duration_ms / 1000:5.2f}s)"
        print(f"  {bed.source:30s}  {window:26s}  {lufs:+.2f} LUFS")
    if not voice_lufs:
        print("!! no measurable voice clips", file=sys.stderr)
        return 1
    voice_mean = weighted_mean_lufs(measured, voice_lufs)
    weighting = "duration-weighted" if all(b.duration_ms for b in measured) else "unweighted"
    print(f"  mean ({weighting}): {voice_mean:+.2f} LUFS")

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

    field = volume_field_name(root_tsx)
    print("\n=== Calibration ===")
    print(f"  target voice→music differential: -{args.target_diff} LU")
    print(f"  current  {field}: {current:+} dB" if current is not None else f"  current  {field}: (unset)")
    print(f"  recommended {field}: {recommended:+} dB")
    if current is not None:
        delta = recommended - current
        print(f"  delta: {delta:+} dB ({'quieter' if delta < 0 else 'louder' if delta > 0 else 'no change'})")

    if args.apply:
        patch_volume(root_tsx, recommended)
        print(f"\n-> patched {root_tsx.relative_to(workspace_root())} {field} = {recommended}")
    else:
        print("\n  (dry run; pass --apply to patch Root.tsx)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
