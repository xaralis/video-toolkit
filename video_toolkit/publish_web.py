#!/usr/bin/env python3
"""Publish a project's final deliverables to the PUBLIC R2 bucket for web serving.

Copies out/intro.mp4 + out/intro.vtt (or any --files) into a separate PUBLIC
bucket (kept apart from the private ops bucket that holds raw footage), with the
correct Content-Type, then prints the public URLs + a ready <video> embed.

Config (in .env, or override via flags):
  R2_PUBLIC_BUCKET     name of the public delivery bucket (e.g. my-brand-web-media)
  R2_PUBLIC_BASE_URL   custom-domain base, e.g. https://media.example.com
  (reuses R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY for auth —
   the API token must have write access to the public bucket too.)

Usage:
  python3 tools/publish_web.py my-video
  python3 tools/publish_web.py my-video --files out/intro.mp4,out/intro.vtt
  python3 tools/publish_web.py my-video --prefix intro --bucket my-brand-web-media \
      --base-url https://media.example.com
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

import boto3
from botocore.config import Config

REPO_ROOT = Path(__file__).resolve().parent.parent

CONTENT_TYPES = {
    ".mp4": "video/mp4",
    ".vtt": "text/vtt",
    ".srt": "application/x-subrip",
    ".mp3": "audio/mpeg",
    ".webm": "video/webm",
    ".png": "image/png",
    ".jpg": "image/jpeg",
}
# web-program-intro deliverables: video (two renditions) + captions + poster
# (website <video> needs a poster frame shown before playback). The poster is
# auto-generated from the video's first frame if it doesn't exist yet.
DEFAULT_FILES = [
    "out/web/intro.mp4",
    "out/web/intro-720.mp4",
    "out/intro.vtt",
    "out/intro-poster.jpg",
]
POSTER_FROM = {"out/intro-poster.jpg": "out/intro.mp4"}  # poster ← first frame of this video

# Web renditions, derived from the high-bitrate master `out/intro.mp4`.
# The Remotion render is a ~16 Mbps archival-grade file — publishing it raw
# made low-end phones stutter (network starvation + decode pressure). Encode
# real web deliverables instead: a capped 1080p primary and a 720p rendition
# the website serves to small viewports / frame-dropping devices.
# `out_range=tv` normalizes the master's full-range (yuvj420p) signal to the
# limited-range yuv420p that every mobile hardware decoder handles correctly;
# `in_range` is auto-detected from the input flags so an already-limited
# master passes through untouched.
WEB_MASTER = "out/intro.mp4"
WEB_RENDITIONS = {
    "out/web/intro.mp4": [
        "-vf", "scale=in_range=auto:out_range=tv",
        "-c:v", "libx264", "-preset", "slow", "-crf", "22",
        "-maxrate", "4.5M", "-bufsize", "9M",
        "-pix_fmt", "yuv420p", "-color_range", "tv",
        "-profile:v", "high", "-level", "4.0",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
    ],
    "out/web/intro-720.mp4": [
        "-vf", "scale=-2:720:in_range=auto:out_range=tv",
        "-c:v", "libx264", "-preset", "slow", "-crf", "23",
        "-maxrate", "2.2M", "-bufsize", "4.4M",
        "-pix_fmt", "yuv420p", "-color_range", "tv",
        "-profile:v", "high", "-level", "3.1",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
    ],
}


def ensure_web_rendition(proj: Path, rel: str) -> None:
    """Encode a web rendition from the master if missing or stale."""
    spec = WEB_RENDITIONS.get(rel)
    if spec is None:
        return
    src = proj / WEB_MASTER
    dst = proj / rel
    if not src.is_file():
        return
    if dst.is_file() and dst.stat().st_mtime >= src.stat().st_mtime:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"  encoding web rendition: {rel} (from {WEB_MASTER}) ...")
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src), *spec, str(dst)],
        check=True,
    )
    size_mb = dst.stat().st_size / 1e6
    print(f"  encoded {rel}  ({size_mb:.1f} MB)")


def ensure_poster(proj: Path, rel: str) -> None:
    """If a poster file is requested but missing, grab the source video's first frame."""
    if rel not in POSTER_FROM:
        return
    dst = proj / rel
    if dst.is_file():
        return
    src = proj / POSTER_FROM[rel]
    if not src.is_file():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    # first frame, full resolution, high quality
    subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", str(src),
         "-frames:v", "1", "-q:v", "2", str(dst)],
        check=True,
    )
    print(f"  generated poster (first frame): {rel}")


def load_env() -> None:
    env = REPO_ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
    )


def main() -> int:
    load_env()
    ap = argparse.ArgumentParser(description="Publish project finals to the public R2 bucket.")
    ap.add_argument("project", help="Project name under projects/")
    ap.add_argument("--files", help="Comma-separated paths relative to the project (default: out/intro.mp4,out/intro.vtt)")
    ap.add_argument("--prefix", help="Key prefix in the public bucket (default: project name)")
    ap.add_argument("--bucket", default=os.environ.get("R2_PUBLIC_BUCKET"))
    ap.add_argument("--base-url", default=os.environ.get("R2_PUBLIC_BASE_URL"))
    ap.add_argument("--cache-seconds", type=int, default=3600, help="Cache-Control max-age (default 3600)")
    args = ap.parse_args()

    if not args.bucket:
        print("ERROR: no public bucket. Set R2_PUBLIC_BUCKET in .env or pass --bucket.", file=sys.stderr)
        return 2
    if not args.base_url:
        print("ERROR: no public base URL. Set R2_PUBLIC_BASE_URL in .env or pass --base-url.", file=sys.stderr)
        return 2

    proj = REPO_ROOT / "projects" / args.project
    if not proj.is_dir():
        print(f"ERROR: project not found: {proj}", file=sys.stderr)
        return 2

    prefix = (args.prefix or args.project).strip("/")
    base = args.base_url.rstrip("/")
    files = [f.strip() for f in (args.files.split(",") if args.files else DEFAULT_FILES)]

    s3 = client()
    published = []
    for rel in files:
        ensure_poster(proj, rel)
        ensure_web_rendition(proj, rel)
        src = proj / rel
        if not src.is_file():
            print(f"  skip (missing): {rel}", file=sys.stderr)
            continue
        key = f"{prefix}/{src.name}"
        ctype = CONTENT_TYPES.get(src.suffix.lower(), "application/octet-stream")
        s3.upload_file(
            str(src), args.bucket, key,
            ExtraArgs={"ContentType": ctype, "CacheControl": f"public, max-age={args.cache_seconds}"},
        )
        url = f"{base}/{key}"
        print(f"  published {rel}  ->  {url}  ({ctype})")
        published.append((src.suffix.lower(), url))

    mp4s = [u for ext, u in published if ext == ".mp4"]
    mp4 = next((u for u in mp4s if "-720" not in u), mp4s[0] if mp4s else None)
    mp4_720 = next((u for u in mp4s if "-720" in u), None)
    vtt = next((u for ext, u in published if ext == ".vtt"), None)
    poster = next((u for ext, u in published if ext in (".jpg", ".png", ".webp")), None)
    if mp4:
        print("\n<video> embed:\n")
        poster_attr = f' poster="{poster}"' if poster else ""
        print(f'<video src="{mp4}"{poster_attr} crossorigin="anonymous" controls playsinline>')
        if vtt:
            print(f'  <track src="{vtt}" kind="subtitles" srclang="cs" label="Čeština" default>')
        print("</video>")
        if mp4_720:
            print(f"\nwebsite heroVideo frontmatter: src: {mp4}")
            print(f"                               srcMobile: {mp4_720}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
