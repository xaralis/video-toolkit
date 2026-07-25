---
description: Turn finished talking-head footage into a cut reel — no screenplay authoring
---

# Assemble

Take **footage that already exists** — a phone-shot gig promo, a to-camera announcement — and
cut it together as-is: clips in order, the brand outro on the end, optionally a music bed
underneath. Nothing to plan, nothing to script, nothing to perform.

This command writes the standard `SCREENPLAY.md`, which `/toolkit:cut` then consumes like any
other. The screenplay is the seam between the two commands.

**Pick the right tool:**

| You want | Use |
|---|---|
| Glue finished footage together, minimal fuss | **`/toolkit:assemble`** (this) |
| Help choosing takes, cutting filler, pulling quotes | `/toolkit:narrate` (Branch B — footage-first, interactive) |
| Plan a shoot before filming | `/toolkit:narrate` (Branch C → shooting checklist) |
| Beat-synced photo/video montage, clip audio muted | the brand's montage command (e.g. `/roost-reel`) |

Design: `docs/superpowers/specs/2026-07-25-footage-first-assemble-design.md`.

## Quick start

```
/toolkit:assemble                  # assemble the current project
/toolkit:assemble <project-name>   # explicitly target
```

## What this command does NOT do

Stated up front, because the value is in the restraint:

- **No curation.** Every clip goes in, in filename order. Choosing the better take or cutting a
  rambling middle is `/toolkit:narrate` Branch B.
- **No trimming.** Clips keep their full length. Dead air is *reported* (Step 6) so you can trim
  it visually in `/toolkit:cut-tune`, where trimming is a first-class operation — this command
  never silently reshapes footage.
- **No overlays.** No titles, quote-pulls or stat callouts. Add them later in the editor.
- **No b-roll interleaving.** `public/broll/` is ignored; only `public/recordings/` is assembled.

## Flow

### Step 1: Detect project

1. If invoked from inside a `projects/<name>/` directory, use that project.
2. Else scan `projects/` for active projects (any directory with `src/Root.tsx`).
3. If multiple, ask which. If none, suggest `/toolkit:video` first.

### Step 2: Guard an existing screenplay

This command authors a screenplay from scratch. If `projects/<name>/SCREENPLAY.md` already
exists:

- Summarize what is there (segment count, target duration).
- Offer `/toolkit:narrate` to edit it instead.
- Only regenerate on an explicit confirmation — and say plainly that hand edits will be lost.

### Step 3: Select the brand

The screenplay's frontmatter carries `brand` + `brandRulesPath`, and `/toolkit:cut` relies on
both, so a brand must be resolved before anything is written:

1. If `project.json` records a brand, use it.
2. Else scan the workspace's `brands/` and offer the choices. One brand → use it, saying which.
3. Read `brands/<brand>/voice.json` if present; a declared language there is the transcription
   language for Step 6. Do not assume a language default.

Also read `brands/<brand>/BRAND-RULES.md` now — it is needed for the Step 8 warnings, which
must appear in the summary *before* anything is written.

### Step 4: Inventory footage

List `public/recordings/`. If it holds no real footage (empty or only `.gitkeep`), stop and
tell the user to drop their clips there first. Do not invent segments for footage that does not
exist.

Report the file count and total raw duration.

`public/broll/` is deliberately ignored by this command — say so if it is non-empty, so the
user knows those files are not in the reel.

### Step 5: Ingest — probe durations, bake rotation

```bash
python3 -m video_toolkit.ingest_media projects/<name>/public/recordings \
  --out projects/<name>/.assemble-manifest.json
```

Read the manifest. Each entry carries `file`, `type`, `width`, `height`, `orientation`,
`durationSec` and `rotation`.

Three things matter here:

- **Rotation baking.** Any file carrying rotation metadata gets an upright sibling
  `<name>_upright.mp4` written into the same directory. This flow's typical input is phone
  footage, where dangling rotation metadata is the classic way a reel comes out sideways.
  **Reference the manifest's `file` value everywhere downstream** — the screenplay's `Source:`,
  the transcription inputs, the summary — so the upright file, not the crooked original, is what
  gets cut. Re-running is outcome-safe (the manifest never doubles up), though it does re-encode
  each rotated clip, so it is not free.
