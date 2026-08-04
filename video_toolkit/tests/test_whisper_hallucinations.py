"""Whisper's subtitle-credit hallucinations, and the rule that removes them."""

import json

import pytest

from video_toolkit.whisper_hallucinations import (
    is_hallucination,
    strip_hallucinated_segments,
)


def seg(id_, start, end, text, words=None):
    return {
        "id": id_,
        "start": start,
        "end": end,
        "text": text,
        "words": words if words is not None else [{"start": start, "end": end, "word": text}],
    }


# Verbatim from real transcripts this toolkit produced (pp-u-kamenne-vily,
# 2026-08-04). Both are the LAST segment of a recording, right after the
# speech ends — Whisper filling trailing silence with what Czech subtitle
# files end with.
REAL_CZECH = " Titulky vytvořil JohnyX http://johnyxcz.blogspot.com"
REAL_CZECH_SHORT = " Titulky vytvořil JohnyX."


class TestIsHallucination:
    @pytest.mark.parametrize(
        "text",
        [
            REAL_CZECH,
            REAL_CZECH_SHORT,
            "Titulky vytvořil JohnyX",
            "  titulky vytvořil někdo jiný  ",
            "Přepis a korektura: Petr Novák",
            "Překlad: Jan Novák",
            "Subtitles by the Amara.org community",
            "Subtitles by the Amara.org community.",
            "www.amara.org",
            "Titulky z odposlechu",
        ],
    )
    def test_known_credit_lines(self, text):
        assert is_hallucination(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            # The word appears in real speech — the rule must not fire.
            " Titulky jsme k tomu videu přidali až později.",
            " Přepis toho jednání si můžete přečíst na webu.",
            " Přeložili jsme to do češtiny sami.",
            " Hned za Maťákem vede jedno z velmi frekventovaných propojení.",
            "",
            "   ",
        ],
    )
    def test_real_speech_survives(self, text):
        assert is_hallucination(text) is False


class TestStripHallucinatedSegments:
    def test_removes_the_trailing_credit_and_reports_it(self):
        result = {
            "language": "cs",
            "duration": 12.04,
            "segments": [seg(0, 1.18, 10.48, " Hned za Maťákem…"), seg(1, 10.48, 12.04, REAL_CZECH)],
        }
        cleaned, removed = strip_hallucinated_segments(result)
        assert [s["text"] for s in cleaned["segments"]] == [" Hned za Maťákem…"]
        # Reported, never silent: the caller prints what it dropped.
        assert removed == [REAL_CZECH]

    def test_leaves_a_clean_transcript_untouched_and_reports_nothing(self):
        result = {"language": "cs", "duration": 6.5, "segments": [seg(0, 1.08, 6.5, " Jezdí tudy cyklisté.")]}
        cleaned, removed = strip_hallucinated_segments(result)
        assert removed == []
        assert cleaned["segments"] == result["segments"]

    def test_renumbers_ids_so_they_stay_contiguous(self):
        result = {
            "segments": [
                seg(0, 0.0, 1.0, " První věta."),
                seg(1, 1.0, 2.0, REAL_CZECH_SHORT),
                seg(2, 2.0, 3.0, " Druhá věta."),
            ]
        }
        cleaned, _ = strip_hallucinated_segments(result)
        assert [s["id"] for s in cleaned["segments"]] == [0, 1]
        assert [s["text"] for s in cleaned["segments"]] == [" První věta.", " Druhá věta."]

    def test_does_not_mutate_the_input(self):
        result = {"segments": [seg(0, 0.0, 1.0, REAL_CZECH)]}
        strip_hallucinated_segments(result)
        assert len(result["segments"]) == 1

    def test_survives_a_payload_without_segments(self):
        cleaned, removed = strip_hallucinated_segments({"language": "cs"})
        assert removed == []
        assert cleaned == {"language": "cs"}

    def test_keeps_every_other_key(self):
        result = {"language": "cs", "duration": 12.04, "segments": [seg(0, 0.0, 1.0, REAL_CZECH)]}
        cleaned, _ = strip_hallucinated_segments(result)
        assert cleaned["language"] == "cs" and cleaned["duration"] == 12.04
        assert cleaned["segments"] == []


class TestTranscribeWiring:
    """The filter is worthless if `transcribe` doesn't call it — pin the wiring,
    not just the rule."""

    def test_transcribe_one_writes_a_cleaned_transcript(self, tmp_path, monkeypatch, capsys):
        from video_toolkit import transcribe

        monkeypatch.setattr(
            transcribe,
            "_transcribe_audio",
            lambda *a, **k: {
                "language": "cs",
                "duration": 12.04,
                "segments": [seg(0, 1.18, 10.48, " Skutečná řeč."), seg(1, 10.48, 12.04, REAL_CZECH)],
            },
        )
        audio = tmp_path / "take.wav"  # not a VIDEO_EXTS suffix — no ffmpeg path
        audio.write_bytes(b"")
        out = tmp_path / "take.transcript.json"

        result = transcribe.transcribe_one(audio, "cs", "http://endpoint", out)

        assert [s["text"] for s in result["segments"]] == [" Skutečná řeč."]
        assert [s["text"] for s in json.loads(out.read_text(encoding="utf-8"))["segments"]] == [" Skutečná řeč."]
        # It says what it dropped rather than deleting quietly.
        assert "Titulky vytvořil" in capsys.readouterr().out


class TestCleanFile:
    def test_cleans_an_existing_transcript_in_place(self, tmp_path):
        from video_toolkit.whisper_hallucinations import clean_file

        p = tmp_path / "take.mp4.transcript.json"
        p.write_text(
            json.dumps(
                {
                    "language": "cs",
                    "duration": 12.04,
                    "segments": [seg(0, 1.18, 10.48, " Skutečná řeč."), seg(1, 10.48, 12.04, REAL_CZECH)],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        removed = clean_file(p)

        assert removed == [REAL_CZECH]
        assert [s["text"] for s in json.loads(p.read_text(encoding="utf-8"))["segments"]] == [" Skutečná řeč."]

    def test_leaves_a_clean_file_byte_identical(self, tmp_path):
        from video_toolkit.whisper_hallucinations import clean_file

        p = tmp_path / "take.mp4.transcript.json"
        original = json.dumps({"segments": [seg(0, 0.0, 1.0, " Skutečná řeč.")]}, ensure_ascii=False)
        p.write_text(original, encoding="utf-8")

        assert clean_file(p) == []
        # Not rewritten at all — a no-op must not churn the file (or its line
        # endings) just because it was inspected.
        assert p.read_text(encoding="utf-8") == original
