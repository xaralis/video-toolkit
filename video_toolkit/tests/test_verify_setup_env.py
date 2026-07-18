"""verify_setup must read .env from the brand-repo (workspace) root, not CWD.

Setup runs commands from various dirs (e.g. cd into the toolkit for deploys), so
verification has to resolve .env the same way config.py does — via workspace_root().
"""
import os


def test_load_workspace_env_reads_env_from_workspace_root(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    (tmp_path / ".env").write_text("VTK_SENTINEL=hello-brand\n")
    sub = tmp_path / "projects" / "reel"
    sub.mkdir(parents=True)
    monkeypatch.chdir(sub)  # run from a subdir, not the workspace root
    monkeypatch.delenv("VTK_SENTINEL", raising=False)

    from video_toolkit.verify_setup import _load_workspace_env
    _load_workspace_env()

    assert os.environ.get("VTK_SENTINEL") == "hello-brand"


def test_load_workspace_env_tolerates_no_workspace(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)  # no workspace.json anywhere above
    # Must not raise even though there is no workspace.
    from video_toolkit.verify_setup import _load_workspace_env
    _load_workspace_env()
