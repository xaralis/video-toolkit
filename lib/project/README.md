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

**Import these three with a relative specifier, not `@video-toolkit/lib/...`.**
`remotion.config.ts` and `vitest.config.ts` are both loaded by their tool
(Remotion's CLI, Vite/Vitest) via esbuild *before* any bundler alias exists —
Vite externalizes bare specifiers in a config file and resolves them through
plain Node `node_modules` resolution, which cannot see the `resolve.alias` the
config is about to *return* (chicken-and-egg), and `@video-toolkit` is not a
real package in any `node_modules`. Verified directly: a `vitest.config.ts`
importing `createToolkitVitestConfig` from `@video-toolkit/lib/project/vitest-config`
fails to load with `Cannot find module '@video-toolkit/lib/project/vitest-config'`;
the same file importing it from the relative path below loads and runs.
Remotion's config loader happens to tolerate the bare form too — but only
because its esbuild step also reads the project's `tsconfig.json`, and a
`paths` entry there currently wins over `packages: 'external'` and gets the
import inlined. That is an accident of `tsconfig.json` shape, not a supported
path: drop the `paths` entry later (or the template's tsconfig stops being read
for some other reason) and `npm run render` breaks with no code change. A
relative specifier sidesteps the whole question for both files, the same way
`lib/editor/vitest.config.ts` already reaches its sibling `lib/` with
`fileURLToPath(new URL('..', import.meta.url))` rather than through its own
alias. Bare `@video-toolkit/lib/...` remains correct *inside* `src/` — code a
bundler with the alias applied actually handles — just not in the config files
that set the alias up.

### remotion.config.ts

```ts
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4'; // omit if the brand has no Tailwind
import { applyToolkitWebpack } from '../../toolkit/lib/project/remotion-config';

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
import { createToolkitVitestConfig } from '../../toolkit/lib/project/vitest-config';

export default defineConfig(
  createToolkitVitestConfig({
    projectRoot: path.dirname(fileURLToPath(import.meta.url)),
    brandLib: true, // omit/false if this brand has no brand-lib tier
    // extraTestInclude: ['tests/**/*.test.ts'], // only if the project also has a top-level tests/ dir
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

`tsconfig.base.json` deliberately declares no `paths` of its own. TypeScript's
`compilerOptions.paths` does not merge across a single `extends` — the
extending config's own `paths` object replaces the base's wholesale, not adds
to it (verified against the repo's own TypeScript 5.9.3 with `--showConfig`) —
so any `paths` entry put in the base would be silently discarded by every real
template, which always declares its own `paths` for `@/*`. Worse, an earlier
draft of this file claimed the base's entry "means `lib/*` of this repo,
correctly, no matter where the extending template sits" — that is false
whenever the extending config also sets `baseUrl` (every real template does):
with `baseUrl: "."` at the template and no matching entry in the template's own
`paths`, `@video-toolkit/lib/foo` was confirmed with `--traceResolution` to
resolve successfully to `templates/foo.ts` — a file one directory short of the
right one — not to fail loudly. A base-level `paths` entry here would therefore
be dead in the one shape that's supposed to use it, and dangerously wrong in
the other. **The rule, made authoritative:** every template must declare
`"@video-toolkit/lib/*": ["../../toolkit/lib/*"]` in its own `tsconfig.json`
`paths`, exactly as shown above, alongside its brand-relative `@/*` and
`@brand-lib/*` (and `outDir`/`include`/`exclude`) — there is no shortcut
through the base config.

This repeated entry is a type-checking (`tsc`, editor IntelliSense) concern
only, now that both build-time consumers no longer depend on it: webpack's
alias comes from `applyToolkitWebpack`'s own runtime path computation (not
`tsconfig.json`), and — per the relative-import note above — `remotion.config.ts`'s
own import of `applyToolkitWebpack` no longer rides on the `tsconfig.json`
`paths`-beats-`packages:external` accident either. Omitting the repeated entry
degrades type-checking, not `npm run render`.
