# campaign-reels

Schema-driven Remotion template for vertical campaign reels (1080×1920, 30fps).

## Quick start

```bash
cp -r templates/campaign-reels projects/my-reel
cd projects/my-reel
npm install
npm run studio              # preview (uses minimal demo defaults)
```

Real reels come from a slash-command workflow:

```bash
/video        # bootstrap (creates projects/<name>/)
/narrate      # author SCREENPLAY.md interactively
# film footage, drop into public/recordings/ and public/broll/
/cut          # map footage → reel config defaultProps
/fine-tune    # iterate timing + text in Studio (lock final timing here)
/add-music    # ACE-Step background music sized to the final reel (optional)
/render       # final MP4 (or /render preview for half-scale faster iteration)
```

## Architecture

- **Schema-driven props**: `src/config/schema.ts` defines the entire ReelConfig
  via Zod discriminated unions. Studio renders a full editor for every field.
- **Three-layer composition**: persistent overlay (watermark + disclaimer) /
  per-segment overlays (chevron, captions, quote-pulls) / video track.
- **L-cut audio inheritance**: a `broll` segment with
  `audioMode: 'inherit-from-clip'` continues a talking-head's voice over
  the b-roll visual.
- **Transcript-driven captions**: clip segments load `<source>.transcript.json`
  (produced by `video_toolkit.transcribe`) and render synced captions in lime + coal stroke.

## Segment types

| Type | Use for |
|---|---|
| `clip` | Talking-head from `public/recordings/` |
| `broll` | B-roll from `public/broll/` (optional `aiGenerated: true` auto-tags ▸ AI VIZUALIZACE) |
| `multi-clip` | Side-by-side (`split-h`/`split-v`), picture-in-picture (`pip`), or 4-up (`quad`) |
| `card` | Reel-native motion graphic (`claim-plate`, `program-plate`, `contrast-plate`, `stats-plate`) |
| `outro` | Brand stinger MP4 — always last |

## Overlay types

`title`, `quote-pull` (with inline `{lime:phrase}` / `{teal:phrase}` accent syntax), `stat-callout`, `source-tag`. The `▸ AI VIZUALIZACE` tag auto-renders when `broll.aiGenerated === true`.

## Transitions

`cut` (default), `dissolve`, `fade-coal`, `glitch`, `whip-pan`, `zoom-through`, `wipe`.

## File map

| Path | Purpose |
|---|---|
| `src/config/schema.ts` | Zod schemas for ReelConfig / Segment / Overlay / Transition |
| `src/config/reel-config.ts` | `buildReelConfig()` builder + dimensions / fps constants |
| `src/config/types.ts` | TypeScript types (mirror the schemas) |
| `src/Root.tsx` | Composition registration + inline `defaultProps` literal |
| `src/CampaignReel.tsx` | Three-layer composition |
| `src/overlays/*` | Visual primitives (chevron, captions, quote-pull, title, stat-callout, etc.) |
| `src/segments/*` | Segment renderers (clip / broll / multi-clip / card / outro) |
| `src/lib/*` | Utilities (accent parser, transcript window, font loader) |
| `public/brand/*` | Brand assets (watermark, outro stinger MP4+MP3, skyline) |
| `public/recordings/*` | Talking-head clips (you drop here) |
| `public/broll/*` | B-roll cutaways (you drop here) |
| `public/audio/*` | Generated voiceover / background music |

## Tests

```bash
npm run test          # vitest unit suite (22 tests across schema/builder/duration/transcript/accent)
npx tsc --noEmit      # type check
```

## Render

```bash
npm run render            # full quality
npm run render:preview    # half-scale faster render for review
```

Output lands in `out/reel.mp4`.
