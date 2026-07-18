---
description: Publish a web-program-intro's final outputs (video + VTT + poster) to the public R2 bucket for website embedding
---

# Publish

Push a finished project's **web deliverables** — `intro.mp4` + `intro-720.mp4`
(web-encoded renditions, see below), `intro.vtt`, and a `intro-poster.jpg`
(auto-generated from the video's first frame) — to the **public** R2 bucket
(`my-brand-web-media`), served over the custom domain
`media.example.com`. Prints the public URLs and a ready-to-paste
`<video>` embed.

**Never publish the raw render.** The Remotion master (`out/intro.mp4`) is a
~16 Mbps archival-grade file; served raw it makes low-end phones stutter. The
publish tool automatically derives two web renditions into `out/web/`:

- `intro.mp4` — 1080p, CRF 22, capped at 4.5 Mbps (the website's default `src`)
- `intro-720.mp4` — 720p, CRF 23, capped at 2.2 Mbps (the website's
  `srcMobile` — small viewports + automatic dropped-frames fallback)

Both are normalized to limited-range yuv420p (`out_range=tv`) — some Android
hardware decoders mishandle the full-range signal Remotion emits. Renditions
re-encode only when missing or older than the master.

This is distinct from `/toolkit:sync push`, which mirrors the whole project (raw
footage, renders, transcripts) to the **private** ops bucket for backup.
`/toolkit:publish` exposes only the final, web-facing files on the public domain.

## Quick start

```
/toolkit:publish                         # current project
/toolkit:publish <project-name>          # explicit
/toolkit:publish <name> --files out/intro.mp4,out/intro.vtt   # custom file set
```

## Prereqs (one-time, already set up)

- Public R2 bucket `my-brand-web-media` with a Cloudflare **custom domain**
  (`media.example.com`) + a **CORS policy** allowing the website
  origin (needed for the `<track>` captions).
- `.env` has `R2_PUBLIC_BUCKET` + `R2_PUBLIC_BASE_URL`.
- The R2 API token (`R2_ACCESS_KEY_ID`) has **Object Read & Write** on
  `my-brand-web-media` (and still on the ops bucket for `/toolkit:sync`).

## Flow

### Step 1: Detect project
Same convention as `/toolkit:render` / `/toolkit:sync`. If invoked inside `projects/<name>/`,
use it; else scan `projects/`.

### Step 2: Verify state
1. `out/intro.mp4` exists (run `/toolkit:render` first if not).
2. `out/intro.vtt` exists (run `python3 -m video_toolkit.export_vtt <name>` + proofread
   proper nouns if not — see web-program-intro CLAUDE.md step 9-10).
3. `.env` has `R2_PUBLIC_BUCKET` + `R2_PUBLIC_BASE_URL` (else stop, point at the
   prereqs above).

### Step 3: Publish

```bash
python3 -m video_toolkit.publish_web <name>
```

The tool:
- auto-generates `out/intro-poster.jpg` from the video's **first frame** if missing,
- uploads `intro.mp4` (video/mp4), `intro.vtt` (text/vtt), `intro-poster.jpg`
  (image/jpeg) to `my-brand-web-media/<name>/` with correct Content-Type +
  `Cache-Control`,
- prints the public URLs and a `<video>` embed (with `poster=` + `<track>`).

### Step 4: Verify live (optional but recommended)

```bash
curl -sI https://media.example.com/<name>/intro.mp4 | head -1
```
Expect `HTTP/2 200`. Repeat for `.vtt` / `-poster.jpg`.

### Step 5: Report
Print the three public URLs + the embed snippet for the website team:

```html
<video src="https://media.example.com/<name>/intro.mp4"
       poster="https://media.example.com/<name>/intro-poster.jpg"
       crossorigin="anonymous" controls playsinline>
  <track src="https://media.example.com/<name>/intro.vtt"
         kind="subtitles" srclang="cs" label="Čeština" default>
</toolkit:video>
```

## Notes

- **Public vs private buckets are deliberately separate.** Raw footage / WIP
  renders live in the private ops bucket (`/toolkit:sync`); only polished, web-facing
  files go public via `/toolkit:publish`. Never bind the ops bucket to a public domain.
- **Re-publishing** overwrites the same keys (`<name>/intro.mp4`, …). The
  `Cache-Control` max-age is 1h; if the website caches longer, purge the
  Cloudflare cache after a re-publish.
- **Poster** defaults to the first frame. To use a different frame, drop your
  own `out/intro-poster.jpg` before running (the tool only generates it if
  missing).
- Workflow position: `/toolkit:render` → `export_vtt` (+ proofread) → **`/toolkit:publish`**.
