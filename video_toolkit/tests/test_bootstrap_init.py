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
