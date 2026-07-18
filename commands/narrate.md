---
description: Author or edit SCREENPLAY.md for the current reel project
---

# Narrate

Co-author a screenplay for a video reel. The screenplay is the durable
source of truth for the video's intent — what each segment should be,
what overlay text appears when, what language the candidate uses.

## Quick start

```
/narrate                 # author or edit SCREENPLAY.md in the current project
/narrate <project-name>  # explicitly target a project
```

## Flow

### Step 1: Detect project

1. If invoked from inside a `projects/<name>/` directory, use that project.
2. Else scan `projects/` for active projects (any directory with `src/Root.tsx`).
3. If multiple, ask user which one. If none, suggest running `/video` first.

### Step 2: Detect existing screenplay or footage

Three branches based on project state:

#### Branch A — Existing screenplay

Read `projects/<name>/SCREENPLAY.md` if it exists.

- Summarize current segments: `N segments, ~Xs target duration, brand: <brand>`
- Ask: "What would you like to change? (e.g., 'add b-roll between seg-003 and seg-004', 'rephrase the intro', 'extend the closing')"
- Iterate edits.
- Confirm before destructive removals.

#### Branch B — No screenplay, footage already exists (footage-first path)

If `public/recordings/*` (or `public/broll/*`) contains clips but no `SCREENPLAY.md` exists, the user shot something without a formal screenplay. Offer to *listen to the footage* and propose a screenplay reverse-engineered from the spoken content.

Flow:

