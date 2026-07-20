---
description: Render the final MP4 for a reel project (with preview / full / iteration modes)
---

# Render

Produce the final video file for a reel project. Validates the project state,
runs the Remotion render, and reports the output path + size + duration.

## Quick start

```
/toolkit:render                            # current project, full quality (overwrites reel.mp4)
/toolkit:render preview                    # half-scale 540x960 (faster, overwrites preview.mp4)
/toolkit:render keep                       # full quality, auto-versions (reel.mp4, reel-v2.mp4, ...)
/toolkit:render preview keep               # preview + auto-version (preview.mp4, preview-v2.mp4, ...)
/toolkit:render <project-name>             # explicitly target a project
/toolkit:render <project-name> preview
```

## Flow

### Step 1: Detect project

1. If invoked from inside a `projects/<name>/` directory, use that project.
2. Else scan `projects/` for active projects with `src/Root.tsx`.
3. If multiple, ask which one. If none, suggest `/toolkit:video`.

### Step 2: Verify state

Quick preflight to catch common breakage before spending render time:

1. **defaultProps populated**: read `src/Root.tsx` and confirm the inline
   `defaultProps={{...}}` block has real segments (not the template's demo
   `sample.mp4` defaults). If still on demo defaults, suggest `/toolkit:cut` first.

2. **Source files present**: for each `clip` / `broll` / `multi-clip` segment,
   verify the referenced `source` file exists under `public/recordings/` or
   `public/broll/`. Missing files → list them and stop.

3. **Transcripts present** (only matters if clips reference captions): for
   each `clip` segment, verify `<source>.transcript.json` exists next to
   the source file. Missing transcripts → offer to run `python3 -m video_toolkit.transcribe`
   with `--screenplay` (if `SCREENPLAY.md` exists) before continuing.

4. **node_modules installed**: `ls node_modules/.bin/remotion`. If missing,
   run `npm install` once.

5. **Studio is not blocking the port** (informational only — Studio doesn't
   block render, but heavy Studio activity slows it down). If the user wants
   to stop Studio first, offer: `pkill -f "remotion studio"`.

If any check fails, list ALL failures (not just the first) so the user can
fix in one pass.

### Step 3: Decide mode + invoke the wrapper

Use `python3 -m video_toolkit.render_reel` rather than `npm run render` directly. The wrapper adds:
- `--preview` → half-scale 540×960 to `out/preview.mp4`
- `--keep` → auto-version (`reel-v2.mp4`, `reel-v3.mp4`, ...) instead of overwriting
- Automatic `out/HISTORY.md` log entry per render (size, mode, render time)
- Automatic SRT export to `out/reel.srt` after the MP4 lands

```bash
# Full quality, overwrites previous
python3 -m video_toolkit.render_reel --project <name>

# Half-scale preview
python3 -m video_toolkit.render_reel --project <name> --preview

# Full quality, auto-versioned
python3 -m video_toolkit.render_reel --project <name> --keep
```

Direct `npm run render` still works for ad-hoc use; the wrapper just adds the polish.

### Step 4: Run with progress visibility

Use `Bash` with a generous timeout (5–10 minutes for typical 30–60s reels).
Stream output via `run_in_background: true` if the render is long, and let
the harness notify when it finishes.

Watch for:
- `Bundling...` (one-time bundle build, ~5–15s)
- `Rendered N/Total` (frame render progress)
- `Encoded N/Total` (ffmpeg encode pass)
- Final `out/reel.mp4N MB` line

If the render hits errors:
- **Missing font**: usually means brand fonts didn't load — check `public/fonts/`
- **Cannot find module**: stale `node_modules` after a template change → `npm install`
- **Out of memory**: lower concurrency or render in smaller chunks (rare for reels)

### Step 5: SRT captions + history log

`python3 -m video_toolkit.render_reel` automatically:
- Exports `out/reel.srt` (one cue per Whisper sentence, mapped through the L-cut audio timeline). Upload alongside the MP4 for IG/TikTok/FB algorithm boost + accessibility.
- Appends a row to `out/HISTORY.md` with timestamp + filename + mode + size + render time.

No extra commands needed. If transcripts are missing for any clip source, the SRT exporter prints warnings to stderr but still writes whatever cues it can — don't treat as fatal.

### Step 6: Report results

```
Render complete.

Output:       projects/<name>/out/reel.mp4
Size:         42.3 MB
Resolution:   1080×1920
Duration:     46.2s (1386 frames @ 30 fps)
Mode:         full quality
Render time:  2m 34s

Next: post to socials or run /toolkit:render preview to iterate again.
```

For preview renders, label the output clearly so the user doesn't accidentally
post the half-scale file:

```
Output:       projects/<name>/out/preview.mp4  (PREVIEW — half scale)
```

### Step 7: Iteration hints

If the user re-runs `/toolkit:render` quickly (within ~5 minutes of a previous
render) it likely means they're iterating. Useful nudges:

- "Studio is faster than render for visual iteration. Want to launch with `/toolkit:cut-tune`?"
- "If you're iterating timing, preview mode (`/toolkit:render preview`) is 4× faster."
- "If you changed `SCREENPLAY.md`, re-run `/toolkit:cut` before rendering."

## Notes

- `/toolkit:render` doesn't modify any source files. Output lands in `out/`.
- The default output filename is `reel.mp4` (full) or `preview.mp4` (preview).
  These are overwritten on each run — no auto-versioning. If the user wants
  to keep iterations, suggest renaming manually (e.g., `out/reel-v3.mp4`)
  before the next render.
- For projects with very long durations (>2 minutes) or high b-roll density,
  warn the user that render time will exceed the default 10-minute timeout
  and consider running in background mode.
- The Modal endpoints (Whisper, etc.) are NOT involved in render — render
  is local Node + ffmpeg via Remotion. No cloud cost.

## Re-run semantics

Re-running `/toolkit:render` simply re-renders. Files are overwritten in place. There's
no state to invalidate — Remotion picks up whatever's currently in `src/`.
