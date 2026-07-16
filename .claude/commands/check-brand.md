---
description: Lint a reel project's defaultProps against machine-checkable brand rules
---

# Check Brand

Static analysis of a campaign-reels project's `src/Root.tsx` `defaultProps`
against the machine-checkable subset of `brands/<brand>/BRAND-RULES.md`.

Catches drift early — before render time — for the categories of mistakes
that recur most often: 3-second minimums, invalid placements, missing
assets, accent-block over-coloring, pacing gaps.

## Quick start

```
/check-brand                       # current project
/check-brand <project-name>        # explicit
/check-brand --strict              # warnings also fail the lint (CI-style)
/check-brand --json                # machine-readable output for tooling
```

## Flow

### Step 1: Detect project

1. If invoked from inside `projects/<name>/`, use that project.
2. Else most-recently-touched project with `src/Root.tsx`.
3. If no projects, exit with a hint.

### Step 2: Run the linter

```bash
python3 tools/check_brand.py --project <name>
```

The linter reads `src/Root.tsx`, extracts the inline `defaultProps` literal
via the same JSON5 path used by `/render`'s SRT exporter, and walks each
segment + overlay against the rules.

### Step 3: Report

Output groups findings as `[ERROR]` or `[WARN]`:

| Level | When |
|---|---|
| ERROR | Hard violation — render-time defect (missing source file, sub-3s overlay, invalid placement) |
| WARN | Soft signal — author choice (tight pacing, multi-word accent block, title on non-opening segment) |

Exit code:
- `0` if no ERRORs (warnings tolerated)
- `1` if any ERRORs (or any WARN under `--strict`)

## Rules checked (current)

| Rule | Check |
|---|---|
| #1 | Accent blocks `{lime:..}` / `{teal:..}` contain ≤ 3 words (single-char punct exempt) |
| #10 | No `..` (double endpoint dot) in any overlay text |
| #14 | Title overlay only on the first segment; only one title per reel |
| #17 | Clip segments + L-cut b-rolls have a corresponding `<source>.transcript.json` |
| #19 | B-roll segments hold ≥ 3 s; every overlay's `durationMs` ≥ 3000 |
| #20 | ≥ 5 s gap between consecutive quote-pulls (warn) |
| #22 | TitleOverlay `appearAt` is `0` (or warned that the component ignores it) |
| #28 | Quote-pull `placement` is one of the 11 valid enum values |
| asset | Every `source` / `audioSource` file actually exists under `public/recordings` or `public/broll` |
| audio | Every `audioMode: 'inherit-from-clip'` b-roll has an `audioSource` |

## Rules NOT checked (and why)

| Rule | Why not |
|---|---|
| #3 | Disclaimer position is enforced by `PersistentOverlay.tsx` + theme.ts; one place, no defaultProps surface |
| #21 / #24 / #26 / #29 | Encoded in component implementations (decoder reveal, fade+slide, solid coal, glued punctuation); no defaultProps drift possible |
| #4 / #11 / #18 / #25 | Editorial / visual judgment — needs human review |
| #27 | Transcript proofreading is a workflow step, not a config check |

When new brand rules become machine-checkable (e.g., we add a `faceZone` field on clip segments per rule #28), extend `tools/check_brand.py`. The linter is the durable home for "this rule must be enforced without me having to remember".

## When to run

- After `/cut` — catch any defaultProps issues before opening Studio.
- Before `/render` — verify a clean rule pass before spending render time.
- In CI (if the project is in a git repo with workflows) — exit-code-driven.
