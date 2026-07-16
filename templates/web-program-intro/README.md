# web-program-intro template

1920×1080 talking-head intro videos for the PP website's `/program/<NN>-<slug>`
hero positions. Forks `campaign-reels` and consumes shared primitives from
`lib/`.

## Differences from campaign-reels

- **Aspect:** 16:9 (1920×1080) instead of 9:16 (1080×1920)
- **No overlays:** title, chevron, captions (burn-in), quote-pull, stat-callout,
  source-tag, ai-visual-tag — all removed. Captions are emitted as an external
  `.vtt` file rendered by the website via `<track>`.
- **No PersistentOverlay:** no watermark, no § 16d disclaimer (web embed on
  party's own site is not paid political advertising).
- **No outro stinger.**
- **Talking-head primary audio:** clip footage carries the speaker's voice;
  no generated voiceover.

## Workflow

See `CLAUDE.md`.
