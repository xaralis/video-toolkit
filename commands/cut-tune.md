---
description: Launch the reel editor for timeline iteration on a cut reel; Save persists to Root.tsx
---

# Cut Tune

Launch the **reel editor** — the toolkit's own NLE-style editor — for
interactive iteration on a cut reel: trim, slip, reorder, retime overlays,
adjust framing and per-clip speed. Save writes back to `src/Root.tsx`.

This used to launch Remotion Studio and tune the reel through Studio's schema
sidebar. That is no longer the right tool: the sidebar edits props field by
field, with no timeline, no trim handles and no way to see two clips meet at a
cut — which is where nearly all tuning decisions actually live. Studio is still
there (`npm run studio`) and remains the right place for prop-level poking and
`remotion still` checks, but it is no longer the tuning surface.

## Quick start

```
/toolkit:cut-tune                 # current project
/toolkit:cut-tune <project-name>  # explicit
```

## Flow

### Step 1: Detect project + verify state

1. Detect project (same convention as `/toolkit:cut`).
2. Read `src/Root.tsx`; verify `defaultProps={{ reel: {...} }}` carries a real
   `LayeredReel` with populated tracks, not the template's demo default. If it
   is still the default, suggest `/toolkit:cut` first.
3. Verify the project's prereqs:
   - `node_modules` is installed (`ls node_modules/.bin/vite`). If missing, run
     `npm install` once — a project that arrived via `/toolkit:sync pull` will
     not have it, since `node_modules` is never committed or mirrored.
   - `.prettierrc.json` exists in the project root (the editor formats the
     `Root.tsx` it writes).
   - Every media file the reel references resolves on disk. Check the
     `source:` values in `Root.tsx` against `public/recordings/`,
     `public/broll/` and `public/audio/`; if any are missing, run
     `/toolkit:sync pull` before starting — the editor will open, but those
     clips will be blank and their trim handles will refuse to extend, which
     reads as the editor misbehaving rather than as absent footage.

### Step 2: Start the editor

```bash
cd projects/<name>
nohup npm run editor > /tmp/<name>-editor.log 2>&1 & disown
sleep 8
```

Read the log for the bound URL:

```bash
grep -oE "http://localhost:[0-9]+" /tmp/<name>-editor.log | head -1
```

Default port is 3100; Vite takes the next free one if it is busy, so read the
URL from the log rather than assuming. Confirm it answers before briefing the
user:

```bash
curl -s -o /dev/null -w "%{http_code}\n" <url>
```

### Step 3: Brief the user

Print the URL and this orientation, adjusted to what the reel actually
contains:

```
Editor running at <URL>

Timeline lanes, top to bottom: transitions · video · audio · music · overlays ·
brand. Click a block to select it; the inspector on the right shows its
sections (Crop & zoom, Fit & pad, Color, Music boost, Effects, Transition out,
Speed) — each starts collapsed unless it carries a non-default value.

  Space          play / pause          ← →        step one frame
  ⇧← ⇧→          ten frames            Home End   start / end
  s              split at playhead     ⌫          delete selected
  ⌘D             duplicate             ⌘Z / ⌘⇧Z   undo / redo
  + / -          zoom timeline         ?          all shortcuts

  drag a block edge     trim (stops at the end of the footage)
  ⌥ + drag              slip the shot inside its window
  ⌘ + scroll            zoom the timeline
  drag the volume line  set a bed's level (double-click resets)

The Ripple toggle decides whether an edit shifts everything after it. Snap and
Beats snap are next to it.

Save (⌘S) writes src/Root.tsx; Discard reverts to the last save — the exact
reel on disk, brand span included. The status chip left of them is green when
saved, orange when there are unsaved changes, and red when the reel has a
diagnostic worth reading — click it to jump to the item it is about. If a
project's `Root.tsx` still carries a watermark/disclaimer span from before
brand spans were derived automatically, the editor opens already showing
"unsaved changes" — that's the correction waiting to be written back, not a
bug — and one Save persists it. Discard in that state puts the old on-disk
values back rather than keeping the correction.

Render straight from the header's Render dropdown (Preview is half-scale).

Tell me when you're done, or ask for a change and I'll make it in the code.
```

### Step 4: Wait for the user

They work in the editor. While waiting, do not touch `src/Root.tsx` — the
editor owns it for the duration, and a concurrent write will be silently
overwritten by the next Save. If the user asks for a change that is easier in
code than in the UI (a bulk retime, a repeated overlay edit), have them Save
first, make the edit, and tell them to reload the page.

### Step 5: Render

The editor's own Render dropdown covers this. Only shell out if the user asks
for something it does not offer:

```bash
cd projects/<name>
npm run render
```

Report the final MP4 path and size, and read the exit code rather than the log
tail — `npm run render` exits non-zero on a failed render while still printing
plausible-looking progress.

### Step 6: Stop the editor (optional)

```bash
pkill -f "vite --config .editor/vite.config.mts" 2>/dev/null
```

## Notes

- The editor writes **inline literal `defaultProps`**, not imported references.
  The template's `Root.tsx` satisfies this.
- A reel edited here stays a `LayeredReel` — the editor never round-trips
  through the segment/cut format. Re-running `/toolkit:cut` **regenerates
  `defaultProps` from `SCREENPLAY.md` and discards every tuning made here.**
  Say so before running it on a project whose `project.json` shows a completed
  cut-tune session; for deep structural changes prefer editing in the editor,
  or re-cut deliberately and knowingly.
- If the user re-edits `SCREENPLAY.md` between `/toolkit:cut` and
  `/toolkit:cut-tune`, those changes do NOT flow into the reel — the screenplay
  is an authoring input, not a live source.
- A clip whose timeline span and source span differ by a few milliseconds
  carries a derived playback speed that is not exactly 1 (see
  `lib/reel-config-base/speed.ts`). That is usually rounding residue from an
  earlier tuning pass rather than intent, and it is worth checking when a reel
  plays subtly out of sync.
