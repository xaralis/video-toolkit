# claude-code-video-toolkit

This file provides guidance to Claude Code (claude.ai/code) when working with this video production toolkit.

## Overview

**claude-code-video-toolkit** is an AI-native video production workspace. It provides Claude Code with the skills, commands, and tools to create professional videos from concept to final render.

**This repo is the shared core.** It ships templates, shared `lib/` components, Python tools,
Claude Code skills/commands, and docs — but no brand identity and no video projects of its own
(`brands/` here holds only the `default` scaffold, for local testing/reference). Real brand
profiles and video projects live in **separate per-brand repos** (one per client/org), each of
which vendors this repo as a `toolkit/` git submodule and consumes its skills/commands as a
**Claude Code plugin** (`toolkit@video-toolkit`, invoked as `/toolkit:<name>`). That keeps every
brand's material isolated from every other brand while all brands stay on one versioned core. A
brand repo typically looks like:

```
my-brand-videos/
├── toolkit/          # this repo, as a pinned git submodule
├── brands/<brand>/   # this brand's colors, fonts, voice, BRAND-RULES.md
├── projects/         # this brand's video projects (vendored template copies)
└── CLAUDE.md        # thin, brand-specific instructions layered on top of toolkit/CLAUDE.md
```

A new brand repo is bootstrapped with `npx github:xaralis/video-toolkit init <dir>` (Node CLI in
`scripts/bootstrap/`): it adds the `toolkit/` submodule, scaffolds `workspace.json`
(`kind: "brand"`), a starter brand, `projects/`, and `.claude/settings.json` (which enables the
`toolkit@video-toolkit` plugin), then installs the Python toolkit into `.venv`. No manual cloning
or submodule linking.

**First-run order (canonical):** `npx github:xaralis/video-toolkit init <dir>` → `cd <dir>` + `claude`
→ `/toolkit:setup` (writes `.env` and deploys/registers the cloud GPU tools — Modal/RunPod — for this
brand repo) → `/toolkit:video`. Per-repo configuration (`.env`, cloud endpoints, `.venv`) installs
**only into the brand repo, never into the core**. Cloud images are account-level (Modal builds
remotely on deploy; RunPod uses prebuilt GHCR images), so setup records the resulting endpoints in the
brand repo's `.env` and only deploys what the account is missing.

**Key capabilities:**
- Programmatic video creation with Remotion (React-based)
- AI voiceover generation with ElevenLabs or Qwen3-TTS
- AI music generation with ACE-Step 1.5 (text-to-music, vocals, covers, stems)
- Browser demo recording with Playwright
- Asset processing with FFmpeg

## Directory Structure

```
claude-code-video-toolkit/        # this repo (the core) — also a Claude Code plugin
├── .claude-plugin/      # plugin.json + marketplace.json (exposes commands/ + skills/)
├── commands/            # Guided workflow slash commands (→ /toolkit:<name> when consumed)
├── skills/              # Domain knowledge for Claude
├── .claude/             # core's own settings (SessionStart hook); no commands/skills here
├── video_toolkit/       # Python CLI automation (installable package)
├── lib/                 # Shared components, transitions, theme, reel-config-base, transcripts
├── brands/default/      # Neutral scaffold brand (colors, fonts, voice) — real brands live in the consuming brand repo
├── examples/            # Curated reference projects (hello-world, quick-spot, …)
├── showcase/            # Runnable demos (e.g. the transitions gallery)
├── assets/              # Shared assets (voices, images)
├── docs/                # Documentation
└── _internal/           # Toolkit metadata & registry
```

