"""Write text files whose bytes do not depend on the host that wrote them.

`Path.write_text` and a bare `open(p, "w")` translate "\\n" to `os.linesep`,
so the same code emits LF here and CRLF on Windows. For anything git tracks
that means a file which reads identically but diffs as fully rewritten — see
the pp-u-kamenne-vily transcripts, where a pull showed all ten changed and
`git diff -w` was empty.

There is no library to reach for: the fix is to stop asking the platform.
Encoding to bytes ourselves removes the translating layer entirely, which is
also why this is testable anywhere rather than only on Windows.
"""

from pathlib import Path


def write_text_lf(path: Path | str, text: str) -> None:
    """Write `text` with LF endings and UTF-8, on every platform."""
    normalised = text.replace("\r\n", "\n").replace("\r", "\n")
    Path(path).write_bytes(normalised.encode("utf-8"))
