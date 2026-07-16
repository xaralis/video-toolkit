# campaign-reels — Claude guidance

A schema-driven Remotion template for 1080×1920 vertical campaign reels.
The template ships with a generic Zod schema covering every segment type
(clip / broll / multi-clip / card / outro) and every overlay (title /
quote-pull / stat-callout / source-tag / ai-visual-tag). Remotion Studio
renders an editor for the entire schema in the sidebar.

## Canonical workflow

```
1.  cp -r templates/campaign-reels projects/<name>   # or use /video
2.  /narrate                                          # author SCREENPLAY.md
3.  (film footage; drop into public/recordings + public/broll)
4.  /sync push recordings,broll                       # back up raw footage to R2
5.  /cut                                              # map footage → defaultProps
6.  /fine-tune                                        # iterate in Studio (lock final timing)
7.  /add-music                                        # generate bg.mp3 sized to final reel (optional)
7b. python3 tools/audio_calibrate.py <name> --apply   # calibrate musicVolumeDb against voice LUFS (brand rule #34)
8.  /render                                           # final MP4 (or /render preview)
9.  /sync push out                                    # back up renders to R2
10. /sync share                                       # generate short URL (TinyURL of presigned R2)
```

Collaborator joining mid-project:

```
1.  /video                                            # resume (detects existing project)
2.  /sync pull                                        # download all media from R2
3.  /fine-tune  (or wherever the work is)
```

`/sync` is the bridge between git (source + configs) and R2 (heavy media —
raw footage, generated music, rendered MP4s). Treat it as a regular step,
not optional housekeeping — without it nobody else can pick up the project.
The final `/sync share` step generates a short TinyURL pointing at the R2
presigned URL of `out/reel.mp4` — paste it into Slack / IG / email to send
the finished reel to reviewers without uploading anywhere else.

## Configuration source-of-truth

- `SCREENPLAY.md`: the video's INTENT (what we wanted to say). Human-editable.
- `src/Root.tsx`'s inline `defaultProps={{...}}`: the CURRENT STATE OF THE CUT.
  Editable via Studio Save or by hand.
- `out/reel.mp4`: the output.

These three files evolve mostly independently. `/cut` is the bridge that
turns screenplay intent into a cut state given current footage.

## Why an inline defaultProps literal

Remotion Studio's Save feature only writes to an inline hardcoded literal,
not an imported reference. This is why `defaultProps={{...}}` is spelled
out in Root.tsx rather than imported from a constants file.

## Brand discipline

If your brand has a `BRAND-RULES.md` (e.g. at
`brands/<brand>/BRAND-RULES.md`), `/narrate` reads it in full
and proposes screenplay choices that respect it. Re-read the brand rules
before changing visual primitives — they encode learnings from prior
projects.

## Captions

Caption text is auto-generated from Whisper transcripts. Override per line
via `segment.caption.lines[]` when:
- Whisper got a word wrong (especially proper nouns)
- The spoken line is too long to read at scroll speed
- Pacing needs adjustment

## AI visualizations for B-roll

Brand manuals are often strict: AI may visualize policy proposals, abstract
concepts, urban studies — but never portraits of real people or photoreal
"events". Always set `aiGenerated: true` on AI-derived broll segments — this
auto-renders the mandatory ▸ AI VIZUALIZACE tag.

Generate stills with `tools/flux2.py`; short animated clips with `tools/ltx2.py`
(if available).

## Key files (don't touch unless you know what you're doing)

- `src/config/schema.ts` — Zod schemas. Adding a new overlay or segment type?
  Define it here.
- `src/config/reel-config.ts` — builder. Most changes go to schema; builder
  is currently near-identity.
- `src/Root.tsx` — Composition + defaultProps literal. `/cut` writes here.
- `src/CampaignReel.tsx` — composition root with three layers (video track,
  per-segment overlays, persistent overlay).
- `src/overlays/*` and `src/segments/*` — visual primitives. Should match
  brand rules at `brands/<brand>/BRAND-RULES.md`.
- `public/brand/` — brand assets (watermark, skyline, outro, logos) mirrored
  from `brands/<brand>/assets/`. Synced automatically by `/cut` (step 2b)
  via `tools/sync_brand_assets.py`; re-run that command if a brand asset
  is added after scaffolding.

## Tests

```bash
npm run test          # vitest — schema, builder, accent-parser, transcript-window, duration
npx tsc --noEmit      # type check (template src/ only; lib/ has pre-existing setup oddities)
```

## Common tasks

- Add a new segment type: define a new Zod schema in `schema.ts`, add to
  `SegmentSchema` discriminated union, create a renderer in `src/segments/`,
  dispatch in `CampaignReel.tsx`.
- Add a new overlay kind: define a new Zod schema, add to `OverlaySchema`
  discriminated union, create a renderer in `src/overlays/`, dispatch in
  the segment renderers.
- Adjust visual primitive (e.g., quote-pull motion): edit the relevant file
  in `src/overlays/`. Verify against brand rules if applicable.

## Legal — § 16d disclaimer (Czech political ads)

Auto-rendered on every frame via `PersistentOverlay`. Default text comes from
`brand.json reels.disclaimer.text`. Do not remove. Override only for coalition
posts (different Zadavatel) by editing the brand profile.
