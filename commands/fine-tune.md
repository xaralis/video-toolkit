---
description: Launch Studio for slider + text-input iteration on a cut reel
---

# Fine-tune

Launch Remotion Studio for interactive iteration on a reel's timing
and overlay text. Changes save back to `src/Root.tsx` via Studio's
Save button.

## Quick start

```
/toolkit:fine-tune                 # current project
/toolkit:fine-tune <project-name>  # explicit
```

## Flow

### Step 1: Detect project + verify state

1. Detect project.
2. Read `src/Root.tsx`; verify `defaultProps={{...}}` is populated with
   real segments (not just the template's demo defaults). If still default,
   suggest running `/toolkit:cut` first.
3. Verify the project's prereqs:
   - `.prettierrc.json` exists in project root (required for Studio Save).
   - `node_modules` is installed (`ls node_modules/.bin/remotion`).
   - If missing, run `npm install` once.

### Step 2: Start Studio

```bash
cd projects/<name>
nohup npx remotion studio > /tmp/<name>-studio.log 2>&1 & disown
sleep 4
```

Read the log to find the bound port and confirm "Server ready":

```bash
grep "Server ready" /tmp/<name>-studio.log
```

Default port is 3000 (override via `REMOTION_STUDIO_PORT` env var). If
taken, Remotion picks the next free port automatically.

### Step 3: Brief the user

Print:

```
Studio running at <URL>

The right sidebar shows the full schema editor:

- Click any segment to expand its fields
- Drag sliders for timing (trimIn / trimOut / durationMs / audioStartSec)
- Edit overlay text in input boxes (supports {lime:phrase} / {teal:phrase})
- "+ Add segment" to insert; trash icon to remove
- Save (disk icon, top of Props panel) persists to src/Root.tsx

Scrub the timeline to verify, then come back and tell me when done.
I'll offer to render the final MP4.
```

### Step 4: Wait for user signal

Wait for the user to type "done", "render", or similar. While waiting,
they freely interact with Studio. They may also:
- Edit `SCREENPLAY.md` directly (text editor)
- Run other slash commands in parallel sessions
- Just close Studio if they're done

### Step 5: Offer render

When the user signals completion:

```
Ready to render? (Y/n)
```

If yes:

```bash
cd projects/<name>
npm run render
```

Watch the log; report the final MP4 size + path when done.

### Step 6: Stop Studio (optional)

If the user wants to free up the port:

```bash
pkill -f "remotion studio" 2>/dev/null
```

## Notes

- Studio's Save only writes to **inline literal defaultProps**, not to
  imported references. The template's Root.tsx satisfies this. If user
  hand-edits to use an import, Save will fail with a clear error message.
- If user re-edits SCREENPLAY.md between `/toolkit:cut` and `/toolkit:fine-tune`, those
  changes do NOT auto-flow into the config — re-run `/toolkit:cut` to refresh.
- For deep timeline changes (reorder segments, add/remove multiple), it's
  often easier to re-run `/toolkit:cut` than to drag in Studio.
