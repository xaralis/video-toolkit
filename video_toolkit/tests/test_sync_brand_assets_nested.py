"""Brand assets nested in subdirectories must reach the project.

`sync_brand_assets` mirrored `brands/<brand>/assets/` into a project's
`public/brand/` with `src.iterdir()`, so only top-level files were ever copied.
A brand that organises its assets — `assets/logos/parties/*.svg`,
`assets/components/` — silently delivered none of them, and the failure was
invisible: the tool reported "N unchanged" and exited 0.

The workaround people reached for was copying the files into each project by
hand, which is exactly what drifts across 19 projects.
"""

import json

import pytest

from video_toolkit import sync_brand_assets


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')

    assets = tmp_path / "brands" / "acme" / "assets"
    assets.mkdir(parents=True)
    (assets / "watermark.png").write_bytes(b"top-level")
    (assets / "logos" / "parties").mkdir(parents=True)
    (assets / "logos" / "parties" / "alpha.svg").write_bytes(b"<svg/>")
    (assets / "logos" / "beta.svg").write_bytes(b"<svg/>")
    (assets / "components").mkdir()
    (assets / "components" / "Mark.tsx").write_text("export const Mark = () => null;")

    proj = tmp_path / "projects" / "demo"
    proj.mkdir(parents=True)
    (proj / "project.json").write_text(json.dumps({"brand": "acme"}))

    monkeypatch.chdir(tmp_path)
    return tmp_path


def _run(monkeypatch, *argv: str) -> int:
    monkeypatch.setattr("sys.argv", ["sync_brand_assets", *argv])
    return sync_brand_assets.main()


def test_nested_assets_are_copied(workspace, monkeypatch):
    assert _run(monkeypatch, "demo") == 0

    brand = workspace / "projects" / "demo" / "public" / "brand"
    assert (brand / "watermark.png").read_bytes() == b"top-level"
    assert (brand / "logos" / "beta.svg").read_bytes() == b"<svg/>"
    assert (brand / "logos" / "parties" / "alpha.svg").read_bytes() == b"<svg/>"


def test_dry_run_copies_nothing(workspace, monkeypatch):
    assert _run(monkeypatch, "demo", "--dry-run") == 0

    brand = workspace / "projects" / "demo" / "public" / "brand"
    assert not (brand / "logos").exists()


def test_a_changed_nested_asset_is_updated(workspace, monkeypatch):
    _run(monkeypatch, "demo")
    src = workspace / "brands" / "acme" / "assets" / "logos" / "parties" / "alpha.svg"
    src.write_bytes(b"<svg viewBox=/>")  # different size

    _run(monkeypatch, "demo")

    dst = workspace / "projects" / "demo" / "public" / "brand" / "logos" / "parties" / "alpha.svg"
    assert dst.read_bytes() == b"<svg viewBox=/>"


def test_strict_removes_a_nested_file_the_brand_no_longer_has(workspace, monkeypatch):
    _run(monkeypatch, "demo")
    (workspace / "brands" / "acme" / "assets" / "logos" / "beta.svg").unlink()

    _run(monkeypatch, "demo", "--strict")

    brand = workspace / "projects" / "demo" / "public" / "brand"
    assert not (brand / "logos" / "beta.svg").exists()
    # Siblings survive — strict prunes what the brand dropped, nothing else.
    assert (brand / "logos" / "parties" / "alpha.svg").exists()
    assert (brand / "watermark.png").exists()


def test_strict_leaves_a_file_the_brand_still_has(workspace, monkeypatch):
    _run(monkeypatch, "demo")

    _run(monkeypatch, "demo", "--strict")

    brand = workspace / "projects" / "demo" / "public" / "brand"
    assert (brand / "logos" / "parties" / "alpha.svg").exists()


def test_source_files_are_not_mirrored(workspace, monkeypatch):
    """public/brand/ is web-served — shipping .tsx into it serves no one."""
    assert _run(monkeypatch, "demo") == 0

    brand = workspace / "projects" / "demo" / "public" / "brand"
    assert not (brand / "components" / "Mark.tsx").exists()
    assert not (brand / "components").exists()
