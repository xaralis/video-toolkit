# Tools Reference — CLI Cheat Sheet

CLI examples for every Python tool in `tools/`. This file is a backup
reference; the canonical source for each tool is its own `--help` output
and (where it exists) the corresponding skill in `.claude/skills/`. Use
this file when you want a single-page lookup of common invocations.

See also: `_internal/toolkit-registry.json` (`tools` section) for
structured metadata — descriptions, options, presets, env vars.

## Setup

```bash
pip install -r tools/requirements.txt
```

**Important: always invoke tools from the toolkit root directory.** When
working inside a project (`projects/my-video/`), tool paths like
`python3 tools/upscale.py` will fail because `tools/` is relative.
Always use:

```bash
cd /path/to/claude-code-video-toolkit && python3 tools/upscale.py ...
```

This is especially critical for background commands where the working
directory may not be obvious.

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
python3 tools/sync_template.py <project> --dry-run          # preview (writes nothing)
python3 tools/sync_template.py <project>                    # sync
python3 tools/sync_template.py <project> --template <name>  # if project.json has no `template`
python3 tools/sync_template.py <project> --strict           # also delete files the template dropped
```

`src/Root.tsx` and `src/config/demo.config.json` are **project-owned and never written** (they are
the project's actual cut) — reported as `preserved`. Compares by content hash; idempotent.
**Never run it on a finished project.** See `/sync-template` for the full workflow.

Brand assets have the same snapshot model — mirrored by copy, not linked:

```bash
python3 tools/sync_brand_assets.py <project> --dry-run
```

## Voiceover Generation

```bash
# Per-scene generation (recommended)
python tools/voiceover.py --scene-dir public/audio/scenes --json

# Using Qwen3-TTS (self-hosted, free alternative to ElevenLabs)
python tools/voiceover.py --provider qwen3 --tone warm --scene-dir public/audio/scenes --json

# Single file (legacy)
python tools/voiceover.py --script SCRIPT.md --output out.mp3
```

## Timing Sync (after voiceover)

```bash
python3 tools/sync_timing.py                          # Dry run comparison
python3 tools/sync_timing.py --apply                  # Update config (1s default padding)
python3 tools/sync_timing.py --apply --padding 1.5    # Custom padding
python3 tools/sync_timing.py --voiceover-json vo.json # Use voiceover.py output
python3 tools/sync_timing.py --json                   # Machine-readable output
```

## Qwen3-TTS (Standalone)

```bash
python tools/qwen3_tts.py --text "Hello world" --speaker Ryan --output hello.mp3
python tools/qwen3_tts.py --text "Hello world" --tone warm --output hello.mp3
python tools/qwen3_tts.py --text "Hello" --instruct "Speak enthusiastically" --output excited.mp3
python tools/qwen3_tts.py --text "Hello" --ref-audio sample.wav --ref-text "transcript" --output cloned.mp3
python tools/qwen3_tts.py --list-voices   # 9 speakers: Ryan, Aiden, Vivian, etc.
python tools/qwen3_tts.py --list-tones    # neutral, warm, professional, excited, etc.
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
python tools/image_edit.py --setup
python tools/upscale.py --setup
python tools/qwen3_tts.py --setup
python tools/music_gen.py --setup

# --- Modal setup (deploy each app you need) ---
pip install modal && python3 -m modal setup
modal deploy docker/modal-upscale/app.py        # Then save URL to .env
modal deploy docker/modal-image-edit/app.py
# See docs/modal-setup.md for full guide
```

## AI Image Editing

```bash
# Image editing (Qwen-Image-Edit)
python tools/image_edit.py --input photo.jpg --prompt "Add sunglasses"
python tools/image_edit.py --input photo.jpg --prompt "Add sunglasses" --cloud modal
python tools/image_edit.py --input photo.jpg --style cyberpunk
python tools/image_edit.py --input photo.jpg --background office
python tools/image_edit.py --list-presets  # Full preset list