**Core ships no templates.** Templates are brand-shaped and live in each brand repo
(campaign-reels + web-program-intro in the Progresivní Pardubice repo, roost-reels in
ROOST's). Core ships the *machinery* they are built from — `lib/` components,
transitions, `reel-config-base` schemas, the Python tools — plus `examples/` as the
reference for how it fits together.

When consumed as a submodule, a brand repo has its own top-level `brands/<brand>/` and
`projects/` that sit *alongside* `toolkit/` (this repo) — they are never copied into it, and this
repo never contains another brand's `brands/` or `projects/` content.

## Registry

`_internal/toolkit-registry.json` is the canonical source for all skills, commands, tools, templates, components, transitions, and cloud endpoints — including their paths, status, options, presets, and env vars. Consult it for structured data. This file focuses on **workflow guidance, patterns, and knowledge** that the registry can't capture.

## Quick Start

> The workflow below assumes you're working from a **brand repo** that vendors this toolkit as a
> `toolkit/` submodule (paths like `templates/` and `projects/` are then `toolkit/templates/` and
> the brand repo's own `projects/`). When working directly in this core repo — e.g. building a new
> template or fixing a tool — there is no `projects/` to create; see "Toolkit vs Project Work"
> below.

**First-time setup (optional, ~5 minutes):**
```
/toolkit:setup
```

Walks through cloud GPU, file transfer (R2), and voice configuration. Most features are free. Skip this if you just want to render videos with Node.js.

**Work on a video project:**
```
/toolkit:video
```

This command will:
1. Scan for existing projects (resume or create new)
2. Choose template (campaign-reels, web-program-intro)
3. Choose brand (or create one with `/toolkit:brand`)
4. Plan scenes interactively
5. Create project with VOICEOVER-SCRIPT.md

**Multi-session support:** Projects span multiple sessions. Run `/toolkit:video` to resume where you left off. Each project tracks its phase, scenes, assets, and session history in `project.json`.

**Or manually** (from a brand repo, which carries its own `templates/`):
```bash
cp -r templates/campaign-reels projects/my-video
cd projects/my-video
npm install
npm run studio   # Preview
npm run render   # Export
```

> **Note:** After creating or modifying commands/skills, restart Claude Code to load changes.

## Templates (brand-owned)

**Core ships no templates** — they are brand-shaped and live in each brand repo
(`templates/campaign-reels`, `templates/web-program-intro` in the PP repo;
`templates/roost-reels` in ROOST's). What core ships is the machinery a template is
built from: `lib/` components + transitions, `reel-config-base` schemas, and the Python
tools. The workflow below is how a brand uses the `campaign-reels` template — documented
here because the toolkit's commands drive it.

### campaign-reels (a brand template)
Vertical 9:16 (1080x1920) short-form reels for social campaigns. Three-layer composition: persistent brand overlay (watermark + legal disclaimer) + per-segment overlays (chevron, captions, stat callouts, quote pulls) + clip-based video track (clip / broll / multi-clip / card / outro segments). Brand-agnostic by design — any brand's colors, fonts, and copy discipline apply via `brands/<brand>/BRAND-RULES.md` in the consuming brand repo.

**Canonical workflow:**

```
/toolkit:video                          # create projects/<name>/
/toolkit:narrate                        # author SCREENPLAY.md (intent + segments)
(film footage; drop into public/recordings + public/broll)
/toolkit:sync push recordings,broll     # back up code + raw footage (git + R2)
/toolkit:cut                            # map footage → defaultProps in Root.tsx
/toolkit:fine-tune                      # iterate timing/text in Studio (lock final durations here)
/toolkit:add-music                      # generate ACE-Step bg music sized to the final reel (optional)
/toolkit:render                         # final MP4 (or /toolkit:render preview for half-scale)
/toolkit:sync push out                  # back up code + renders (git + R2)
/toolkit:sync share                     # short URL of out/reel.mp4 — send to reviewers
```

Collaborator joining mid-project:

```
/toolkit:video → resume → /toolkit:sync pull → /toolkit:fine-tune (or wherever the work is)
```

**Auto-pull pravidlo (lazy sync)**: SessionStart hook spouští `python3 -m video_toolkit.check_stale_projects`, který tiše prohlédne R2 a vypíše banner `=== R2 STALE PROJECTS ===`, pokud některý lokální projekt zaostává. Když uživatel v dalším promptu zmíní práci na takovém projektu (resume přes `/toolkit:video`, "pokračujme v X", "co je v X", atd.), **NEJDŘÍV** spusť `/toolkit:sync pull <name>` (= git pull + R2 pull, jeden krok) a teprve potom dělej cokoli s jeho soubory. Bez čekání na další explicitní pokyn. Projekty, které v banneru nejsou, jsou aktuální — sync přeskoč. Pokud banner chybí úplně (R2 nedostupné, není nakonfigurováno), pracuj s lokálním stavem.

The schema-driven template uses Zod (`src/config/schema.ts`) so Studio's sidebar renders a full editor for every segment, overlay, and transition. Brand rules at `brands/<brand>/BRAND-RULES.md` are loaded by `/toolkit:narrate` and `/toolkit:cut` to enforce accent emphasis-only, 3s minimums, L-cut audio inheritance, and other authoritative discipline. `/toolkit:sync` keeps raw footage + renders in Cloudflare R2 so heavy media never goes to git but is still shareable across the team.

## Brand Profiles

Brand identity lives in `brands/<brand>/`. Each brand defines:

```
brands/my-brand/
├── brand.json    # Colors, fonts, typography
├── voice.json    # ElevenLabs voice settings
└── assets/       # Logo, backgrounds
```

In this core repo, `brands/` holds only the neutral `default` scaffold — real brands (their own
colors, voice, `BRAND-RULES.md`) live in the top-level `brands/` of the brand repo that vendors
this toolkit as a submodule, never in the toolkit itself. That's what keeps one brand's identity
out of another brand's view. See `docs/creating-brands.md` for how to create one.

## Shared Components

Reusable video components in `lib/components/`. See registry `components` section for the full list with descriptions. Import in templates via:

```tsx
import { AnimatedBackground, SlideTransition, Label } from '@video-toolkit/lib/components';
```

## Python Tools

Audio, video, and image tools in `video_toolkit/`. Three things you need to know:

- **Setup**: `pip install -e .`
- **Always invoke from toolkit root** (`cd /path/to/claude-code-video-toolkit && python3 -m video_toolkit.<tool>`). Critical for background commands.
- **Every tool supports `--help`** for full CLI options.

Per-tool categories:

| Type | Tools | When to Use |
|------|-------|-------------|
| **Project tools** | voiceover, music_gen, sfx, sync_timing | During video creation workflow |
| **Utility tools** | addmusic, locate_watermark | Quick transformations on existing videos |
| **Cloud GPU** | image_edit, upscale, dewatermark, qwen3_tts, music_gen, flux2 | AI processing via RunPod or Modal (`--cloud runpod\|modal`) |

For ready-to-copy invocations of each tool (voiceover, sync_timing, qwen3_tts, image_edit, music_gen, dewatermark, transcribe, plus RunPod/Modal setup) see **`docs/tools-reference.md`**. Deeper patterns live in the corresponding `skills/<tool>/` directory and in `_internal/toolkit-registry.json`.

## Video Production Workflow

1. **Create/resume project** - Run `/toolkit:video`, choose template and brand (or resume existing)
2. **Review script** - Edit `VOICEOVER-SCRIPT.md` to plan content
3. **Gather assets** - Add external video footage
4. **Scene review** - Run `/toolkit:scene-review` to verify visuals in Remotion Studio
5. **Design refinement** - Use `/toolkit:design` or the "Refine" option in scene-review to improve slide visuals
6. **Generate audio** - Use `/toolkit:generate-voiceover` for AI narration
7. **Sync timing** - Run `python3 -m video_toolkit.sync_timing --apply` to update config durations
8. **Preview** - `npm run studio` in project directory
9. **Iterate** - Adjust timing, content, styling with Claude Code
10. **Render** - `npm run render` for final MP4

## Project Lifecycle

Projects move through phases tracked in `project.json`:

```
planning → assets → review → audio → editing → rendering → complete
```

| Phase | Description |
|-------|-------------|
| `planning` | Defining scenes, writing script |
| `assets` | Recording demos, gathering materials |
| `review` | Scene-by-scene review in Remotion Studio (`/toolkit:scene-review`) |
| `audio` | Generating voiceover, music |
| `editing` | Adjusting timing, previewing |
| `rendering` | Final render in progress |
| `complete` | Done |

See `lib/project/README.md` for details on the project system.

## Video Timing

Core principles (full reference in **`docs/video-timing.md`**):

- **Voiceover drives timing.** Generate audio first, anchor visuals to actual measured durations — don't estimate.
- **~150 WPM** standard reading pace (2.5 words/second). Title scenes 0-10% narration density; Overview/Stats 70-90%; Demo 30-50%.
- **All videos run at 30fps** (frames = seconds × 30).
- **TTS drifts.** ElevenLabs and Qwen3-TTS compress pauses and speed through short sentences; a 50s script may produce 40-45s of audio. Always run `python3 -m video_toolkit.sync_timing --apply` after voiceover generation to update `durationInFrames` to match actual audio.
- **Two timeline strategies:** audio-anchored absolute `start=` timestamps (tight ad-style edits, sub-30s spots) vs. `<Series>` auto-chained durations (long-form sprint reviews). Mix per section as needed.

The full doc covers: speaking-rate tiers, narration-density tables, word-count budgeting, drift patterns + fixes, audio-anchored Python/moviepy pattern with example, and `<Series>` vs. absolute-start trade-offs.

## Remotion Patterns & Transitions

Toolkit-specific Remotion conventions (animation hooks, Series sequencing, `<OffthreadVideo>` rule, transition examples and duration guidelines) live in **`docs/remotion-patterns.md`**. Per-transition catalog with options: `lib/transitions/README.md`. Framework knowledge: `remotion-official` skill.

**One always-on reminder:** use `<OffthreadVideo>`, never `<video>` — raw `<video>` will not render correctly.

## Design Refinement with frontend-design Skill

The `frontend-design` skill elevates slide visuals from generic to distinctive.

### Usage
- **During scene review** (`/toolkit:scene-review`): Choose "Refine" for visual improvements
- **Focused sessions** (`/toolkit:design`): Deep-dive on a specific scene — `/toolkit:design title`, `/toolkit:design cta`

### When to Use
- Slide scenes that feel generic
- When building visual contrast between scenes (e.g., calm title → harsh problem)
- When animations feel too basic or too busy

### Visual Narrative Arc
Consider how visual intensity builds across scenes:
- **Title**: Set the mood, plant visual seeds
- **Problem**: Create tension (harsh contrast)
- **Solution**: Relief and hope return
- **Demo**: Neutral, content-focused
- **Stats**: Build credibility
- **CTA**: Climax - maximum visual energy

## Toolkit vs Project Work

**Toolkit work** (evolves this shared core):
- Skills, commands, templates, tools, `lib/`
- Done in this repo directly; roadmap and planned work are tracked upstream (https://github.com/digitalsamba/claude-code-video-toolkit/issues)
- Ships to every brand repo the next time they update their `toolkit/` submodule pin

**Project work** (creates videos for a specific brand):
- Happens in a brand repo, not here — this core repo has no `projects/` of its own
- Each project has `project.json` (machine-readable state) and auto-generated `CLAUDE.md`
- A brand repo consumes this repo's templates/tools/skills via the `toolkit/` submodule and
  `/toolkit:sync-template` pulls in template fixes without touching the project's own cut

Keep these separate. Don't mix toolkit improvements with video production — a fix that a specific
project needs belongs in that project's brand repo; a fix every brand needs belongs here.

**The criterion, authoritative:** anything reusable by *any* brand or repo that uses the toolkit —
a component, a Python tool, a skill, a helper, a pattern, not just a video primitive — is core by
nature and belongs here; brand-specific material stays in the brand repo. Ownership is decided by
nature, not by who needs it today. Brand repos apply this **proactively**: when work there produces
something core-worthy, Claude flags it and offers to upstream it — without blocking the work, and
leaving an easy path to swap the local copy for core's once it lands (see a brand repo's own
CLAUDE.md, and `.claude/superpowers/specs/2026-07-18-core-upstreaming-convention-design.md`).

## Documentation

- `docs/tools-reference.md` - CLI cheat sheet for every Python tool
- `docs/video-timing.md` - Full timing reference (WPM, density tables, TTS drift, audio-anchoring)
- `docs/remotion-patterns.md` - Toolkit Remotion conventions + transitions
- `docs/getting-started.md` - First video walkthrough
- `docs/creating-templates.md` - Build new templates
- `docs/creating-brands.md` - Create brand profiles
- `docs/optional-components.md` - Setup for optional ML-based tools (ProPainter, etc.)
