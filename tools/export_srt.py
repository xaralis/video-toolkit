#!/usr/bin/env python3
"""Export an SRT (subtitle) file from a campaign-reels project.

Reads the project's `src/Root.tsx`, extracts the inline `defaultProps` object
literal (JSON5-compatible), walks the segments to compute reel-timeline
timings, and for every segment with audio (clip OR broll with
`audioMode: 'inherit-from-clip'`) emits one SRT cue per Whisper
sentence-segment.

Usage:
    python3 tools/export_srt.py                       # auto-detect project
    python3 tools/export_srt.py --project pp-smoke-02
    python3 tools/export_srt.py --project pp-smoke-02 --output captions.srt
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import json5  # type: ignore[import-untyped]

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTRO_SEC = 6.0  # 180 frames @ 30 fps
# Consecutive L-cut windows that inherit from the same source are "contiguous"
# if the next window's source-start sits within this tolerance of the current
# window's source-end. Must absorb trim/rounding slop (audioStartSec values are
# hand-tuned and rarely land exactly on the previous window's end), otherwise a
# sentence spanning the boundary gets truncated and the following segment is
# left with no caption.
L_CUT_GAP_TOLERANCE_SEC = 0.15


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
    # Pick the project with most-recently-touched Root.tsx
    candidates = [
        (p, (p / "src" / "Root.tsx").stat().st_mtime)
        for p in projects_dir.iterdir()
        if (p / "src" / "Root.tsx").exists()
    ]
    if not candidates:
        raise SystemExit("ERROR: no reel projects with src/Root.tsx found")
    candidates.sort(key=lambda kv: kv[1], reverse=True)
    return candidates[0][0]


def _strip_js_comments(src: str) -> str:
    """Remove // line comments and /* block comments, preserving newlines so
    line numbers in error messages still roughly track. Aware of string
    contexts ('...', "...", `...`) so comments inside strings are kept."""
    out: list[str] = []
    i = 0
    n = len(src)
    in_string: str | None = None
    while i < n:
        ch = src[i]
        nxt = src[i + 1] if i + 1 < n else ""
        if in_string is not None:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(nxt)
                i += 2
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            in_string = ch
            out.append(ch)
            i += 1
            continue
        if ch == "/" and nxt == "/":
            # line comment until newline
            while i < n and src[i] != "\n":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            # block comment until */
            i += 2
            while i + 1 < n and not (src[i] == "*" and src[i + 1] == "/"):
                if src[i] == "\n":
                    out.append("\n")  # preserve line breaks
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def extract_default_props_literal(root_tsx: Path) -> str:
    """Return the source text of the inline defaultProps={ ... } literal."""
    src = root_tsx.read_text(encoding="utf-8")
    # Strip JS comments first — the template's comment block above the JSX
    # mentions `defaultProps={{...}}` in prose, which the brace-tracker would
    # otherwise grab as the literal.
    src = _strip_js_comments(src)
    needle = "defaultProps={"
    idx = src.find(needle)
    if idx == -1:
        raise SystemExit("ERROR: defaultProps={ not found in Root.tsx")
    i = idx + len(needle)
    if src[i] != "{":
        raise SystemExit("ERROR: expected '{' after defaultProps=")
    # Track balanced braces, skip over strings (handles single/double/backtick).
    start = i
    depth = 1
    i += 1
    in_string: str | None = None
    while i < len(src) and depth > 0:
        ch = src[i]
        if in_string is not None:
            if ch == "\\":
                i += 2
                continue
            if ch == in_string:
                in_string = None
        else:
            if ch in ("'", '"', "`"):
                in_string = ch
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
        i += 1
    if depth != 0:
        raise SystemExit("ERROR: unbalanced braces in defaultProps literal")
    return src[start:i]


def strip_ts_assertions(literal: str) -> str:
    """Remove TypeScript `as const` assertions from an otherwise JSON5-compatible
    literal. Skips inside string contents so `as const` literally written in a
    string is preserved.

    Handles `<whitespace>as<whitespace>const` followed by a non-identifier char
    (comma, brace, whitespace, end-of-input). Other TS assertions (`as T`,
    `satisfies T`, `: T`) are NOT stripped — defaultProps uses only `as const`.
    """
    out: list[str] = []
    i = 0
    in_string: str | None = None
    n = len(literal)
    while i < n:
        ch = literal[i]
        if in_string is not None:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(literal[i + 1])
                i += 2
                continue
            if ch == in_string:
                in_string = None
            i += 1
            continue
        if ch in ("'", '"', "`"):
            in_string = ch
            out.append(ch)
            i += 1
            continue
        if ch.isspace():
            # Peek for `<ws>as<ws>const<non-ident>`
            j = i
            while j < n and literal[j].isspace():
                j += 1
            if literal[j:j+2] == "as" and j + 2 < n and literal[j+2].isspace():
                k = j + 2
                while k < n and literal[k].isspace():
                    k += 1
                if literal[k:k+5] == "const":
                    after = literal[k+5:k+6]
                    if not after or not (after.isalnum() or after == "_"):
                        i = k + 5
                        continue
        out.append(ch)
        i += 1
    return "".join(out)


def parse_default_props(root_tsx: Path) -> dict:
    literal = extract_default_props_literal(root_tsx)
    literal = strip_ts_assertions(literal)
    try:
        return json5.loads(literal)
    except Exception as e:
        raise SystemExit(f"ERROR: could not parse defaultProps literal as JSON5: {e}")


def compute_segment_timings(segments: list[dict]) -> list[dict]:
    cursor = 0.0
    out: list[dict] = []
    for seg in segments:
        t = seg.get("type")
        if t in ("clip", "broll"):
            duration = float(seg["trimOut"]) - float(seg["trimIn"])
        elif t in ("multi-clip", "card"):
            duration = float(seg["durationMs"]) / 1000.0
        elif t == "outro":
            duration = OUTRO_SEC
        else:
            duration = 0.0
        out.append({**seg, "startSec": cursor, "durationSec": duration})
        # Transitions overlap visually but TransitionSeries plays both audio
        # tracks during the transition window; SRT timing stays aligned to
        # the natural per-segment audio cursor.
        cursor += duration
    return out


def srt_time(sec: float) -> str:
    ms = max(0, round(sec * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_cues(timed_segments: list[dict], project_path: Path) -> list[dict]:
    """Produce one SRT cue per Whisper sentence.

    Builds a source-time → reel-time map across all reel segments that use a
    given source (clip OR broll inheriting from that source). For each Whisper
    sentence, looks up the reel-time of its start, then extends the cue end
    through contiguous mappings if the sentence spans a reel-segment boundary
    (the common case with L-cut audio).
    """
    # source_file → list of {src_start, src_end, reel_start}, sorted by src_start
    source_mappings: dict[str, list[dict]] = {}
    for seg in timed_segments:
        if seg["type"] == "clip":
            # Silent clips (no spoken content — closer beats, group portraits)
            # carry no voice; their transcript is irrelevant. Skip per brand
            # rule #30: silent clips are music-bed visuals, not caption sources.
            if seg.get("audioMode") == "silent":
                continue
            src = seg["source"]
            entry = {"src_start": float(seg["trimIn"]), "src_end": float(seg["trimOut"]), "reel_start": seg["startSec"]}
        elif (
            seg["type"] == "broll"
            and seg.get("audioMode") == "inherit-from-clip"
            and seg.get("audioSource")
        ):
            src = seg["audioSource"]
            sstart = float(seg.get("audioStartSec", 0))
            entry = {"src_start": sstart, "src_end": sstart + seg["durationSec"], "reel_start": seg["startSec"]}
        else:
            continue
        source_mappings.setdefault(src, []).append(entry)

    for mappings in source_mappings.values():
        mappings.sort(key=lambda m: m["src_start"])

    cues: list[dict] = []
    for source, mappings in source_mappings.items():
        transcript_path = project_path / "public/recordings" / f"{source}.transcript.json"
        if not transcript_path.exists():
            print(f"-> missing transcript: {transcript_path.name} (skipping source {source})", file=sys.stderr)
            continue
        try:
            transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"-> failed to read {transcript_path.name}: {e}", file=sys.stderr)
            continue

        for wseg in transcript.get("segments", []):
            ws, we = float(wseg["start"]), float(wseg["end"])
            # Find first mapping that OVERLAPS the Whisper segment (not just
            # contains its start). A sentence starting before trim_in but ending
            # inside the window should still emit a cue, clipped to the window.
            target = next(
                (m for m in mappings if not (we <= m["src_start"] or ws >= m["src_end"])),
                None,
            )
            if target is None:
                continue
            # Clip ws to mapping start if the sentence starts before the trim
            ws_clipped = max(ws, target["src_start"])
            reel_s = target["reel_start"] + (ws_clipped - target["src_start"])
            # Walk through contiguous mappings to find where the sentence ends
            # in reel-time. If the sentence extends past a mapping's source_end
            # and the next mapping picks up at exactly that source-time, the
            # audio is contiguous (L-cut) — extend through.
            remaining_we = we
            current = target
            reel_e = target["reel_start"] + (min(remaining_we, current["src_end"]) - current["src_start"])
            while remaining_we > current["src_end"]:
                next_m = next(
                    (m for m in mappings if abs(m["src_start"] - current["src_end"]) < L_CUT_GAP_TOLERANCE_SEC),
                    None,
                )
                if next_m is None:
                    break  # gap in audio playback; truncate the cue
                current = next_m
                reel_e = current["reel_start"] + (min(remaining_we, current["src_end"]) - current["src_start"])
            if reel_e <= reel_s:
                continue
            # Reconstruct cue text from word-level data so trim-cut words don't
            # leak in. Use word midpoint vs clipped window: words whose middle
            # falls outside [ws_clipped, we] are dropped.
            words = wseg.get("words", [])
            text: str
            if words:
                # Keep words whose start is within 0.5s before the clip start.
                # Accepts boundary words bleeding into the trim from a natural
                # spoken phrase; rejects words that fired well before (e.g.,
                # counterdowns "Raz, dva, tři" before the clipped narration).
                BOUNDARY_BUFFER_SEC = 0.5
                kept = [
                    w for w in words
                    if float(w["start"]) >= ws_clipped - BOUNDARY_BUFFER_SEC
                    and float(w["start"]) <= we
                ]
                text = "".join(w["word"] for w in kept).strip()
                if not text:
                    text = (wseg.get("text") or "").strip()
            else:
                text = (wseg.get("text") or "").strip()
            if not text:
                continue
            cues.append({"start": reel_s, "end": reel_e, "text": text})

    cues.sort(key=lambda c: c["start"])
    return cues


def format_srt(cues: list[dict]) -> str:
    return (
        "\n".join(
            f"{i + 1}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}\n"
            for i, c in enumerate(cues)
        )
        + "\n"
    )


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", help="Project name under projects/")
    ap.add_argument("--output", help="Output SRT path (default: <project>/out/reel.srt)")
    args = ap.parse_args()

    project_path = detect_project(args.project)
    project_name = project_path.name
    output = Path(args.output) if args.output else project_path / "out" / "reel.srt"

    print(f"-> exporting SRT for {project_name}")
    props = parse_default_props(project_path / "src/Root.tsx")
    segments = props.get("segments", [])
    timed = compute_segment_timings(segments)
    cues = build_cues(timed, project_path)
    if not cues:
        print("WARN: no caption cues produced — check that clip segments have transcripts", file=sys.stderr)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(format_srt(cues), encoding="utf-8")
    total = sum(s["durationSec"] for s in timed)
    rel = output.relative_to(REPO_ROOT) if output.is_relative_to(REPO_ROOT) else output
    print(f"   wrote {rel} — {len(cues)} cue(s), reel duration ~{total:.1f}s")


if __name__ == "__main__":
    main()
