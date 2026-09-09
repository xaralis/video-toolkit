"""audio_calibrate must read the layered model, not just the old segment shape.

Every web-program-intro and campaign-reel authored since the LayeredReel
migration stores its cut as `tracks.video[] / tracks.audio[] / tracks.music`,
with `kind:` instead of `type:` and `baseVolumeDb` instead of `musicVolumeDb`.
The segment-shaped regexes matched none of it, so the tool bailed with
"no clip segments found in Root.tsx defaultProps" and every layered project had
to be calibrated by hand.

The window matters as much as the format: a layered clip names an explicit
`sourceInMs`/`sourceOutMs` into a take that is usually far longer than the piece
actually used (pp-program-skoly's TH-04_t1 is 78s of which 21.4s is in the
reel, the rest being silence and two discarded takes). Measuring the whole file
reports the loudness of material the viewer never hears.
"""

import textwrap

import pytest

from video_toolkit import audio_calibrate


LAYERED = textwrap.dedent("""
    export const RemotionRoot: React.FC = () => {
      return (
        <Composition
          defaultProps={{
            reel: {
              version: 'layered-1',
              meta: { topic: 'Školy', totalDurationMs: 72699 },
              tracks: {
                video: [
                  {
                    id: 'seg-001',
                    kind: 'clip',
                    startMs: 0,
                    endMs: 17267,
                    source: 'TH-01_t2_clean.mp4',
                    sourceInMs: 17920,
                    sourceOutMs: 35187,
                    musicBoostDb: 0,
                  },
                  {
                    id: 'seg-002',
                    kind: 'broll',
                    startMs: 17267,
                    endMs: 20267,
                    source: 'BR-01_chodba.mp4',
                    sourceInMs: 0,
                    sourceOutMs: 3000,
                  },
                  {
                    id: 'seg-020',
                    kind: 'clip',
                    startMs: 67366,
                    endMs: 72699,
                    source: 'TH-05_t1_clean.mp4',
                    sourceInMs: 1900,
                    sourceOutMs: 7233,
                    musicBoostDb: 0,
                  },
                ],
                audio: [],
                music: {
                  source: 'audio/bg.mp3',
                  baseVolumeDb: -17,
                },
                overlays: [],
                brand: [],
              },
            },
          }}
        />
      );
    };
""")

LEGACY = textwrap.dedent("""
    export const RemotionRoot: React.FC = () => {
      return (
        <Composition
          defaultProps={{
            topic: 'Mobilita',
            audio: { music: 'audio/bg.mp3', musicVolumeDb: -15 },
            segments: [
              { id: 'seg-001', type: 'clip', source: 'TH-01_t2_clean.mp4', trimIn: 0.85, trimOut: 10.53 },
              { id: 'seg-005', type: 'broll', source: 'BR-02_auta.mp4', trimIn: 10, trimOut: 13.2 },
              { id: 'seg-008', type: 'clip', source: 'TH-02_t2_clean.mp4', trimIn: 15.4, trimOut: 20.9 },
            ],
          }}
        />
      );
    };
""")


def write(tmp_path, text):
    p = tmp_path / "Root.tsx"
    p.write_text(text, encoding="utf-8")
    return p


class TestLayered:
    def test_finds_clip_beds_with_their_source_windows(self, tmp_path):
        beds = audio_calibrate.extract_voice_beds(write(tmp_path, LAYERED))
        assert [(b.source, b.start_ms, b.end_ms) for b in beds] == [
            ("TH-01_t2_clean.mp4", 17920, 35187),
            ("TH-05_t1_clean.mp4", 1900, 7233),
        ]

    def test_skips_broll_because_it_is_not_the_voice(self, tmp_path):
        beds = audio_calibrate.extract_voice_beds(write(tmp_path, LAYERED))
        assert all("BR-" not in b.source for b in beds)

    def test_finds_music_under_tracks(self, tmp_path):
        assert audio_calibrate.extract_music_source(write(tmp_path, LAYERED)) == "audio/bg.mp3"

    def test_reads_base_volume_db(self, tmp_path):
        assert audio_calibrate.extract_current_volume(write(tmp_path, LAYERED)) == -17

    def test_patches_base_volume_db_and_leaves_everything_else(self, tmp_path):
        p = write(tmp_path, LAYERED)
        audio_calibrate.patch_volume(p, -14)
        text = p.read_text(encoding="utf-8")
        assert "baseVolumeDb: -14," in text
        assert "baseVolumeDb: -17," not in text
        assert "musicBoostDb: 0," in text  # must not be mistaken for the music level

    def test_reports_the_field_name_the_project_actually_uses(self, tmp_path):
        """Telling a layered user to look at `musicVolumeDb` sends them hunting
        for a key their Root.tsx does not contain."""
        assert audio_calibrate.volume_field_name(write(tmp_path, LAYERED)) == "baseVolumeDb"


class TestLegacySegments:
    """The old shape still has to work — projects predating the migration."""

    def test_finds_clip_segments(self, tmp_path):
        beds = audio_calibrate.extract_voice_beds(write(tmp_path, LEGACY))
        assert [b.source for b in beds] == ["TH-01_t2_clean.mp4", "TH-02_t2_clean.mp4"]

    def test_measures_whole_file_when_no_window_is_declared(self, tmp_path):
        beds = audio_calibrate.extract_voice_beds(write(tmp_path, LEGACY))
        assert all(b.start_ms is None and b.end_ms is None for b in beds)

    def test_finds_music_and_volume(self, tmp_path):
        p = write(tmp_path, LEGACY)
        assert audio_calibrate.extract_music_source(p) == "audio/bg.mp3"
        assert audio_calibrate.extract_current_volume(p) == -15

    def test_patches_music_volume_db(self, tmp_path):
        p = write(tmp_path, LEGACY)
        audio_calibrate.patch_volume(p, -12)
        assert "musicVolumeDb: -12" in p.read_text(encoding="utf-8")

    def test_reports_the_field_name_the_project_actually_uses(self, tmp_path):
        assert audio_calibrate.volume_field_name(write(tmp_path, LEGACY)) == "musicVolumeDb"


class TestWeighting:
    """A 21s bed and a 5s bed must not count the same.

    LUFS values come in as a list parallel to `beds`, not a mapping keyed by
    filename: one take legitimately backs several beds at different trims
    (pp-program-mobilita cuts back to TH-02_t2 three times), and each of those
    windows has its own loudness.
    """

    def test_mean_is_weighted_by_bed_duration(self):
        beds = [
            audio_calibrate.VoiceBed("long.mp4", 0, 20000),
            audio_calibrate.VoiceBed("short.mp4", 0, 5000),
        ]
        assert audio_calibrate.weighted_mean_lufs(beds, [-20.0, -10.0]) == pytest.approx(-18.0)

    def test_same_source_twice_is_weighted_per_window(self):
        beds = [
            audio_calibrate.VoiceBed("take.mp4", 0, 30000),
            audio_calibrate.VoiceBed("take.mp4", 40000, 50000),
        ]
        assert audio_calibrate.weighted_mean_lufs(beds, [-16.0, -8.0]) == pytest.approx(-14.0)

    def test_unwindowed_beds_fall_back_to_a_plain_mean(self):
        beds = [
            audio_calibrate.VoiceBed("a.mp4", None, None),
            audio_calibrate.VoiceBed("b.mp4", None, None),
        ]
        assert audio_calibrate.weighted_mean_lufs(beds, [-20.0, -10.0]) == pytest.approx(-15.0)
