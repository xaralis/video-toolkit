# claude-code-video-toolkit

This file provides guidance to Claude Code (claude.ai/code) when working with this video production toolkit.

## Overview

**claude-code-video-toolkit** is an AI-native video production workspace. It provides Claude Code with the skills, commands, and tools to create professional videos from concept to final render.

**This repo is the shared core.** It ships no templates — see "Core ships no templates" below —
but does ship shared `lib/` components, Python tools, Claude Code skills/commands, and docs, with
no brand identity and no video projects of its own
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
├── lib/                 # Shared components, transitions, theming, render, reel-config-base, transcripts,
│                        #   plus the brand shell: project/ (build-config presets) + editor/host/ (the reel editor)
├── brands/default/      # Neutral scaffold brand (colors, fonts, voice) — real brands live in the consuming brand repo
├── examples/            # Curated reference projects (layered-minimal, quick-spot, …)
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

Since Phase 2, that machinery includes the template's whole **shell**: the
`<Composition>` prop bundle (`lib/render/layered-composition-props.ts`), brand font
loading (`lib/render/load-fonts.ts`), the `remotion.config.ts` / `vitest.config.ts` /
`tsconfig.json` presets (`lib/project/`), and the reel editor with its Vite dev-server
plugin (`lib/editor/host/`). A template writes an id, a literal, a theme and ~30 lines
of configuration — see `docs/creating-templates.md`.

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
/toolkit:cut-tune                      # iterate timing/text in Studio (lock final durations here)
/toolkit:add-music                      # generate ACE-Step bg music sized to the final reel (optional)
/toolkit:render                         # final MP4 (or /toolkit:render preview for half-scale)
/toolkit:sync push out                  # back up code + renders (git + R2)
/toolkit:sync share                     # short URL of out/reel.mp4 — send to reviewers
```

**Footage-first variant (no screenplay authoring).** When the footage already exists and just
needs gluing together — a phone-shot gig promo, a to-camera announcement — swap the `narrate`
step for `/toolkit:assemble`, which writes the same `SCREENPLAY.md` automatically (clips at full
length in filename order, brand outro, optional gentle music bed; dead air is reported for you to
trim later, never cut silently) and hands off to `/toolkit:cut`, which consumes it like any other
screenplay:

```
/toolkit:video → (drop footage into public/recordings) → /toolkit:assemble → /toolkit:cut → /toolkit:cut-tune → /toolkit:render
```

`/toolkit:narrate` Branch B remains the interactive footage-first path for when the takes need
curating (choose the strong ones, cut filler, pull quotes) rather than just assembling.

Collaborator joining mid-project:

```
/toolkit:video → resume → /toolkit:sync pull → /toolkit:cut-tune (or wherever the work is)
```

**Auto-pull pravidlo (lazy sync)**: SessionStart hook spouští `python3 -m video_toolkit.check_stale_projects`, který tiše prohlédne R2 a vypíše banner `=== R2 STALE PROJECTS ===`, pokud některý lokální projekt zaostává. Když uživatel v dalším promptu zmíní práci na takovém projektu (resume přes `/toolkit:video`, "pokračujme v X", "co je v X", atd.), **NEJDŘÍV** spusť `/toolkit:sync pull <name>` (= git pull + R2 pull, jeden krok) a teprve potom dělej cokoli s jeho soubory. Bez čekání na další explicitní pokyn. Projekty, které v banneru nejsou, jsou aktuální — sync přeskoč. Pokud banner chybí úplně (R2 nedostupné, není nakonfigurováno), pracuj s lokálním stavem.

The schema-driven template uses Zod (`src/config/schema.ts`) so Studio's sidebar renders a full editor for every segment, overlay, and transition. Brand rules at `brands/<brand>/BRAND-RULES.md` are loaded by `/toolkit:narrate` and `/toolkit:cut` to enforce accent emphasis-only, 3s minimums, L-cut audio inheritance, and other authoritative discipline. `/toolkit:sync` keeps raw footage + renders in Cloudflare R2 so heavy media never goes to git but is still shareable across the team.

**The `add-*` command family:** `add-music`, `add-lottie-graphic` (and, planned,
`add-video-from-text`) each *generate or source a discrete asset and place it on the timeline*.
Animated components and transitions are code-level primitives composed via `/toolkit:cut` and
`/toolkit:slide-design`, not part of this family.

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
import { SlideTransition, FilmGrain, Vignette, LottieAnimation } from '@video-toolkit/lib/components';
```

