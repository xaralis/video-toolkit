"""Purging local media is irreversible — a file may only go once R2 provably holds it.

Covers the S3-style ETag check (single-part MD5 and multipart md5-of-md5s), every
reason a file must be KEPT (missing, size mismatch, checksum mismatch, tracked by
git), phase-based project selection, and that a dry run deletes nothing.
"""

import hashlib
import json
import subprocess
from pathlib import Path

import pytest

from video_toolkit import purge_project, sync_project

MiB = 1024 * 1024
BROLL = "public/broll"


def md5(b: bytes) -> str:
    return hashlib.md5(b).hexdigest()


def multipart_etag(b: bytes, part: int) -> str:
    digests = b"".join(hashlib.md5(b[i:i + part]).digest() for i in range(0, len(b), part))
    return f"{hashlib.md5(digests).hexdigest()}-{-(-len(b) // part)}"


class FakePaginator:
    def __init__(self, objects):
        self.objects = objects

    def paginate(self, Bucket, Prefix):  # noqa: N803 - boto3's spelling
        yield {"Contents": [
            {"Key": k, "Size": o["size"], "ETag": f'"{o["etag"]}"'}
            for k, o in sorted(self.objects.items()) if k.startswith(Prefix)
        ]}


class FakeR2:
    def __init__(self, objects=None):
        self.objects = objects or {}

    def get_paginator(self, _name):
        return FakePaginator(self.objects)


def obj(body: bytes, etag: str | None = None) -> dict:
    return {"size": len(body), "etag": etag or md5(body)}


@pytest.fixture
def workspace(tmp_path, monkeypatch):
    (tmp_path / "workspace.json").write_text('{"kind": "brand"}')
    monkeypatch.chdir(tmp_path)
    return tmp_path


def make_project(ws: Path, name: str, phase: str = "complete") -> Path:
    proj = ws / "projects" / name
    (proj / BROLL).mkdir(parents=True)
    (proj / "project.json").write_text(json.dumps({"name": name, "phase": phase}))
    return proj


def bind(monkeypatch, client):
    monkeypatch.setattr(sync_project, "get_r2_client", lambda: (client, {"bucket_name": "b"}))


def key(name, rel):
    return f"projects/{name}/{BROLL}/{rel}"


# --- checksum ----------------------------------------------------------------


def test_etag_matches_single_part_md5(tmp_path):
    f = tmp_path / "a.bin"
    f.write_bytes(b"hello")
    assert purge_project.etag_matches(f, md5(b"hello"))
    assert not purge_project.etag_matches(f, md5(b"other"))


@pytest.mark.parametrize("part", [5 * MiB, 8 * MiB])
def test_etag_matches_multipart_upload_at_common_part_sizes(tmp_path, part):
    body = bytes(range(256)) * (20 * MiB // 256 + 7)
    f = tmp_path / "big.bin"
    f.write_bytes(body)
    assert purge_project.etag_matches(f, multipart_etag(body, part))


def test_etag_rejects_multipart_with_corrupted_content(tmp_path):
    body = b"a" * (17 * MiB)
    f = tmp_path / "big.bin"
    f.write_bytes(b"b" + body[1:])
    assert not purge_project.etag_matches(f, multipart_etag(body, 8 * MiB))


# --- per-file decisions --------------------------------------------------------


def test_plan_deletes_only_files_verified_on_r2(workspace, monkeypatch):
    proj = make_project(workspace, "pp-a")
    (proj / BROLL / "ok.mp4").write_bytes(b"same")
    (proj / BROLL / "missing.mp4").write_bytes(b"local-only")
    (proj / BROLL / "resized.mp4").write_bytes(b"12345")
    (proj / BROLL / "corrupt.mp4").write_bytes(b"abcd")
    bind(monkeypatch, FakeR2({
        key("pp-a", "ok.mp4"): obj(b"same"),
        key("pp-a", "resized.mp4"): obj(b"123"),
        key("pp-a", "corrupt.mp4"): obj(b"abcd", etag=md5(b"wxyz")),
    }))

    plan = purge_project.plan_project("pp-a")

    assert [e.rel for e in plan.delete] == ["ok.mp4"]
    assert {e.rel: e.reason for e in plan.keep} == {
        "corrupt.mp4": "checksum mismatch",
        "missing.mp4": "not on R2",
        "resized.mp4": "size mismatch",
    }


def test_plan_keeps_git_tracked_files(workspace, monkeypatch):
    proj = make_project(workspace, "pp-a")
    (proj / BROLL / "tracked.mp4").write_bytes(b"x")
    (proj / BROLL / "ignored.mp4").write_bytes(b"y")
    subprocess.run(["git", "init", "-q"], cwd=workspace, check=True)
    subprocess.run(["git", "add", "projects/pp-a/public/broll/tracked.mp4"], cwd=workspace, check=True)
    bind(monkeypatch, FakeR2({key("pp-a", "tracked.mp4"): obj(b"x"), key("pp-a", "ignored.mp4"): obj(b"y")}))

    plan = purge_project.plan_project("pp-a")

    assert [e.rel for e in plan.delete] == ["ignored.mp4"]
    assert plan.skipped_tracked == 1


def test_plan_refuses_without_r2(workspace, monkeypatch):
    make_project(workspace, "pp-a")
    monkeypatch.setattr(sync_project, "get_r2_client", lambda: (None, None))
    with pytest.raises(SystemExit):
        purge_project.plan_project("pp-a")


# --- project selection ---------------------------------------------------------


def test_default_selection_is_complete_projects_only(workspace):
    make_project(workspace, "pp-done", phase="complete")
    make_project(workspace, "pp-wip", phase="editing")
    (workspace / "projects" / "no-json").mkdir()

    assert purge_project.select_projects(None) == ["pp-done"]


def test_explicit_project_is_selected_regardless_of_phase(workspace):
    make_project(workspace, "pp-wip", phase="editing")
    assert purge_project.select_projects("pp-wip") == ["pp-wip"]


# --- execution -------------------------------------------------------------------


def test_dry_run_deletes_nothing_and_confirmed_run_deletes_verified(workspace, monkeypatch):
    proj = make_project(workspace, "pp-a")
    (proj / BROLL / "ok.mp4").write_bytes(b"same")
    (proj / BROLL / "missing.mp4").write_bytes(b"local-only")
    bind(monkeypatch, FakeR2({key("pp-a", "ok.mp4"): obj(b"same")}))

    assert purge_project.cmd_purge(None, confirm=False) == 0
    assert (proj / BROLL / "ok.mp4").exists()

    assert purge_project.cmd_purge(None, confirm=True) == 0
    assert not (proj / BROLL / "ok.mp4").exists()
    assert (proj / BROLL / "missing.mp4").exists()