# Upscaling (RealESRGAN)
python tools/upscale.py --input photo.jpg --output photo_4x.png --cloud runpod
python tools/upscale.py --input photo.jpg --scale 2 --model anime --face-enhance --cloud runpod
```

See `docs/qwen-edit-patterns.md` and `.claude/skills/qwen-edit/` for
prompting guidance.

## AI Music Generation (ACE-Step 1.5)

Default provider is **acemusic** (official cloud API, free key from
[acemusic.ai/api-key](https://acemusic.ai/api-key)). Uses XL Turbo 4B
model with 5Hz LM thinking mode. Falls back to Modal/RunPod for
self-hosted 2B model.

```bash
# Background music (acemusic cloud API by default)
python tools/music_gen.py --prompt "Upbeat tech corporate" --duration 60 --bpm 128 --key "G Major" --output music.mp3

# Generate 4 variations, pick the best
python tools/music_gen.py --prompt "Subtle corporate tech" --duration 60 --variations 4 --output bg.mp3

# Fast mode (disable thinking)
python tools/music_gen.py --no-thinking --prompt "Quick draft" --duration 30 --output draft.mp3

# Scene presets for video production
python tools/music_gen.py --preset corporate-bg --duration 60 --output bg.mp3
python tools/music_gen.py --preset tension --duration 20 --output problem.mp3
python tools/music_gen.py --preset cta --brand my-brand --output cta.mp3

# Song with vocals and lyrics (use structure tags for sections)
python tools/music_gen.py \
  --prompt "Indie pop anthem, male vocal, bright guitar, studio polish" \
  --lyrics "[Verse]\nWalking through the morning light\nCoffee in my hand feels right\n\n[Chorus - anthemic]\nWE KEEP MOVING FORWARD\nThrough the noise and doubt\n\n[Outro - fade]\n(Moving forward...)" \
  --duration 60 --bpm 128 --key "G Major" --output song.mp3

# Cover / style transfer
python tools/music_gen.py --cover --reference theme.mp3 --prompt "Jazz piano version" --output cover.mp3

# Repaint a weak section (acemusic only)
python tools/music_gen.py --repaint --input track.mp3 --repaint-start 15 --repaint-end 25 --prompt "Guitar solo" --output fixed.mp3

# Continue from existing audio (acemusic only)
python tools/music_gen.py --continuation --input track.mp3 --prompt "Continue with jazz piano" --output extended.mp3

# Stem extraction
python tools/music_gen.py --extract vocals --input mixed.mp3 --output vocals.mp3

# Fall back to self-hosted
python tools/music_gen.py --cloud modal --prompt "Background music" --duration 60 --output bg.mp3

# List presets
python tools/music_gen.py --list-presets
```

8 scene presets: `corporate-bg`, `upbeat-tech`, `ambient`, `dramatic`,
`tension`, `hopeful`, `cta`, `lofi`. See `.claude/skills/acestep/` for
prompt engineering patterns and video production integration guide.

## Watermark Removal

```bash
# Locate watermark coordinates
python tools/locate_watermark.py --input video.mp4 --grid --output-dir ./review/
python tools/locate_watermark.py --input video.mp4 --preset notebooklm --verify

# Remove watermark (RunPod)
python tools/dewatermark.py --input video.mp4 --region 1080,660,195,40 --output clean.mp4 --runpod
python tools/dewatermark.py --setup  # One-time setup
```

**Workflow:** grid overlay → note coordinates → verify with `--region` →
remove with dewatermark.

**Local mode** requires NVIDIA GPU (8GB+ VRAM). Mac users should use
`--runpod`.

## Transcription

Whisper transcription via Modal (Czech-first, language-agnostic):

```bash
# Transcribe multiple files with Czech language
python3 tools/transcribe.py public/recordings/*.mp4 --language cs

# Single file with explicit output
python3 tools/transcribe.py recording.mp4 --output transcript.json

# List available languages
python3 tools/transcribe.py --list-languages
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
python3 tools/export_vtt.py <project-name>
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
python3 tools/render_screenplay_html.py <project-name>
python3 tools/render_screenplay_html.py --all
```

**Pravidlo:** kdykoli upravíš `SCREENPLAY.md`, spusť tento tool a commitni
oba soubory (.md i .html) společně. HTML zůstává v gitu, aby ho kolegové
mohli otevřít bez dalších kroků.
