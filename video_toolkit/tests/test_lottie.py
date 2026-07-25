import json
from pathlib import Path

import pytest

from video_toolkit.lottie import (
    hex_to_rgba, rgba_to_hex, nav, nav_set,
    distinct_colors, is_valid_lottie, main,
)

FIXTURES = Path(__file__).parent / "fixtures"


def test_hex_rgba_roundtrip():
    assert rgba_to_hex(hex_to_rgba("#ea580c")) == "#ea580c"
    assert hex_to_rgba("#000000") == [0.0, 0.0, 0.0, 1.0]
    assert hex_to_rgba("#fff") == [1.0, 1.0, 1.0, 1.0]  # shorthand expands


def test_hex_invalid_raises():
    with pytest.raises(ValueError):
        hex_to_rgba("#12")


def test_nav_and_nav_set():
    obj = {"a": [{"b": [0, 0, 0, 1]}]}
    assert nav(obj, ["a", 0, "b"]) == [0, 0, 0, 1]
    nav_set(obj, ["a", 0, "b", 0], 0.5)
    assert obj["a"][0]["b"][0] == 0.5


def test_distinct_colors_reads_fills():
    data = json.loads((FIXTURES / "sample_lottie.json").read_text())
    assert distinct_colors(data) == ["#ff0000"]


def test_is_valid_lottie():
    data = json.loads((FIXTURES / "sample_lottie.json").read_text())
    assert is_valid_lottie(data) is True
    assert is_valid_lottie({"nope": 1}) is False


def test_info_json_output(capsys):
    rc = main(["info", str(FIXTURES / "sample_lottie.json"), "--json", "--colors"])
    assert rc == 0
    out = json.loads(capsys.readouterr().out)
    assert out["width"] == 100 and out["height"] == 100 and out["fps"] == 30
    assert out["duration_seconds"] == 2.0
    assert out["layers"] == 1
    assert out["valid"] is True
    assert out["colors"] == ["#ff0000"]
