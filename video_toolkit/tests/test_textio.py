"""Files the toolkit writes must not have their line endings chosen for them.

`Path.write_text` opens in text mode, where Python rewrites "\\n" to
`os.linesep` — LF here, CRLF on Windows. The transcripts pulled from R2 for
pp-u-kamenne-vily carried CRLF against LF in git (166 CR bytes over 167 lines,
`git diff -w` empty), so every pull showed all ten as fully rewritten. Whoever
produced them, a writer whose output depends on the host it ran on is a defect
we cannot test our way out of — so there is no platform-dependent write left.
"""

from video_toolkit.textio import write_text_lf


def test_writes_lf_and_never_the_platforms_separator(tmp_path):
    path = tmp_path / "a.json"

    write_text_lf(path, '{\n  "a": 1\n}\n')

    assert path.read_bytes() == b'{\n  "a": 1\n}\n'


def test_normalises_crlf_the_caller_handed_us(tmp_path):
    """The point is an LF file on disk, not merely an untranslated one."""
    path = tmp_path / "a.json"

    write_text_lf(path, '{\r\n  "a": 1\r\n}\r\n')

    assert b"\r" not in path.read_bytes()
    assert path.read_bytes() == b'{\n  "a": 1\n}\n'


def test_normalises_lone_cr(tmp_path):
    path = tmp_path / "a.json"

    write_text_lf(path, "a\rb")

    assert path.read_bytes() == b"a\nb"


def test_accepts_a_plain_string_path(tmp_path):
    """Callers that only ever had a str must not have to import pathlib for this."""
    path = tmp_path / "a.json"

    write_text_lf(str(path), "{}")

    assert path.read_bytes() == b"{}"


def test_round_trips_utf8_without_escaping(tmp_path):
    """Czech transcripts are the whole use case — ensure_ascii=False stays honest."""
    path = tmp_path / "a.json"

    write_text_lf(path, '{"text": "Hned za Maťákem"}')

    assert path.read_text(encoding="utf-8") == '{"text": "Hned za Maťákem"}'
