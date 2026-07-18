---
description: List available templates and their features
---

# Template

List available video templates or create new ones.

## Entry Point

On invocation, scan templates and present options:

### Step 1: Scan Templates

```
1. Glob templates/*/package.json
2. For each template:
   - Read package.json for name/description
   - Check for src/config/*-config.ts
   - Count available scene types
   - Check for README or docs
```

### Step 2: Present Templates

```
Available templates:

  1. **campaign-reels**
     For: Vertical 9:16 social campaign reels
     Segments: clip, broll, multi-clip, card, outro
     Features:
       - Schema-driven props (Zod, full Studio editor)
       - Persistent brand overlay + per-segment overlays
       - L-cut audio inheritance
       - Transcript-driven captions

  2. **web-program-intro**
     For: 16:9 talking-head intros for web embeds
     Segments: clip, broll, multi-clip
     Features:
       - Ambient background music
       - B-roll cutaways with L-cut audio
       - No overlays (captions via external <track>)

Actions:
  → View template details: enter number
  → Create video with template: /video
  → Create new template: 'new'
```

### Template Details View

When user selects a template:

```
Template: campaign-reels

## Overview

Best for vertical 9:16 short-form social campaign reels — brand overlays,
transcript-driven captions, and a clip-based video track.

## Segment Types

| Type | Description |
|------|-------------|
| clip | Talking-head from public/recordings/ |
| broll | B-roll from public/broll/ (optional AI-generated tag) |
| multi-clip | Side-by-side / picture-in-picture / 4-up |
| card | Reel-native motion graphic plate |
| outro | Brand stinger MP4 — always last |

## Overlay Types

title, quote-pull, stat-callout, source-tag

## Config Structure

Schema-driven via `src/config/schema.ts` (Zod discriminated unions) — Studio
renders a full editor for every segment, overlay, and transition. Real reels
are authored through `/narrate` → `/cut`, not by hand-editing config.

## Usage

Create a project with this template:
  /video → select "campaign-reels"

Preview locally:
  cd projects/{name} && npm run studio

Render:
  npm run render
```

---

## New Template Flow

When user selects 'new':

### Step 1: Gather Information

```
Let's create a new template.

Template name: (e.g., "tutorial", "changelog", "comparison")
Description: (what type of videos is this for?)
```

### Step 2: Choose Starting Point

```
How would you like to start?

  1. Copy existing template (recommended)
     → Choose campaign-reels or web-program-intro as base
     → Modify for your needs

  2. Minimal template
     → Basic Remotion setup
     → Single placeholder composition
     → You build from scratch

  3. From existing project
     → Convert a project in projects/ into a reusable template
```

### Step 3: Define Scene Types

```
What scene types should this template support?

Common options:
  - title, intro, outro, credits (bookends)
  - demo, split-demo, screenshot (visuals)
  - overview, summary, stats (information)
  - problem, solution, feature, cta (narrative)
  - chapter, step, tip (educational)

Enter scene types (comma-separated):
```

### Step 4: Create Template

**If copying existing:**
```bash
cp -r templates/{base}/ templates/{name}/
```

Then modify:
1. Update `package.json` name and description
2. Rename config file: `{base}-config.ts` → `{name}-config.ts`
3. Update `Root.tsx` to reference new config
4. Adjust/add scene components as needed
5. Update types.ts with new scene types

**If minimal:**
```bash
cd templates
npx create-video@latest {name} --yes
```

Then set up:
1. Create `src/config/{name}-config.ts`
2. Create `src/config/types.ts`
3. Create `src/config/theme.ts` (or import from lib)
4. Create `src/config/brand.ts` placeholder
5. Set up component directories

**If from project:**
1. Copy project to templates/
2. Remove project-specific content from config
3. Generalize hardcoded values
4. Extract reusable patterns

### Step 5: Verify Setup

```bash
cd templates/{name}
npm install
npm run studio
```

### Step 6: Confirmation

```
Template created: templates/{name}/

Files:
  ✅ package.json
  ✅ src/Root.tsx
  ✅ src/config/{name}-config.ts
  ✅ src/config/types.ts
  ✅ src/config/theme.ts

Next steps:
  1. Edit config to define your content structure
  2. Create/modify components for your scene types
  3. Test with: cd templates/{name} && npm run studio
  4. Use with: /video → select your new template

See docs/creating-templates.md for detailed guidance.

⚠️  Restart Claude Code to see the new template in /video.
```

---

## Template Structure Reference

Each template in `templates/` follows this structure:

```
templates/{name}/
├── package.json           # Remotion project config
├── src/
│   ├── Root.tsx           # Composition entry point
│   ├── config/
│   │   ├── theme.ts       # Visual styling
│   │   ├── brand.ts       # Brand integration (generated)
│   │   ├── types.ts       # TypeScript types
│   │   └── {name}-config.ts  # Content configuration
│   └── components/
│       ├── core/          # Shared components
│       ├── slides/        # Slide components
│       └── demos/         # Demo components
├── public/
│   ├── demos/             # Video assets
│   ├── audio/             # Voiceover, music
│   └── images/            # Logos, screenshots
└── remotion.config.ts     # Remotion settings
```

---

## Template Evolution

Templates are designed to grow and improve over time. Track evolution in each template:

### Adding Features to Existing Templates

```
1. Identify the need (from project work or user requests)
2. Plan the addition:
   - New scene type? → Update types.ts, create component
   - New component? → Add to appropriate folder
   - New config option? → Extend config types
3. Implement with backward compatibility
4. Update template README and CLAUDE.md
5. Test in existing projects
6. Document in _internal/CHANGELOG.md
```

### Template Maturity Indicators

| Indicator | Meaning |
|-----------|---------|
| Scene types | Number of supported content types |
| Components | Reusable building blocks |
| Config flexibility | How customizable without code changes |
| Brand integration | Uses brand.ts for theming |
| Documentation | README completeness |

### Promoting Patterns to Shared Library

When patterns emerge across templates:

```
1. Identify common components/utilities
2. Extract to lib/ (e.g., lib/components/, lib/animations/)
3. Import in templates instead of duplicating
4. Document in lib/README.md
```

---

## Evolution

This command evolves through use. If something's awkward or missing:

**Local improvements:**
1. Edit `commands/template.md` → Update `_internal/CHANGELOG.md`
2. Share upstream → `gh pr create`

**Remote contributions:**
- Issues: `github.com/digitalsamba/claude-code-video-toolkit/issues`
- PRs welcome for new templates, components, documentation

History: Created as unified template listing/creation command
