"""The tools must find the brand repo's .env when vendored as a submodule.

`Path(__file__).parent.parent / ".env"` resolves to `<brand-repo>/toolkit/.env`,
which never exists — per-repo configuration installs only into the brand repo.
The real file sits one level higher, at `<brand-repo>/.env`, so resolution has
to walk UP rather than assume a fixed depth.
"""

import pytest

from video_toolkit.paths import env_file_for_write, find_env_file


def _brand_repo(tmp_path):
    """A brand repo with the toolkit vendored one level down and no toolkit/.env."""
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    (tmp_path / ".env").write_text("MODAL_WHISPER_ENDPOINT_URL=https://brand\n")
    pkg = tmp_path / "toolkit" / "video_toolkit"
    pkg.mkdir(parents=True)
    return tmp_path, pkg


def test_finds_the_brand_repo_env_from_a_vendored_toolkit(tmp_path, monkeypatch):
    repo, pkg = _brand_repo(tmp_path)
    monkeypatch.chdir(pkg)  # no workspace.json below the brand repo root

    assert find_env_file(start=pkg) == repo / ".env"


def test_finds_a_standalone_checkouts_own_env(tmp_path, monkeypatch):
    """A bare core checkout keeps its .env beside the package, not above it."""
    (tmp_path / ".env").write_text("X=1\n")
    pkg = tmp_path / "video_toolkit"
    pkg.mkdir()
    monkeypatch.chdir(pkg)

    assert find_env_file(start=pkg) == tmp_path / ".env"


def test_a_stale_env_in_the_submodule_never_shadows_the_brand_repo(tmp_path, monkeypatch):
    """The workspace is where setup writes; a leftover in toolkit/ is not config."""
    repo, pkg = _brand_repo(tmp_path)
    (pkg.parent / ".env").write_text("MODAL_WHISPER_ENDPOINT_URL=https://stale\n")
    monkeypatch.chdir(pkg)

    assert find_env_file(start=pkg) == repo / ".env"


def test_uses_the_workspace_env_when_the_package_lives_outside_the_repo(tmp_path, monkeypatch):
    """A non-editable install puts the package where walking up finds nothing."""
    repo = tmp_path / "brand-repo"
    repo.mkdir()
    (repo / "workspace.json").write_text('{"kind": "brand"}')
    (repo / ".env").write_text("R2_BUCKET_NAME=b\n")
    elsewhere = tmp_path / "site-packages" / "video_toolkit"
    elsewhere.mkdir(parents=True)
    monkeypatch.chdir(repo)

    assert find_env_file(start=elsewhere) == repo / ".env"


def test_returns_none_when_there_is_no_env_anywhere(tmp_path, monkeypatch):
    pkg = tmp_path / "video_toolkit"
    pkg.mkdir()
    monkeypatch.chdir(pkg)

    assert find_env_file(start=pkg) is None


def test_write_target_is_the_existing_env(tmp_path, monkeypatch):
    """Saving an endpoint must land in the file the readers will read."""
    repo, pkg = _brand_repo(tmp_path)
    monkeypatch.chdir(pkg)

    assert env_file_for_write(start=pkg) == repo / ".env"


def test_write_target_falls_back_to_the_workspace_root(tmp_path, monkeypatch):
    """With no .env yet, setup must create it in the brand repo, not the toolkit."""
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    pkg = tmp_path / "toolkit" / "video_toolkit"
    pkg.mkdir(parents=True)
    monkeypatch.chdir(tmp_path)

    assert env_file_for_write(start=pkg) == tmp_path / ".env"
