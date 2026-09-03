"""Nested media directories must survive a round trip through R2.

`list_local_files` used to call `d.iterdir()`, so only files sitting directly in
`public/broll` (etc.) were ever pushed, pulled or listed. Projects routinely
nest — `public/broll/variants/gemini/*.jpeg`, per-shoot-day folders — and those
files were backed up NOWHERE: git ignores them as binaries and the sync could
not see them. The gap was silent in both directions, which is what made it
expensive: a push reported success while leaving the nested files behind.
"""

from pathlib import Path

import pytest

from video_toolkit import sync_project


class FakePaginator:
    def __init__(self, objects: dict[str, bytes]):
        self.objects = objects

    def paginate(self, Bucket: str, Prefix: str):  # noqa: N803 - boto3's spelling
        yield {
            "Contents": [
                {"Key": key, "Size": len(body)}
                for key, body in sorted(self.objects.items())
                if key.startswith(Prefix)
            ]
        }


class FakeR2:
    """Just enough boto3 to drive cmd_push / cmd_pull."""

    def __init__(self, objects: dict[str, bytes] | None = None):
        self.objects = objects or {}
        self.uploads: list[tuple[str, str]] = []
        self.downloads: list[str] = []

    def get_paginator(self, _name: str):
        return FakePaginator(self.objects)

    def upload_file(self, src: str, _bucket: str, key: str):
        self.uploads.append((src, key))

    def download_file(self, _bucket: str, key: str, dest: str):
        self.downloads.append(key)
        Path(dest).write_bytes(self.objects[key])


PROJECT = "pp-nested"
BROLL = "public/broll"


@pytest.fixture
def project(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    proj = tmp_path / "projects" / PROJECT
    (proj / BROLL).mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    return proj


def _bind(monkeypatch, client: FakeR2) -> None:
    monkeypatch.setattr(sync_project, "get_r2_client", lambda: (client, {"bucket_name": "b"}))


# --- listing -----------------------------------------------------------------


def test_listing_finds_files_in_nested_directories(project):
    (project / BROLL / "top.mp4").write_bytes(b"x")
    (project / BROLL / "variants" / "gemini").mkdir(parents=True)
    (project / BROLL / "variants" / "gemini" / "waterpark.jpeg").write_bytes(b"yy")

    found = {rel for _, _, rel, _ in sync_project.list_local_files(project, [BROLL])}

    assert found == {"top.mp4", "variants/gemini/waterpark.jpeg"}


def test_listing_skips_dotfiles_at_any_depth(project):
    (project / BROLL / ".DS_Store").write_bytes(b"x")
    (project / BROLL / "variants").mkdir()
    (project / BROLL / "variants" / ".DS_Store").write_bytes(b"x")
    (project / BROLL / ".cache").mkdir()
    (project / BROLL / ".cache" / "thumb.jpg").write_bytes(b"x")
    (project / BROLL / "keep.mp4").write_bytes(b"x")

    found = {rel for _, _, rel, _ in sync_project.list_local_files(project, [BROLL])}

    assert found == {"keep.mp4"}


def test_listing_reports_the_relative_path_not_just_the_name(project):
    """Two files sharing a basename in different folders must stay distinct."""
    for sub in ("a", "b"):
        (project / BROLL / sub).mkdir()
        (project / BROLL / sub / "clip.mp4").write_bytes(b"x")

    found = {rel for _, _, rel, _ in sync_project.list_local_files(project, [BROLL])}

    assert found == {"a/clip.mp4", "b/clip.mp4"}


# --- push --------------------------------------------------------------------


def test_push_preserves_nesting_in_the_r2_key(project, monkeypatch):
    (project / BROLL / "variants" / "gemini").mkdir(parents=True)
    (project / BROLL / "variants" / "gemini" / "waterpark.jpeg").write_bytes(b"yy")
    client = FakeR2()
    _bind(monkeypatch, client)

    sync_project.cmd_push(PROJECT, [BROLL], dry_run=False, overwrite=False)

    assert [key for _, key in client.uploads] == [
        f"projects/{PROJECT}/{BROLL}/variants/gemini/waterpark.jpeg"
    ]


def test_push_skips_a_nested_file_already_in_r2_at_the_same_size(project, monkeypatch):
    (project / BROLL / "variants").mkdir()
    (project / BROLL / "variants" / "a.jpeg").write_bytes(b"yy")
    key = f"projects/{PROJECT}/{BROLL}/variants/a.jpeg"
    client = FakeR2({key: b"yy"})
    _bind(monkeypatch, client)

    sync_project.cmd_push(PROJECT, [BROLL], dry_run=False, overwrite=False)

    assert client.uploads == []


# --- pull --------------------------------------------------------------------


def test_pull_recreates_the_nested_layout(project, monkeypatch):
    key = f"projects/{PROJECT}/{BROLL}/variants/gemini/waterpark.jpeg"
    _bind(monkeypatch, FakeR2({key: b"yy"}))

    sync_project.cmd_pull(PROJECT, [BROLL], dry_run=False, overwrite=False)

    assert (project / BROLL / "variants" / "gemini" / "waterpark.jpeg").read_bytes() == b"yy"


def test_pull_does_not_flatten_two_files_sharing_a_basename(project, monkeypatch):
    """Flattening would have one silently overwrite the other."""
    prefix = f"projects/{PROJECT}/{BROLL}"
    _bind(monkeypatch, FakeR2({f"{prefix}/a/clip.mp4": b"1", f"{prefix}/b/clip.mp4": b"22"}))

    sync_project.cmd_pull(PROJECT, [BROLL], dry_run=False, overwrite=False)

    assert (project / BROLL / "a" / "clip.mp4").read_bytes() == b"1"
    assert (project / BROLL / "b" / "clip.mp4").read_bytes() == b"22"


# --- key helper --------------------------------------------------------------


def test_rel_key_strips_the_prefix_and_keeps_nesting():
    key = f"projects/{PROJECT}/{BROLL}/variants/gemini/a.jpeg"
    assert sync_project.rel_key(key, PROJECT, BROLL) == "variants/gemini/a.jpeg"


def test_rel_key_falls_back_to_the_basename_for_an_unexpected_key():
    """A stray object must not abort a pull, and must not escape the subdir."""
    assert sync_project.rel_key("something/else/a.jpeg", PROJECT, BROLL) == "a.jpeg"
