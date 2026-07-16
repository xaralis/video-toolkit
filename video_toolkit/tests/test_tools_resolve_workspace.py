"""The tools must find projects/ in the workspace, not beside their own file.

Before this, REPO_ROOT = Path(__file__).parent.parent meant a tool installed as
a submodule inside a brand repo looked for <brand>/toolkit/projects/, which does
not exist. These tests pin the resolution, not the tools' behaviour.
"""

import pytest

from video_toolkit.paths import workspace_root


def _brand_repo(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text("{}")
    (tmp_path / "projects" / "some-reel").mkdir(parents=True)
    (tmp_path / "toolkit").mkdir()
    monkeypatch.chdir(tmp_path / "projects" / "some-reel")
    return tmp_path


def test_workspace_resolves_from_inside_a_project(tmp_path, monkeypatch):
    """Tools get run from inside a project dir as often as from the root."""
    repo = _brand_repo(tmp_path, monkeypatch)

    assert workspace_root() == repo
    assert (workspace_root() / "projects" / "some-reel").exists()


def test_config_find_workspace_root_agrees_with_paths(tmp_path, monkeypatch):
    """Two disagreeing root-finders is what this change exists to end."""
    from video_toolkit.config import find_workspace_root

    repo = _brand_repo(tmp_path, monkeypatch)

    assert find_workspace_root() == workspace_root() == repo
