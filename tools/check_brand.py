#!/usr/bin/env python3
"""Brand-rule linter for a campaign-reels project.

Reads `src/Root.tsx`, extracts the inline `defaultProps` literal (via JSON5),
and checks each segment / overlay against the machine-checkable brand rules
documented in `brands/<brand>/BRAND-RULES.md`.

Outputs categorized findings:
    [ERROR]  Hard violations (3s minimums, missing assets, invalid placements)
    [WARN]   Soft violations (pacing hints, accent word counts, etc.)

Exit code: 1 if any ERRORs, else 0. WARNs alone don't fail the lint.

Usage:
    python3 tools/check_brand.py                       # auto-detect project
    python3 tools/check_brand.py --project pp-smoke-02
    python3 tools/check_brand.py --strict              # WARNs also fail
    python3 tools/check_brand.py --json                # machine-readable output
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

import json5  # type: ignore[import-untyped]

REPO_ROOT = Path(__file__).resolve().parent.parent
ACCENT_PATTERN = re.compile(r"\{(lime|teal):([^}]+)\}")
VALID_PLACEMENTS = {
    "upper-third", "center", "lower-third",
    "upper-left", "upper-center", "upper-right",
    "mid-left", "mid-right",
    "lower-left", "lower-center", "lower-right",
}
LOWER_PLACEMENTS = {"lower-third", "lower-left", "lower-center", "lower-right"}


@dataclass
class Finding:
    level: str           # "ERROR" or "WARN"
    rule: str            # e.g., "#19"
    segment_id: str | None
    message: str


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


def extract_default_props(root_tsx: Path) -> dict:
    src = root_tsx.read_text(encoding="utf-8")
    needle = "defaultProps={"
    # Find the first occurrence that is NOT inside a line comment (//)
    idx = -1
    search_from = 0
    while True:
        candidate = src.find(needle, search_from)
        if candidate == -1:
            break
        # Check whether this occurrence is on a comment line
        line_start = src.rfind("\n", 0, candidate) + 1
        line_prefix = src[line_start:candidate]
        if "//" not in line_prefix:
            idx = candidate
            break
        search_from = candidate + 1
    if idx == -1:
        raise SystemExit("ERROR: defaultProps={ not found in Root.tsx")
    i = idx + len(needle)
    if src[i] != "{":
        raise SystemExit("ERROR: expected '{' after defaultProps=")
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
    # Strip TypeScript `as const` assertions (added by Remotion Studio's Save,
    # and in hand-authored literals) — json5 can't parse them.
    literal = re.sub(r"\s+as\s+const\b", "", src[start:i])
    return json5.loads(literal)


def lint_segments(segments: list[dict], project_path: Path) -> list[Finding]:
    findings: list[Finding] = []
    title_seen_in: list[int] = []
    last_quote_pull_reel_end: float | None = None
    reel_cursor = 0.0

    for idx, seg in enumerate(segments):
        seg_id = seg.get("id", f"#{idx + 1}")
        seg_type = seg.get("type")
        seg_start = reel_cursor

        # Compute segment duration
        if seg_type in ("clip", "broll"):
            duration = float(seg["trimOut"]) - float(seg["trimIn"])
        elif seg_type in ("multi-clip", "card"):
            duration = float(seg["durationMs"]) / 1000.0
        elif seg_type == "outro":
            duration = 6.0
        else:
            duration = 0.0

        # Rule #19 — b-roll min 3s
        if seg_type == "broll" and duration < 3.0 - 1e-3:
            findings.append(Finding(
                "ERROR", "#19", seg_id,
                f"b-roll duration {duration:.2f}s < 3s minimum",
            ))

        # Source files exist
        if seg_type == "clip":
            src_path = project_path / "public/recordings" / seg["source"]
            if not src_path.exists():
                findings.append(Finding("ERROR", "asset", seg_id, f"missing source file: public/recordings/{seg['source']}"))
            # Transcript file
            transcript_path = project_path / "public/recordings" / f"{seg['source']}.transcript.json"
            if not transcript_path.exists():
                findings.append(Finding("WARN", "#17", seg_id, f"missing transcript: {transcript_path.name}"))
        elif seg_type == "broll":
            src_path = project_path / "public/broll" / seg["source"]
            if not src_path.exists():
                findings.append(Finding("ERROR", "asset", seg_id, f"missing source file: public/broll/{seg['source']}"))
            if seg.get("audioMode") == "inherit-from-clip":
                audio_src = seg.get("audioSource")
                if not audio_src:
                    findings.append(Finding("ERROR", "audio", seg_id, "audioMode='inherit-from-clip' but no audioSource"))
                else:
                    audio_path = project_path / "public/recordings" / audio_src
                    if not audio_path.exists():
                        findings.append(Finding("ERROR", "audio", seg_id, f"audioSource missing: public/recordings/{audio_src}"))
                    transcript_path = project_path / "public/recordings" / f"{audio_src}.transcript.json"
                    if not transcript_path.exists():
                        findings.append(Finding("WARN", "#17", seg_id, f"L-cut audio source has no transcript: {transcript_path.name}"))

        # Overlays
        overlays = list(seg.get("overlays", []) or [])
        # broll has a single `overlay` field, not `overlays`
        if seg.get("overlay"):
            overlays.append(seg["overlay"])

        for ov in overlays:
            ov_kind = ov.get("kind")
            # Rule #19 — emphasis text ≥ 3s
            if ov_kind in ("title", "quote-pull", "stat-callout", "source-tag"):
                dms = ov.get("durationMs", 0)
                if dms < 3000:
                    findings.append(Finding("ERROR", "#19", seg_id, f"{ov_kind} durationMs={dms}ms < 3000ms"))
            # Rule #28 — placement must be in enum (for quote-pull)
            if ov_kind == "quote-pull":
                placement = ov.get("placement")
                if placement not in VALID_PLACEMENTS:
                    findings.append(Finding("ERROR", "#28", seg_id, f"quote-pull placement '{placement}' not in valid enum"))
                # Rule #20 — pace emphasis text (≥7s between, warn at <5s)
                appear_reel = seg_start + ov.get("appearAt", 0) / 1000.0
                if last_quote_pull_reel_end is not None:
                    gap = appear_reel - last_quote_pull_reel_end
                    if gap < 5.0:
                        findings.append(Finding(
                            "WARN", "#20", seg_id,
                            f"quote-pull appears {gap:.1f}s after previous — pace is too tight (target ~7-10s)",
                        ))
                last_quote_pull_reel_end = appear_reel + ov.get("durationMs", 0) / 1000.0

            # Rule #22 — TitleOverlay frame 0 (appearAt is ignored by component, but warn if non-zero so author knows)
            if ov_kind == "title":
                title_seen_in.append(idx)
                if ov.get("appearAt", 0) != 0:
                    findings.append(Finding("WARN", "#22", seg_id, f"title appearAt={ov['appearAt']} is ignored; component always renders from frame 0"))

            # Rule #1 — accent emphasis-only (1–3 words per accent block)
            text = ov.get("text", "")
            for m in ACCENT_PATTERN.finditer(text):
                phrase = m.group(2)
                word_count = len([w for w in phrase.split() if w])
                # Single-char punctuation accent (e.g., {teal:.}) is the brand endpoint — exempt
                if word_count > 3 and phrase.strip() not in (".", ","):
                    findings.append(Finding(
                        "WARN", "#1", seg_id,
                        f"accent block has {word_count} words: '{phrase}' (emphasis-only is 1–3 words)",
                    ))

            # Rule #10 — no double `.` (text ending with `..` after auto-transform would be unusual)
            if text.endswith(".."):
                findings.append(Finding("ERROR", "#10", seg_id, "text ends with '..' — endpoint dot doubled"))

        # Rule #14 — title overlay should be on the FIRST segment only (it's the reel headline)
        if seg_type == "clip" and any(o.get("kind") == "title" for o in overlays):
            if idx != 0:
                findings.append(Finding("WARN", "#14", seg_id, f"title overlay appears on segment #{idx+1}; usually only the opening clip has the headline title"))

        # Advance the reel cursor (transitions cause overlap but for lint
        # purposes the linear sum is close enough for #20 pacing checks)
        reel_cursor += duration

    # Rule #14 (continued) — only one title overlay total
    if len(title_seen_in) > 1:
        findings.append(Finding(
            "WARN", "#14",
            segments[title_seen_in[1]].get("id"),
            f"reel has {len(title_seen_in)} title overlays; the title is the reel headline — usually one per reel",
        ))

    return findings


def format_human(findings: list[Finding]) -> str:
    if not findings:
        return "OK — no brand-rule violations."
    lines = []
    errors = [f for f in findings if f.level == "ERROR"]
    warns = [f for f in findings if f.level == "WARN"]
    for f in errors + warns:
        seg = f.segment_id or "-"
        lines.append(f"[{f.level}] rule {f.rule:5} {seg:10}  {f.message}")
    summary = f"\n{len(errors)} error(s), {len(warns)} warning(s)."
    return "\n".join(lines) + summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--project", help="Project name under projects/")
    ap.add_argument("--strict", action="store_true", help="Treat warnings as failures")
    ap.add_argument("--json", action="store_true", help="Output JSON instead of human text")
    args = ap.parse_args()

    project_path = detect_project(args.project)
    print(f"-> checking {project_path.name}", file=sys.stderr)
    props = extract_default_props(project_path / "src/Root.tsx")
    findings = lint_segments(props.get("segments", []), project_path)

    if args.json:
        print(json.dumps({"findings": [asdict(f) for f in findings]}, indent=2, ensure_ascii=False))
    else:
        print(format_human(findings))

    has_errors = any(f.level == "ERROR" for f in findings)
    has_warns = any(f.level == "WARN" for f in findings)
    if has_errors or (args.strict and has_warns):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
