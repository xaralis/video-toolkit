# Project System

This directory contains the schema and documentation for multi-session video project tracking.

## Overview

Video projects span multiple Claude Code sessions. The project system provides:

1. **Structured state** via `project.json` in each project
2. **Filesystem reconciliation** - comparing intent vs reality
3. **Session continuity** - instant context on resume
4. **Auto-generated CLAUDE.md** - human+Claude readable status

## Resuming a Project

Projects persist across Claude Code sessions. To resume:

### Quick Resume

```
/video
```

This scans `projects/*/project.json`, shows your projects, and lets you pick one to resume.

### Example Resume Session

```
$ /video

Found 2 video projects:

  1. **product-launch** (campaign-reels)
     Phase: assets - 2/3 demos recorded
     Last worked: 2 days ago

  2. **q4-review** (web-program-intro)
     ✅ Complete

Which project? > 1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Resuming: product-launch (campaign-reels)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Scenes

| # | Scene | Type | Status |
|---|-------|------|--------|
| 1 | Title | title | ✅ Ready |
| 2 | Problem | problem | ✅ Ready |
| 3 | Demo: Onboarding | demo | ✅ Recorded |
| 4 | Demo: Dashboard | demo | ✅ Recorded |
| 5 | Demo: Export | demo | ⬜ Needs recording |
| 6 | CTA | cta | ✅ Ready |

## Audio

- Voiceover: ⬜ Not yet generated

## Next Actions

1. **Provide export demo** (Scene 5)
   Provide external video for this scene

Ready to record the export demo?
```

### What Happens on Resume

1. **Read state**: `project.json` loaded, `VOICEOVER-SCRIPT.md` read for context
2. **Reconcile filesystem**: Compare expected assets vs actual files in `public/demos/`, `public/audio/`
3. **Update status**: Mark newly-found assets as `asset-present`, flag missing assets
4. **Add session entry**: `{ date: "2024-12-11", summary: "Resumed project" }`
5. **Regenerate CLAUDE.md**: Update the project's status document
6. **Present next actions**: Guide user to what needs doing

### Project Files Used for Context

| File | Purpose |
|------|---------|
| `project.json` | Machine-readable state (phase, scenes, assets, sessions) |
| `CLAUDE.md` | Auto-generated human-readable status |
| `VOICEOVER-SCRIPT.md` | Scene-by-scene narration script |
| `public/demos/*.mp4` | Recorded demo assets |
| `public/audio/*.mp3` | Voiceover and music files |

### Manual Resume (Without /video)

If you just need to preview or render without the guided workflow:

```bash
cd projects/my-project
npm run studio    # Open Remotion Studio
npm run render    # Render final video
```

Claude Code will still have context via the project's `CLAUDE.md`.

## Project Lifecycle

```
planning → assets → review → audio → editing → rendering → complete
```

| Phase | Description | Exit Criteria |
|-------|-------------|---------------|
| `planning` | Defining scenes, writing script | VOICEOVER-SCRIPT.md complete, scenes defined |
| `assets` | Recording demos, gathering materials | All scene assets present |
| `audio` | Generating voiceover, music | Voiceover file exists |
| `editing` | Adjusting timing, previewing | Config matches assets, preview reviewed |
| `rendering` | Final render in progress | Output file generated |
| `complete` | Done | N/A |

## Schema

See `types.ts` for full TypeScript definitions. Key structures:

### project.json

```json
{
  "name": "my-release-video",
  "template": "campaign-reels",
  "brand": "my-brand",
  "created": "2024-12-09T10:30:00Z",
  "updated": "2024-12-10T15:45:00Z",
  "phase": "assets",

  "scenes": [...],
  "audio": {...},
  "estimates": {...},
  "sessions": [...]
}
```

### Scene Status

| Status | Meaning |
|--------|---------|
| `ready` | No asset needed (slides) or asset verified |
| `asset-needed` | Asset required but not created |
| `asset-present` | File exists, not yet verified |
| `asset-missing` | Was present but now missing (error) |

### Visual Types

| Type | Asset Required | How to Create |
|------|----------------|---------------|
| `slide` | No | Template generates |
| `external` | Yes | User provides file |
| `screenshot` | Yes | User provides |

## Filesystem Reconciliation

The project system follows these principles:

1. **project.json is intent** - What the user planned
2. **Filesystem is truth** - What actually exists
3. **Claude reconciles** - Updates status based on reality

### Reconciliation Logic

```
For each scene with visual.asset:

  If status = "asset-needed" AND file exists:
    → Update to "asset-present"
    → Suggest: "I found {file}, want to verify it in preview?"

  If status = "ready" AND file missing:
    → Update to "asset-missing"
    → Flag: "Asset {file} was removed, needs re-recording"

  If status = "asset-present" AND user confirms:
    → Update to "ready"
```

## Session History

