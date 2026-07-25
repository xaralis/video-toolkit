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


from video_toolkit.lottie import load_catalog, CATALOG_DIR


def test_list_includes_spinner(capsys):
    rc = main(["list"])
    assert rc == 0
    assert "spinner" in capsys.readouterr().out


def test_all_catalog_templates_valid():
    cat = load_catalog()["templates"]
    assert cat, "catalog must declare templates"
    for tid, meta in cat.items():
        path = CATALOG_DIR / "templates" / meta["file"]
        assert path.exists(), f"{tid}: missing template file {meta['file']}"
        data = json.loads(path.read_text())
        assert is_valid_lottie(data), f"{tid}: not structurally valid Lottie"
        for slot, paths in meta.get("colorSlots", {}).items():
            assert isinstance(paths, list) and paths, f"{tid}.{slot}: colorSlots must be a non-empty list of paths"
            for p in paths:
                ref = nav(data, p)
                assert isinstance(ref, list) and len(ref) >= 3, f"{tid}.{slot}: path {p} is not a color array"
        for name, p in meta.get("valueSlots", {}).items():
            nav(data, p)  # must resolve without KeyError/IndexError


def _accent_hex(out_path):
    data = json.loads(Path(out_path).read_text())
    slot_paths = load_catalog()["templates"]["spinner"]["colorSlots"]["accent"]
    return rgba_to_hex(nav(data, slot_paths[0]))


def test_build_explicit_color(tmp_path):
    out = tmp_path / "spinner.json"
    assert main(["build", "spinner", "--color", "accent=#123456", "-o", str(out)]) == 0
    assert _accent_hex(out) == "#123456"
    assert is_valid_lottie(json.loads(out.read_text()))


def test_build_brand_maps_primary(tmp_path):
    brand = tmp_path / "brand.json"
    brand.write_text(json.dumps({"colors": {"primary": "#00ff00"}}))
    out = tmp_path / "spinner.json"
    assert main(["build", "spinner", "--brand", str(brand), "-o", str(out)]) == 0
    assert _accent_hex(out) == "#00ff00"


def test_build_explicit_overrides_brand(tmp_path):
    brand = tmp_path / "brand.json"
    brand.write_text(json.dumps({"colors": {"primary": "#00ff00"}}))
    out = tmp_path / "spinner.json"
    main(["build", "spinner", "--brand", str(brand), "--color", "accent=#0000ff", "-o", str(out)])
    assert _accent_hex(out) == "#0000ff"


def test_build_unknown_template_errors(tmp_path):
    with pytest.raises(SystemExit):
        main(["build", "nope", "-o", str(tmp_path / "x.json")])


def test_build_unknown_slot_errors(tmp_path):
    with pytest.raises(SystemExit):
        main(["build", "spinner", "--color", "ghost=#000000", "-o", str(tmp_path / "x.json")])


def test_colorize_maps_color(tmp_path):
    out = tmp_path / "out.json"
    assert main(["colorize", str(FIXTURES / "sample_lottie.json"),
                 "--map", "#ff0000=#00ff00", "-o", str(out)]) == 0
    assert distinct_colors(json.loads(out.read_text())) == ["#00ff00"]


def test_colorize_requires_map(tmp_path):
    with pytest.raises(SystemExit):
        main(["colorize", str(FIXTURES / "sample_lottie.json"), "-o", str(tmp_path / "x.json")])
