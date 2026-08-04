"""A pull must not dirty the working tree with whitespace-only rewrites.

Transcript JSON is git-tracked; the R2 copies of it differ from what the repo
committed only in formatting. The size-based skip cannot see that, so pulling
pp-u-kamenne-vily rewrote all ten transcripts — 1152 insertions / 1152
deletions, `git diff -w` empty, every file parsing to exactly the same data.
"""

import json

import pytest

from video_toolkit import sync_project


class FakePaginator:
    def __init__(self, objects: dict[str, bytes]):
        self.objects = objects

    def paginate(self, Bucket: str, Prefix: str):  # noqa: N803 - boto3's spelling
        contents = [
            {"Key": key, "Size": len(body)}
            for key, body in sorted(self.objects.items())
            if key.startswith(Prefix)
        ]
        yield {"Contents": contents}


class FakeR2:
    """Just enough boto3 to drive cmd_pull; records what it was asked for."""

    def __init__(self, objects: dict[str, bytes]):
        self.objects = objects
        self.downloads: list[str] = []

    def get_paginator(self, _name: str):
        return FakePaginator(self.objects)

    def download_file(self, _bucket: str, key: str, dest: str):
        self.downloads.append(key)
        from pathlib import Path

        Path(dest).write_bytes(self.objects[key])


TRANSCRIPT = {"segments": [{"words": [{"start": 0.0, "end": 0.5, "word": "ahoj"}]}]}


@pytest.fixture
def project(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    proj = tmp_path / "projects" / "pp-u-kamenne-vily"
    (proj / "public" / "recordings").mkdir(parents=True)
    monkeypatch.chdir(tmp_path)
    return proj


def _pull(monkeypatch, objects: dict[str, bytes]) -> FakeR2:
    client = FakeR2(objects)
    monkeypatch.setattr(sync_project, "get_r2_client", lambda: (client, {"bucket_name": "b"}))
    sync_project.cmd_pull(
        "pp-u-kamenne-vily", ["public/recordings"], dry_run=False, overwrite=False
    )
    return client


def test_pull_leaves_a_reformatted_transcript_untouched(project, monkeypatch):
    """Same data, different indentation — the file on disk must not change."""
    local = project / "public" / "recordings" / "a.mp4.transcript.json"
    committed = json.dumps(TRANSCRIPT, indent=2, ensure_ascii=False) + "\n"
    local.write_text(committed)
    remote = json.dumps(TRANSCRIPT, separators=(",", ":")).encode()
    assert len(remote) != len(committed.encode())  # the size skip cannot save us

    _pull(monkeypatch, {"projects/pp-u-kamenne-vily/public/recordings/a.mp4.transcript.json": remote})

    assert local.read_text() == committed


def test_pull_still_takes_a_transcript_whose_content_changed(project, monkeypatch):
    """Skipping on formatting must not turn into skipping on content."""
    local = project / "public" / "recordings" / "a.mp4.transcript.json"
    local.write_text(json.dumps(TRANSCRIPT, indent=2))
    corrected = dict(TRANSCRIPT)
    corrected["segments"] = [{"words": [{"start": 0.0, "end": 0.5, "word": "dobry den"}]}]
    remote = json.dumps(corrected, indent=2).encode()

    _pull(monkeypatch, {"projects/pp-u-kamenne-vily/public/recordings/a.mp4.transcript.json": remote})

    assert json.loads(local.read_text()) == corrected


def test_pull_leaves_no_temporary_file_behind(project, monkeypatch):
    local = project / "public" / "recordings" / "a.mp4.transcript.json"
    local.write_text(json.dumps(TRANSCRIPT, indent=2))
    remote = json.dumps(TRANSCRIPT, separators=(",", ":")).encode()

    _pull(monkeypatch, {"projects/pp-u-kamenne-vily/public/recordings/a.mp4.transcript.json": remote})

    assert sorted(p.name for p in (project / "public" / "recordings").iterdir()) == [
        "a.mp4.transcript.json"
    ]


def test_pull_of_a_size_matched_file_does_not_download_at_all(project, monkeypatch):
    """The cheap size skip stays the first gate — no fetch just to compare."""
    local = project / "public" / "recordings" / "a.mp4.transcript.json"
    body = json.dumps(TRANSCRIPT, indent=2)
    local.write_text(body)

    client = _pull(
        monkeypatch,
        {"projects/pp-u-kamenne-vily/public/recordings/a.mp4.transcript.json": body.encode()},
    )

    assert client.downloads == []


def test_pull_replaces_media_whose_size_differs(project, monkeypatch):
    """Only JSON gets the semantic compare; footage still goes by size."""
    local = project / "public" / "recordings" / "a.mp4"
    local.write_bytes(b"old")

    _pull(monkeypatch, {"projects/pp-u-kamenne-vily/public/recordings/a.mp4": b"newer bytes"})

    assert local.read_bytes() == b"newer bytes"


def test_pull_takes_the_remote_when_the_local_json_is_corrupt(project, monkeypatch):
    """Unparseable on disk is not 'equivalent' — the remote must win."""
    local = project / "public" / "recordings" / "a.mp4.transcript.json"
    local.write_text("{ truncated")
    remote = json.dumps(TRANSCRIPT).encode()

    _pull(monkeypatch, {"projects/pp-u-kamenne-vily/public/recordings/a.mp4.transcript.json": remote})

    assert json.loads(local.read_text()) == TRANSCRIPT
