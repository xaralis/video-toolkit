#!/usr/bin/env python3
"""
Transcribe audio/video via the Modal Whisper endpoint.

Usage:
    python3 tools/transcribe.py path/to/recording.mp4
    python3 tools/transcribe.py path/to/recording.mp4 --language en
    python3 tools/transcribe.py path/to/recording.mp4 --output transcript.json
    python3 tools/transcribe.py *.mp4 --language cs   # batch
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import requests

sys.path.insert(0, os.path.dirname(__file__))
from file_transfer import upload_to_r2, delete_from_r2  # noqa: E402

DEFAULT_ENDPOINT_ENV = "MODAL_WHISPER_ENDPOINT_URL"
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv"}


def extract_initial_prompt_from_screenplay(path: Path) -> str:
    """Build a Whisper initial_prompt from a SCREENPLAY.md.

    Concatenates: frontmatter `topic` and `chevron`, plus every
    `**Spoken intent:**` line across all segments. Whisper uses this
    as decoder context to improve proper-noun and domain-term accuracy.
    """
    if not path.exists():
        return ""
    text = path.read_text(encoding="utf-8")

    parts: list[str] = []

    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if fm_match:
        for line in fm_match.group(1).splitlines():
            m = re.match(r"^(topic|chevron):\s*(.+?)\s*$", line)
            if m:
                parts.append(m.group(2).strip("\"'"))

    for m in re.finditer(
        r"\*\*Spoken intent:\*\*\s*(.+?)(?:\n\n|\n\*\*|\Z)", text, re.DOTALL
    ):
        parts.append(m.group(1).strip())

    return " ".join(p for p in parts if p)


def extract_audio(input_path: Path, tmp_dir: Path) -> Path:
    """Shell out to ffmpeg: extract mono 16 kHz mp3 to a temp file."""
    out = tmp_dir / "audio.mp3"
    cmd = [
        "ffmpeg", "-y", "-i", str(input_path),
        "-vn", "-ac", "1", "-ar", "16000",
        "-c:a", "libmp3lame", "-b:a", "64k", str(out),
    ]
    try:
        subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        print("ERROR: ffmpeg not found on PATH — install ffmpeg first", file=sys.stderr)
        sys.exit(2)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: ffmpeg failed extracting audio from {input_path}: exit {e.returncode}", file=sys.stderr)
        sys.exit(2)
    return out


def transcribe_one(
    input_path: Path,
    language: str,
    endpoint: str,
    output_path: Path,
    initial_prompt: str = "",
) -> dict:
    if input_path.suffix.lower() in VIDEO_EXTS:
        tmp_dir = Path(tempfile.mkdtemp(prefix="transcribe_"))
        try:
            audio = extract_audio(input_path, tmp_dir)
            result = _transcribe_audio(audio, language, endpoint, initial_prompt)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)
    else:
        result = _transcribe_audio(input_path, language, endpoint, initial_prompt)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    return result


def _transcribe_audio(
    audio: Path, language: str, endpoint: str, initial_prompt: str = ""
) -> dict:
    """Upload audio to R2, transcribe via endpoint, delete from R2."""
    url, key = upload_to_r2(str(audio), "whisper")
    try:
        payload = {"audio_url": url, "language": language}
        if initial_prompt:
            payload["initial_prompt"] = initial_prompt
        resp = requests.post(endpoint, json=payload, timeout=600)
        resp.raise_for_status()
        return resp.json()
    finally:
        delete_from_r2(key)


def resolve_endpoint(arg_endpoint):
    if arg_endpoint:
        return arg_endpoint
    env = os.environ.get(DEFAULT_ENDPOINT_ENV)
    if env:
        return env
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith(f"{DEFAULT_ENDPOINT_ENV}="):
                return line.split("=", 1)[1].strip()
    return None


def main():
    parser = argparse.ArgumentParser(description="Whisper transcription via Modal")
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--language", default="cs")
    parser.add_argument("--output", help="Output JSON path (single-input mode only)")
    parser.add_argument("--endpoint", help=f"Override {DEFAULT_ENDPOINT_ENV}")
    parser.add_argument(
        "--screenplay",
        help=(
            "Path to SCREENPLAY.md. Its frontmatter topic + Spoken intent lines "
            "feed Whisper as initial_prompt for better proper-noun accuracy."
        ),
    )
    args = parser.parse_args()

    endpoint = resolve_endpoint(args.endpoint)
    if not endpoint:
        print(f"ERROR: set {DEFAULT_ENDPOINT_ENV} in env or pass --endpoint", file=sys.stderr)
        sys.exit(2)

    if args.output and len(args.inputs) != 1:
        print("ERROR: --output only valid with single input", file=sys.stderr)
        sys.exit(2)

    initial_prompt = ""
    if args.screenplay:
        initial_prompt = extract_initial_prompt_from_screenplay(Path(args.screenplay))
        if initial_prompt:
            print(
                f"-> using screenplay context ({len(initial_prompt)} chars) as initial_prompt"
            )

    for raw in args.inputs:
        path = Path(raw)
        if not path.exists():
            print(f"SKIP: {path} does not exist", file=sys.stderr)
            continue
        out = Path(args.output) if args.output else path.with_suffix(path.suffix + ".transcript.json")
        print(f"-> transcribing {path}")
        result = transcribe_one(path, args.language, endpoint, out, initial_prompt)
        n = len(result.get("segments", []))
        d = result.get("duration", 0)
        print(f"   wrote {out} ({n} segments, {d:.1f}s)")


if __name__ == "__main__":
    main()
