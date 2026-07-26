import json

import pytest

from video_toolkit.sync_template import (
    PROJECT_OWNED,
    check_identity_preserved,
    merge_package_json,
    resolve_template,
    sync_extras,
    sync_template,
)


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


# --- the vendored surface beyond src/ ------------------------------------------------------------
#
# Phase 2.5: 8 of 11 PP project editors could not start because .editor/ and the editor
# devDependencies were never carried. src/ alone is not the vendored surface.

TEMPLATE_PKG = {
    "name": "demo-template",
    "version": "1.0.0",
    "scripts": {
        "studio": "npx remotion studio",
        "test": "vitest run",
        "editor": "vite --config .editor/vite.config.mts --port 3100",
    },
    "dependencies": {"remotion": "4.0.425", "react": "^18.2.0"},
    "devDependencies": {"vite": "^5.4.21", "@vitejs/plugin-react": "^4.7.0", "typescript": "^5.0.0"},
}


def _make_template_dir(root):
    """The whole template dir, not just src: .editor/, the build config, package.json."""
    tpl = root / "templates" / "demo"
    _make_template(root)  # creates tpl/src
    (tpl / ".editor").mkdir(parents=True)
    (tpl / ".editor" / "index.html").write_text("<div id=root></div>\n")
    (tpl / ".editor" / "main.tsx").write_text("editor main v2\n")
    (tpl / ".editor" / "vite.config.mts").write_text("vite config v2\n")
    (tpl / "remotion.config.ts").write_text("remotion config v2\n")
    (tpl / "vitest.config.ts").write_text("vitest config v2\n")
    (tpl / "tsconfig.json").write_text('{"compilerOptions": {"strict": true}}\n')
    (tpl / "package.json").write_text(json.dumps(TEMPLATE_PKG, indent=2) + "\n")
    return tpl


def _make_project_dir(root, pkg=None, name="p1"):
    proj = root / "projects" / name
    _make_project(root) if name == "p1" else (proj / "src").mkdir(parents=True)
    if pkg is not None:
        (proj / "package.json").write_text(json.dumps(pkg, indent=2) + "\n")
    return proj


def test_editor_and_build_config_are_carried(tmp_path):
    """The regression that broke 8 of 11 project editors: .editor/ never reached the project."""
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)

    report = sync_extras(tpl, proj)

    assert (proj / ".editor" / "vite.config.mts").read_text() == "vite config v2\n"
    assert (proj / ".editor" / "main.tsx").read_text() == "editor main v2\n"
    assert (proj / ".editor" / "index.html").exists()
    assert (proj / "remotion.config.ts").read_text() == "remotion config v2\n"
    assert (proj / "vitest.config.ts").read_text() == "vitest config v2\n"
    assert (proj / "tsconfig.json").exists()
    assert set(report["copied"]) == {
        ".editor/index.html",
        ".editor/main.tsx",
        ".editor/vite.config.mts",
        "remotion.config.ts",
        "vitest.config.ts",
        "tsconfig.json",
    }


def test_editor_drift_is_pulled_forward_and_idempotent(tmp_path):
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    (proj / ".editor").mkdir()
    (proj / ".editor" / "main.tsx").write_text("editor main v1\n")  # drifted behind

    report = sync_extras(tpl, proj)
    assert report["updated"] == [".editor/main.tsx"]
    assert (proj / ".editor" / "main.tsx").read_text() == "editor main v2\n"

    again = sync_extras(tpl, proj)
    assert again["copied"] == [] and again["updated"] == []
    assert len(again["skipped"]) == 6


def test_project_owns_nothing_inside_the_editor_tree(tmp_path):
    """PROJECT_OWNED is src-relative. A `Root.tsx` under .editor/ is the editor's, not the cut —
    it must be carried, not silently preserved."""
    tpl = _make_template_dir(tmp_path)
    (tpl / ".editor" / "Root.tsx").write_text("editor root v2\n")
    proj = _make_project_dir(tmp_path)

    report = sync_extras(tpl, proj)

    assert (proj / ".editor" / "Root.tsx").read_text() == "editor root v2\n"
    assert report["preserved"] == []
    assert ".editor/Root.tsx" in report["copied"]


def test_extras_dry_run_writes_nothing_but_reports(tmp_path):
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)

    report = sync_extras(tpl, proj, dry_run=True)

    # not even an empty directory — a dry run against a real project must leave no trace at all
    assert not (proj / ".editor").exists()
    assert not (proj / "remotion.config.ts").exists()
    assert ".editor/main.tsx" in report["copied"]
    assert "remotion.config.ts" in report["copied"]


