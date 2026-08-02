"""music_gen CLI: exit-code honesty and sequential variations.

Two behaviours are pinned here:

1. A generation that produces no audio must exit non-zero. A caller (or a
   background task runner) reads exit 0 as "the file is there".
2. `--variations N` must issue N *separate* requests. The acemusic API's
   `batch_size` reliably 504s for N > 1, which is how a whole batch used to
   fail at once.
"""

import base64
import json
import sys
from pathlib import Path

import pytest

from video_toolkit import music_gen


# --- Fakes ---------------------------------------------------------------


class FakeResponse:
    def __init__(self, status_code=200, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload
        self.text = text

    def json(self):
        if self._payload is None:
            raise json.JSONDecodeError("no json", "", 0)
        return self._payload


def audio_payload(n_clips=1):
    """A minimal acemusic success response carrying `n_clips` data-URL clips."""
    clip = "data:audio/mpeg;base64," + base64.b64encode(b"ID3fake-audio").decode()
    return {
        "choices": [
            {
                "message": {
                    "content": "",
                    "audio": [{"audio_url": {"url": clip}} for _ in range(n_clips)],
                }
            }
        ]
    }


@pytest.fixture
def acemusic(monkeypatch):
    """Patch the API key + `requests.post`, and record every request payload."""
    import config

    monkeypatch.setattr(config, "get_acemusic_api_key", lambda: "test-key")

    calls = []

    def responder(url, json=None, headers=None, timeout=None):
        calls.append(json)
        return responder.reply(len(calls))

    responder.reply = lambda n: FakeResponse(200, audio_payload())
    monkeypatch.setattr(music_gen.requests, "post", responder)
    responder.calls = calls
    return responder


def run_cli(monkeypatch, *argv):
    """Run `main()` with argv; return the exit code it raised."""
    monkeypatch.setattr(sys, "argv", ["music_gen", *argv])
    with pytest.raises(SystemExit) as exc:
        music_gen.main()
    return exc.value.code


# --- Exit codes ----------------------------------------------------------


def test_http_error_exits_nonzero(monkeypatch, acemusic, tmp_path):
    """A 504 from acemusic writes nothing, so it must not report success."""
    acemusic.reply = lambda n: FakeResponse(504, None, "acemusic.ai | 504: Gateway time-out")
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--duration", "30", "--output", str(out))

    assert code != 0
    assert not out.exists()


def test_missing_api_key_exits_nonzero(monkeypatch, tmp_path):
    import config

    monkeypatch.setattr(config, "get_acemusic_api_key", lambda: None)
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--output", str(out))

    assert code != 0


def test_success_exits_zero(monkeypatch, acemusic, tmp_path):
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--output", str(out))

    assert code == 0
    assert out.exists()


# --- Sequential variations ----------------------------------------------


def test_variations_issue_one_request_each(monkeypatch, acemusic, tmp_path):
    """N variations = N requests, never one `batch_size` request."""
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--variations", "3", "--output", str(out))

    assert code == 0
    assert len(acemusic.calls) == 3
    assert all("batch_size" not in payload for payload in acemusic.calls)
    for i in (1, 2, 3):
        assert (tmp_path / f"bg_{i}.mp3").exists()


def test_variations_use_distinct_seeds(monkeypatch, acemusic, tmp_path):
    """Same prompt + same seed would return the same track N times."""
    out = tmp_path / "bg.mp3"

    run_cli(monkeypatch, "--prompt", "test", "--variations", "3", "--output", str(out))

    seeds = [payload.get("seed") for payload in acemusic.calls]
    assert all(s is not None for s in seeds)
    assert len(set(seeds)) == 3


def test_explicit_seed_anchors_the_variation_series(monkeypatch, acemusic, tmp_path):
    out = tmp_path / "bg.mp3"

    run_cli(monkeypatch, "--prompt", "test", "--variations", "3",
            "--seed", "100", "--output", str(out))

    assert [p.get("seed") for p in acemusic.calls] == [100, 101, 102]


def test_partial_variations_exit_nonzero_and_keep_files(monkeypatch, acemusic, tmp_path):
    """2 of 3 asked-for tracks is not success — but don't throw the 2 away."""
    acemusic.reply = lambda n: (
        FakeResponse(504, None, "gateway timeout") if n == 2
        else FakeResponse(200, audio_payload())
    )
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--variations", "3", "--output", str(out))

    assert code != 0
    assert (tmp_path / "bg_1.mp3").exists()
    assert not (tmp_path / "bg_2.mp3").exists()
    assert (tmp_path / "bg_3.mp3").exists()


def test_variations_allowed_on_modal(monkeypatch, tmp_path):
    """Sequential variations work on any provider — they are not acemusic-only."""
    seen = []

    def fake_generate(**kwargs):
        seen.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"audio")
        return {"success": True, "output": kwargs["output_path"]}

    monkeypatch.setattr(music_gen, "generate_music", fake_generate)
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--cloud", "modal",
                   "--variations", "2", "--output", str(out))

    assert code == 0
    assert len(seen) == 2
    assert len({k["seed"] for k in seen}) == 2


# --- Modal fallback ------------------------------------------------------


def test_acemusic_failure_falls_back_to_modal(monkeypatch, acemusic, tmp_path):
    """The default provider chain is acemusic -> modal, as add-music.md promises."""
    monkeypatch.setenv("MODAL_MUSIC_GEN_ENDPOINT_URL", "https://modal.test/music")
    acemusic.reply = lambda n: FakeResponse(504, None, "gateway timeout")

    fell_back = []

    def fake_generate(**kwargs):
        fell_back.append(kwargs)
        Path(kwargs["output_path"]).write_bytes(b"audio")
        return {"success": True, "output": kwargs["output_path"]}

    monkeypatch.setattr(music_gen, "generate_music", fake_generate)
    out = tmp_path / "bg.mp3"

    code = run_cli(monkeypatch, "--prompt", "test", "--output", str(out))

    assert code == 0
    assert len(fell_back) == 1
    assert fell_back[0]["cloud"] == "modal"
    assert out.exists()


def test_explicit_acemusic_never_falls_back(monkeypatch, acemusic, tmp_path):
    monkeypatch.setenv("MODAL_MUSIC_GEN_ENDPOINT_URL", "https://modal.test/music")
    acemusic.reply = lambda n: FakeResponse(504, None, "gateway timeout")

    def fake_generate(**kwargs):
        raise AssertionError("must not fall back when --cloud acemusic is explicit")

    monkeypatch.setattr(music_gen, "generate_music", fake_generate)

    code = run_cli(monkeypatch, "--prompt", "test", "--cloud", "acemusic",
                   "--output", str(tmp_path / "bg.mp3"))

    assert code != 0


def test_no_fallback_when_modal_unconfigured(monkeypatch, acemusic, tmp_path):
    monkeypatch.delenv("MODAL_MUSIC_GEN_ENDPOINT_URL", raising=False)
    acemusic.reply = lambda n: FakeResponse(504, None, "gateway timeout")

    def fake_generate(**kwargs):
        raise AssertionError("must not call modal when its endpoint is unset")

    monkeypatch.setattr(music_gen, "generate_music", fake_generate)

    code = run_cli(monkeypatch, "--prompt", "test", "--output", str(tmp_path / "bg.mp3"))

    assert code != 0
