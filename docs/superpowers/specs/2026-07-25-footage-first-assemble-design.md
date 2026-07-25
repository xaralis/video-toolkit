# `/toolkit:assemble` — footage-first reel, no screenplay authoring

**Date:** 2026-07-25
**Status:** approved (design), implementing
**Repo:** core (`xaralis/video-toolkit`)
**Predecessor:** `2026-07-25-layered-reel-composition-design.md` (stage 1 — made every brand
template render the voice/audio track, which this flow depends on)

## Problem

Someone has **finished talking-head footage** — a phone-shot gig promo, a to-camera
announcement — and wants it cut together as-is: clips in order, the brand outro on the end,
maybe a music bed underneath. Nothing to plan, nothing to script, nothing to perform.

Today the only paths are:

- `/toolkit:narrate` → `/toolkit:cut` — screenplay-driven. `narrate` Branch B *does* handle
  footage-first (transcribe → propose a screenplay), but it is an **interactive co-authoring
  session**: pick the strong takes, skip filler, propose overlay text, iterate per segment.
  That is the right tool when you want to curate. It is far too much ceremony for "just glue
  these five clips together".
- `/roost-reel` — beat-synced montage, clip audio hard-muted. Wrong: the speech is the point.

There is no zero-ceremony footage-first path, and nothing that treats *existing* footage as
the source of truth rather than something to be curated against a script.

## Goal

One command that turns a folder of finished talking-head clips into a cut reel with the least
possible interaction, by **auto-generating the standard `SCREENPLAY.md`** so `/toolkit:cut`
consumes it like any other screenplay.

The screenplay stays the durable artifact and the seam between the two commands — exactly as
with `narrate`. `cut` needed three fixes (see below); two only make it honour fields the format
already documented, and the third adds a single optional frontmatter key.

## Non-goals

- Editorial curation (choosing takes, dropping filler, writing overlay copy) — that is
  `narrate` Branch B, which stays.
- Trimming footage. Dead air is reported, never cut — see "Why no trimming" below.
- Beat-synced montage — `/roost-reel`.
- Voiceover generation — the footage already carries the voice.

## Changes to `/toolkit:cut`

The first draft of this design assumed `cut` could stay untouched. Review against `cut.md`
showed that assumption was false, in ways that would have silently broken the flow — and each
is a genuine `cut` bug independent of this command:

1. **`cut` ignored a declared `Source:`.** Step 3 re-derived the source→segment mapping from a
   filename-numbering regex and then "the largest unassigned file". Phone filenames
   (`IMG_4471.mp4`) match no numbering convention, so every segment fell through to
   largest-file-first — ordering the reel **by file size**. `narrate` Branch B writes `Source:`
   too, so it had the same latent bug. Fixed: Step 3 rule 0 honours a declared `Source:` and
   skips matching for that segment.
2. **`cut` hardcoded `musicVolumeDb: -6` and could pick the `demo.wav` placeholder.** The
   frontmatter key `musicVolumeDb` was documented in `narrate`'s format but never read. Fixed:
   Step 6 gained explicit music rules that read the frontmatter value and skip `demo.wav`.
3. **A declined music bed came back anyway.** `cut` scanned `public/audio/` unconditionally, so
   a user offered a bed and saying *no* still got it — at `cut`'s own `-6` dB, louder than the
   one they declined. The format had no way to record the decision: `musicVolumeDb` carries a
   volume, never an identity or an opt-out. Fixed by a small format extension — a `music:`
   frontmatter key (`audio/<file>`, or `none`) that `cut` honours *instead of* scanning; with
   the key absent, it scans as before, so older screenplays are unaffected. This also removes a
   double-question: previously both commands asked which track, and the answers could differ.

`cut`'s heuristic also now prefers an `_upright.mp4` bake over its crooked original and stops
reporting the original as an unused file.

## Why no trimming

The first draft trimmed leading/trailing dead air automatically ("the one automatic edit").
That was actively harmful: the screenplay format has **no field for a trim-in offset**, so the
head trim could not be recorded, while `cut` derives `trimIn: 0` and
`trimOut: trimIn + duration_target`. A clip reported as "head trimmed 2.1 s" would therefore
keep its dead air *and* lose 2.1 s of the speaker's final words — worse than doing nothing, and
the opposite of what the confirmed summary claimed.

So dead air is **detected and reported**, with trimming left to `/toolkit:cut-tune`, where it
is a visual, first-class operation. Adding a trim field to the screenplay format would be the
alternative; it is not worth a format change for something the editor already does better.

## Design

### Command

`/toolkit:assemble [<project-name>]` — new file `commands/assemble.md`.

Project detection matches `narrate` / `cut` (invoked from inside `projects/<name>/`, else scan,
else ask).

### Flow

1. **Guard an existing screenplay.** If `SCREENPLAY.md` exists, this command is not the right
   tool (it authors one from scratch). Report what is there and offer `narrate` to edit it, or
   an explicit confirmation to regenerate.
2. **Select the brand** — `project.json`, else scan `brands/` and offer. The frontmatter's
   `brand` + `brandRulesPath` are read by `cut`, and `BRAND-RULES.md` is needed for the step 8
   warnings that appear in step 9's pre-write summary, so this cannot be deferred. A brand's `voice.json` supplies the transcription
   language.
