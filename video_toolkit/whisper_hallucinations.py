#!/usr/bin/env python3
"""
Whisper's subtitle-credit hallucinations, and the rule that removes them.

Whisper fills trailing silence with what it saw in training data, and a large
share of that data is subtitled video — so a recording that ends with a few
seconds of room tone comes back with the *subtitler's credit line* appended as
a final segment. In Czech that is "Titulky vytvořil <nick> <url>"; in English
it is usually the Amara.org community credit. It is not a transcription error
in the ordinary sense — the model is completing a document, and subtitle
documents end that way.

It is worth removing at the source because the damage downstream is silent and
confusing: the caption overlay renders word-level timings, and only the FIRST
word of the hallucination carries a real duration (the rest are zero-length at
the segment end), so what reaches the screen is a bare "Titulky" over otherwise
correct footage. That is what it cost on 2026-08-04 — twice in one reel, from
two different takes.

THE RULE IS DELIBERATELY NARROW: a segment is dropped only when its ENTIRE
text is one of the known credit forms. Not "contains", not "is the last
segment", not "is short and follows silence" — those heuristics delete real
speech, and a caption that vanishes is far worse than one that says something
odd. A sentence that merely mentions titulky/subtitles survives, and there are
tests pinning exactly that.

Usage as a tool (cleans transcripts that were written before this filter):

    python3 -m video_toolkit.whisper_hallucinations path/to/*.transcript.json
"""

import argparse
import json
import re
import sys
from pathlib import Path

from video_toolkit.textio import write_text_lf

# Each pattern must match the WHOLE segment text (case-insensitive, surrounding
# whitespace and trailing punctuation ignored). Add a form only after seeing it
# come out of a real transcription — a speculative pattern is a way to lose
# real speech.
HALLUCINATION_PATTERNS = [
    # cs/sk — the subtitler's credit, with or without a URL or nick.
    r"titulky\s+vytvořil.*",
    r"titulky\s+z\s+odposlechu.*",
    r"titulky\s*:.*",
    r"přepis\s+(a\s+korektura)?\s*:.*",
    r"překlad\s*:.*",
    r"preklad\s*:.*",
    # en — the Amara community credit, the most common English form.
    r"subtitles\s+by\s+the\s+amara\.org\s+community.*",
    r"subtitles\s+by.*amara\.org.*",
    r"(www\.)?amara\.org.*",
]

_COMPILED = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in HALLUCINATION_PATTERNS]


def is_hallucination(text: str) -> bool:
    """True when `text` is entirely a known subtitle-credit line."""
    stripped = (text or "").strip()
    if not stripped:
        return False
    return any(p.fullmatch(stripped) for p in _COMPILED)


def strip_hallucinated_segments(result: dict) -> tuple[dict, list[str]]:
    """Return (cleaned result, texts removed).

    Never mutates the input. Segment ids are renumbered so they stay
    contiguous — consumers index into them. The removed texts come back so the
    caller can PRINT them: a filter that silently deletes transcription output
    is exactly the kind of quiet behaviour that makes a later bug unfindable.
    """
    segments = result.get("segments")
    if not segments:
        return result, []

    kept, removed = [], []
    for seg in segments:
        if is_hallucination(seg.get("text", "")):
            removed.append(seg["text"])
        else:
            kept.append({**seg, "id": len(kept)})

    if not removed:
        return result, []
    return {**result, "segments": kept}, removed


def clean_file(path: Path) -> list[str]:
    """Strip hallucinations from a transcript JSON in place.

    Returns the removed texts. A file with nothing to remove is NOT rewritten —
    inspecting a transcript must not churn it (or its line endings).
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    cleaned, removed = strip_hallucinated_segments(data)
    if removed:
        write_text_lf(Path(path), json.dumps(cleaned, indent=2, ensure_ascii=False))
    return removed


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Strip Whisper's subtitle-credit hallucinations from transcript JSON files"
    )
    parser.add_argument("inputs", nargs="+", help="*.transcript.json files")
    args = parser.parse_args()

    total = 0
    for raw in args.inputs:
        path = Path(raw)
        if not path.exists():
            print(f"!! {path} does not exist")
            continue
        removed = clean_file(path)
        total += len(removed)
        if removed:
            print(f"   {path}: removed {len(removed)}")
            for text in removed:
                print(f"      - {text.strip()!r}")
        else:
            print(f"   {path}: clean")

    print(f"\nRemoved {total} hallucinated segment(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
