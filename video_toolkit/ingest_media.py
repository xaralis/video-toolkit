"""Scan media dir, probe dims/rotation, bake video rotation, emit manifest."""
import argparse, json, os, subprocess, sys

PHOTO_EXT = {".jpg", ".jpeg", ".png", ".webp"}
VIDEO_EXT = {".mp4", ".mov", ".m4v"}

def _ffprobe(path):
    out = subprocess.run(
        ["ffprobe","-v","error","-select_streams","v:0",
         "-show_entries","stream=width,height,duration:stream_tags=rotate:stream_side_data_list:format=duration",
         "-of","json", path],
        check=True, capture_output=True, text=True).stdout
    return json.loads(out)

def _frame_rotation(path):
    # Fallback source: some encoders (e.g. the H.264 SEI display-orientation
    # message used by many phone/camera pipelines) only expose rotation as
    # per-frame side data, not at the stream/container level. Read just the
    # first frame (read_intervals limits decode cost) to check.
    # Note: `-show_entries frame=side_data_list` truncates the nested
    # side_data fields (rotation, displaymatrix) down to empty objects on
    # ffprobe 7.1 -- only the unfiltered `-show_frames` expands them, so we
    # use that here despite pulling a few extra fields we don't need.
    out = subprocess.run(
        ["ffprobe","-v","error","-select_streams","v:0",
         "-show_frames",
         "-read_intervals","%+#1",
         "-of","json", path],
        capture_output=True, text=True).stdout
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return 0
    for fr in data.get("frames", []) or []:
        for sd in fr.get("side_data_list", []) or []:
            if "rotation" in sd:
                return int(sd["rotation"])
    return 0

def _rotation(meta, path=None):
    # Rotation can be signalled three different ways depending on the
    # encoder/muxer that produced the file. Check them in order of
    # reliability: container-level side data (e.g. QuickTime tkhd display
    # matrix -- what real footage in this project carries), then the
    # legacy `rotate` stream tag some tools still write, then per-frame
    # side data (e.g. H.264 SEI display-orientation) as a last resort.
    st = (meta.get("streams") or [{}])[0]
    for sd in st.get("side_data_list", []) or []:
        if "rotation" in sd:
            return int(sd["rotation"])
    tag = st.get("tags", {}).get("rotate")
    if tag not in (None, ""):
        try:
            return int(tag)
        except ValueError:
            pass
    if path is not None:
        return _frame_rotation(path)
    return 0

def probe_media(path):
    ext = os.path.splitext(path)[1].lower()
    typ = "photo" if ext in PHOTO_EXT else "video"
    meta = _ffprobe(path)
    st = meta["streams"][0]
    w, h = int(st["width"]), int(st["height"])
    rot = _rotation(meta, path) if typ == "video" else 0
    if abs(rot) == 90:  # rotation swaps display dims
        w, h = h, w
    dur = float(st.get("duration") or meta.get("format",{}).get("duration") or 0)
    return {
        "file": os.path.basename(path), "type": typ,
        "width": w, "height": h,
        "orientation": "portrait" if h >= w else "landscape",
        "durationSec": round(dur, 3), "rotation": rot,
    }

def bake_rotation(path, out_path):
    # ffmpeg's decoder auto-detects rotation metadata -- however the source
    # signals it (container-level display matrix, H.264 SEI display-
    # orientation, etc.) -- and inserts the matching transpose/flip filter
    # by default (autorotate is on unless disabled), producing upright
    # pixels with the rotation side data consumed and cleared in the
    # process. A plain re-encode is therefore enough to "bake" the
    # rotation; it's also more robust than picking a transpose direction
    # from the sign of a rotation value ourselves, since:
    #   - manually replicating the rotation with our own -vf transpose
    #     while autorotate is still active double-rotates the frame
    #   - disabling autorotate (-noautorotate) and transposing ourselves
    #     fixes the pixels but leaves the original rotation side data
    #     dangling on the output stream (movenc carries it through from
    #     the decoded frame), which players/decoders that honor it would
    #     then apply a second time on top of already-upright pixels
    #   - relying on autorotate sidesteps both failure modes and also
    #     generalizes beyond +/-90 degrees
    subprocess.run(
        # -autorotate is a boolean flag (no value) in ffmpeg's CLI parser --
        # passing "-autorotate 1" makes ffmpeg treat the "1" as a stray
        # extra output filename and fail. Bare -autorotate pins the
        # already-default-on behavior explicitly.
        ["ffmpeg","-y","-autorotate","-i",path,
         "-metadata:s:v:0","rotate=0","-c:a","copy","-pix_fmt","yuv420p", out_path],
        check=True, capture_output=True)

def ingest(media_dir, out):
    media = []
    for name in sorted(os.listdir(media_dir)):
        ext = os.path.splitext(name)[1].lower()
        if ext not in PHOTO_EXT | VIDEO_EXT: continue
        # Skip our own baked-rotation outputs from a prior run: on a re-run
        # over the same dir, os.listdir sees both the original rotated video
        # and the "<name>_upright.mp4" this loop produced for it earlier.
        # Without this guard both get probed and appended, duplicating the
        # manifest entry (and inflating "ingested N files" counts) every time
        # ingest() runs again -- which a re-ingest does on every invocation.
        if name.endswith("_upright.mp4"): continue
        path = os.path.join(media_dir, name)
        try:
            info = probe_media(path)
            if info["type"] == "video" and info["rotation"] != 0:
                up = os.path.join(media_dir, os.path.splitext(name)[0] + "_upright.mp4")
                bake_rotation(path, up)
                info = probe_media(up)  # re-probe baked; trust whatever it finds
                if info["rotation"] != 0:
                    print(f"WARNING: bake left residual rotation={info['rotation']} on {info['file']}", file=sys.stderr)
        except (subprocess.CalledProcessError, ValueError, KeyError, IndexError) as e:
            print(f"WARNING: skipping {name}: {e}", file=sys.stderr)
            continue
        media.append(info)
    data = {"media": media}
    with open(out, "w") as f:
        json.dump(data, f, indent=2)
    print(f"ingested {len(media)} files -> {out}")
    return data

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("media_dir")
    ap.add_argument("--out", default="media-manifest.json")
    a = ap.parse_args()
    ingest(a.media_dir, a.out)

if __name__ == "__main__":
    main()
