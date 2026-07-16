import subprocess
import sys


def test_tool_is_invocable_as_a_module():
    """Shared commands must call core tools by name, from any CWD."""
    result = subprocess.run(
        [sys.executable, "-m", "video_toolkit.detect_beats", "--help"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert "usage" in result.stdout.lower()
