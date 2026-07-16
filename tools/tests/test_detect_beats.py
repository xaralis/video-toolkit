import numpy as np, soundfile as sf, tempfile, os
from tools.detect_beats import detect_beats

def _click_track(bpm=120, secs=8, sr=44100):
    # Broadband percussive hits: a short white-noise burst shaped by a
    # Hanning envelope at each beat. Unlike a bare Hanning "click" (a smooth
    # low-frequency bump with almost no high-frequency content), noise
    # spreads energy across the whole spectrum -- exercising onset
    # detection the way a real percussive hit (kick/snare/skank) does, so
    # this fixture passes with librosa's standard cross-band median
    # aggregation instead of requiring a narrowband-tuned deviation.
    #
    # sr=44100 (standard recording rate) rather than librosa's 22050 load
    # default: detect_beats now preserves the source's native rate, and a
    # finer native rate gives beat_track's discrete tempo grid enough
    # resolution to land within a couple BPM of the true 120.
    beat = 60.0 / bpm
    rng = np.random.default_rng(42)
    y = np.zeros(int(secs * sr), dtype=np.float32)
    burst_len = int(sr * 0.01)  # ~10ms burst
    envelope = np.hanning(burst_len).astype(np.float32)
    for n in range(int(secs / beat)):
        i = int(n * beat * sr)
        noise = rng.standard_normal(burst_len).astype(np.float32)
        y[i:i+burst_len] += envelope * noise
    peak = float(np.max(np.abs(y))) or 1.0
    y = (y / peak) * 0.9
    return y, sr

def test_detects_120bpm_click():
    y, sr = _click_track(120)
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, "click.wav"); sf.write(p, y, sr)
        r = detect_beats(p)
    assert abs(r["bpm"] - 120) <= 2
    assert len(r["beatTimes"]) >= 10
    assert r["downbeatTimes"][1] == r["beatTimes"][4]
    assert r["trackDurationSec"] > 7.5
