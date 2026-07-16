# web-program-intro — Claude guidance

A schema-driven Remotion template for 1920×1080 talking-head program intro
videos served on the PP website. Builds on shared primitives in `lib/`
(segments, overlays, transitions, transcript utilities).

## Canonical workflow

```
1.  cp -r templates/web-program-intro projects/<name>   # or use /video
2.  /narrate                                             # author SCREENPLAY.md
2b. python3 tools/render_screenplay_html.py <name>       # SCREENPLAY.html (pro kolegy)
3.  (natoč talking heads + b-roll; drop into public/recordings + public/broll)
4.  /sync push recordings,broll                          # back up footage to R2
5.  /cut                                                 # footage → defaultProps
6.  /fine-tune                                           # iterate in Studio (lock final timing)
7.  /add-music                                           # lively bg.mp3 (optional; BRAND-RULE #35)
7b. python3 tools/audio_calibrate.py <name> --apply --target-diff 16   # ~-15 dB, livelier (BRAND-RULE #35)
8.  /render                                              # out/intro.mp4
9.  python3 tools/export_vtt.py <name>                   # out/intro.vtt (Whisper → WebVTT)
10. (manuálně oprava ~2-3 míst v intro.vtt)
11. /sync push out                                       # MP4 + VTT do R2 (privátní ops bucket, záloha)
12. /publish                                             # MP4 + VTT + poster → veřejný bucket (web)
```

**`/sync push` vs `/publish`:** `/sync` zálohuje celý projekt (vč. syrových
záběrů) do privátního ops bucketu. `/publish` vystaví jen finální web soubory
(intro.mp4 + intro.vtt + auto-generovaný intro-poster.jpg z prvního framu) do
veřejného bucketu `my-brand-web-media` na doméně `media.example.com`
a vypíše `<video>` embed. Privátní a veřejný bucket jsou záměrně oddělené.

## Framing rules (HARD — pro natáčení)

- **Mluvčí v pravé třetině** 16:9 kompozice (obličej x≈1280-1600 z 1920px).
- **Levá třetina = blur background** = safe zone pro web headline overlay
  (`<h1>` + lead paragraph se renderuje vlevo přes video na webu).
- **Eye line** nad horizontálním středem (oči y≈400-500 z 1080px).
- Stejné framing pro `clip` segmenty. B-roll volnější, ale text safe zone vlevo
  musí zůstat čistá.

## What's removed vs campaign-reels

- No `PersistentOverlay` (no watermark, no § 16d disclaimer)
- No `ChevronMarker`
- No outro segment / stinger
- No overlay union (title/chevron/caption/quote-pull/stat-callout/source-tag/ai-visual-tag)
- No burn-in captions — VTT is external (HTML `<track>`)

## Brand discipline

Brand rules at `brands/<brand>/BRAND-RULES.md` apply with this
subset:
- #30 (broll silent +6 dB) — yes, silent broll segments are supported
- LUT grading (`default.cube`) — **NO, that grade is campaign-reels only.** The
  brand LUT is tuned for GoPro/phone reel footage; on full-frame program-intro
  clips it lifts blacks and washes out contrast. Instead, tune the filmed clips
  per-clip *before* render (eq pop + gentle warm WB + unsharp), and render
  WITHOUT `lut3d`.
- Font loading — yes (copy `brands/<brand>/fonts/*` into `public/fonts/`)

N/A:
- Outro-related rules (no outro)
- #31 (per-video music ramp) — anchored to outro start; no outro → no anchor
- Caption/chevron/watermark/§ 16d rules (no overlays)

## Configuration source-of-truth

Same as reels:
- `SCREENPLAY.md` — INTENT + plán natáčení (human-editable). Po každé
  úpravě regenerovat `SCREENPLAY.html` přes
  `python3 tools/render_screenplay_html.py <name>` a commitnout oba.
- `src/Root.tsx` inline `defaultProps={{...}}` — CURRENT CUT STATE (Studio Save target)
- `out/intro.mp4` + `out/intro.vtt` — outputs

## Key files

- `src/config/schema.ts` — Zod schema; reuses base from `lib/reel-config-base/`
- `src/config/reel-config.ts` — builder + dimensions
- `src/WebProgramIntro.tsx` — composition root (audio mix + transitions; no overlays)
- `src/Root.tsx` — Composition + inline defaultProps

## Tests

```bash
npm run test          # vitest — schema + reel-config + shared lib/ tests
npx tsc --noEmit      # type check (template src/ only; lib/ has pre-existing setup oddities)
```
