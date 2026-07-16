import subprocess, os, tempfile, json
from tools.ingest_media import probe_media, ingest

def _make_video(path, w, h, rotate_meta=0, secs=2):
    cmd = ["ffmpeg","-y","-f","lavfi","-i",f"testsrc=size={w}x{h}:rate=30:duration={secs}"]
    if rotate_meta:
        cmd += ["-metadata:s:v:0", f"rotate={rotate_meta}"]
    cmd += ["-pix_fmt","yuv420p"]
    if rotate_meta:
        # The legacy `-metadata:s:v:0 rotate=` tag above is kept for
        # compatibility with tools that still read it, but modern ffmpeg's
        # mov/mp4 muxer (verified on 7.1.1) no longer auto-converts it into
        # a display-matrix / readable tag on encode -- ffprobe finds no
        # rotation at all from that alone. Also insert a real H.264 SEI
        # display-orientation NAL via the h264_metadata bitstream filter,
        # which is how real phone/camera footage typically signals
        # rotation and is reliably readable via ffprobe frame side_data.
        cmd += ["-bsf:v", f"h264_metadata=display_orientation=insert:rotate={rotate_meta}"]
    cmd += [path]
    subprocess.run(cmd, check=True, capture_output=True)

def test_probe_landscape_video():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d,"land.mp4"); _make_video(p, 1024, 576)
        r = probe_media(p)
    assert r["type"] == "video"
    assert r["orientation"] == "landscape"
    assert r["width"] == 1024 and r["height"] == 576

def test_ingest_bakes_rotation_to_upright():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d,"rot.mp4"); _make_video(p, 1024, 576, rotate_meta=-90)
        out = os.path.join(d,"manifest.json")
        m = ingest(d, out)
        entry = [e for e in m["media"] if "rot" in e["file"]][0]
    # after bake, display orientation is portrait and no rotation remains
    assert entry["orientation"] == "portrait"
    assert entry["rotation"] == 0
    assert entry["file"].endswith("_upright.mp4")

def test_ingest_is_idempotent_across_reruns():
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d,"rot.mp4"); _make_video(p, 1024, 576, rotate_meta=-90)
        out = os.path.join(d,"manifest.json")
        m1 = ingest(d, out)
        m2 = ingest(d, out)
    assert len(m1["media"]) == len(m2["media"])
    entry2 = [e for e in m2["media"] if "rot" in e["file"]]
    assert len(entry2) == 1
    assert entry2[0]["file"].endswith("_upright.mp4")
    assert entry2[0]["rotation"] == 0

def test_ingest_skips_corrupt_file_without_aborting_batch():
    with tempfile.TemporaryDirectory() as d:
        good = os.path.join(d,"good.mp4"); _make_video(good, 640, 480)
        bad = os.path.join(d,"bad.mp4")
        with open(bad, "w") as f:
            f.write("this is not a video file, just text")
        out = os.path.join(d,"manifest.json")
        m = ingest(d, out)
    files = [e["file"] for e in m["media"]]
    assert "good.mp4" in files
    assert "bad.mp4" not in files
    assert len(m["media"]) == 1
