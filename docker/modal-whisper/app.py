"""
Modal deployment for Whisper transcription via faster-whisper.

Returns word-level timestamps. Czech is the primary target but the API is
language-agnostic.

Deploy:
    modal deploy docker/modal-whisper/app.py

Endpoint URL -> MODAL_WHISPER_ENDPOINT_URL in toolkit .env.
"""

import modal

app = modal.App("video-toolkit-whisper")

image = (
    modal.Image.from_registry(
        # cuDNN 9 + CUDA 12 — compatible with ctranslate2 4.6+
        "nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install("ffmpeg")  # faster-whisper / av use ffmpeg for audio decoding
    .pip_install(
        # Use latest faster-whisper/ctranslate2 which ship against cuDNN 9
        "faster-whisper==1.2.1",
        "ctranslate2==4.7.2",
        "requests",
        "fastapi[standard]",
    )
    .run_commands(
        "python -c 'from faster_whisper import WhisperModel; "
        "WhisperModel(\"large-v3\", device=\"cpu\", compute_type=\"int8\")'"
    )
)


@app.cls(gpu="A10G", image=image, timeout=600, scaledown_window=120)
class Whisper:
    """Whisper large-v3 transcription with word-level timestamps."""
    @modal.enter()
    def load(self):
        from faster_whisper import WhisperModel
        self.model = WhisperModel("large-v3", device="cuda", compute_type="float16")

    @modal.fastapi_endpoint(method="POST")
    def transcribe(self, payload: dict):
        import base64
        import os
        import tempfile

        import requests

        audio_url      = payload.get("audio_url")
        audio_b64      = payload.get("audio_b64")
        language       = payload.get("language", "cs")
        # Optional context to bias decoding toward expected vocabulary
        # (proper nouns, domain terms). Maps to faster-whisper's
        # initial_prompt parameter.
        initial_prompt = payload.get("initial_prompt") or None

        if not (audio_url or audio_b64):
            return {"error": "audio_url or audio_b64 required"}

        # Determine file extension from URL or default to .mp3 so that
        # av/faster-whisper can auto-detect the audio format.
        suffix = ".mp3"
        if audio_url:
            from urllib.parse import urlparse
            parsed_path = urlparse(audio_url.split("?")[0]).path
            ext = os.path.splitext(parsed_path)[-1].lower()
            if ext in {".wav", ".ogg", ".flac", ".m4a", ".mp4", ".webm"}:
                suffix = ext

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            if audio_url:
                try:
                    resp = requests.get(audio_url, timeout=120)
                    resp.raise_for_status()
                    f.write(resp.content)
                except requests.RequestException as e:
                    f.close()
                    os.unlink(f.name)
                    return {"error": f"Failed to download audio: {e}"}
            else:
                try:
                    f.write(base64.b64decode(audio_b64))
                except Exception as e:
                    f.close()
                    os.unlink(f.name)
                    return {"error": f"Invalid base64 audio: {e}"}
            tmp_path = f.name

        try:
            segments_iter, info = self.model.transcribe(
                tmp_path,
                language=language,
                word_timestamps=True,
                vad_filter=True,
                initial_prompt=initial_prompt,
            )
            segments = []
            for i, seg in enumerate(segments_iter):
                segments.append({
                    "id": i,
                    "start": seg.start,
                    "end":   seg.end,
                    "text":  seg.text,
                    "words": [
                        {"start": w.start, "end": w.end, "word": w.word}
                        for w in (seg.words or [])
                    ],
                })
            return {
                "language": info.language,
                "duration": info.duration,
                "segments": segments,
            }
        finally:
            os.unlink(tmp_path)
