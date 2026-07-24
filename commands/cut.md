---
description: Bridge SCREENPLAY.md + footage → reel config defaultProps
---

# Cut

Read the screenplay, inventory footage, transcribe, map footage to a segment
config, then **derive the track-native `LayeredReel`** and write it as the
`defaultProps={{ reel: {...} }}` literal into `src/Root.tsx` (the
`LayeredCampaignReel` composition renders from it).

## Quick start

```
/toolkit:cut                  # cut the current project
/toolkit:cut <project-name>   # explicitly target
```

## Flow

### Step 1: Detect project + screenplay

1. Detect project (same as `/toolkit:narrate`).
2. Verify `SCREENPLAY.md` exists. If not, suggest `/toolkit:narrate` first.
3. Read the screenplay; parse segments, overlays, brand, duration targets.

### Step 2: Inventory footage

List files in:
- `projects/<name>/public/recordings/` (talking-head clips)
- `projects/<name>/public/broll/` (b-roll cutaways)

If both directories are empty, output a message: "No footage found. Per the
shooting checklist in SCREENPLAY.md, drop your recordings into
`public/recordings/` (talking heads) and `public/broll/` (b-roll), then run
/toolkit:cut again."

### Step 2b: Sync brand assets

Brand-level assets (watermark, skyline, outro mp3/mp4, logos) live in
`brands/<brand>/assets/`. The project references them via
`staticFile('brand/...')` which resolves to `projects/<name>/public/brand/`.
Mirror them with:

```bash
python3 -m video_toolkit.sync_brand_assets <name>
```

The tool is idempotent (size-based skip), so it's safe to re-run on every
`/toolkit:cut`. Run BEFORE the render-time logic in later steps so missing
assets (`brand/skyline.svg`, etc.) don't blow up Studio /
`/toolkit:render` with "Error loading image". A new brand asset shipped after
the project was scaffolded won't appear automatically — re-running
`/toolkit:cut` (or invoking `sync_brand_assets.py` directly) pulls it in.

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

### Step 6b: Derive the layered model (the source of truth)

The project renders from the track-native **`LayeredReel`** model (tracks:
`video`/`audio`/`overlays`/`music`/`brand`, all absolute-ms items), so the
segment config from Step 6 is an **intermediate**. Derive it:

1. Run `deriveLayered(<segment config>, { fps, outroFrames })` from
   `@video-toolkit/lib/reel-config-base/derive-layered` — via a throwaway
   `npx tsx` script importing the relative submodule path
   (`../../../toolkit/lib/reel-config-base/derive-layered.ts`), the same pattern
   a project flip uses. This reshapes the segments into the four tracks (Ken
   Burns / blend become generic `effects[]`; per-clip `musicBoostDb`; audio
   beds; chevron + brand seeded from rules).
2. **Populate brand item props from the theme** so timeline labels + edits are
   self-describing: the `watermark` brand item gets
   `props: { asset: <theme.watermark.asset> }`, the `disclaimer` gets
   `props: { text: <theme.disclaimer.text> }` (read from `src/config/theme.ts`).

The result is the `LayeredReel` the `LayeredCampaignReel` composition renders from.

### Step 7: Write into `src/Root.tsx`

Write the derived `LayeredReel` as an **inline literal** in the
`LayeredCampaignReel` composition's `defaultProps={{ reel: {...} }}` — inline so
Remotion Studio's Save and the editor's surgical Save can patch it in place.
Replace the existing `defaultProps` block (keep a single
`<Composition id="LayeredCampaignReel" …>`; a project scaffolded from the current
template already has this shape). Run `prettier` afterwards.

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

Next: open the reel editor to iterate on timing + overlay text.
```

If there are warnings (3s violations, unused source files, missing transcripts),
list them.

### Step 8b: Offer to launch the editor

After the summary, offer to open the visual editor right away — don't just
mention it, ask and launch it if the user says yes (phrase the offer in the
user's language):

> Chceš teď otevřít editor a doladit střih? [ano / ne]

If **yes**, start the editor in the background from the project dir and report
the URL:

```bash
cd projects/<name>
nohup npm run editor > /tmp/<name>-editor.log 2>&1 & disown
sleep 4
grep -iE "localhost|ready|:3100" /tmp/<name>-editor.log | head
```

The editor binds port **3100** by default (Vite picks the next free port if
taken — read the log for the actual URL). It saves back to `src/Root.tsx`, so
`/toolkit:cut` stays safe to re-run afterwards (Step 9 diffs and merges).

If **no**, remind the user they can launch it later with `npm run editor` from
the project dir, or `/toolkit:cut-tune` for the Remotion Studio sidebar instead.

### Step 9: Re-run semantics

Re-running `/toolkit:cut` on a project with an existing `defaultProps`:
- Re-read SCREENPLAY.md (it may have been edited)
- Re-detect footage (some may have been added or replaced)
- Re-transcribe only newly-added or replaced files
- Compute a diff between current `defaultProps` and the freshly generated one
- Show diff to user; ask before writing.

This keeps `/toolkit:cut` safe to re-run after partial re-shoots or screenplay edits.

## Notes

- `/toolkit:cut` doesn't touch user code outside `Root.tsx`. Custom overlays or
  components written by hand stay intact.
- If a user has manually edited `defaultProps` (e.g., via Studio Save),
  `/toolkit:cut` will diff and offer to merge rather than overwrite — the goal
  is to respect human edits while still reflecting screenplay updates.
