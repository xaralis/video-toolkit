import pytest

from video_toolkit.paths import NotFound, WorkspaceNotFound, find_brand, find_template, workspace_root


def test_workspace_root_finds_marker_in_start_dir(tmp_path):
    (tmp_path / "workspace.json").write_text("{}")
    assert workspace_root(tmp_path) == tmp_path


def test_workspace_root_walks_up_from_nested_dir(tmp_path):
    """Tools get invoked from inside a project, not just the workspace root."""
    (tmp_path / "workspace.json").write_text("{}")
    nested = tmp_path / "projects" / "my-project" / "src"
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


def _workspace(tmp_path, monkeypatch):
    """A brand repo: its own templates/brands, with the toolkit nested inside."""
    (tmp_path / "workspace.json").write_text("{}")
    (tmp_path / "templates" / "roost-reels").mkdir(parents=True)
    (tmp_path / "brands" / "roost").mkdir(parents=True)
    toolkit = tmp_path / "toolkit"
    (toolkit / "templates" / "campaign-reels").mkdir(parents=True)
    (toolkit / "brands" / "default").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    return tmp_path, toolkit


def test_find_template_prefers_the_workspace(tmp_path, monkeypatch):
    """A brand's own template must win — it is the nearer one."""
    ws, _ = _workspace(tmp_path, monkeypatch)
    monkeypatch.setattr("video_toolkit.paths.toolkit_root", lambda: ws / "toolkit")

    assert find_template("roost-reels") == ws / "templates" / "roost-reels"


def test_find_template_falls_back_to_the_toolkit(tmp_path, monkeypatch):
    """Core's templates must stay reachable from a brand repo."""
    ws, toolkit = _workspace(tmp_path, monkeypatch)
    monkeypatch.setattr("video_toolkit.paths.toolkit_root", lambda: toolkit)

    assert find_template("campaign-reels") == toolkit / "templates" / "campaign-reels"


def test_find_brand_prefers_the_workspace(tmp_path, monkeypatch):
    ws, toolkit = _workspace(tmp_path, monkeypatch)
    monkeypatch.setattr("video_toolkit.paths.toolkit_root", lambda: toolkit)

    assert find_brand("roost") == ws / "brands" / "roost"


def test_find_brand_falls_back_to_the_toolkit(tmp_path, monkeypatch):
    ws, toolkit = _workspace(tmp_path, monkeypatch)
    monkeypatch.setattr("video_toolkit.paths.toolkit_root", lambda: toolkit)

    assert find_brand("default") == toolkit / "brands" / "default"


def test_find_template_raises_when_nowhere(tmp_path, monkeypatch):
    ws, toolkit = _workspace(tmp_path, monkeypatch)
    monkeypatch.setattr("video_toolkit.paths.toolkit_root", lambda: toolkit)

    with pytest.raises(NotFound) as e:
        find_template("does-not-exist")
    # the message must name both places it looked, or the next person debugs blind
    assert "does-not-exist" in str(e.value)
