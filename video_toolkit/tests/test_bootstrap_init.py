"""End-to-end tests for the brand-repo bootstrap CLI (scripts/bootstrap/cli.mjs).

Runs the real Node CLI via subprocess against THIS repo as a local toolkit
source, so no network and (with --skip-install) no pip. Skips cleanly when no
Node >= 18 is available.
"""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
CLI = REPO_ROOT / "scripts" / "bootstrap" / "cli.mjs"


def _node18() -> str | None:
    """First Node >= 18 on PATH or in common locations, else None."""
    candidates = []
    which = shutil.which("node")
    if which:
        candidates.append(which)
    candidates.append("/opt/homebrew/bin/node")
    candidates.append("/usr/local/bin/node")
    nvm = Path.home() / ".nvm" / "versions" / "node"
    if nvm.is_dir():
        for d in sorted(nvm.iterdir(), reverse=True):
            candidates.append(str(d / "bin" / "node"))
    for node in candidates:
        try:
            out = subprocess.run([node, "-p", "process.versions.node"],
                                 capture_output=True, text=True, timeout=15)
        except (OSError, subprocess.SubprocessError):
            continue
        if out.returncode == 0 and int(out.stdout.strip().split(".")[0]) >= 18:
            return node
    return None


NODE = _node18()
pytestmark = pytest.mark.skipif(NODE is None, reason="no Node >= 18 available")


def _run(args, cwd=None):
    return subprocess.run([NODE, str(CLI), *args], cwd=cwd,
                          capture_output=True, text=True, timeout=120)


def test_no_subcommand_prints_usage_and_fails():
    r = _run([])
    assert r.returncode != 0
    assert "init" in (r.stdout + r.stderr)


def test_unknown_subcommand_fails():
    r = _run(["frobnicate"])
    assert r.returncode != 0


def test_init_into_nonempty_dir_fails(tmp_path):
    (tmp_path / "occupied.txt").write_text("x")
    r = _run(["init", str(tmp_path), "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode != 0
    assert "not empty" in (r.stdout + r.stderr).lower()


def test_init_creates_git_repo(tmp_path):
    target = tmp_path / "brand-a"
    r = _run(["init", str(target), "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr
    assert (target / ".git").exists()


def test_scaffold_files(tmp_path):
    target = tmp_path / "brand-b"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr

    # submodule present
    assert (target / "toolkit" / "brands" / "default" / "brand.json").exists()
    assert (target / ".gitmodules").exists()

    # workspace marker with kind=brand
    ws = json.loads((target / "workspace.json").read_text())
    assert ws["kind"] == "brand"
    assert ws["name"] == "acme-videos"

    # brand copied from default, name overridden
    bj = json.loads((target / "brands" / "acme" / "brand.json").read_text())
    assert bj["name"] == "acme"
    assert (target / "brands" / "acme" / "voice.json").exists()
    assert (target / "brands" / "acme" / "BRAND-RULES.md").exists()

    # projects dir kept
    assert (target / "projects" / ".gitkeep").exists()


def test_ref_pins_submodule_to_requested_commit(tmp_path):
    # Local clone of this repo used as the toolkit source, tagged so we have
    # a non-default ref to pin against (brands/default, .env.example,
    # CLAUDE.md all exist at HEAD, satisfying the later scaffold steps).
    fixture_toolkit = tmp_path / "fixture-toolkit"
    clone = subprocess.run(["git", "clone", str(REPO_ROOT), str(fixture_toolkit)],
                            capture_output=True, text=True, timeout=120)
    assert clone.returncode == 0, clone.stdout + clone.stderr

    # -m avoids relying on an interactive editor; the user's global
    # tag.gpgsign=true would otherwise force an annotated tag with no message.
    tag = subprocess.run(["git", "-C", str(fixture_toolkit), "tag", "-m", "test pin",
                           "vtk-test-pin"],
                          capture_output=True, text=True, timeout=30)
    assert tag.returncode == 0, tag.stdout + tag.stderr

    # ^{commit} peels an annotated tag (forced by the user's global
    # tag.gpgsign=true) down to the commit it points at.
    rev_parse = subprocess.run(
        ["git", "-C", str(fixture_toolkit), "rev-parse", "vtk-test-pin^{commit}"],
        capture_output=True, text=True, timeout=30)
    assert rev_parse.returncode == 0, rev_parse.stdout + rev_parse.stderr
    pinned_sha = rev_parse.stdout.strip()

    target = tmp_path / "brand-ref"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(fixture_toolkit), "--ref", "vtk-test-pin"])
    assert r.returncode == 0, r.stdout + r.stderr

    submodule_head = subprocess.run(
        ["git", "-C", str(target / "toolkit"), "rev-parse", "HEAD"],
        capture_output=True, text=True, timeout=30)
    assert submodule_head.returncode == 0, submodule_head.stdout + submodule_head.stderr
    assert submodule_head.stdout.strip() == pinned_sha


def test_plugin_wiring_and_commit_and_nextsteps(tmp_path):
    target = tmp_path / "brand-c"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr

    # .claude/settings.json lights up the plugin, marketplace points at ./toolkit
    settings = json.loads((target / ".claude" / "settings.json").read_text())
    assert settings["enabledPlugins"]["toolkit@video-toolkit"] is True
    mp = settings["extraKnownMarketplaces"]["video-toolkit"]["source"]
    assert mp["path"] == "./toolkit"

    # thin CLAUDE.md references the toolkit + brand
    claude = (target / "CLAUDE.md").read_text()
    assert "toolkit/CLAUDE.md" in claude
    assert "acme" in claude

    # supporting files
    assert (target / ".gitignore").exists()
    assert (target / ".env.example").exists()
    assert (target / "README.md").exists()

    # an initial commit exists
    log = subprocess.run(["git", "-C", str(target), "log", "--oneline"],
                         capture_output=True, text=True)
    assert log.returncode == 0 and log.stdout.strip()

    # next-steps insists on launching Claude Code; commands live inside
    out = r.stdout
    assert "claude" in out
    assert "/toolkit:brand" in out
    assert "/toolkit:video" in out


def test_skip_install_leaves_no_venv_and_notes_it(tmp_path):
    target = tmp_path / "brand-d"
    r = _run(["init", str(target), "--brand", "acme", "--yes", "--skip-install",
              "--toolkit-url", str(REPO_ROOT)])
    assert r.returncode == 0, r.stdout + r.stderr
    assert not (target / ".venv").exists()
    assert "--skip-install" in r.stdout
    assert "pip install -e toolkit" in r.stdout