1. **Inventory** — list all clips in `public/recordings/` and `public/broll/`. Show the user the count and total raw duration.
2. **Confirm path** — "I can transcribe these and propose a screenplay based on what was actually said. Or you can describe the intent and I'll plan around the footage. Which way?"
3. **If transcribe-first**:
   - Run `python3 -m video_toolkit.transcribe public/recordings/*.MP4 --language cs` (no `--screenplay` flag yet since we don't have one).
   - Read each `<file>.transcript.json` in full.
   - **Proofread the transcripts** (brand rule #27): scan for obvious Whisper errors — proper-noun mangling (Pardubice → patubickým), phonetic swaps (ploše → tloše, vozidel → lozidel), missing diacritics. Edit the JSON in place to fix CLEAR errors before they propagate into the screenplay + captions.
   - **Summarize what was said** to the user in chat — clip by clip, in 1–2 sentences each. Identify the strongest takes, repetitions, filler.
4. **Propose a screenplay from transcripts**:
   - Pick a topic + chevron based on the dominant theme of the recordings.
   - Suggest a segment breakdown that uses the strong moments and skips filler. Mix clip + broll naturally — if there's only talking-head footage, propose L-cut b-roll cutaways from `public/broll/` if any exist.
   - For each clip segment, set `Spoken intent` to the actual spoken phrase (paraphrased lightly if needed — the screenplay is intent, not verbatim transcript).
   - Suggest `quote-pull` / `title` overlay texts pulled from the strongest spoken phrases.
   - Mark `Source: <filename>.MP4` directly (no `TBD` — we know which file backs each segment).
5. **Confirm** — show the proposed screenplay outline before writing. Iterate with the user.
6. **Write SCREENPLAY.md** in the standard format (Step 5 below) but SKIP the Shooting Checklist section — footage already exists.
7. Next step: `/cut` to convert the screenplay into `defaultProps`.

This branch turns a pile of phone clips into a structured reel. It's also the right path when someone hands off a finished shoot to you without context.

#### Branch C — No screenplay, no footage (planning path)

- Ask: "What's this video about? (topic + audience + key message)"
- Ask: "Target duration? (typical reel: 30–60s)"
- Ask: "Which brand?" (scan `brands/` and offer choices; if user picks one, load its `BRAND-RULES.md`)
- Propose a segment breakdown based on the topic + length + brand rules.
- Write SCREENPLAY.md WITH the Shooting Checklist section (Step 6 below) since footage doesn't exist yet.

### Step 3: Load brand context (if brand selected)

Read `brands/<brand>/BRAND-RULES.md` in full. Every screenplay proposal must
respect the rules there:
- accent emphasis-only (1–3 words per quote-pull)
- 3s minimums for b-roll and emphasis text
- chevron/title/disclaimer treatments
- L-cut audio inheritance patterns
- pace ~7-10s between emphasis beats

Without a brand, default to campaign-reels template conventions.

### Step 4: Co-author segments

For each segment, decide:
- **Type**: `clip` (talking-head) / `broll` (cutaway) / `multi-clip` / `card` / `outro`
- **Role**: opening hook / problem framing / evidence / solution / CTA / etc.
- **Spoken intent** (for clip): what the candidate should say (Czech text)
- **Visual intent** (for broll): what to film
- **Overlays**: title/quote-pull/stat-callout/source-tag with timing & text
- **Duration target**: integer seconds or range
- **Source**: leave as `TBD` if footage doesn't exist yet

Iterate until user approves.

### Step 5: Write SCREENPLAY.md

Format:

```markdown
---
topic: <topic>
chevron: <CATEGORY>
brand: <brand-name>
brandRulesPath: brands/<brand>/BRAND-RULES.md
durationTargetSec: <number>
musicPrompt: "<short ACE-Step prompt>" # optional, used by /cut if music is desired
musicVolumeDb: -6 # optional default
---

# Screenplay — <topic>

<one-paragraph synopsis>

## seg-001  [clip · face · <role>]

**Spoken intent:** <Czech text the candidate should say>

**Duration target:** <N>s

**Overlays:**
- `<kind>` <appearMs>..<endMs> [<placement>]: `<text>`

**Source:** TBD

## seg-002  [broll · audio-inherit-from seg-001]

**Visual intent:** <description>

**Duration target:** <N>s

**Source:** TBD

...

## seg-NNN  [outro]

**Duration target:** 6s (brand stinger)
```

### Step 6: Shooting checklist (if footage doesn't exist)

If user confirms footage hasn't been filmed yet, append a section to
SCREENPLAY.md:

```markdown
## Shooting Checklist

Recommended filename convention: `segNN_<short-description>.MP4` so `/cut`
can auto-map source files to segments. E.g., `seg01_intro.MP4` lands on
seg-001.

- [ ] seg-001 [clip]: <spoken intent>
- [ ] seg-002 [broll]: <visual intent>
- [ ] seg-003 [clip]: <spoken intent>
...
```

### Step 7: Render the HTML companion (ALWAYS, automatic)

Every time `SCREENPLAY.md` is written or edited, regenerate its HTML companion
in the same breath — they are a pair and must never drift:

```bash
python3 -m video_toolkit.render_screenplay_html <name>
```

This produces `projects/<name>/SCREENPLAY.html` (dark PP-branded pandoc render,
shareable/printable). Do NOT hand-author a bespoke HTML — the tool is the
single source of the house style. Run it on the planning path, the
footage-first path, AND on every re-run of `/narrate` that edits an existing
screenplay (Branch A). If `pandoc` is missing, warn the user and continue.

### Step 8: Update project state

- Record the screenplay generation in `projects/<name>/project.json` if it
  exists (add a session entry).
- Suggest next steps:
  - If footage not yet filmed: "Film per the shooting checklist, then run `/cut`."
  - If footage exists: "Run `/cut` to map your recordings to the screenplay."

## Notes

- The screenplay is human-editable. Users can hand-edit `SCREENPLAY.md`
  in any editor; subsequent `/cut` runs respect the edits.
- Brand rules are LOADED, not hardcoded — switching brands or updating
  `BRAND-RULES.md` changes future `/narrate` proposals automatically.
- Re-running `/narrate` on an existing screenplay is always interactive;
  never destructive without confirmation.
- The three branches (existing screenplay / footage-first / planning) all
  produce the SAME artifact — a `SCREENPLAY.md` in the project's standard
  format — so `/cut` doesn't care which branch was taken.
- Footage-first transcription does NOT use the `--screenplay` flag (no
  screenplay yet to seed Whisper's `initial_prompt`). Transcription
  accuracy is therefore baseline; if proper-noun errors show up,
  re-running transcription with the freshly-written screenplay as the
  prompt is a no-cost improvement (Modal cache hits, ~10–20s per clip).
