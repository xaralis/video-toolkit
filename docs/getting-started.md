# Getting Started

This guide will help you create your first video using the claude-code-video-toolkit.

## Prerequisites

### Minimum (renders videos immediately)

- [Node.js](https://nodejs.org/) 18+ — that's it

### Optional: AI Voiceover

| Provider | Cost | Setup |
|----------|------|-------|
| Qwen3-TTS | Free (self-hosted) | Modal or RunPod — configured for you by `/toolkit:setup` (or manually: `python3 -m video_toolkit.qwen3_tts --setup --cloud runpod`) |
| ElevenLabs | Pay-per-use | API key in `.env` |

### Optional: Full Toolkit

- [Python](https://python.org/) 3.10+ — for audio tools, image editing, upscaling
- [FFmpeg](https://ffmpeg.org/) — for media conversion and compression
- [RunPod account](https://runpod.io/) — for cloud GPU processing (TTS, image editing, watermark removal, talking heads)
- [ElevenLabs API key](https://elevenlabs.io/) — for premium AI voices

## Your First Video in 2 Minutes

```bash
cd examples/hello-world
npm install
npm run studio    # Preview in browser
npm run render    # Export MP4
```

No API keys needed. Edit `src/config/sprint-config.ts` to customize content.

## Starting your own brand repo

The quick start above renders a bundled example straight from this core. To make **your own**
videos, create a brand repo (a separate repo that vendors this toolkit):

```bash
npx github:xaralis/video-toolkit init my-brand-videos
cd my-brand-videos
claude    # the /toolkit:* commands live inside Claude Code
```

`init` adds the toolkit as a `toolkit/` submodule, scaffolds a starter brand and `projects/`,
pre-wires the `toolkit@video-toolkit` plugin, and installs the Python tools into `.venv`. Inside
Claude Code, run `/toolkit:brand` then `/toolkit:video`.

## Full Setup (for AI Tools)

> This is optional — you can render videos with just Node.js installed.

The AI tools are configured **inside your brand repo** (created with `npx … init` above), not by
cloning the core. `init` already installed the Python toolkit into `.venv`; all that's left is the
cloud config:

1. **From your brand repo, launch Claude Code**
   ```bash
   cd my-brand-videos
   claude
   ```

2. **Run the setup wizard**

   Type `/toolkit:setup` — this walks you through configuring cloud GPU, file transfer, and voice
   in about 5 minutes, writing everything to this brand repo's `.env`. Most features are free:
   - **Cloudflare R2**: Free (10GB storage, zero egress)
   - **Modal**: $30/month free compute on Starter plan
   - **Qwen3-TTS**: Free AI voiceovers (runs on your Modal compute)

   Or configure manually: `cp .env.example .env` and edit with your API keys.

## Optional: Codex Setup

If you use Codex instead of Claude Code, install the toolkit's Codex-compatible wrappers and regenerate `AGENTS.md` from `CLAUDE.md`:

```bash
python3 scripts/migrate_to_codex.py --force
```

This installs toolkit skills into `~/.codex/skills` and appends or updates a generated Codex block in the repository root `AGENTS.md`.

Resources created or updated by the migration script:

1. Toolkit skills under `~/.codex/skills/`
2. Command-wrapper skills under `~/.codex/skills/`
3. A generated Codex block inside repository root `AGENTS.md`

Important:

1. The script manages only a generated block inside the repository root `AGENTS.md`.
2. Manual `AGENTS.md` content outside that block is preserved.
3. The generated block is derived from `CLAUDE.md`.
4. Re-run `python3 scripts/migrate_to_codex.py --force` after updating `CLAUDE.md`.

To remove the installed toolkit skills later:

```bash
python3 scripts/migrate_to_codex.py --reset
```

`--reset` removes the generated Codex block from `AGENTS.md`, but does not remove the rest of the file.

## Your First Video

The easiest way to create a video is using the `/toolkit:video` command:

```
/toolkit:video
```

This unified command will:
1. Scan for existing projects (or start fresh if none found)
2. Let you choose a template (see `/toolkit:template` for the current list)
3. Let you choose a brand (or create one with `/toolkit:brand`)
4. Gather your content (paste notes, provide URLs, or describe what you want)
5. Plan scenes interactively with your input
6. Create a project in `projects/` with all scaffolding ready

## Manual Project Creation

If you prefer manual setup (from a brand repo, which carries its own `templates/` —
core itself ships none):

1. **Copy a template**
   ```bash
   cp -r templates/campaign-reels projects/my-video
   cd projects/my-video
   npm install
   ```

2. **Author the content**
   Run `/toolkit:narrate` to write `SCREENPLAY.md`, then `/toolkit:cut` to map your footage into `src/Root.tsx` defaultProps.

3. **Add footage**
   Place clips in `public/recordings/` and `public/broll/`

4. **Preview**
   ```bash
   npm run studio
   ```

5. **Render**
   ```bash
   npm run render
   ```

## Available Commands

| Command | Description |
|---------|-------------|
| `/toolkit:setup` | First-time setup - cloud GPU, file transfer, voice, prerequisites |
| `/toolkit:video` | Video projects - list, resume, or create new |
| `/toolkit:scene-review` | Scene-by-scene review in Remotion Studio |
| `/toolkit:design` | Focused design refinement session for a scene |
| `/toolkit:brand` | Brand profiles - list, edit, or create new |
| `/toolkit:template` | List available templates or create new ones |
| `/toolkit:generate-voiceover` | Generate AI voiceover from script (supports per-scene mode) |
| `/toolkit:skills` | List installed skills or create new ones |
| `/toolkit:contribute` | Share improvements - issues, PRs, examples |
| `/toolkit:versions` | Check dependency versions and toolkit updates |

## Project Structure

After creating a project, you'll have:

```
projects/my-video/
├── project.json           # Project state (phase, scenes, assets)
├── CLAUDE.md              # Auto-generated status for Claude Code
├── VOICEOVER-SCRIPT.md    # Narration script with asset markers
├── src/
│   ├── config/       # Template-specific content/schema config
│   └── components/
├── public/
│   ├── recordings/ # Your footage
│   ├── audio/      # Voiceovers, music, SFX
│   └── images/     # Logo, screenshots
└── package.json
```

## Multi-Session Workflow

Projects can span multiple Claude Code sessions. The `/toolkit:video` command tracks progress:

```
/toolkit:video
```

When you have existing projects, you'll see:

```
Found 2 video projects:

  1. **my-release-video** (campaign-reels)
     Phase: assets - 2/5 clips recorded
     Last worked: 2 days ago

  2. **product-launch** (web-program-intro)
     Phase: audio - voiceover needed
     Last worked: 5 days ago

Which project? (or 'new' for a new project)
```

### Project Phases

| Phase | Description |
|-------|-------------|
| `planning` | Defining scenes, writing script |
| `assets` | Recording demos, gathering materials |
| `review` | Scene-by-scene review in Remotion Studio (`/toolkit:scene-review`) |
| `audio` | Generating voiceover, music |
| `editing` | Adjusting timing, previewing |
| `rendering` | Final render in progress |
| `complete` | Done |

## Next Steps

- [Creating Templates](./creating-templates.md) - Build custom video structures
- [Creating Brands](./creating-brands.md) - Define visual identity