def test_extras_tolerate_a_template_without_them(tmp_path):
    """A template that ships no .editor/ or build config yields an empty report, not a crash."""
    _make_template(tmp_path)  # src only
    tpl = tmp_path / "templates" / "demo"
    proj = _make_project_dir(tmp_path)

    report = sync_extras(tpl, proj)

    assert all(v == [] for v in report.values())


def test_extras_strict_prunes_only_the_mirrored_dir(tmp_path):
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    (proj / ".editor").mkdir()
    (proj / ".editor" / "stale.tsx").write_text("gone from template\n")
    (proj / "CLAUDE.md").write_text("project docs\n")

    report = sync_extras(tpl, proj, strict=True)

    assert report["removed"] == [".editor/stale.tsx"]
    assert (proj / "CLAUDE.md").exists()  # --strict must not reach outside the mirrored dirs


# --- package.json: merged, NEVER overwritten -----------------------------------------------------


def test_package_json_merge_keeps_project_identity_and_takes_the_toolchain(tmp_path):
    """Overwriting package.json would rename every project. Merge instead."""
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(
        tmp_path,
        pkg={
            "name": "pp-program-klima-reel",
            "version": "0.3.0",
            "scripts": {
                "studio": "npx remotion studio",
                "test": "node node_modules/vitest/dist/cli.js run",  # the project's own tuning
            },
            "dependencies": {"remotion": "4.0.425", "react": "^18.2.0"},
            "devDependencies": {"typescript": "^4.9.0", "prettier": "^3.0.0"},
        },
    )

    report = merge_package_json(tpl, proj)
    merged = json.loads((proj / "package.json").read_text())

    # identity survives
    assert merged["name"] == "pp-program-klima-reel"
    assert merged["version"] == "0.3.0"
    assert not any("name" in e for e in report["added"] + report["updated"])

    # the missing editor devDependencies — the actual Phase 2.5 failure — are added
    assert merged["devDependencies"]["vite"] == "^5.4.21"
    assert merged["devDependencies"]["@vitejs/plugin-react"] == "^4.7.0"
    assert "devDependencies.vite@^5.4.21" in report["added"]

    # a version the project pinned differently resolves to the TEMPLATE's, and is reported
    assert merged["devDependencies"]["typescript"] == "^5.0.0"
    assert "devDependencies.typescript: ^4.9.0 -> ^5.0.0" in report["updated"]

    # a dependency only the project has is left alone
    assert merged["devDependencies"]["prettier"] == "^3.0.0"

    # the `editor` script the project lacks is added; the tuned `test` script is KEPT
    assert merged["scripts"]["editor"] == "vite --config .editor/vite.config.mts --port 3100"
    assert "scripts.editor" in report["added"]
    assert merged["scripts"]["test"] == "node node_modules/vitest/dist/cli.js run"
    assert any(e.startswith("scripts.test") for e in report["kept"])


def test_package_json_merge_is_idempotent_and_dry_run_writes_nothing(tmp_path):
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path, pkg={"name": "p1", "version": "1.0.0"})

    before = (proj / "package.json").read_text()
    dry = merge_package_json(tpl, proj, dry_run=True)
    assert (proj / "package.json").read_text() == before  # untouched
    assert dry["added"]  # but reported

    merge_package_json(tpl, proj)
    again = merge_package_json(tpl, proj)
    assert again["added"] == [] and again["updated"] == []
    assert json.loads((proj / "package.json").read_text())["name"] == "p1"


def test_project_without_package_json_gets_one_named_after_its_directory(tmp_path):
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    assert not (proj / "package.json").exists()

    report = merge_package_json(tpl, proj)

    created = json.loads((proj / "package.json").read_text())
    assert created["name"] == "p1"  # NOT "demo-template"
    assert created["devDependencies"] == TEMPLATE_PKG["devDependencies"]
    assert report["created"] == ["package.json  (name=p1)"]


def test_identity_guard_rails_reject_a_rename(tmp_path):
    """The guard the merge runs before writing: if a future edit ever touches `name`, it must
    raise rather than silently rename a project."""
    before = {"name": "pp-program-klima-reel", "version": "0.3.0"}

    check_identity_preserved(before, dict(before, scripts={"editor": "vite"}))  # merging is fine

    with pytest.raises(RuntimeError, match="`name` would change"):
        check_identity_preserved(before, dict(before, name="demo-template"))
    with pytest.raises(RuntimeError, match="`version` would change"):
        check_identity_preserved(before, dict(before, version="1.0.0"))


def test_template_without_package_json_is_a_no_op(tmp_path):
    _make_template(tmp_path)
    tpl = tmp_path / "templates" / "demo"
    proj = _make_project_dir(tmp_path)

    report = merge_package_json(tpl, proj)

    assert all(v == [] for v in report.values())
    assert not (proj / "package.json").exists()
