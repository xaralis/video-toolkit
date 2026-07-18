"""Unit tests for video_toolkit/render_shooting_cards.py."""
import sys
from pathlib import Path

# Make the package importable as a sibling.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from video_toolkit.render_shooting_cards import (
    _CARD_USABLE_H_PT,
    _FIT_SAFETY,
    _MAX_TAKE_PT,
    _MIN_TAKE_PT,
    _estimate_take_height_pt,
    _fit_take_font,
    parse_screenplay,
)

# A representative seg-NNN screenplay: one L-cut take (face → broll → face).
SAMPLE = """# Natáčení — Test

## seg-001  [clip · face · Úvod]

**Spoken intent:** Do Pardubic přicházejí studovat tisíce mladých lidí.

## seg-002  [broll · audio-inherit-from seg-001]

**Visual intent:** Studenti v centru.

**Spoken intent (audio-inherit-from seg-001):** Mnozí by tu rádi zůstali,

## seg-003  [clip · face]

**Spoken intent (continues seg-001):** dostupné bydlení je ale problém.
"""


def test_parse_groups_lcut_into_one_take():
    sp = parse_screenplay(SAMPLE)
    assert sp.title == "TEST"
    assert len(sp.takes) == 1
    take = sp.takes[0]
    assert take.label == "Úvod"
    assert take.lines == [
        "Do Pardubic přicházejí studovat tisíce mladých lidí.",
        "Mnozí by tu rádi zůstali,",
        "dostupné bydlení je ale problém.",
    ]
    assert sp.broll == ["Studenti v centru."]


def test_new_spoken_intent_starts_a_fresh_take():
    md = SAMPLE + "\n## seg-004  [clip · face · Druhý]\n\n**Spoken intent:** Nová promluva.\n"
    sp = parse_screenplay(md)
    assert len(sp.takes) == 2
    assert sp.takes[1].lines == ["Nová promluva."]


def test_short_take_gets_the_biggest_font():
    size, fits = _fit_take_font(["Chceme stavět budoucnost."])
    assert fits is True
    assert size == _MAX_TAKE_PT


def test_fit_fills_the_page_leaving_little_whitespace():
    # A largest-that-fits size must sit close under the budget: bumping it 1pt
    # would overflow, so the page is filled (no wasted tier from a coarse ladder).
    budget = _CARD_USABLE_H_PT * _FIT_SAFETY
    lines = [
        "Příčina je jednoduchá: v Pardubicích vzniká málo nových bytů.",
        "Když jich je nedostatek, ceny rostou",
        "a mladí lidé ztrácejí možnost",
        "spojit svou budoucnost s Pardubicemi.",
    ]
    size, fits = _fit_take_font(lines)
    assert fits is True
    assert size < _MAX_TAKE_PT  # a multi-line take does not get the max size
    assert _estimate_take_height_pt(lines, size) <= budget
    assert _estimate_take_height_pt(lines, size + 1) > budget  # one bigger would overflow


def test_every_normal_take_is_guaranteed_to_fit_one_page():
    # The five real bydleni takes (≈170–200 chars each, 3–4 fragments).
    takes = [
        [
            "Do Pardubic přicházejí studovat tisíce mladých lidí.",
            "Mnozí by tu po škole rádi zůstali,",
            "založili rodinu a budovali svůj život.",
            "Dostupné bydlení je ale čím dál větší problém.",
        ],
        [
            "Symbolem té změny budou Masarykova kasárna.",
            "Na místě dnešního brownfieldu připravíme novou čtvrť",
            "a část pozemků nabídneme bytovým družstvům.",
            "Vznikne tu bydlení bez developerské marže, za cenu stavby.",
        ],
    ]
    budget = _CARD_USABLE_H_PT * _FIT_SAFETY
    for lines in takes:
        size, fits = _fit_take_font(lines)
        assert fits is True
        # The chosen size's estimated height must sit inside the page budget.
        assert _estimate_take_height_pt(lines, size) <= budget
        assert size >= _MIN_TAKE_PT


def test_pathologically_long_take_reports_overflow():
    # A wall of text that cannot fit even at the minimum size.
    lines = ["Tohle je hodně dlouhá věta plná slov. " * 12 for _ in range(6)]
    size, fits = _fit_take_font(lines)
    assert fits is False
    assert size == _MIN_TAKE_PT


def test_bigger_font_never_shrinks_estimated_height():
    lines = ["Nějaká přiměřeně dlouhá promluva o bydlení v Pardubicích."]
    heights = [_estimate_take_height_pt(lines, s) for s in range(_MIN_TAKE_PT, _MAX_TAKE_PT + 1)]
    assert heights == sorted(heights)
