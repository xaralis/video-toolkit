---
description: Generate background music for the current reel and wire it into Root.tsx
---

# Add Music

Generate background music for a reel via ACE-Step (acemusic cloud API,
with Modal fallback) and wire the resulting `bg.mp3` into the project's
`defaultProps.audio` block.

**Workflow position:** runs AFTER `/toolkit:cut-tune`, BEFORE `/toolkit:render`. The
reasoning: music duration must match the FINAL reel duration. If you
generate music before `/toolkit:cut-tune`, any timing change in Studio
invalidates the music length and forces a regeneration.

## Quick start

```
/toolkit:add-music                                  # use SCREENPLAY.md's musicPrompt + duration
/toolkit:add-music --preset corporate-bg            # override with a scene preset
/toolkit:add-music --prompt "subtle tech, calm"     # custom prompt
/toolkit:add-music --provider modal                 # skip acemusic, go straight to Modal
/toolkit:add-music --volume-db -10                  # override default -6 dB
/toolkit:add-music --duration 45                    # override derived duration
```

## Flow

### Step 1: Detect project + state

1. Detect project (same convention as `/toolkit:narrate` / `/toolkit:cut` / `/toolkit:cut-tune`).
2. Read `src/Root.tsx`; confirm `defaultProps` has real segments (not template demos).
   - If still on demo defaults → suggest `/toolkit:cut` first.
3. Read `SCREENPLAY.md` frontmatter for hints:
   - `musicPrompt` (string) → default prompt
   - `musicVolumeDb` (number) → default volume (else `-6`)
   - `durationTargetSec` (number) → fallback if compute fails
4. Compute the **effective duration**:
   - Parse all segments in `defaultProps`; sum `(trimOut - trimIn)` for clip/broll, `durationMs/1000` for multi-clip/card, `6.0` for outro.
   - This is the canonical music duration — matches the final reel length.
   - Pad by +1s so music has a tail beyond the last visual frame.

### Step 2: Resolve prompt + parameters

Priority (highest wins):
1. `--prompt` CLI arg
2. `--preset` CLI arg (`corporate-bg`, `upbeat-tech`, `ambient`, `dramatic`, `tension`, `hopeful`, `cta`, `lofi`)
3. `SCREENPLAY.md` frontmatter `musicPrompt`
4. Default: `corporate-bg` preset

Volume:
- `--volume-db` CLI arg
- `SCREENPLAY.md` `musicVolumeDb`
- Default `-6` (per brand rule for PP / matches what worked in pp-smoke-01)

### Step 3: Generate

Run from the repo root (tool paths are relative):

```bash
python3 -m video_toolkit.music_gen \
  [--preset <preset> | --prompt "<text>"] \
  --duration <N> \
  --output projects/<name>/public/audio/bg.mp3
```

If a `--brand` is set in screenplay frontmatter, pass `--brand <name>` so
brand-specific hints (BPM/key/style) flow from `brands/<name>/toolkit:brand.json`.

**Provider strategy** (implemented in `music_gen.py` — you don't re-run it by hand):

- **Default**: omit `--cloud` → acemusic, falling back to Modal automatically if
  acemusic produces nothing (504, network error, timeout). The fallback only
  fires when `MODAL_MUSIC_GEN_ENDPOINT_URL` is set in `.env`; otherwise the run
  fails outright.
- **`--cloud modal`**: skip acemusic, go straight to Modal.
- **`--cloud acemusic`**: pins the provider — never falls back, fails loudly if
  acemusic is down.

**Exit code is the source of truth.** `music_gen.py` exits non-zero whenever it
did not produce every file that was asked for — including a partial
`--variations` run. Never report success off stdout alone, and never pipe the
run through `tee` without checking `PIPESTATUS` / `pipefail`, or you will read
the pipe's exit code instead of the tool's.

If NEITHER provider is configured (no `ACEMUSIC_API_KEY`, no
`MODAL_MUSIC_GEN_ENDPOINT_URL`):
- Suggest `/toolkit:setup` for Modal, or paste an `ACEMUSIC_API_KEY` from
  https://acemusic.ai/api-key.

### Step 4: Verify output

```bash
ls -lh projects/<name>/public/audio/bg.mp3
ffprobe -v error -show_entries format=duration -of csv=p=0 \
  projects/<name>/public/audio/bg.mp3
```

Check the actual duration is close to requested (±0.5s). Larger drift =
re-generate or note in summary.

### Step 5: Patch Root.tsx `defaultProps.audio` block

Read `src/Root.tsx`. Locate the `defaultProps={{` opener and the matching
closer. Inject (or update) an `audio` field inside the top-level object,
positioned right after `chevron` and before `segments`:

```ts
audio: { music: 'audio/bg.mp3', musicVolumeDb: -6 },
```

If `audio` already exists, UPDATE its values (don't duplicate). If
`musicVolumeDb` was overridden by CLI, use the override.

Run prettier:

```bash
npx prettier --write projects/<name>/src/Root.tsx
```

### Step 6: Verify TS + tests

```bash
cd projects/<name>
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v node_modules | head -5
npx vitest run 2>&1 | tail -5
```

If `tsc` or vitest fails, the music block injection likely produced
malformed code — re-read Root.tsx and fix manually before reporting success.

### Step 7: Summary

```
Music added.

Output:      projects/<name>/public/audio/bg.mp3
Duration:    44.2s (requested 44s + 1s pad)
Provider:    acemusic (or modal fallback)
Prompt:      <prompt used>
Volume:      -6 dB
Generation:  87s

Root.tsx updated with audio block. Run /toolkit:cut-tune or /toolkit:render to hear it.
```

## Re-run semantics

Re-running `/toolkit:add-music` on a project with existing music:
- The previous `bg.mp3` is overwritten in place (no auto-versioning).
- The `audio` block in Root.tsx is updated in place.
- If the user has manually adjusted `musicVolumeDb` via Studio Save, the
  new value from the CLI/screenplay wins — warn the user first if the
  current value differs from the proposed value.

## Notes

- `music_gen.py` supports `--variations N` to generate N takes and pick the
  best. It works on any provider: N takes are **N sequential requests** with
  distinct seeds, never one batched request (acemusic 504s on a batch, losing
  all N at once). Budget the wall-clock accordingly — N takes cost N× the time.
  `/toolkit:add-music` doesn't expose this by default to keep the command
  simple — pass `--variations 4` through if you want it.
- For songs with vocals (`--lyrics`), use `python3 -m video_toolkit.music_gen` directly.
  `/toolkit:add-music` is scoped to instrumental background tracks for reels.
- The brand rule for PP audio mixing: music sits at `-6 dB` (loud enough
  to feel, low enough not to compete with voice). Caption-driven b-roll
  segments rely on this balance — don't push to `-3 dB` without checking
  the L-cut audio renders cleanly.
