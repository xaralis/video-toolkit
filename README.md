# claude-code-video-toolkit

<p align="center">
  <img src="assets/banner/toolkit-banner.gif" alt="claude-code-video-toolkit — NARRATE ▸ SCORE ▸ GENERATE ▸ COMPOSE ▸ RENDER" width="960" />
</p>

[![GitHub release](https://img.shields.io/github/v/release/xaralis/video-toolkit)](https://github.com/xaralis/video-toolkit/releases)

> **Derived from [digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit)** (MIT, © 2024 Digital Samba) — see [LICENSE](LICENSE). This repo trims that toolkit to a content-gen core and restructures it as a shared submodule for per-brand repos; the upstream project remains the original.

An AI-native video production workspace for [Claude Code](https://claude.ai/code), with experimental bridges to other agent runtimes like [Codex](#using-with-codex). Skills, commands, templates, and tools that give your AI agent everything it needs to help you create professional videos — from concept to final render.

**This repo is the shared core toolkit** — templates, shared `lib/` components, Python tools, Claude Code skills/commands, and docs. It ships no brand identity and no video projects of its own (`brands/default` is a neutral scaffold, not a real brand). Real brand profiles and video projects live in separate per-brand repos, each vendoring this repo as a `toolkit/` git submodule — see [Project Structure](#project-structure) below.

## Create a new brand repo

You do **not** clone this core or wire up submodules by hand. From an empty directory name, run:

```bash
npx github:xaralis/video-toolkit init my-brand-videos
```

This scaffolds a ready-to-use brand repo: the toolkit vendored as a `toolkit/` submodule, a
`workspace.json` marker, a starter brand copied from the neutral default, the `projects/` folder,
and `.claude/settings.json` that pre-enables the `toolkit@video-toolkit` plugin. It then installs
the Python toolkit into `.venv`. Node 18+ and git are required (both are already needed to render).

When it finishes, `cd` into the new directory and **launch Claude Code** (`claude`) — the
`/toolkit:*` slash commands live inside Claude Code. Then run `/toolkit:brand` to fill in your
colors/fonts/voice and `/toolkit:video` to start your first video.

## Quick Start

```bash
git clone https://github.com/xaralis/video-toolkit.git
cd video-toolkit
python3 -m venv .venv && .venv/bin/pip install -e .   # Python 3.13+ (3.14 preferred)
claude plugin install toolkit@video-toolkit           # load the /toolkit:* slash commands
claude                                                # Open Claude Code in the toolkit
```

Then in Claude Code:

```
/toolkit:setup            # Configure cloud GPU, storage, voice (~5 min, mostly free)
/toolkit:video            # Create your first video
```

**That's it.** `/toolkit:setup` walks you through everything interactively — cloud GPU provider, file transfer, voice config. `/toolkit:video` creates a project from a template and guides you through the whole workflow.

The commands ship as a **Claude Code plugin**: this repo is both the toolkit and the plugin (`commands/` + `skills/` at the root, declared by `.claude-plugin/`). `claude plugin install toolkit@video-toolkit` is what turns them into working slash commands — without it they report "Unknown command". A per-brand repo consumes the exact same plugin by vendoring this repo as a `toolkit/` submodule; the commands are identical, invoked as `/toolkit:<name>` everywhere. **`npx github:xaralis/video-toolkit init` sets all of this up for you** — see [Create a new brand repo](#create-a-new-brand-repo).

## Using with Codex

This toolkit is built around Claude Code assets in `.claude/` and `CLAUDE.md`, but it also ships an experimental migration script for Codex — contributed by [@kimhoontae-gogo](https://github.com/kimhoontae-gogo) in [#16](https://github.com/digitalsamba/claude-code-video-toolkit/pull/16).

```bash
python3 scripts/migrate_to_codex.py --force
```

This does two things:

1. Installs Codex skills into `~/.codex/skills`
2. Appends or updates a generated Codex block in the repository root `AGENTS.md` from `CLAUDE.md`

Resources created or updated by `python3 scripts/migrate_to_codex.py --force`:

1. `~/.codex/skills/acestep/`
2. `~/.codex/skills/elevenlabs/`
3. `~/.codex/skills/ffmpeg/`
4. `~/.codex/skills/frontend-design/`
5. `~/.codex/skills/ltx2/`
6. `~/.codex/skills/qwen-edit/`
7. `~/.codex/skills/remotion/`
8. `~/.codex/skills/remotion-best-practices/`
9. `~/.codex/skills/runpod/`
10. `~/.codex/skills/brand/`
11. `~/.codex/skills/contribute/`
12. `~/.codex/skills/design/`
13. `~/.codex/skills/generate-voiceover/`
14. `~/.codex/skills/scene-review/`
15. `~/.codex/skills/setup/`
16. `~/.codex/skills/skills/`
17. `~/.codex/skills/template/`
18. `~/.codex/skills/versions/`
19. `~/.codex/skills/video/`
20. `~/.codex/skills/video-toolkit/`
21. A generated Codex block inside `AGENTS.md` in the repository root

Important:

1. The migration script manages only a generated block inside the repository root `AGENTS.md`.
2. Manual `AGENTS.md` content outside that block is preserved.
3. The generated block is derived from `CLAUDE.md`, so changes to `CLAUDE.md` should be followed by `python3 scripts/migrate_to_codex.py --force`.

To remove the installed Codex skills later:

```bash
python3 scripts/migrate_to_codex.py --reset
```

`--reset` removes the toolkit skills previously installed under `~/.codex/skills` and removes the generated Codex block from `AGENTS.md`. It does not delete other user skills and it does not remove the rest of `AGENTS.md`.

**What's free:** The toolkit leans heavily on open-source AI models — voiceovers (Qwen3-TTS), image generation (FLUX.2), music (ACE-Step), and more. You deploy them to your own cloud GPU account and run them at cost. Cloudflare R2 has a generous free tier (10GB, zero egress), and Modal gives $30/month free compute on the Starter plan — more than enough for a few 5-minute videos a month.

**Requirements:** [Node.js](https://nodejs.org/) 18+ and [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Python 3.13+ recommended for AI tools. FFmpeg optional.

> **Want to skip setup and just render something?**
> ```bash
> cd examples/hello-world && npm install && npm run render
> ```
> No API keys needed — outputs an MP4 immediately.


## Features

### Skills

Claude Code has deep knowledge in:

| Skill | Description |
|-------|-------------|
| **remotion** | React-based video framework — compositions, animations, rendering |
| **elevenlabs** | AI audio — text-to-speech, voice cloning, music, sound effects |
| **ffmpeg** | Media processing — format conversion, compression, resizing |
| **frontend-design** | Visual design refinement for distinctive, production-grade aesthetics |
| **qwen-edit** | AI image editing — prompting patterns and best practices |
| **acestep** | AI music generation — prompts, lyrics, scene presets, video integration |
| **ltx2** | AI video generation — text-to-video, image-to-video clips, prompting guide |
| **runpod** | Cloud GPU — setup, Docker images, endpoint management, costs |

### Commands

| Command | Description |
|---------|-------------|
| `/toolkit:setup` | First-time setup — cloud GPU, file transfer, voice, prerequisites |
| `/toolkit:video` | Video projects — list, resume, or create new |
| `/toolkit:scene-review` | Scene-by-scene review in Remotion Studio |
| `/toolkit:design` | Focused design refinement session for a scene |
| `/toolkit:brand` | Brand profiles — list, edit, or create new |
| `/toolkit:template` | List available templates or create new ones |
| `/toolkit:skills` | List installed skills or create new ones |
| `/toolkit:contribute` | Share improvements — issues, PRs, examples |
| `/toolkit:generate-voiceover` | Generate AI voiceover from a script |
| `/toolkit:versions` | Check dependency versions and toolkit updates |

> **Note:** After creating or modifying commands/skills, restart Claude Code to load changes.

### Templates (brand-owned)

Templates are brand-shaped and live in each brand repo, not in core — for example:

- **campaign-reels** — Vertical 9:16 short-form reels with brand overlays and clip-based composition
- **web-program-intro** — 16:9 talking-head intros for web embeds

Core ships the machinery they are built from (`lib/` components + transitions,
`reel-config-base` schemas, the Python tools). See `examples/` for runnable reference
projects — `hello-world`, `quick-spot`, `data-viz-chart`, and more.

### Scene Transitions

The toolkit includes a transitions library for scene-to-scene effects:

| Transition | Description |
|------------|-------------|
| `glitch()` | Digital distortion with RGB shift |
| `rgbSplit()` | Chromatic aberration effect |
| `zoomBlur()` | Radial motion blur |
| `lightLeak()` | Cinematic lens flare |
| `clockWipe()` | Radial sweep reveal |
| `pixelate()` | Digital mosaic dissolution |
| `checkerboard()` | Grid-based reveal (9 patterns) |

Plus official Remotion transitions: `slide()`, `fade()`, `wipe()`, `flip()`

Preview all transitions:
```bash
cd showcase/transitions && npm install && npm run studio
```

See [lib/transitions/README.md](lib/transitions/README.md) for full documentation.

### Brand Profiles

Visual identity — colors, fonts, voice, styling — is defined per brand in `brands/<brand>/`. When you create a project with `/toolkit:video`, the selected brand's identity is automatically applied.

```
brands/my-brand/
├── brand.json    # Colors, fonts, typography
├── voice.json    # ElevenLabs voice settings
└── assets/       # Logo, backgrounds
```

This core repo ships only the neutral `default` scaffold. Real brands live in the top-level `brands/` of the repo that vendors this toolkit as a submodule — each brand gets its own repo, so no brand's identity is visible from another's.

Create your own with `/toolkit:brand`.

### Project Management System

Video projects are tracked through a multi-session lifecycle:

```
planning → assets → review → audio → editing → rendering → complete
```

Each project has a `project.json` that tracks:
- **Scenes** — What to show, asset status, visual types
- **Audio** — Voiceover and music status
- **Sessions** — Work history across Claude Code sessions
- **Phase** — Current stage in the workflow

The system automatically reconciles intent (what you planned) with reality (what files exist), and generates a `CLAUDE.md` per project for instant context when resuming.

See [lib/project/README.md](lib/project/README.md) for schema details, scene status tracking, and filesystem reconciliation logic.

### Python Tools

Audio, video, and image tools in `video_toolkit/`:

```bash
# Generate voiceover (ElevenLabs)
python3 -m video_toolkit.voiceover --script script.md --output voiceover.mp3

# Generate voiceover (Qwen3-TTS — self-hosted, cheaper alternative)
python3 -m video_toolkit.voiceover --provider qwen3 --speaker Ryan --scene-dir public/audio/scenes --json
python3 -m video_toolkit.qwen3_tts --text "Hello world" --tone warm --output hello.mp3

# Generate background music (ACE-Step — free cloud API, XL Turbo 4B model)
python3 -m video_toolkit.music_gen --preset corporate-bg --duration 120 --output music.mp3
python3 -m video_toolkit.music_gen --prompt "Dramatic cinematic" --duration 30 --bpm 90 --key "D Minor" --output reveal.mp3
python3 -m video_toolkit.music_gen --prompt "Upbeat indie rock" --duration 60 --variations 4 --output intro.mp3

# Generate sound effects
python3 -m video_toolkit.sfx --preset whoosh --output sfx.mp3

# Add background music to existing video
python3 -m video_toolkit.addmusic --input video.mp4 --prompt "Subtle ambient" --output output.mp4

# AI image editing (style transfer, backgrounds, custom prompts)
python3 -m video_toolkit.image_edit --input photo.jpg --style cyberpunk --cloud modal
python3 -m video_toolkit.image_edit --input photo.jpg --prompt "Add sunglasses" --cloud modal

# AI image upscaling (2x/4x)
python3 -m video_toolkit.upscale --input photo.jpg --output photo_4x.png --cloud modal

# Remove watermarks (requires cloud GPU)
python3 -m video_toolkit.dewatermark --input video.mp4 --preset sora --output clean.mp4 --cloud modal

# Locate watermark coordinates
python3 -m video_toolkit.locate_watermark --input video.mp4 --grid --output-dir ./review/

# AI image generation (FLUX.2 Klein 4B — text-to-image + editing)
python3 -m video_toolkit.flux2 --prompt "A sunset over mountains" --cloud modal
python3 -m video_toolkit.flux2 --preset title-bg --brand my-brand --cloud modal
python3 -m video_toolkit.flux2 --list-presets

# AI video generation (LTX-2.3 22B — text-to-video + image-to-video)
python3 -m video_toolkit.ltx2 --prompt "A sunset over the ocean, cinematic" --cloud modal
python3 -m video_toolkit.ltx2 --prompt "Gentle camera drift" --input photo.jpg --cloud modal
```

**Tool Categories:**

| Type | Tools | Purpose |
|------|-------|---------|
| **Project** | voiceover, music_gen, sfx | Used during video creation workflow |
| **Utility** | addmusic, locate_watermark | Quick transformations, no project needed |
| **Cloud GPU** | image_edit, upscale, dewatermark, qwen3_tts, flux2, music_gen, ltx2 | AI processing via Modal or RunPod |

### Cloud GPU (Modal + RunPod)

8 AI tools run on cloud GPUs. Use `--cloud modal` (recommended) or `--cloud runpod` on any tool.

| Tool | What It Does | Est. Cost |
|------|--------------|-----------|
| `qwen3_tts` | AI text-to-speech (9 speakers, voice cloning) | ~$0.01 |
| `flux2` | AI image generation & editing | ~$0.02 |
| `image_edit` | AI image editing & style transfer | ~$0.03 |
| `upscale` | AI image upscaling (2x/4x) | ~$0.01 |
| `music_gen` | AI music generation (8 scene presets) | Free (acemusic) / ~$0.05 (self-hosted) |
| `ltx2` | AI video generation (text-to-video, image-to-video) | ~$0.23 |
| `dewatermark` | Video watermark removal | ~$0.10 |

**Modal (recommended):** Each tool deploys from `docker/modal-*/app.py` — Modal builds and hosts the containers. $30/month free compute on the Starter plan, typical usage is $1-2/month. Run `/toolkit:setup` to deploy all tools automatically.

**RunPod (alternative):** Uses pre-built Docker images from `ghcr.io/conalmullan/video-toolkit-*`. Pay-per-second, no minimums. Run `python3 -m video_toolkit.<tool> --setup` to create endpoints.

See [docs/modal-setup.md](docs/modal-setup.md) and [docs/runpod-setup.md](docs/runpod-setup.md) for details.

## Project Structure

This repo — the shared core (also a Claude Code plugin):

```
claude-code-video-toolkit/
├── .claude-plugin/      # plugin.json + marketplace.json — exposes commands/ + skills/ as the toolkit@video-toolkit plugin
├── commands/            # Slash commands (/toolkit:video, /toolkit:setup, /toolkit:brand, …)
├── skills/              # Domain knowledge for Claude
├── scripts/bootstrap/   # `npx github:xaralis/video-toolkit init` — scaffolds a new brand repo
├── lib/                 # Shared components, theme system, utilities
│   ├── components/      # Reusable video components
│   ├── transitions/     # Scene transition effects (7 custom + 4 official)
│   ├── theme/           # ThemeProvider, useTheme
│   └── project/         # Multi-session project system
├── video_toolkit/       # Python CLI tools (installable package)
├── docker/              # Cloud GPU images (Modal apps + RunPod Dockerfiles)
├── brands/default/      # Neutral scaffold brand — real brands live in the consuming brand repo
├── examples/            # Curated reference projects
├── showcase/            # Runnable demos (e.g. the transitions gallery)
├── assets/              # Shared assets
├── docs/                # Documentation
├── .claude/             # the core's OWN settings (SessionStart hook) — NOT the plugin
├── package.json         # bin for `npx github:xaralis/video-toolkit init`
└── _internal/           # Toolkit metadata & registry
```

> **Note:** core ships **no `templates/`** — templates are brand-shaped and live in each brand repo. See [Templates (brand-owned)](#templates-brand-owned).

A brand repo that consumes this toolkit (own org/repo per brand, so brands never see each other's
material):

Everything below is scaffolded by `npx github:xaralis/video-toolkit init` (see [Create a new brand repo](#create-a-new-brand-repo)) — no manual cloning or submodule wiring:

```
my-brand-videos/
├── toolkit/             # this repo, vendored as a pinned git submodule
├── brands/<brand>/      # this brand's colors, fonts, voice, BRAND-RULES.md
├── projects/            # this brand's video projects (source in git; heavy media via /toolkit:sync to R2)
├── workspace.json       # marks this a brand workspace (kind: "brand")
├── .claude/settings.json # enables the toolkit@video-toolkit plugin so /toolkit:* work here
├── .venv/               # the Python toolkit installed into this repo (pip install -e toolkit)
├── .env                 # this brand's config + cloud endpoints (written by /toolkit:setup)
└── CLAUDE.md            # thin, brand-specific instructions on top of toolkit/CLAUDE.md
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Modal Setup](docs/modal-setup.md) — Cloud GPU with Modal (recommended)
- [RunPod Setup](docs/runpod-setup.md) — Cloud GPU with RunPod (alternative)
- [Creating Templates](docs/creating-templates.md)
- [Creating Brands](docs/creating-brands.md)
- [Project System](lib/project/README.md) — Multi-session lifecycle, schema, reconciliation
- [Optional Components](docs/optional-components.md) — Local GPU tools setup
- [Changelog](_internal/CHANGELOG.md) — What's shipped; roadmap and feature discussion happen [upstream](https://github.com/digitalsamba/claude-code-video-toolkit/issues)

## Video Workflow

```
/toolkit:video → Script → Assets → Scene Review → Design → Audio → Preview → Render
```

1. **Create project** — Run `/toolkit:video`, choose template and brand
2. **Review script** — Edit `VOICEOVER-SCRIPT.md` to plan content and assets
3. **Gather assets** — Add external video footage
4. **Scene review** — Run `/toolkit:scene-review` to verify visuals in Remotion Studio
5. **Design refinement** — Use `/toolkit:design` to improve slide visuals with the frontend-design skill
6. **Generate audio** — AI voiceover with `/toolkit:generate-voiceover`
7. **Configure** — Update config file with asset paths and timing
8. **Preview** — `npm run studio` for live preview
9. **Iterate** — Work with Claude Code to adjust timing, styling, content
10. **Render** — `npm run render` for final MP4

## Contributing

This is a personal customization of an upstream project. **Improvements that aren't specific to this
fork belong upstream** — please open them at
[digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit/issues),
where they benefit everyone. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — Copyright (c) 2024 Digital Samba. See [LICENSE](LICENSE).

This repo is a derivative of
[digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit);
the copyright and licence of the original are retained. Modifications here (content-gen trim,
shared-core/submodule restructure, additional tooling) are released under the same licence.

---

Built for use with [Claude Code](https://claude.ai/code) by Anthropic.