| Component | Purpose |
|-----------|---------|
| `LottieAnimation` | Frame-synced Lottie overlay (loaders, checks, confetti, progress) |

## Python Tools

Audio, video, and image tools in `video_toolkit/`. Three things you need to know:

- **Setup**: `pip install -e .`
- **Always invoke from toolkit root** (`cd /path/to/claude-code-video-toolkit && python3 -m video_toolkit.<tool>`). Critical for background commands.
- **Every tool supports `--help`** for full CLI options.

Per-tool categories:

| Type | Tools | When to Use |
|------|-------|-------------|
| **Project tools** | voiceover, music_gen, sfx, sync_timing, lottie | During video creation workflow |
| **Utility tools** | addmusic, locate_watermark | Quick transformations on existing videos |
| **Cloud GPU** | image_edit, upscale, dewatermark, qwen3_tts, music_gen, flux2 | AI processing via RunPod or Modal (`--cloud runpod\|modal`) |

For ready-to-copy invocations of each tool (voiceover, sync_timing, qwen3_tts, image_edit, music_gen, dewatermark, transcribe, plus RunPod/Modal setup) see **`docs/tools-reference.md`**. Deeper patterns live in the corresponding `skills/<tool>/` directory and in `_internal/toolkit-registry.json`.

## Video Production Workflow

1. **Create/resume project** - Run `/toolkit:video`, choose template and brand (or resume existing)
2. **Review script** - Edit `VOICEOVER-SCRIPT.md` to plan content
3. **Gather assets** - Add external video footage
4. **Slide review** - Run `/toolkit:slide-review` to verify visuals in Remotion Studio
5. **Slide design** - Use `/toolkit:slide-design` or the "Refine" option in slide-review to improve slide visuals
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
| `review` | Scene-by-scene review in Remotion Studio (`/toolkit:slide-review`) |
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
- **During slide review** (`/toolkit:slide-review`): Choose "Refine" for visual improvements
- **Focused sessions** (`/toolkit:slide-design`): Deep-dive on a specific scene — `/toolkit:slide-design title`, `/toolkit:slide-design cta`

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

## Quality Gates

Run these before considering `lib/` or `examples/` work done. **All are manual, and that is a
deliberate choice, not an oversight to "fix" by wiring up CI.** Phase 4 considered CI and rejected
it: the pixel harness alone is ~60 s and several gates need a real browser / `remotion still`
render, so the gate economy that makes six-task days possible (run only what the diff can move,
skip with a stated reason, one full matrix at the end) works because a human decides what to run
each time. A CI job would either run everything on every commit (killing the speed this workflow
depends on) or reinvent the same conditional logic in YAML with none of the judgement. If CI is
ever added, it should run the full matrix on merge/release, not replace this per-task discipline.
`.github/workflows/` today only builds Docker images, cuts releases, and syncs the Remotion skill
from upstream — it does not and should not run these six.