3. **Inventory** `public/recordings/`; empty → stop and say where to drop footage.
   `public/broll/` is explicitly **not** assembled — say so when it is non-empty so the user
   knows those files are absent from the reel.
4. **Ingest** — `python3 -m video_toolkit.ingest_media <project>/public/recordings --out
   <project>/.assemble-manifest.json`. It probes duration, dimensions and orientation, and
   **bakes rotation** into a `<name>_upright.mp4` beside any file carrying rotation metadata —
   which matters because this flow's typical input is phone footage. Reference the manifest's
   `file` value everywhere downstream so the upright file is what gets cut. Re-running is
   outcome-safe (upright files are skipped as inputs, so the manifest never doubles up) but
   re-encodes each rotated clip, so it is not free. Two reporting duties: surface `WARNING:`
   lines, and **diff the inventory against the manifest** — `ingest_media` silently drops
   extensions outside `.jpg/.jpeg/.png/.webp/.mp4/.mov/.m4v`, so a folder of `.mkv` would
   otherwise vanish without a word. Delete the manifest afterwards; it is scratch, not state.
5. **Transcribe — best-effort, never a hard requirement.** `video_toolkit.transcribe` needs a
   configured cloud endpoint and exits with an error without one, so this step must degrade:
   - endpoint configured → transcribe the manifest's `file` values (the upright ones — a
     transcript is resolved at render time by exact source name, so transcribing the pre-bake
     original silently yields no captions), no `--screenplay` (there is none yet), then
     proofread recognition errors.
   - not configured → skip with a clear note: neutral `Spoken intent`, no captions until
     `/toolkit:cut` transcribes, no dead-air detection.
6. **Compose the screenplay**, no interaction:
   - one `clip` segment per recording, in natural filename order (chronological for phone and
     camera naming schemes), duration = the manifest's `durationSec` — **full length**;
   - heading `[clip · face]`, deliberately without `narrate`'s third `· <role>` field, since
     assigning a role is editorial judgement this command does not make and nothing downstream
     parses it;
   - `Spoken intent` = what the clip actually says (lightly paraphrased), or a neutral
     placeholder when there is no transcript;
   - `Source:` set directly — footage exists, so never `TBD`;
   - **no overlays** — the premise is footage plus an outro, nothing more. Text is added later
     in the editor if wanted;
   - a final `## seg-NNN [outro]`;
   - no Shooting Checklist section (footage exists) and no shooting cards.
7. **Music bed (optional).** If `public/audio/` holds a real track — ignoring the `demo.wav`
   placeholder — offer it, and **record the answer either way** in the `music:` frontmatter key:
   `audio/<file>` plus `musicVolumeDb: -18` on yes (well under speech; the bed is atmosphere, not
   a co-star), `none` on no. Recording the decline is what stops `cut` re-adding the bed at its
   own default. Core's music envelope already applies a data-driven 1 s fade-out
   (`fadeOutMs ?? 1000`), so the bed lands softly without extra plumbing; a fade-in is a
   one-field tweak in the editor.
8. **Brand rules: report, do not enforce.** Report violations the footage causes (a sub-3 s
   clip, for instance) as warnings **in the pre-write summary**, so they are visible while the
   user still has a choice. The premise of this command is footage as-is; silently reshaping the
   user's footage to satisfy a rule would defeat it.
9. **One confirmation before writing** — order, per-clip durations, total, outro, music,
   captions, rotation bakes, skipped files, dead air, brand warnings — then write
   `SCREENPLAY.md` and regenerate its HTML companion
   (`python3 -m video_toolkit.render_screenplay_html <name>`), which is mandatory for every
   screenplay write.
10. **Hand off** to `/toolkit:cut`.

### Language

Transcription's `--language` comes from the brand's `voice.json` when it declares one,
otherwise ask once. Core stays language-neutral; no hardcoded default.

### Relationship to `narrate` Branch B

Both stay, and cross-reference each other:

- `assemble` — "just glue it": no curation, minimal interaction, footage as-is.
- `narrate` Branch B — "help me choose": transcribe, then co-author which takes to use, what to
  cut, what text to pull.

Same output artifact, so `cut` is indifferent to which produced it.

## Re-run semantics

Re-running on a project that already has a screenplay never clobbers hand edits without an
explicit confirmation (matching `narrate` Branch A). Re-ingesting is safe: `ingest_media` is
idempotent.

## Risks

- **No transcript → no captions** until `/toolkit:cut` runs its own transcription. Acceptable
  and reported; the reel is otherwise complete. Captions are not overlays — they resolve at
  render time from `recordings/<source>.transcript.json` next to each clip, which is why the
  transcribe-the-upright-file rule (step 5) decides whether they appear at all.
- **A brand whose rules demand overlays** (a chevron, a disclaimer) gets them from `cut`'s
  brand seeding, not from this command — the screenplay carries no overlay directives.
- **The reported total is approximate.** The outro's real length comes from the `outroFrames`
  passed to `deriveLayered` by `cut`, not from the screenplay's duration target, so the summary
  hedges it rather than claiming an exact figure.

## Future directions

- `fadeInMs` for the music bed via a frontmatter key, once `cut` carries fade fields through.
- Optional light b-roll interleaving when `public/broll/` is populated.
