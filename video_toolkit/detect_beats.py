"""Beat detection via librosa. Outputs beats.json (bpm, beatTimes, downbeatTimes, kickTimes)."""
import argparse, json
import numpy as np
import librosa

# Kick band: reggae/dub kick fundamentals sit ~40-120 Hz. Narrow to 40-110 to stay under most of
# the busy reggae bassline while still catching the kick's punch.
KICK_FMIN = 40.0
KICK_FMAX = 110.0
KICK_WINDOW_SEC = 0.2  # search radius around each beat when snapping a kick to it


def detect_kicks(y, sr, beat_times, hop_length: int = 512) -> list:
    """Onset times (seconds) of the kick drum, quantized to the beat.

    A plain low-band onset detector fires on nearly every eighth note of a busy reggae bassline, so
    the heartbeat ended up far too busy. Instead we snap to the beat grid: on the HALF-TIME (one-drop)
    grid — every other detected beat — take the single STRONGEST low-band onset near each beat. That
    yields at most one kick per beat, on the beat, dropping the sub-beat bassline wiggles. Beats with
    no low onset nearby (breakdowns) get no kick.
    """
    if len(beat_times) < 2:
        return []
    grid = np.asarray(beat_times[::2], dtype=float)  # one-drop (76bpm-ish) grid
    y_perc = librosa.effects.percussive(y, margin=3.0)
    S = np.abs(librosa.stft(y_perc, n_fft=2048, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    band = (freqs >= KICK_FMIN) & (freqs <= KICK_FMAX)
    if not band.any():
        return []
    low_db = librosa.amplitude_to_db(S[band, :], ref=np.max)
    env = librosa.onset.onset_strength(S=low_db, sr=sr, hop_length=hop_length)
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=env, sr=sr, hop_length=hop_length, backtrack=True
    )
    if len(onset_frames) == 0:
        return []
    strengths = env[onset_frames]
    times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=hop_length)
    kicks = []
    for b in grid:
        win = np.where((times >= b - KICK_WINDOW_SEC) & (times <= b + KICK_WINDOW_SEC))[0]
        if win.size == 0:
            continue
        j = win[int(np.argmax(strengths[win]))]
        t = round(float(times[j]), 4)
        if not kicks or t - kicks[-1] > 1e-3:  # dedupe if two beats claim the same onset
            kicks.append(t)
    return kicks


def detect_beats(path: str) -> dict:
    # Preserve the source's native sample rate rather than librosa.load's
    # default 22050 Hz downsample. librosa.beat.beat_track's static tempo
    # estimate is picked from a discrete grid of candidate BPMs spaced by
    # sr / hop_length (default hop_length=512); at 22050 Hz that grid has
    # ~5-6 BPM gaps in the 100-140 BPM range common to reggae/pop, which can
    # put the true tempo squarely between two candidates and bias the
    # estimate off by several BPM regardless of onset-detection quality.
    # Keeping the native rate (typically 44.1/48 kHz for real recordings)
    # gives a much finer tempo grid and an accurate reading.
    y, sr = librosa.load(path, mono=True, sr=None)

    # Standard librosa beat tracking: cross-band median onset aggregation,
    # tuned for real polyphonic/percussive music.
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    bpm = float(tempo if not hasattr(tempo, "__len__") else tempo[0])

    downbeats = beat_times[::4]
    return {
        "bpm": round(bpm, 2),
        "beatTimes": [round(t, 4) for t in beat_times],
        "downbeatTimes": [round(t, 4) for t in downbeats],
        "kickTimes": detect_kicks(y, sr, beat_times),
        "trackDurationSec": round(float(len(y) / sr), 3),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("track")
    ap.add_argument("--out", default="beats.json")
    a = ap.parse_args()
    data = detect_beats(a.track)
    with open(a.out, "w") as f:
        json.dump(data, f, indent=2)
    print(f"bpm={data['bpm']} beats={len(data['beatTimes'])} "
          f"kicks={len(data['kickTimes'])} -> {a.out}")

if __name__ == "__main__":
    main()
