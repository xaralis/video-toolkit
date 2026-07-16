"""Regression test for the tools/ -> video_toolkit/ rename.

`git mv` moved these modules but left string literals pointing at the old
`tools/` directory (sys.path.insert targets, sibling-script paths). Nothing
imported these modules, so the breakage shipped silently. Each module here
must at least load and run `--help` from a neutral CWD, using the installed
package entrypoint (`-m video_toolkit.<module>`) rather than a relative file
path — see test_package_entrypoints.py for the established pattern.
"""

import subprocess
import sys

import pytest

# Every module in this class of regression: sibling-module paths that
# referenced the pre-rename "tools/" directory.
MODULES = [
    "sync_project",
    "render_reel",
    "export_vtt",
    "chain_video",
]


@pytest.mark.parametrize("module", MODULES)
def test_module_help_runs_from_neutral_cwd(tmp_path, module):
    result = subprocess.run(
        [sys.executable, "-m", f"video_toolkit.{module}", "--help"],
        capture_output=True,
        text=True,
        cwd=tmp_path,
    )
    assert result.returncode == 0, result.stderr
    assert "usage" in result.stdout.lower()


def test_check_stale_projects_runs_from_neutral_cwd(tmp_path):
    # No argparse in this module (SessionStart-hook script); just verify it
    # imports and executes cleanly with no configured R2 credentials.
    result = subprocess.run(
        [sys.executable, "-m", "video_toolkit.check_stale_projects"],
        capture_output=True,
        text=True,
        cwd=tmp_path,
    )
    assert result.returncode == 0, result.stderr
