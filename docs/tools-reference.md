# Tools Reference — CLI Cheat Sheet

CLI examples for every Python tool in `video_toolkit/`. This file is a backup
reference; the canonical source for each tool is its own `--help` output
and (where it exists) the corresponding skill in `skills/`. Use
this file when you want a single-page lookup of common invocations.

See also: `_internal/toolkit-registry.json` (`tools` section) for
structured metadata — descriptions, options, presets, env vars.

## Setup

```bash
pip install -e .
```

This installs `video_toolkit` as a package (pulling in
`video_toolkit/requirements.txt` via `pyproject.toml`), so every tool is
invocable by name — `python3 -m video_toolkit.upscale ...` — from any
working directory, including from inside a project (`projects/my-video/`)
or from a background command.

## Tool Categories

| Type | Tools | When to Use |
|------|-------|-------------|
| **Project tools** | voiceover, music_gen, sfx, sync_timing | During video creation workflow |
| **Sync tools** | sync_template, sync_brand_assets, sync_project | Keep a project's vendored code / brand assets / heavy media up to date |
| **Utility tools** | addmusic, locate_watermark | Quick transformations on existing videos |
| **Cloud GPU** | image_edit, upscale, dewatermark, qwen3_tts, music_gen, flux2 | AI processing via RunPod or Modal (`--cloud runpod\|modal`) |

Utility tools work on any video file without requiring a project
structure.

## Template sync (vendored src)

Projects **vendor** their template's `src/` — a project is a self-contained snapshot, so a later
toolkit upgrade can't break a finished render. To pull a template fix into an **in-progress** project:

```bash
python3 -m video_toolkit.sync_template <project> --dry-run          # preview (writes nothing)
python3 -m video_toolkit.sync_template <project>                    # sync
python3 -m video_toolkit.sync_template <project> --template <name>  # if project.json has no `template`
python3 -m video_toolkit.sync_template <project> --strict           # also delete files the template dropped
```

