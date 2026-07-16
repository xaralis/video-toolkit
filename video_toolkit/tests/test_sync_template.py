import json

from video_toolkit.sync_template import PROJECT_OWNED, resolve_template, sync_template


def _make_template(root):
    """A miniature template src: shared code + the two files a project owns."""
    src = root / "templates" / "demo" / "src"
    (src / "config").mkdir(parents=True)
    (src / "overlays").mkdir(parents=True)
    (src / "Comp.tsx").write_text("template v2\n")
    (src / "overlays" / "Watermark.tsx").write_text("watermark v2\n")
    (src / "config" / "schema.ts").write_text("schema v2\n")
    # the template ships its own demo cut — these must never reach a project
    (src / "Root.tsx").write_text("TEMPLATE demo cut\n")
    (src / "config" / "demo.config.json").write_text('{"demo": true}\n')
    return src


def _make_project(root):
    dst = root / "projects" / "p1" / "src"
    (dst / "config").mkdir(parents=True)
    # the project's OWN content — the whole point is that this survives
    (dst / "Root.tsx").write_text("PROJECT real cut\n")
    (dst / "config" / "demo.config.json").write_text('{"project": true}\n')
    return dst


def test_project_owned_files_are_never_overwritten(tmp_path):
    """The tool exists because hand-rsync destroys the project's cut. It must not."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)

    report = sync_template(src, dst)

    # untouched, even though the template ships different content at the same paths
    assert (dst / "Root.tsx").read_text() == "PROJECT real cut\n"
    assert json.loads((dst / "config" / "demo.config.json").read_text()) == {"project": True}
    assert sorted(report["preserved"]) == sorted(PROJECT_OWNED)


def test_shared_code_is_copied_and_updated(tmp_path):
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    # a vendored file that has drifted behind the template
    (dst / "Comp.tsx").write_text("template v1\n")

    report = sync_template(src, dst)

    assert (dst / "Comp.tsx").read_text() == "template v2\n"           # drift pulled forward
    assert (dst / "overlays" / "Watermark.tsx").read_text() == "watermark v2\n"  # new subdir file
    assert report["updated"] == ["Comp.tsx"]
    assert "overlays/Watermark.tsx" in report["copied"]
    assert "config/schema.ts" in report["copied"]


def test_identical_files_are_skipped_not_rewritten(tmp_path):
    """Idempotent: a second run reports everything unchanged."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)

    sync_template(src, dst)
    report = sync_template(src, dst)

    assert report["copied"] == [] and report["updated"] == []
    assert sorted(report["skipped"]) == ["Comp.tsx", "config/schema.ts", "overlays/Watermark.tsx"]


def test_dry_run_writes_nothing(tmp_path):
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)

    report = sync_template(src, dst, dry_run=True)

    assert not (dst / "Comp.tsx").exists()
    assert report["copied"]  # but it still reports what it would do


def test_strict_removes_extra_files_but_spares_project_owned(tmp_path):
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    (dst / "Stale.tsx").write_text("removed from template\n")

    report = sync_template(src, dst, strict=True)

    assert not (dst / "Stale.tsx").exists()
    assert report["removed"] == ["Stale.tsx"]
    # --strict must not take the project's own files with it
    assert (dst / "Root.tsx").read_text() == "PROJECT real cut\n"


def test_resolve_template_prefers_override_then_project_json(tmp_path):
    proj = tmp_path / "projects" / "p1"
    proj.mkdir(parents=True)

    assert resolve_template(proj, "explicit") == "explicit"      # override wins
    assert resolve_template(proj, None) is None                  # no project.json -> unknown

    (proj / "project.json").write_text(json.dumps({"template": "campaign-reels"}))
    assert resolve_template(proj, None) == "campaign-reels"
    assert resolve_template(proj, "explicit") == "explicit"