The `sessions` array tracks work across Claude Code sessions:

```json
"sessions": [
  { "date": "2024-12-09", "summary": "Created project, planned 6 scenes" },
  { "date": "2024-12-10", "summary": "Recorded dark-mode and login demos" },
  { "date": "2024-12-11", "summary": "Generated voiceover, adjusted timing" }
]
```

This helps Claude understand context when resuming.

## Auto-Generated CLAUDE.md

Each project gets an auto-generated `CLAUDE.md` with:

- Current phase and status
- Scene checklist with ✅/⬜ markers
- Audio status
- Next actions
- Quick commands

This provides instant context even without running `/video`.

**Template:**

```markdown
# Project: {name}

**Template:** {template} | **Brand:** {brand} | **Phase:** {phase}
**Last Updated:** {relative_time}

## Scenes

| # | Scene | Type | Status |
|---|-------|------|--------|
| 1 | Title | title | ✅ Ready |
| 2 | Demo | demo | ⬜ Needs recording |

## Audio

- Voiceover: ⬜ Not generated
- Music: Optional

## Next Actions

1. {next_action_1}
2. {next_action_2}

## Commands

\`\`\`bash
npm run studio    # Preview
npm run render    # Final render
\`\`\`

---
*Auto-generated from project.json*
```

## Integration with Commands

### /video

The main entry point. Scans projects, offers resume or new.

### Recording demos (Playwright)

After recording, updates the scene's status:
- Sets `status: "asset-present"`
- Updates `visual.asset` path if needed
- Adds session entry

### /generate-voiceover

After generating:
- Sets `audio.voiceover.status: "present"`
- Updates phase to `audio` → `editing` if all assets ready
- Adds session entry

## Project Health

When scanning, projects are classified:

| Health | Condition |
|--------|-----------|
| `ready` | Can proceed to next phase |
| `blocked` | Missing required assets |
| `stale` | No updates in 7+ days, not complete |
| `complete` | Phase is "complete" |

## Build config

Every brand template needs the same webpack alias, the same `zod$` single-instance
pin, and the same vitest setup — because every template sits two hops below the
brand repo root, next to a `toolkit/` submodule and (optionally) a `brand-lib/`:

```
<repo>/toolkit/            ← this repo, vendored as a submodule
<repo>/brand-lib/          ← optional shared brand components
<repo>/templates/<name>/   ← a template     (projectRoot)
<repo>/projects/<name>/    ← a video project (projectRoot)
```

`paths.ts`, `remotion-config.ts`, and `vitest-config.ts` in this directory are the
one home for that logic, so the workarounds — the `zod$` alias, the
`resolve.modules` fix for `@remotion/transitions`, and the `toolkit/lib` existence
guard — live in one place instead of being copy-pasted (and drifting) across every
`remotion.config.ts`.

### remotion.config.ts

```ts
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4'; // omit if the brand has no Tailwind
import { applyToolkitWebpack } from '@video-toolkit/lib/project/remotion-config';

applyToolkitWebpack(Config, {
  projectRoot: process.cwd(),
  brandLib: true, // omit/false if this brand has no brand-lib tier
  tailwind: enableTailwind, // omit if the brand has no Tailwind
});
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

### vitest.config.ts

```ts
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { createToolkitVitestConfig } from '@video-toolkit/lib/project/vitest-config';

export default defineConfig(
  createToolkitVitestConfig({
    projectRoot: path.dirname(fileURLToPath(import.meta.url)),
    brandLib: true, // omit/false if this brand has no brand-lib tier
  }),
);
```

### tsconfig.json

```json
{
  "extends": "../../toolkit/lib/project/tsconfig.base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "paths": {
      "@/*": ["src/*"],
      "@video-toolkit/lib/*": ["../../toolkit/lib/*"],
      "@brand-lib/*": ["../../brand-lib/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "out"]
}
```

`paths` in an extended config resolve relative to **the file that declares them**
— i.e. `tsconfig.base.json` itself — so its `@video-toolkit/lib/*` entry
(`["../*"]`) means `lib/*` of this repo, correctly, no matter where the extending
template sits.

**`paths` does not merge across `extends`.** TypeScript's `compilerOptions.paths`
is replaced wholesale, not merged, when the extending config declares its own
`paths` object (verified against the repo's own TypeScript 5.9.3) — so a
template's `tsconfig.json` that lists only `@/*` and `@brand-lib/*` would silently
lose `@video-toolkit/lib/*` for type-checking, even though webpack and vitest
still resolve it fine (they get their alias from `applyToolkitWebpack` /
`createToolkitVitestConfig`, not from `tsconfig.json`). A template must therefore
repeat `@video-toolkit/lib/*` in its own `paths`, exactly as shown above, in
addition to its brand-relative `@/*` and `@brand-lib/*` (and `outDir`/`include`/
`exclude`).
