import hashlib
import json

import pytest

from video_toolkit.sync_template import (
    MANIFEST_NAME,
    PROJECT_OWNED,
    check_identity_preserved,
    load_vendored,
    merge_package_json,
    resolve_template,
    save_vendored,
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


def _sha(text: str) -> str:
    """The hash the manifest would carry for this content."""
    return hashlib.sha256(text.encode()).hexdigest()


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
    """Drift is pulled forward — but only for a file the tool can PROVE it vendored."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    # a vendored file that has drifted behind the template, with the provenance to say so
    (dst / "Comp.tsx").write_text("template v1\n")
    vendored = {"Comp.tsx": _sha("template v1\n")}

    report = sync_template(src, dst, vendored=vendored)

    assert (dst / "Comp.tsx").read_text() == "template v2\n"           # drift pulled forward
    assert (dst / "overlays" / "Watermark.tsx").read_text() == "watermark v2\n"  # new subdir file
    assert report["updated"] == ["Comp.tsx"]
    assert "overlays/Watermark.tsx" in report["copied"]
    assert "config/schema.ts" in report["copied"]
    assert vendored["Comp.tsx"] == _sha("template v2\n")  # manifest advanced to what we wrote


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
    """--strict prunes what the TOOL placed and the template has since dropped."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    (dst / "Stale.tsx").write_text("removed from template\n")
    vendored = {"Stale.tsx": _sha("removed from template\n")}  # we put it there

    report = sync_template(src, dst, strict=True, vendored=vendored)

    assert not (dst / "Stale.tsx").exists()
    assert report["removed"] == ["Stale.tsx"]
    assert "Stale.tsx" not in vendored  # and the manifest forgets it
    # --strict must not take the project's own files with it
    assert (dst / "Root.tsx").read_text() == "PROJECT real cut\n"


# --- DATA LOSS: project-authored files must survive an unflagged sync ----------------------------
#
# Four real cases, all confirmed by dry-run against the PP repo. The first is the sharp one: an
# authored file at a path the template also ships, which no path-based rule can protect.

# pp-mov-koalice/src/segments/OutroSegment.tsx — 83 lines of client work (a coalition partner logo
# over the brand stinger) where the template ships a 10-line default.
AUTHORED_OUTRO = """\
import { AbsoluteFill, OffthreadVideo, Audio, Img, staticFile } from 'remotion';
// Coalition co-branding: reveal the Novi lidovci partner logo below the PP wordmark.
// Brand rules honoured: #24 entry/exit fade+slide, #26 logo sits on the stinger's own coal.
const NL_LOGO_WIDTH = 620;
const APPEAR_F = 36;
const FADEOUT_START_F = 165;
export const OutroSegment: React.FC = () => <AbsoluteFill>...</AbsoluteFill>;
"""
TEMPLATE_OUTRO = "export const OutroSegment: React.FC = () => <AbsoluteFill>default</AbsoluteFill>;\n"


def test_authored_file_at_a_template_path_is_never_silently_overwritten(tmp_path):
    """THE data-loss case. pp-mov-koalice's OutroSegment.tsx is authored client work sitting at the
    template's own path. An unflagged sync must not touch it — no path rule can save it, only
    provenance, and unknown provenance must read as `authored`."""
    src = _make_template(tmp_path)
    (src / "segments").mkdir()
    (src / "segments" / "OutroSegment.tsx").write_text(TEMPLATE_OUTRO)
    dst = _make_project(tmp_path)
    (dst / "segments").mkdir()
    (dst / "segments" / "OutroSegment.tsx").write_text(AUTHORED_OUTRO)

    report = sync_template(src, dst)  # no flags, no manifest — the default path

    assert (dst / "segments" / "OutroSegment.tsx").read_text() == AUTHORED_OUTRO
    assert report["diverged"] == ["segments/OutroSegment.tsx"]
    assert "segments/OutroSegment.tsx" not in report["updated"]


def test_authored_trees_absent_from_the_template_survive_strict(tmp_path):
    """pp-05-zastupitelsky-klub's src/lib/*, pp-paro-2026's plates/, pp-program-klima-reel's
    graphics/ — authored files the template never had. --strict must not prune them."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    authored = [
        "lib/accent-parser.ts", "lib/accent-parser.test.ts", "lib/load-transcripts.ts",
        "lib/transcript-window.ts", "lib/transcript-window.test.ts",
        "segments/plates/LinkPlate.tsx", "graphics/HaComparison.tsx", "graphics/StudieZones.tsx",
    ]
    for rel in authored:
        (dst / rel).parent.mkdir(parents=True, exist_ok=True)
        (dst / rel).write_text(f"project-authored {rel}\n")

    report = sync_template(src, dst, strict=True)

    for rel in authored:
        assert (dst / rel).exists(), f"--strict deleted authored {rel}"
        assert (dst / rel).read_text() == f"project-authored {rel}\n"
    assert sorted(report["unmanaged"]) == sorted(authored)
    assert report["removed"] == []


def test_an_edited_vendored_file_is_protected_even_though_we_placed_it(tmp_path):
    """Provenance is content-based, not name-based: a file we vendored and the project then EDITED
    is authored work now, and stops being ours to overwrite."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    (dst / "Comp.tsx").write_text("template v1 + the project's own tweak\n")
    vendored = {"Comp.tsx": _sha("template v1\n")}  # what we wrote; not what's there now

    report = sync_template(src, dst, vendored=vendored)

    assert (dst / "Comp.tsx").read_text() == "template v1 + the project's own tweak\n"
    assert report["diverged"] == ["Comp.tsx"]


def test_force_is_the_only_way_to_lose_authored_content(tmp_path):
    """The escape hatch stays available — explicit, and named in the report first."""
    src = _make_template(tmp_path)
    (src / "segments").mkdir()
    (src / "segments" / "OutroSegment.tsx").write_text(TEMPLATE_OUTRO)
    dst = _make_project(tmp_path)
    (dst / "segments").mkdir()
    (dst / "segments" / "OutroSegment.tsx").write_text(AUTHORED_OUTRO)
    (dst / "Authored.tsx").write_text("authored\n")

    report = sync_template(src, dst, strict=True, force=True)

    assert (dst / "segments" / "OutroSegment.tsx").read_text() == TEMPLATE_OUTRO
    assert not (dst / "Authored.tsx").exists()
    assert report["diverged"] == [] and report["unmanaged"] == []
    # even --force does not touch the files the project owns by path
    assert (dst / "Root.tsx").read_text() == "PROJECT real cut\n"


def test_dry_run_never_writes_even_when_protecting(tmp_path):
    src = _make_template(tmp_path)
    (src / "segments").mkdir()
    (src / "segments" / "OutroSegment.tsx").write_text(TEMPLATE_OUTRO)
    dst = _make_project(tmp_path)
    (dst / "segments").mkdir()
    (dst / "segments" / "OutroSegment.tsx").write_text(AUTHORED_OUTRO)

    report = sync_template(src, dst, dry_run=True, strict=True)

    assert (dst / "segments" / "OutroSegment.tsx").read_text() == AUTHORED_OUTRO
    assert report["diverged"] == ["segments/OutroSegment.tsx"]


# --- the provenance manifest itself ---------------------------------------------------------------


def test_manifest_bootstraps_from_identical_files_then_lets_drift_flow(tmp_path):
    """A LEGACY project — files already on disk, no manifest at all, as all 14 real projects are
    today. Files that already match the template are provably safe, so the first run records them,
    and the NEXT template fix then flows with no flag. Without this the tool would be stuck
    demanding --force forever, and --force is the thing that destroys work."""
    src = _make_template(tmp_path)
    dst = _make_project(tmp_path)
    # the legacy project's vendored copies: identical to the template, but nothing records that
    (dst / "Comp.tsx").write_text("template v2\n")
    vendored: dict[str, str] = {}

    first = sync_template(src, dst, vendored=vendored)
    assert first["skipped"] == ["Comp.tsx"]                      # recognised as unchanged...
    assert vendored["Comp.tsx"] == _sha("template v2\n")         # ...and now recorded as ours
    assert first["diverged"] == []

    (src / "Comp.tsx").write_text("template v3\n")               # template moves on
    second = sync_template(src, dst, vendored=vendored)

    assert second["updated"] == ["Comp.tsx"]                     # flows automatically, no --force
    assert (dst / "Comp.tsx").read_text() == "template v3\n"


def test_divergence_is_sticky_a_second_run_still_protects(tmp_path):
    """Protection must not decay. If a `diverged` file were recorded as vendored, the very NEXT
    sync would consider it ours and destroy it — the defect, one run later."""
    src = _make_template(tmp_path)
    (src / "segments").mkdir()
    (src / "segments" / "OutroSegment.tsx").write_text(TEMPLATE_OUTRO)
    dst = _make_project(tmp_path)
    (dst / "segments").mkdir()
    (dst / "segments" / "OutroSegment.tsx").write_text(AUTHORED_OUTRO)
    vendored: dict[str, str] = {}

    first = sync_template(src, dst, vendored=vendored)
    assert first["diverged"] == ["segments/OutroSegment.tsx"]
    assert "segments/OutroSegment.tsx" not in vendored  # NOT recorded — it isn't ours

    second = sync_template(src, dst, vendored=vendored)
    third = sync_template(src, dst, vendored=vendored)

    assert second["diverged"] == ["segments/OutroSegment.tsx"]
    assert third["diverged"] == ["segments/OutroSegment.tsx"]
    assert (dst / "segments" / "OutroSegment.tsx").read_text() == AUTHORED_OUTRO


def test_manifest_round_trips_and_a_corrupt_one_fails_safe(tmp_path):
    proj = tmp_path / "projects" / "p1"
    proj.mkdir(parents=True)

    assert load_vendored(proj) == {}                             # absent -> nothing is vendored
    save_vendored(proj, {"src/Comp.tsx": "abc123"})
    assert load_vendored(proj) == {"src/Comp.tsx": "abc123"}

    (proj / MANIFEST_NAME).write_text("{ not json")
    assert load_vendored(proj) == {}                             # corrupt -> protect everything

    save_vendored(proj, {"src/X.tsx": "d"}, dry_run=True)        # dry run writes nothing
    assert load_vendored(proj) == {}


def test_provenance_guards_the_editor_tree_too(tmp_path):
    """The .editor/ mirror protects nothing by PATH, so provenance is its only guard — and the
    prefixed manifest keys have to line up for it to work."""
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    (proj / ".editor").mkdir()
    (proj / ".editor" / "main.tsx").write_text("the project's own editor tweak\n")
    (proj / ".editor" / "local-notes.md").write_text("my notes\n")

    report = sync_extras(tpl, proj, strict=True)

    assert (proj / ".editor" / "main.tsx").read_text() == "the project's own editor tweak\n"
    assert (proj / ".editor" / "local-notes.md").exists()
    assert ".editor/main.tsx" in report["diverged"]
    assert ".editor/local-notes.md" in report["unmanaged"]


def test_provenance_uses_project_relative_keys(tmp_path):
    """src/Comp.tsx and .editor/Comp.tsx must not collide in one manifest."""
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    vendored: dict[str, str] = {}

    sync_template(tpl / "src", proj / "src", vendored=vendored, prefix="src/")
    sync_extras(tpl, proj, vendored=vendored)

    assert "src/Comp.tsx" in vendored
    assert ".editor/main.tsx" in vendored
    assert "tsconfig.json" in vendored
    assert all(not k.startswith("/") for k in vendored)


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
    (tpl / "tailwind.config.ts").write_text("tailwind config v2\n")
    (tpl / ".prettierrc.json").write_text('{"semi": true}\n')
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
    # the formatting + tailwind toolchain is the template's too: .prettierrc.json is byte-identical
    # in all 12 PP+roost projects, and all 11 PP projects match their template's tailwind.config.ts
    assert (proj / "tailwind.config.ts").read_text() == "tailwind config v2\n"
    assert (proj / ".prettierrc.json").read_text() == '{"semi": true}\n'
    assert set(report["copied"]) == {
        ".editor/index.html",
        ".editor/main.tsx",
        ".editor/vite.config.mts",
        "remotion.config.ts",
        "vitest.config.ts",
        "tsconfig.json",
        "tailwind.config.ts",
        ".prettierrc.json",
    }


def test_editor_drift_is_pulled_forward_and_idempotent(tmp_path):
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    (proj / ".editor").mkdir()
    (proj / ".editor" / "main.tsx").write_text("editor main v1\n")  # drifted behind
    vendored = {".editor/main.tsx": _sha("editor main v1\n")}       # ...and we are the ones who put it there

    report = sync_extras(tpl, proj, vendored=vendored)
    assert report["updated"] == [".editor/main.tsx"]
    assert (proj / ".editor" / "main.tsx").read_text() == "editor main v2\n"

    again = sync_extras(tpl, proj, vendored=vendored)
    assert again["copied"] == [] and again["updated"] == []
    assert len(again["skipped"]) == 8


def test_a_project_that_tuned_its_build_config_keeps_it(tmp_path):
    """What makes carrying tailwind.config.ts safe: a project that tuned its own is PROTECTED, not
    overwritten. (This test used to assert `updated` — that was the data-loss defect.)"""
    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path)
    (proj / "tailwind.config.ts").write_text("project's own tailwind\n")
    (proj / ".prettierrc.json").write_text('{"semi": false}\n')

    report = sync_extras(tpl, proj)

    assert "tailwind.config.ts" in report["diverged"]
    assert ".prettierrc.json" in report["diverged"]
    assert (proj / "tailwind.config.ts").read_text() == "project's own tailwind\n"
    assert json.loads((proj / ".prettierrc.json").read_text()) == {"semi": False}


