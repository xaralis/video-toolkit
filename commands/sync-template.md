---
description: Pull template fixes into a project's vendored code, editor and build config — without touching the project's own cut
---

# Sync template

Projects **vendor** their template: `projects/<name>/` is a full copy of `templates/<t>/` — the
`src/` tree, the reel editor in `.editor/`, and the build config. That is deliberate — a project is a self-contained snapshot, finished at its
final render, so upgrading the toolkit later (new Remotion, refactored components) can never break a
delivered video. Each project also pins its own `node_modules`, so dependency versions are frozen too.

The cost of that isolation: a project **doesn't** automatically get template fixes. While a project is
still being worked on you sometimes want them. `/toolkit:sync-template` does that safely.

## Quick start

```
/toolkit:sync-template <project>                    # pull template fixes in
/toolkit:sync-template <project> --dry-run          # preview — writes nothing
/toolkit:sync-template <project> --template <name>  # if project.json has no `template` field
/toolkit:sync-template <project> --strict           # also delete files the template no longer has
/toolkit:sync-template <project> --src-only         # legacy: mirror src/ only
```

Runs `python3 -m video_toolkit.sync_template` from the toolkit root.

## What it carries

| Path | Rule |
|------|------|
| `src/` | full mirror, minus the project-owned files below |
| `.editor/` | full mirror — the reel editor is the template's, wholesale |
| `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` | full mirror |
| `package.json` | **merged, never overwritten** — see below |

Everything mirrored is compared by **content hash**, so unchanged files are skipped and genuine
drift shows as `updated`. Idempotent: re-running is free.

`src/` alone used to be the whole story, and it was not enough: 8 of 11 PP project editors could not
start at all, because the vendored `package.json` never inherited the template's editor
`devDependencies` and Vite died with `ERR_MODULE_NOT_FOUND` before it even read the config.

## What it will never touch

| File | Why |
|------|-----|
| `src/Root.tsx` | the project's actual cut — defaultProps, segments, brand config |
| `src/config/demo.config.json` | the project's Studio defaultProps sample |
| `package.json` → `name`, `version` | the project's identity — overwriting would rename every project |
| `package.json` → any script the project already defines | projects tune e.g. `test` for their own node layout |

The template ships its own demo versions of the first two. Copying them over a project **destroys
the user's work** — the tool refuses, and reports them as `preserved`. (This is not a nicety:
hand-`rsync`ing a template into a project has silently wiped a project's cut more than once.)

## The `package.json` merge

`package.json` is the one file that is merged rather than mirrored, because it is half the
template's and half the project's:

- **`dependencies` / `devDependencies`** — every template entry is applied. Missing → added; present
  at a **different version** → updated to the template's, since the template is the source of truth
  for the toolchain. A dependency only the project has is left alone.
- **`scripts`** — a script the project doesn't define is added (this is how `editor` arrives); one it
  does define is **kept**, and reported as `pkg keep` so you can see the divergence.
- **`name` / `version`** — never written.

Every merged key is printed (`pkg add` / `pkg update` / `pkg keep`), so the report tells you exactly
what changed. Run `npm install` in the project afterwards if anything was added or updated.

## When to run it

- **Before editing a vendored component** in a project — otherwise you may fork from the template
  without noticing.
- **After fixing something in the template** that an in-progress project should get.
- **Never on a finished project.** A delivered reel is a snapshot; leave it frozen. If you must
  re-render an old project, re-render it as-is.

## Workflow

1. **Preview first.** Run with `--dry-run` and read the report: `copied` (new files), `updated`
   (drift being pulled forward), `preserved` (project-owned, untouched), `unchanged`.
2. **Check the `updated` list.** Each one means the project's copy differs from the template. If the
   project intentionally diverged (a project-specific tweak living in a shared component), syncing
   will overwrite that tweak — move it into `Root.tsx`/config, or skip the sync.
3. **Run for real** (drop `--dry-run`).
4. **`npm install`** in the project if the report showed any `pkg add` / `pkg update`.
5. **Verify the project still renders** — `/toolkit:render preview` or a still. The template may have moved on
   in ways the project's config doesn't expect (a renamed schema field, a new required prop).
6. Commit the project's change with a message naming what the template fix was.

## Related

- `python3 -m video_toolkit.sync_brand_assets` — the same idea for brand assets (`brands/<brand>/assets` →
  `projects/<name>/public/brand`). Also a copy, not a link, for the same snapshot reason.
- `/toolkit:sync` — moves project source + heavy media between git and R2. Different job entirely.
