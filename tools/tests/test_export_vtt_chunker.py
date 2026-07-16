"""Unit tests for tools/export_vtt.py chunker."""
import sys
from pathlib import Path

# Make tools/ importable as a sibling package.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from tools.export_vtt import Word, chunk_words_into_cues, format_timestamp, render_vtt


def W(start, end, word):
    return Word(start=start, end=end, word=word)


def test_single_short_phrase_yields_one_cue():
    words = [W(0.0, 0.5, "Pardubice"), W(0.5, 1.0, "mají"), W(1.0, 1.5, "všechno")]
    cues = chunk_words_into_cues(words, max_chars=28, max_cue_sec=2.0)
    assert len(cues) == 1
    assert cues[0].text == "Pardubice mají všechno"
    assert cues[0].start == 0.0
    assert cues[0].end == 1.5


def test_sentence_end_always_terminates_cue():
    words = [
        W(0.0, 0.5, "Krátký"),
        W(0.5, 1.0, "úsek."),
        W(1.0, 1.5, "Další"),
    ]
    cues = chunk_words_into_cues(words, max_chars=80, max_cue_sec=10.0)
    assert len(cues) == 2
    assert cues[0].text == "Krátký úsek."
    assert cues[1].text == "Další"


def test_char_budget_with_soft_break_preferred():
    # "Pardubice mají všechno, co moderní město potřebuje."
    # max_chars=28 → expect break after "všechno," (comma is soft break).
    words = [
        W(0.0, 0.4, "Pardubice"),
        W(0.4, 0.8, "mají"),
        W(0.8, 1.2, "všechno,"),
        W(1.2, 1.6, "co"),
        W(1.6, 2.0, "moderní"),
        W(2.0, 2.5, "město"),
        W(2.5, 3.0, "potřebuje."),
    ]
    cues = chunk_words_into_cues(words, max_chars=28, max_cue_sec=10.0)
    assert len(cues) == 2
    assert cues[0].text == "Pardubice mají všechno,"
    assert cues[1].text == "co moderní město potřebuje."


def test_time_budget_forces_break_without_soft_break():
    # Long words with no punctuation, max_cue_sec=1.5s → must break.
    words = [
        W(0.0, 0.5, "Aaa"),
        W(0.5, 1.0, "Bbb"),
        W(1.0, 1.6, "Ccc"),
        W(1.6, 2.2, "Ddd"),
    ]
    cues = chunk_words_into_cues(words, max_chars=80, max_cue_sec=1.5)
    # First cue: "Aaa Bbb Ccc" (Aaa.start=0, Ccc.end=1.6 ≥ 1.5 → break)
    assert len(cues) >= 2
    assert cues[0].text == "Aaa Bbb Ccc"


def test_format_timestamp_under_one_hour():
    assert format_timestamp(0.0) == "00:00.000"
    assert format_timestamp(1.6) == "00:01.600"
    assert format_timestamp(65.123) == "01:05.123"
    assert format_timestamp(3599.999) == "59:59.999"


def test_render_vtt_emits_webvtt_header_and_cues():
    from tools.export_vtt import Cue
    cues = [
        Cue(start=0.0, end=1.6, text="Pardubice mají všechno,"),
        Cue(start=1.6, end=3.2, text="co moderní město potřebuje."),
    ]
    vtt = render_vtt(cues)
    assert vtt.startswith("WEBVTT\n")
    assert "00:00.000 --> 00:01.600" in vtt
    assert "Pardubice mají všechno," in vtt
    assert "00:01.600 --> 00:03.200" in vtt
    # No cue settings (line:, position:, align:) — pure text.
    assert "line:" not in vtt
    assert "position:" not in vtt
    assert "align:" not in vtt
