import pytest

from video_toolkit.paths import WorkspaceNotFound, workspace_root


def test_workspace_root_finds_marker_in_start_dir(tmp_path):
    (tmp_path / "workspace.json").write_text("{}")
    assert workspace_root(tmp_path) == tmp_path


def test_workspace_root_walks_up_from_nested_dir(tmp_path):
    """Tools get invoked from inside a project, not just the workspace root."""
    (tmp_path / "workspace.json").write_text("{}")
    nested = tmp_path / "projects" / "roost-reel-01" / "src"
    nested.mkdir(parents=True)

    assert workspace_root(nested) == tmp_path


def test_workspace_root_raises_when_no_marker(tmp_path):
    with pytest.raises(WorkspaceNotFound):
        workspace_root(tmp_path)


def test_workspace_root_stops_at_nearest_marker(tmp_path):
    """A brand repo nests toolkit/ inside itself; the inner marker must win."""
    (tmp_path / "workspace.json").write_text("{}")
    inner = tmp_path / "toolkit"
    inner.mkdir()
    (inner / "workspace.json").write_text("{}")

    assert workspace_root(inner) == inner
