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
/toolkit:sync-template <project> --strict           # also delete mirrored files the template no longer has
/toolkit:sync-template <project> --src-only         # legacy: mirror src/ only
```

Runs `python3 -m video_toolkit.sync_template` from the toolkit root.

## What it carries

| Path | Rule |
|------|------|
| `src/` | full mirror, minus the project-owned files below |
| `.editor/` | full mirror — the reel editor is the template's, wholesale |
| `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.prettierrc.json` | full mirror (a file the template doesn't ship is skipped) |
| `package.json` | **merged, never overwritten** — see below |

Everything mirrored is compared by **content hash**, so unchanged files are skipped and genuine
drift shows as `updated`. Idempotent: re-running is free.

## How your work is protected

**The tool only ever overwrites or deletes a file it can prove it put there itself.** Anything else
is reported and left alone.

It keeps a provenance manifest, `.template-sync.json` in the project, mapping each path to the hash
of the content *this tool wrote there*. On the next run:

| project's file | meaning | what happens |
|---|---|---|
| matches the recorded hash | untouched since we vendored it | updated to the template's version |
| identical to the template's | provably the same content already | left alone, and recorded from now on |
| **differs from the recorded hash** | **the project edited it** | **`PROTECTED` — not written** |
| **no record at all** | **unknown — assume authored** | **`PROTECTED` — not written** |

Unknown provenance counts as *authored*, deliberately: the cost of guessing wrong is destroying
client work, so the tool refuses and tells you instead.

This matters because path-based rules cannot do the job. `pp-mov-koalice`'s
`src/segments/OutroSegment.tsx` is 83 lines of client work — a coalition partner logo over the brand
stinger, with its own tuned constants — living at the exact path where the template ships a 10-line
default. Nothing about the path distinguishes it from a stale vendored copy. Only provenance does.

**Legacy projects bootstrap themselves.** A project with no manifest isn't stuck needing `--force`:
every file that already matches the template is recorded on the first run, so only genuinely
diverged files need a human decision, and the next template fix flows normally.

> **`--force` is the only way to lose content — and it can.** It overwrites diverged files,
> rewrites dependency pins the project set itself, and with `--strict` deletes unmanaged files. Use
> it only after reading a `--dry-run` and deciding line-by-line that nothing listed as `PROTECTED`
> matters. `Root.tsx` and `config/demo.config.json` survive even `--force`.

> **`--strict` blast radius.** `--strict` deletes files the template no longer has **from every
> mirrored tree, which includes `.editor/`**. It only removes files the manifest says this tool
> placed and the project hasn't touched — a project's own `.editor/local-notes.md`, or authored
> trees like `src/lib/` and `src/graphics/`, are reported `PROTECTED` and kept. It never reaches the
> project root (`CLAUDE.md`, `project.json`, `public/`, `out/`) and never removes a dependency from
> `package.json`. `--dry-run` lists every `removed` file first — check that list.

`src/` alone used to be the whole story, and it was not enough: 8 of 11 PP project editors could not
start at all, because the vendored `package.json` never inherited the template's editor
`devDependencies` and Vite died with `ERR_MODULE_NOT_FOUND` before it even read the config.

## What it will never touch

Beyond the provenance rule above, these are protected **by name**, unconditionally — they survive
even `--force`:

| File | Why |
|------|-----|
| `src/Root.tsx` | the project's actual cut — defaultProps, segments, brand config |
| `src/config/demo.config.json` | the project's Studio defaultProps sample |
| `package.json` → `name`, `version` | the project's identity — overwriting would rename every project |
| `package.json` → any script the project already defines | projects tune e.g. `test` for their own node layout |

The template ships its own demo versions of the first two. Copying them over a project **destroys
the user's work** — the tool refuses, and reports them as `preserved`. (This is not a nicety:
hand-`rsync`ing a template into a project has silently wiped a project's cut more than once.)

This list is short on purpose. It is a convenience for the two paths that *always* differ, **not**
the safety mechanism — that is provenance, which needs no list and cannot go stale.

## The `package.json` merge

`package.json` is the one file that is merged rather than mirrored, because it is half the
template's and half the project's:

- **`dependencies` / `devDependencies`** — a package the project **lacks** is added from the
  template. A package it has at a **different version** is decided by the same provenance rule as a
  file: if the manifest records that this tool wrote the version currently there, it is a stale
  vendored pin and is updated; otherwise the project pinned it itself and it is reported
  `PROTECTED` and **left alone**. A dependency only the project has is left alone.
- **`scripts`** — a script the project doesn't define is added (this is how `editor` arrives); one it
  does define is **kept**, and reported as `pkg keep` so you can see the divergence.
- **`name` / `version`** — never written.

> **Why a pin is not the template's to take.** A version that differs may be a stale vendored copy
> *or* a deliberate project decision, and the version string cannot tell you which — the same
> argument that makes a path list useless for files. The stakes here are higher, not lower: a
> zod/remotion mismatch in this toolkit **fails silently** (`docs/zod-version.md`), so a silently
> rewritten pin produces a wrong render with nothing to notice. `--force` takes the template's
> version, and is the only way to lose the project's.

Every merged key is printed (`pkg add` / `pkg update` / `pkg keep` / `PROTECTED`), so the report
tells you exactly what changed. Run `npm install` in the project afterwards **only if the report
showed `pkg add` / `pkg update`** — that is the one case `npm ci` cannot serve, since it refuses
when `package.json` and the lock disagree. Nothing added? `npm ci` (see CLAUDE.md, "`npm ci` in a
project").

## When to run it

- **Before editing a vendored component** in a project — otherwise you may fork from the template
  without noticing.
- **After fixing something in the template** that an in-progress project should get.
- **Never on a finished project.** A delivered reel is a snapshot; leave it frozen. If you must
  re-render an old project, re-render it as-is.

## Workflow

1. **Preview first.** Run with `--dry-run` and read the report: `copied` (new files), `updated`
   (drift being pulled forward), `PROTECTED` (yours — not written), `preserved`, `unchanged`.
2. **Check the `PROTECTED` list.** Each one is a file the project appears to own. That is the
   correct outcome for authored work; if one is really just a stale vendored copy you want
   refreshed, delete it and re-run (it will be `copied`), which is safer than reaching for
   `--force`.
3. **Run for real** (drop `--dry-run`).
4. **`npm install`** in the project if the report showed any `pkg add` / `pkg update` — and only
   then; otherwise `npm ci`, which never rewrites the lock.
5. **Verify the project still renders** — `/toolkit:render preview` or a still. The template may have moved on
   in ways the project's config doesn't expect (a renamed schema field, a new required prop).
6. Commit the project's change with a message naming what the template fix was.

## Related

- `python3 -m video_toolkit.sync_brand_assets` — the same idea for brand assets (`brands/<brand>/assets` →
  `projects/<name>/public/brand`). Also a copy, not a link, for the same snapshot reason.
- `/toolkit:sync` — moves project source + heavy media between git and R2. Different job entirely.
