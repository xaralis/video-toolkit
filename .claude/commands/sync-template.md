---
description: Pull template fixes into a project's vendored src — without touching the project's own cut
---

# Sync template

Projects **vendor** their template's source: `projects/<name>/src/` is a full copy of
`templates/<t>/src/`. That is deliberate — a project is a self-contained snapshot, finished at its
final render, so upgrading the toolkit later (new Remotion, refactored components) can never break a
delivered video. Each project also pins its own `node_modules`, so dependency versions are frozen too.

The cost of that isolation: a project **doesn't** automatically get template fixes. While a project is
still being worked on you sometimes want them. `/sync-template` does that safely.

## Quick start

```
/sync-template <project>                    # pull template fixes in
/sync-template <project> --dry-run          # preview — writes nothing
/sync-template <project> --template <name>  # if project.json has no `template` field
/sync-template <project> --strict           # also delete files the template no longer has
```

Runs `python3 tools/sync_template.py` from the toolkit root.

## What it will never touch

| File | Why |
|------|-----|
| `src/Root.tsx` | the project's actual cut — defaultProps, segments, brand config |
| `src/config/demo.config.json` | the project's Studio defaultProps sample |

The template ships its own demo versions of both. Copying them over a project **destroys the user's
work** — the tool refuses, and reports them as `preserved`. (This is not a nicety: hand-`rsync`ing a
template into a project has silently wiped a project's cut more than once.)

Everything else under the template's `src/` is mirrored, compared by **content hash** — so unchanged
files are skipped and genuine drift shows as `updated`. Idempotent: re-running is free.

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
4. **Verify the project still renders** — `/render preview` or a still. The template may have moved on
   in ways the project's config doesn't expect (a renamed schema field, a new required prop).
5. Commit the project's `src/` change with a message naming what the template fix was.

## Related

- `tools/sync_brand_assets.py` — the same idea for brand assets (`brands/<brand>/assets` →
  `projects/<name>/public/brand`). Also a copy, not a link, for the same snapshot reason.
- `/sync` — moves project source + heavy media between git and R2. Different job entirely.