- **Files the manifest does not mention.** `ingest_media` only accepts `.jpg/.jpeg/.png/.webp`
  and `.mp4/.mov/.m4v`, and it drops anything else **without a warning** — a folder of `.mkv` or
  `.avi` clips yields an empty manifest and no complaint. So diff the Step 4 inventory against
  the manifest entries and report every file that did not make it, by name.
- **Warnings.** `ingest_media` prints `WARNING:` to stderr for files it skipped (bad probe,
  unsupported codec) or where baking left a residual. Carry these into the Step 9 summary.

### Step 6: Transcribe (best-effort — never a blocker)

`video_toolkit.transcribe` needs a configured cloud endpoint and exits with an error without
one, so this step must degrade gracefully.

**If the endpoint is configured**, transcribe the manifest's `file` values — the upright ones:

```bash
python3 -m video_toolkit.transcribe \
  projects/<name>/public/recordings/<manifest file 1> \
  projects/<name>/public/recordings/<manifest file 2> \
  --language <lang>
```

Getting this wrong is silent: transcripts are resolved at render time by exact source name
(`recordings/<source>.transcript.json`), so transcribing the pre-bake original leaves the
upright clip with no transcript and the reel with no captions, without any error.

Do **not** pass `--screenplay` — there is no screenplay yet. `/toolkit:cut` re-transcribes later
with the freshly written screenplay as Whisper's `initial_prompt`, which is a no-cost accuracy
improvement, so baseline accuracy here is fine.

Then **proofread lightly**: scan for obvious recognition errors — mangled proper nouns,
phonetically-adjacent swaps, missing diacritics — and fix the clear ones directly in each
`<file>.transcript.json` so they do not propagate into the screenplay's `Spoken intent`. Keep it
light: `/toolkit:cut` re-transcribes these same files with the screenplay as its prompt and
**overwrites** them, then proofreads again, so a thorough pass here is wasted effort. The pass
that matters for the captions is `cut`'s.

**Dead air — report, never trim.** With transcripts, note any clip with more than ~1.5 s before
its first word or after its last, and report it in the summary with the amount. Do **not** act
on it: the screenplay has no field for a trim offset, so a trim recorded here would be dropped
by `/toolkit:cut` (which derives `trimIn` from 0 and `trimOut` from the duration target) and
would silently cut the *end* of the speech instead. Trimming belongs in `/toolkit:cut-tune`,
where the user sees what they are cutting.

**If the endpoint is not configured**, skip transcription and say so plainly. Consequences,
stated rather than buried:

- the screenplay's `Spoken intent` lines get a neutral placeholder;
- there are no captions until `/toolkit:cut` transcribes;
- dead air is not detected, so nothing is reported about it.

### Step 7: Music bed (optional)

List `public/audio/`. **Ignore `demo.wav`** — that is the template's placeholder test tone, not a
bed; if it is the only file there, skip this step silently. Most of these reels do not need music.

With a real track present, offer it:

> Found `audio/<file>`. Lay it under the speech as a music bed?

On yes, remember the choice for the Step 9 summary and set frontmatter `musicVolumeDb: -18` when
writing — well under speech, because the bed is atmosphere and the talking is the point.
`/toolkit:cut` reads that frontmatter value (its Step 6 music rules), and core's music envelope
applies a data-driven 1 s fade-out at the end (`fadeOutMs ?? 1000`), so the bed lands softly with
no extra plumbing. A fade-in is a one-field tweak in the editor afterwards.

If several real tracks are present, ask which one rather than guessing.

### Step 8: Brand rules — evaluate for the summary

Using `BRAND-RULES.md` from Step 3, report violations the footage causes — a sub-3 s clip, a
missing disclaimer, a pace the rules would flag — **in the Step 9 summary, before the write**,
so the user can weigh them while they still have a choice.

Do not reshape the footage to satisfy a rule. The premise of this command is footage as-is;
silently stretching or dropping a clip to hit a minimum would defeat it. Say what the rules
say, and let the user decide whether to reshoot, trim in the editor, or accept it.

### Step 9: Confirm, then write

Show one summary and get a confirmation before writing anything:

```
Assembling <project> (brand: <brand>):

Clips:     5 (filename order, full length)
  01  IMG_4471_upright.mp4     10.5s   (2.1s dead air at head — trim in cut-tune)
  02  IMG_4472.mp4             12.0s
  03  IMG_4473.mp4              6.2s
  04  IMG_4474.mp4              9.1s
  05  IMG_4475_upright.mp4      7.7s
Outro:     brand stinger (exact length is set by /toolkit:cut)
Total:     45.5s of footage + outro
Music:     audio/promo-bed.wav at -18 dB
Captions:  yes (transcribed)
Rotation:  2 files baked upright
Skipped:   IMG_4476.mkv — extension not supported by ingest_media
Brand:     no disclaimer text set (rules require one)

Write SCREENPLAY.md?
```

Then write `projects/<name>/SCREENPLAY.md`. The format is `/toolkit:narrate` Step 5's, with the
Shooting Checklist omitted (the footage is already shot). Written literally, for this command:

```markdown
---
topic: <project topic — from project.json, else the dominant theme of the transcripts>
chevron:
brand: <brand>
brandRulesPath: brands/<brand>/BRAND-RULES.md
durationTargetSec: <sum of the clip duration targets below — footage only, no outro>
musicVolumeDb: -18   # only when a bed was chosen in Step 7
---

# Screenplay — <topic>

<One-paragraph synopsis of what the footage covers, from the transcripts. Without
transcripts: "Assembled from existing footage; N to-camera clips.">

## seg-001  [clip · face]

**Spoken intent:** <what this clip actually says, lightly paraphrased>

**Duration target:** <durationSec from the manifest, floored to 0.1s>s

**Source:** <manifest `file`>

## seg-002  [clip · face]

...

## seg-NNN  [outro]

**Duration target:** 6s (brand stinger)
```

Notes on the format, so a fresh run does not have to guess:

- The clip heading is `[clip · face]` — **no role**. `narrate`'s format has a third
  `· <role>` field (opening hook / evidence / CTA); assigning one is editorial judgement this
  command explicitly does not make, and nothing downstream parses it.
- `chevron` is left empty unless the brand's rules require one.
- `Spoken intent` without a transcript: `To-camera segment (not transcribed)`.
- No `**Overlays:**` blocks at all.
- `Source:` is always a real filename, never `TBD` — `/toolkit:cut` Step 3 honours a declared
  `Source:` and skips its own filename matching, which is what keeps the clip order intact.

Then regenerate the HTML companion in the same breath — mandatory for every screenplay write:

```bash
python3 -m video_toolkit.render_screenplay_html <name>
```

Do NOT hand-author a bespoke HTML — the tool is the single source of the house style. It exits
with an error if `pandoc` is missing; report that and carry on, the screenplay itself is fine.

### Step 10: Next step

- Record the assembly in `projects/<name>/project.json` if it exists (add a session entry).
- Delete `.assemble-manifest.json`.
- Point at `/toolkit:cut`.

```
Screenplay written. Next: /toolkit:cut to build the reel config, then
/toolkit:cut-tune to trim dead air, add text and adjust timing in Studio.
```

## Notes

- **What `cut` needs from this command.** `cut` reads the frontmatter (`topic`, `chevron`,
  `brand`, `brandRulesPath`, `musicVolumeDb`), each segment's type marker, `Duration target`
  and `Source:`. Two behaviours of `cut` are load-bearing here: Step 3 honours a declared
  `Source:` (so the filename order survives), and Step 6's music rules read frontmatter
  `musicVolumeDb` and skip the `demo.wav` placeholder (so the −18 dB bed survives). Don't add an
  assemble-specific path to `cut` beyond those.
- **Clip audio is the point.** Talking-head clip audio reaches the reel through the layered
  model's audio track (`audioMode: 'voice'` → an `AudioItem` per clip), which every brand
  template renders via core's shared composition. If a brand's reel comes out silent, that
  template is not mounting `reel.tracks.audio` — see
  `docs/superpowers/specs/2026-07-25-layered-reel-composition-design.md`.
- **Captions** are not overlays. They are resolved at render time from
  `recordings/<source>.transcript.json` next to each clip, which is why Step 6's
  transcribe-the-upright-file rule decides whether captions appear at all.
- Re-running is safe: Step 2 guards an existing screenplay and `ingest_media` is outcome-safe on
  repeat.
