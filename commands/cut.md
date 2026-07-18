---
description: Bridge SCREENPLAY.md + footage → reel config defaultProps
---

# Cut

Read the screenplay, inventory footage, transcribe, and write the
generated `defaultProps={{...}}` literal into `src/Root.tsx`.

## Quick start

```
/cut                  # cut the current project
/cut <project-name>   # explicitly target
```

## Flow

### Step 1: Detect project + screenplay

1. Detect project (same as `/narrate`).
2. Verify `SCREENPLAY.md` exists. If not, suggest `/narrate` first.
3. Read the screenplay; parse segments, overlays, brand, duration targets.

### Step 2: Inventory footage

List files in:
- `projects/<name>/public/recordings/` (talking-head clips)
- `projects/<name>/public/broll/` (b-roll cutaways)

If both directories are empty, output a message: "No footage found. Per the
shooting checklist in SCREENPLAY.md, drop your recordings into
`public/recordings/` (talking heads) and `public/broll/` (b-roll), then run
/cut again."

### Step 2b: Sync brand assets

Brand-level assets (watermark, skyline, outro mp3/mp4, logos) live in
`brands/<brand>/assets/`. The project references them via
`staticFile('brand/...')` which resolves to `projects/<name>/public/brand/`.
Mirror them with:

```bash
python3 -m video_toolkit.sync_brand_assets <name>
```

The tool is idempotent (size-based skip), so it's safe to re-run on every
`/cut`. Run BEFORE the render-time logic in later steps so missing
assets (`brand/skyline.svg`, etc.) don't blow up Studio /
`/render` with "Error loading image". A new brand asset shipped after
the project was scaffolded won't appear automatically — re-running
`/cut` (or invoking `sync_brand_assets.py` directly) pulls it in.

### Step 3: Map source files to segments

For each segment in SCREENPLAY.md:

1. **Auto-match via numbering convention**: regex `^(seg)?0*(\d+)_/i` on
   each filename. If the captured number matches the segment's ID
   number (e.g., `seg-001` ↔ `seg01_intro.MP4`), auto-assign.

2. **Heuristic match** (if no convention match): for clip segments, propose
   the largest unassigned file in `public/recordings/`. For broll segments,
   propose unassigned files in `public/broll/` in directory-sort order.

3. **Show the proposed mapping to the user** as a table:

   ```
   seg-001  [clip]   → GX010827.MP4
   seg-002  [broll]  → GX010818.MP4
   seg-003  [clip]   → GX010827.MP4 (same source as seg-001, different trim)
   ...
   ```

4. Ask user to confirm or override. Allow per-segment override interactively.

### Step 4: Transcribe

Run `python3 -m video_toolkit.transcribe` on all unique `clip` source files:

```bash
python3 -m video_toolkit.transcribe \
  projects/<name>/public/recordings/<file1>.MP4 \
  projects/<name>/public/recordings/<file2>.MP4 \
  --language cs \
  --screenplay projects/<name>/SCREENPLAY.md
```

The `--screenplay` flag feeds Whisper the screenplay's `Spoken intent` lines
as `initial_prompt`, improving proper-noun accuracy.

Transcripts are written next to each source as `<file>.transcript.json`.

**After transcription, proofread** (brand rule #27): even with `initial_prompt` priming, Whisper still mangles some Czech proper nouns and phonetically-adjacent words. Read each transcript and fix obvious errors directly in the JSON before computing trims or overlay text — defects compound otherwise.

### Step 5: Compute trim ranges + overlay timing

For each segment, derive the config fields:

- **clip segment**:
  - `trimIn`: start at the segment's intended source position. For the first
    clip-segment of a given source, default to 0. For subsequent clip-segments
    of the same source, start where the previous segment's audio ended.
  - `trimOut`: `trimIn + duration_target` (or use transcript word timestamps
    to find a sensible cut point near the target).
  - `overlays`: carry over verbatim from screenplay.

- **broll segment** with `audio-inherit-from seg-X`:
  - `audioMode`: `'inherit-from-clip'`
  - `audioSource`: source filename of the referenced clip
  - `audioStartSec`: where in that source the inherited audio begins (= preceding clip's trimOut)
  - `trimIn`: 0
  - `trimOut`: `duration_target`

- **broll segment** with silent audio: `audioMode: 'silent'`.

- **outro segment**: `{ id, type: 'outro' }` only.

### Step 6: Generate `defaultProps={...}` literal

Build the full `defaultProps` object:

```ts
{
  topic: '<from frontmatter>',
  chevron: '<from frontmatter>',
  audio: { music: 'audio/bg.mp3', musicVolumeDb: -6 }, // if music exists in project public/audio/
  segments: [
    { id: 'seg-001', type: 'clip', source: 'GX010827.MP4', trimIn: 0, trimOut: 5.5, overlays: [...] },
    { id: 'seg-002', type: 'broll', source: 'GX010818.MP4', trimIn: 0, trimOut: 3.0,
      audioMode: 'inherit-from-clip', audioSource: 'GX010827.MP4', audioStartSec: 5.5 },
    ...
  ],
}
```

### Step 7: Write into `src/Root.tsx`

Locate the existing `defaultProps={{...}}` block in `src/Root.tsx` via
regex (or a simple AST-aware string operation) and replace it with the
generated literal. Run `prettier` on the file afterwards to normalize
formatting.

```bash
npx prettier --write projects/<name>/src/Root.tsx
```

### Step 8: Summary

Print to user:

```
Cut complete.

Topic:           Magnum pro lidi
Chevron:         DOPRAVA
Segments:        11 (10 mapped, 1 outro)
Total duration:  ~46.2s
Warnings:        0

Next: /fine-tune to iterate in Studio.
```

If there are warnings (3s violations, unused source files, missing transcripts),
list them.

### Step 9: Re-run semantics

Re-running `/cut` on a project with an existing `defaultProps`:
- Re-read SCREENPLAY.md (it may have been edited)
- Re-detect footage (some may have been added or replaced)
- Re-transcribe only newly-added or replaced files
- Compute a diff between current `defaultProps` and the freshly generated one
- Show diff to user; ask before writing.

This keeps `/cut` safe to re-run after partial re-shoots or screenplay edits.

## Notes

- `/cut` doesn't touch user code outside `Root.tsx`. Custom overlays or
  components written by hand stay intact.
- If a user has manually edited `defaultProps` (e.g., via Studio Save),
  `/cut` will diff and offer to merge rather than overwrite — the goal
  is to respect human edits while still reflecting screenplay updates.