def test_a_template_shipping_only_some_config_files_is_fine(tmp_path):
    """roost's template ships no tailwind.config.ts — a missing file is skipped, not an error."""
    tpl = _make_template_dir(tmp_path)
    (tpl / "tailwind.config.ts").unlink()

    report = sync_extras(tpl, _make_project_dir(tmp_path))

    assert "tailwind.config.ts" not in report["copied"]
    assert "vitest.config.ts" in report["copied"]


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
    vendored = {".editor/stale.tsx": _sha("gone from template\n")}  # the tool placed it

    report = sync_extras(tpl, proj, strict=True, vendored=vendored)

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


def test_the_merge_actually_runs_the_identity_guard_before_writing(tmp_path, monkeypatch):
    """Testing the guard in isolation is not enough — deleting its CALL SITE must fail too. This is
    the one operation that could rename 14 projects, so pin that it runs, and runs BEFORE the write."""
    import video_toolkit.sync_template as st

    tpl = _make_template_dir(tmp_path)
    proj = _make_project_dir(tmp_path, pkg={"name": "pp-ricni-sauna", "version": "0.2.0"})
    before = (proj / "package.json").read_text()

    calls = []

    def _spy(pre, post):
        calls.append((pre, post))
        raise RuntimeError("`name` would change")  # stand in for a real violation

    monkeypatch.setattr(st, "check_identity_preserved", _spy)

    with pytest.raises(RuntimeError, match="`name` would change"):
        st.merge_package_json(tpl, proj)

    assert len(calls) == 1
    assert calls[0][0] == {"name": "pp-ricni-sauna", "version": "0.2.0"}  # the PRE-merge identity
    # the guard ran before the write, so a violation leaves the file untouched
    assert (proj / "package.json").read_text() == before


def test_template_without_package_json_is_a_no_op(tmp_path):
    _make_template(tmp_path)
    tpl = tmp_path / "templates" / "demo"
    proj = _make_project_dir(tmp_path)

    report = merge_package_json(tpl, proj)

    assert all(v == [] for v in report.values())
    assert not (proj / "package.json").exists()
