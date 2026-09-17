import json

import pytest

from video_toolkit.render_reel import DEFAULT_COMPOSITION, resolve_composition


def _project(tmp_path, scripts):
    (tmp_path / "package.json").write_text(json.dumps({"name": "p", "scripts": scripts}), encoding="utf-8")
    return tmp_path


def test_explicit_override_wins(tmp_path):
    p = _project(tmp_path, {"render": "npx remotion render src/index.ts LayeredCampaignReel out/reel.mp4"})
    assert resolve_composition(p, "Other") == "Other"


def test_reads_composition_from_render_script(tmp_path):
    p = _project(tmp_path, {"render": "npx remotion render src/index.ts LayeredCampaignReel out/reel.mp4"})
    assert resolve_composition(p, None) == "LayeredCampaignReel"


def test_render_script_with_flags_and_node_entry(tmp_path):
    p = _project(tmp_path, {"render": "node node_modules/@remotion/cli/remotion-cli.js render --concurrency=4 src/index.ts WebProgramIntro out/intro.mp4"})
    assert resolve_composition(p, None) == "WebProgramIntro"


def test_falls_back_to_preview_script(tmp_path):
    p = _project(tmp_path, {"render:preview": "npx remotion render src/index.ts RoostReel out/preview.mp4 --scale=0.5"})
    assert resolve_composition(p, None) == "RoostReel"


@pytest.mark.parametrize("scripts", [{}, {"render": "remotion render"}, {"build": "tsc"}])
def test_default_when_script_unusable(tmp_path, scripts):
    assert resolve_composition(_project(tmp_path, scripts), None) == DEFAULT_COMPOSITION


def test_default_without_package_json(tmp_path):
    assert resolve_composition(tmp_path, None) == DEFAULT_COMPOSITION