| Gate | Command | Covers | Baseline (measured 2026-08-01, Phase 5 Task 4) |
|---|---|---|---|
| Editor tests | `cd lib/editor && npx vitest run --no-file-parallelism` | `lib/editor`, `lib/theming`, plus shared `lib/*` modules it imports | **109 files / 1807 tests** — 1801 passed, **6 skipped**, ~59 s this run (Task 4 migrated `checkerboard` — the catalog's LAST composite kind — to `plan`: its default `'fade'` moves onto `LayerOp.wrap` (the first NATIVE node to need one), `'scale'`/`'flip'` onto `ghosts`, plus a new `'mask-scale'` sub-option. The partition pin widened to NINETEEN kinds — the WHOLE catalog — leaving `COMPOSITE_KINDS` empty; three files (`video-track-remount.test.tsx`, `single-mount-assembly.test.tsx`, `dev-warnings.test.tsx`) swapped their `checkerboard` composite-arm fixture for a test-only `composite-probe` node, since no real catalog kind is composite any more. Fix round 1 fixed two Criticals — the carve-out's `to.style.opacity: 0` multiplied out its own `ghosts` (a GROUP-opacity mistake; fixed via a `wrap` that hides only the real mount) and the mask id, minted at factory time, collided across two byte-identically-configured simultaneously-mounted boundaries (fixed via `useState` inside the component, minting per MOUNT) — and added the effective-opacity (ancestor-multiplied) instrument that catches both, run through both a hand-rolled mirror and the real `buildVideoNodes` tree). **A kind, task or warning added/removed moves this number — re-derive it per file, never carry a prior count forward.** |
| Editor types | `cd lib/editor && npx tsc --noEmit ; echo "exit=$?"` | Same surface as above, plus all of `lib/render` and all of `lib/transitions` (incl. `TransitionGallery.tsx`, reached via `src/transition-gallery*.test.tsx`) | **3** pre-existing errors (`LayeredInspector.tsx:1052` `hide`, `derive-layered.test.ts:277`, `../theming/envelope.test.ts:1` — no `vitest` types), **exit code 2**, same three files. **Trap:** `npx tsc --noEmit \| grep -c 'error TS'` prints `0` when `tsc` itself crashes — always read the exit code separately, never the grep count alone. |
| Render/transitions types | `cd examples/layered-minimal && npm run typecheck` | `lib/render` and `lib/transitions` (including their `.tsx` components), via the example that actually imports them — see `docs/superpowers/core-typecheck-gate.md` | **0** errors, coverage guard holds at render **13** / transitions 16 / theming 26 / reel-config-base 10 / transcripts 1 files (unchanged this task — no new files under those trees; the guard is a FLOOR, so a rise never fails it) |
| Brand-leak grep | `grep -riE 'lime\|teal\|roost\|progresivn\|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'` | Any brand vocabulary leaking into shared `lib/` | exactly **2** hits, both comments naming the brand they were generalised from (`lib/theming/effects/ken-burns.ts`, `lib/transitions/presentations/burn.tsx`). Free — run it every time. |
| `it.fails` guard | `grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx` (the **escaped** dot — an unescaped `it.fails` also matches prose describing the pins historically and has produced a false positive twice) | Known-defect transition kinds shipped without a real fix | **zero** — all four historical pins were converted to real fixes in Task 2.1; still zero after Tasks 2.2/2.3/3. Re-derive; do not copy "zero" forward without running it. |
| Python — `sync_template` | `./.venv/bin/python -m pytest video_toolkit/tests/test_sync_template.py -q` | Template-scaffolding correctness; essentially never touched by render/transitions/editor work | **36 passed**. System `python3` has no `pytest` — use `./.venv/bin/python`. |
| Pixel harness | `cd examples/layered-minimal && npm run pixel-gate:strict` — **while iterating, filter to the kinds you touched** (see below); this full form is for the gate itself | Every at-cut transition kind × mode × progress — one still per cell, hash-compared against committed goldens | **PASS** in **45 s** (300 stills, 0 retried): `300 accepted (11 on a bimodal cell's second recorded hash — varies run to run, per `bimodalCells`' own nature; re-derive rather than trust this figure), 0 same-picture-different-bytes, 0 drifted, 0 missing`. Task 4 moved `checkerboard` (the catalog's last composite kind) onto `plan` — its default `'fade'` (the only one of its 15 goldens' cells) via `LayerOp.wrap` (an SVG mask, mechanism UNCHANGED from Task 0.1's), `'scale'`/`'flip'` via `ghosts` (not part of the catalog default, so not golden-covered). **ZERO cells moved** — the filtered `checkerboard`-only run and the full unfiltered run both show 0 drifted, matching this task's own hypothesis (parts 1 and 2 are both specified pixel-exact), verified again after fix round 1 fixed two Criticals in `checkerboard.tsx` (neither touches the `'fade'` default's rendered pixels). `bimodalCells` unchanged at **18** (`clock-wipe` 9, `iris` 7, `light-leak` 2) — this task touched neither list nor any of those three kinds. |

**`--strict` is the mode a parity claim must use — the plain `pixel-gate` is for day-to-day
iteration only.** The lenient default treats a near-miss (8×8 mean delta within tolerance) as a
warning; `--strict` makes it fatal. Renders here are **not byte-deterministic**: a per-render coin
flip (9-50% depending on the cell) produces one of two *stable, recorded* attractor hashes on 24
cells, concentrated in the rightmost 8 columns of the frame — this is renderer nondeterminism,
reproduced in fresh processes, not harness state leakage. `--strict` still passes reliably on an
unchanged tree because both attractors are accepted goldens; a hash that is neither is a real
`drifted`. Read `docs/superpowers/transition-pixel-harness.md` for the full mechanism (union rule
for re-seeding, `--audit-bimodal`, why the scope is a cell and never a kind) — it has changed more
than once this phase and a stale paraphrase here would be worse than a pointer to it.

**What the pixel harness cannot see, at all, in either direction: the editor-mount-lifecycle
defect class.** It renders 300 fully independent stills, so it never exercises a component
persisting or remounting *across frames* — the exact shape of the Task R1/R2 preview-only
transition-remount regression (media elements destroyed and recreated at a boundary, causing a
colour flash / stagger in the Player). That class is pinned by
`lib/editor/src/video-track-remount.test.tsx`'s DOM-identity assertions, a completely different
gate. A gate table that implies the pixel harness covers "transitions" end to end would be wrong;
it covers *what a single frame looks like*, not *whether the same DOM node persists across frames*.

### ALWAYS filter the pixel harness while iterating — this is an instruction, not a tip

**When you are working on specific transition kinds, pass them as bare positional arguments.
Do not run the full harness to check a change that touches two kinds.**

```bash
cd examples/layered-minimal && node scripts/render-transition-matrix.mjs wipe pixelate
```

That renders 2 kinds × 3 modes × 5 progress points = **30 stills instead of 300**, seconds
instead of ~47 s. Most work touches one to four kinds.

**The rule:**

- **Iterating on a change** → filter to the kinds you touched. Every time. Re-running 300
  stills to learn about 30 is waste, and you will do it many times per task.
- **Before committing** → one full `npm run pixel-gate:strict`, unfiltered. That is the gate;
  the filtered runs are not.
- **Reviewing** → filter unless the finding is about the harness itself or an axis.

An entire workstream was run with every agent doing a full pass on every iteration — minutes
per task, thrown away, because the filter is undocumented anywhere the agents were reading.
If you catch yourself waiting ~47 s to look at one kind, you have made this mistake.

**Two things the filter does NOT substitute for**, both deliberate:

- A filtered run **refuses an axis change** (`MODES` / `PROGRESS`) — an axis change touches
  every kind, so it must be re-baselined unfiltered. You will see
  `AXIS CHANGE ON A FILTERED RUN`.
- **Harness-machinery work needs unfiltered runs.** Several guards behave differently on a
  filtered run (by design — read the comments before changing one), so if you are editing
  `scripts/render-transition-matrix.mjs` itself, filtering hides the thing you are testing.

### The harness renders serially — and the "parallel is slower" comment is narrower than it looks

`shoot()` is called from a plain triple `for` loop over kind × mode × progress against **one
warm browser**, i.e. 300 sequential `renderStill` calls on a 10-core machine. The long comment
above `openBrowser` says other arrangements "measured worse" — but what was actually measured
is (a) letting `renderStill` launch its **own Chrome per still** (~7× slower, dies around 60
stills) and (b) **recycling** the browser every 15 stills (`EPIPE` crashes, orphaned
`chrome-headless-shell` processes that wedge the next run). **Neither is "shard the kind list
across N concurrent browsers"**, which is untried here and is the normal way to parallelise
this. Expect 3–4× on 10 cores.

**If you do it, know the hazard first.** Render non-determinism in this repo is **bimodal and
process-dependent**, and separate processes are the *enumerating* axis for it — so sharding
across processes will surface bimodal cells the serial run never sampled. That is *allowed*
(the union rule treats the list as a lower bound and additions are fine), but it means the
first runs churn the golden file. Do the re-seed **deliberately, in the same commit**, rather
than discovering it mid-task and reading it as drift.

**Do not shrink the render scale to go faster.** It invalidates every golden and destroys the
margin that separates a real regression (8×8 mean delta 1–2) from the flake (0.0183).

**If a gate run hangs at startup, check for stray `chrome-headless-shell` processes** before
anything else — a killed run leaves orphans that wedge the next one for minutes.

**There are no `it.fails` pins left.** Four known-defect pins used to live in
`lib/editor/src/at-cut-transitions.test.tsx` (`checkerboard`, `pixelate`, `scanline-glitch`,
`wipe`), and vitest counted each as a pass — so "all passed" was not full green. Phase 4
Task 2.1 fixed all four (they are native two-input nodes now) and the pins are gone.
**Still re-derive rather than trust this line** —
`grep -c 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx`, expected **0**; the
count has been wrong in writing three times. Historical detail:
`docs/superpowers/at-cut-transition-findings.md`.

**The 6 SKIPPED tests are deliberate and derived** (re-derived for Phase 5 Task 3 — it
was 5 through Task 2.2/2.3; `rgb-split` joined `NODE_KINDS` this task, migrating from a
one-sided `TransitionPresentation` core lifted (twice — once per direction, via
`fromRemotionPresentation`) to a native node returning `ghosts` directly, so it is now
`isTransitionNode(resolved)` straight out of `resolveTransition` like the other five — the "a
kind cannot opt out quietly" guarantee below is what caught this automatically, not a
hand-edited count). They are the generic "carries its authored params through to the
presentation" case for the six kinds that resolve to a two-input node — a node closes over its
params, so there is no props bag to read. The set of skipping kinds is itself asserted, so a
seventh kind cannot opt out quietly.

**What replaces them, precisely** (an earlier version of this paragraph claimed "pinned by
DOM assertions" and that was **false** for 9 of the 11 params): the
`two-input node <kind> delivers every authored param` block in the same file is a
**differential** check — for every sub-option `subOptionsFor(kind)` declares, it renders
the kind twice, catalog default vs an in-bounds probe value for that one param, at three
progress points, and requires the rendered output to differ. All **15** tunable params are now
covered (`pixelate` ×5, `checkerboard` ×4, `scanline-glitch.rgbShiftPx`, `wipe.direction`,
`gradient-wipe.direction` + `gradient-wipe.softness`, `rgb-split.direction` +
`rgb-split.displacement` — the two params Task 3's migration added, re-derived directly off
`subOptionsFor('rgb-split')` rather than assumed; `wipe.color` and `fade-to-color.color` by the
accent tests — an `accent`-typed param has no in-bounds probe value to invent, so it gets a
differential test of its own instead). It is derived so a new param is covered the day it is
added, and it fails whether the value is dropped at the forwarding table in
`lib/render/at-cut-transitions.tsx` or ignored inside the node. **This hole was real:**
deleting `scanlines: t.scanlines` from that table previously passed every gate, because
the editor suite skipped the kind and the pixel harness only ever renders catalog
defaults. **Task 3 found a SECOND instance of the same hole class, for `rgb-split`
specifically:** the differential helper (`mountPlan` in `at-cut-transitions.test.tsx`) rendered
`style`/`z`/`wrap` but not `ghosts` — and `rgb-split`'s whole picture lives on `ghosts`, so
`direction`/`displacement` both failed "not to be" on two byte-identical strings until the
helper was fixed to render ghosts too (mirroring `LayerShell`'s own production behaviour).

**The differential block went vacuous for 5 of the 11 params, silently, and was fixed in
Phase 5 Task 0.2's fix round.** It compares two renders' `container.innerHTML`. Once
`checkerboard` (Task 0.1) and `scanline-glitch` (Task 0.2) each started minting an unseeded
`random(null)`-derived SVG `id` on every mount, the two HTML strings could never be equal
regardless of any param — proven by hard-coding `checkerboard`'s `gridSize`/`pattern`/
`stagger`/`squareAnimation` and `scanline-glitch`'s `rgbShiftPx` in turn and confirming the
block still passed every time. The helper (`stripGeneratedIds`, same file) now normalises
`id="…"` and `url(#…)` to a fixed placeholder before comparing, restoring the guarantee — and
that fix was itself proven by re-running the same 5 hard-coded-param mutations and confirming
each now goes red. **Any future kind minting a fresh per-mount id needs no new test** — the
normalisation is generic — but a kind whose differential test still passes with a param
hard-coded should raise the same suspicion the "9 of 11" DOM-assertion claim above should have.

The pixel harness has **18** known-**bimodal** cells with two accepted hashes each: `clock-wipe`
9, `iris` 7, `light-leak` 2 (`light-leak__exit__p025`/`__p05`, minority 1/24 each). This is
Phase 5 Task 2.3's own re-derivation, not a carried-forward number, and the count's history is
worth reading because a shallow re-seed produced a WRONG intermediate value along the way: Task
2.3's migration re-shapes `light-leak`'s picture (the `isolation: 'isolate'` flag turning on),
which legitimately de-lists the 8 `light-leak` cells that were bimodal before it — their old
second hash does not apply to a materially different picture, and the harness's own `NOTE` lines
say so explicitly, not a silent drop. The FIRST re-seed pass ran at only `--repeat=6` and found
zero bimodal `light-leak` cells — which a review caught as structurally meaningless: the script's
own `BIMODAL_RECORD_SAMPLES` is 8, so a 6-sample run cannot record a second attractor even if one
exists. Re-running at `--repeat=24` (the depth Phase 4 Task 2.3 needed for six of these same
cells previously) recovered exactly 2, not 0. Before Task 2.3 the count was 24 (18 until Phase 4
Task 2.3 confirmed six more at 24 samples each — one `iris` and five `light-leak` edge cells,
each of which had been failing `--strict` intermittently; 19 until Task 2.2, which re-baselined
six `light-leak` edge cells whose recorded pictures no longer existed and seeded five new ones at
`--repeat=12`). The parenthesised "N matched a bimodal cell's SECOND recorded hash" in a gate run
varies legitimately between runs; `0 drifted, 0 missing` is the gate, that count is not.

**Check `tsc`'s exit code, not just the error count** — `npx tsc --noEmit | grep -c 'error TS'`
returns `0` when tsc *crashes*. This has bitten twice.

The brand-leak gate is **count-based**: `grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'` must keep returning exactly **2** hits. They are both prose in comments, and the *files* move as code is refactored — today they are `lib/theming/effects/ken-burns.ts` and `lib/transitions/presentations/burn.tsx`. Treat a change in the count as the signal; a change in which file carries a hit is only worth a look.

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
- `docs/zod-version.md` - **The zod pin (`3.22.3`, exact) and why.** Read before changing any
  `zod` or `remotion` version in core or a brand repo — the mismatch fails silently.
- `docs/video-timing.md` - Full timing reference (WPM, density tables, TTS drift, audio-anchoring)
- `docs/remotion-patterns.md` - Toolkit Remotion conventions + transitions
- `docs/getting-started.md` - First video walkthrough
- `docs/creating-templates.md` - Build new templates
- `docs/creating-brands.md` - Create brand profiles
- `docs/optional-components.md` - Setup for optional ML-based tools (ProPainter, etc.)