`src/Root.tsx` and `src/config/demo.config.json` are **project-owned and never written** (they are
the project's actual cut) — reported as `preserved`. Compares by content hash; idempotent.
**Never run it on a finished project.** See `/sync-template` for the full workflow.

Brand assets have the same snapshot model — mirrored by copy, not linked:

```bash
python3 -m video_toolkit.sync_brand_assets <project> --dry-run
```

## Voiceover Generation

```bash
# Per-scene generation (recommended)
python3 -m video_toolkit.voiceover --scene-dir public/audio/scenes --json

# Using Qwen3-TTS (self-hosted, free alternative to ElevenLabs)
python3 -m video_toolkit.voiceover --provider qwen3 --tone warm --scene-dir public/audio/scenes --json

# Single file (legacy)
python3 -m video_toolkit.voiceover --script SCRIPT.md --output out.mp3
```

## Timing Sync (after voiceover)

```bash
python3 -m video_toolkit.sync_timing                          # Dry run comparison
python3 -m video_toolkit.sync_timing --apply                  # Update config (1s default padding)
python3 -m video_toolkit.sync_timing --apply --padding 1.5    # Custom padding
python3 -m video_toolkit.sync_timing --voiceover-json vo.json # Use voiceover.py output
python3 -m video_toolkit.sync_timing --json                   # Machine-readable output
```

## Qwen3-TTS (Standalone)

```bash
python3 -m video_toolkit.qwen3_tts --text "Hello world" --speaker Ryan --output hello.mp3
python3 -m video_toolkit.qwen3_tts --text "Hello world" --tone warm --output hello.mp3
python3 -m video_toolkit.qwen3_tts --text "Hello" --instruct "Speak enthusiastically" --output excited.mp3
python3 -m video_toolkit.qwen3_tts --text "Hello" --ref-audio sample.wav --ref-text "transcript" --output cloned.mp3
python3 -m video_toolkit.qwen3_tts --list-voices   # 9 speakers: Ryan, Aiden, Vivian, etc.
python3 -m video_toolkit.qwen3_tts --list-tones    # neutral, warm, professional, excited, etc.
```

Temperature controls expressiveness: `--temperature 1.2` (more
expressive) or `--temperature 0.4` (more consistent).

## Cloud GPU Providers

All cloud GPU tools support two providers via `--cloud runpod|modal`.
RunPod is the default. Modal was added as a reliability fallback after
RunPod outages, and offers faster cold starts.

```bash
# --- RunPod setup (automated, one-time per tool) ---
echo "RUNPOD_API_KEY=your_key_here" >> .env
python3 -m video_toolkit.image_edit --setup
python3 -m video_toolkit.upscale --setup
python3 -m video_toolkit.qwen3_tts --setup
python3 -m video_toolkit.music_gen --setup

# --- Modal setup (deploy each app you need) ---
pip install modal && python3 -m modal setup
modal deploy docker/modal-upscale/app.py        # Then save URL to .env
modal deploy docker/modal-image-edit/app.py
# See docs/modal-setup.md for full guide
```

## AI Image Editing

```bash
# Image editing (Qwen-Image-Edit)
python3 -m video_toolkit.image_edit --input photo.jpg --prompt "Add sunglasses"
python3 -m video_toolkit.image_edit --input photo.jpg --prompt "Add sunglasses" --cloud modal
python3 -m video_toolkit.image_edit --input photo.jpg --style cyberpunk
python3 -m video_toolkit.image_edit --input photo.jpg --background office
python3 -m video_toolkit.image_edit --list-presets  # Full preset list

# Upscaling (RealESRGAN)
python3 -m video_toolkit.upscale --input photo.jpg --output photo_4x.png --cloud runpod
python3 -m video_toolkit.upscale --input photo.jpg --scale 2 --model anime --face-enhance --cloud runpod
```

See `docs/qwen-edit-patterns.md` and `skills/qwen-edit/` for
prompting guidance.

## AI Music Generation (ACE-Step 1.5)

Default provider is **acemusic** (official cloud API, free key from
[acemusic.ai/api-key](https://acemusic.ai/api-key)). Uses XL Turbo 4B
model with 5Hz LM thinking mode. Falls back to Modal/RunPod for
self-hosted 2B model.

```bash
# Background music (acemusic cloud API by default)
python3 -m video_toolkit.music_gen --prompt "Upbeat tech corporate" --duration 60 --bpm 128 --key "G Major" --output music.mp3

# Generate 4 variations, pick the best
python3 -m video_toolkit.music_gen --prompt "Subtle corporate tech" --duration 60 --variations 4 --output bg.mp3

# Fast mode (disable thinking)
python3 -m video_toolkit.music_gen --no-thinking --prompt "Quick draft" --duration 30 --output draft.mp3

# Scene presets for video production
python3 -m video_toolkit.music_gen --preset corporate-bg --duration 60 --output bg.mp3
python3 -m video_toolkit.music_gen --preset tension --duration 20 --output problem.mp3
python3 -m video_toolkit.music_gen --preset cta --brand my-brand --output cta.mp3

# Song with vocals and lyrics (use structure tags for sections)
python3 -m video_toolkit.music_gen \
  --prompt "Indie pop anthem, male vocal, bright guitar, studio polish" \
  --lyrics "[Verse]\nWalking through the morning light\nCoffee in my hand feels right\n\n[Chorus - anthemic]\nWE KEEP MOVING FORWARD\nThrough the noise and doubt\n\n[Outro - fade]\n(Moving forward...)" \
  --duration 60 --bpm 128 --key "G Major" --output song.mp3

# Cover / style transfer
python3 -m video_toolkit.music_gen --cover --reference theme.mp3 --prompt "Jazz piano version" --output cover.mp3

# Repaint a weak section (acemusic only)
python3 -m video_toolkit.music_gen --repaint --input track.mp3 --repaint-start 15 --repaint-end 25 --prompt "Guitar solo" --output fixed.mp3

# Continue from existing audio (acemusic only)
python3 -m video_toolkit.music_gen --continuation --input track.mp3 --prompt "Continue with jazz piano" --output extended.mp3

# Stem extraction
python3 -m video_toolkit.music_gen --extract vocals --input mixed.mp3 --output vocals.mp3

# Fall back to self-hosted
python3 -m video_toolkit.music_gen --cloud modal --prompt "Background music" --duration 60 --output bg.mp3

# List presets
python3 -m video_toolkit.music_gen --list-presets
```

8 scene presets: `corporate-bg`, `upbeat-tech`, `ambient`, `dramatic`,
`tension`, `hopeful`, `cta`, `lofi`. See `skills/acestep/` for
prompt engineering patterns and video production integration guide.

## Watermark Removal

```bash
# Locate watermark coordinates
python3 -m video_toolkit.locate_watermark --input video.mp4 --grid --output-dir ./review/
python3 -m video_toolkit.locate_watermark --input video.mp4 --preset notebooklm --verify

# Remove watermark (RunPod)
python3 -m video_toolkit.dewatermark --input video.mp4 --region 1080,660,195,40 --output clean.mp4 --runpod
python3 -m video_toolkit.dewatermark --setup  # One-time setup
```

**Workflow:** grid overlay → note coordinates → verify with `--region` →
remove with dewatermark.

**Local mode** requires NVIDIA GPU (8GB+ VRAM). Mac users should use
`--runpod`.

## Transcription

Whisper transcription via Modal (Czech-first, language-agnostic):

```bash
# Transcribe multiple files with Czech language
python3 -m video_toolkit.transcribe public/recordings/*.mp4 --language cs

# Single file with explicit output
python3 -m video_toolkit.transcribe recording.mp4 --output transcript.json

# List available languages
python3 -m video_toolkit.transcribe --list-languages
```

Used by `campaign-reels` to drive auto-generated captions. Word-level
timestamps. Modal-deployed; cold start ~30-60s, warm ~10-20s per 5-min
clip.

## WebVTT export (web-program-intro)

Wraps `transcribe.py` and chunks word-level transcripts into short
single-line WebVTT cues. Output is text-only — no positioning cue
settings — because the website draws the caption layer itself via
`VideoHeroOverlay.tsx`. Reference format:
`media.example.com/public/video/intro-hero-mockup.en.vtt`.

```bash
python3 -m video_toolkit.export_vtt <project-name>
# defaults: --max-chars 28, --max-cue-sec 2.0
# input:   projects/<name>/out/intro.mp4
# output:  projects/<name>/out/intro.vtt
# hint:    projects/<name>/SCREENPLAY.md is used as Whisper initial_prompt
```

After running, manually post-edit the `.vtt` to fix any remaining
proper-noun errors (~2-3 cues per video typically).

## SCREENPLAY HTML preview

Renderuje `projects/<name>/SCREENPLAY.md` do čitelného self-contained
`SCREENPLAY.html` přes pandoc s embedded CSS (A4-friendly print + obrazovka).
Posílat kolegům co nemají rádi raw markdown.

```bash
python3 -m video_toolkit.render_screenplay_html <project-name>
python3 -m video_toolkit.render_screenplay_html --all
```

**Pravidlo:** kdykoli upravíš `SCREENPLAY.md`, spusť tento tool a commitni
oba soubory (.md i .html) společně. HTML zůstává v gitu, aby ho kolegové
mohli otevřít bez dalších kroků.
