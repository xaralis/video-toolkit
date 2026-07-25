# The editor host

Core owns the whole reel editor — state, history, keyboard handling, the preview
Player, the timeline toolbar, crop gestures, save/discard. A brand supplies only
configuration: its composition, its frame size, its palette, its editor
vocabulary.

## A brand's `.editor/main.tsx`

```tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { LayeredCampaignReel } from '../src/LayeredCampaignReel';
import { brandTheme } from '../src/config/brand-theme';
import { editorMeta } from '../src/config/editor-meta'; // the brand must author this module (or drop this import and the `meta:` line below until it does)
import { fps, width, height } from '../src/config/reel-config';
import '../src/styles/global.css';

mountEditorHost({
  component: LayeredCampaignReel,
  projectName: 'campaign-reels',
  fps,
  width,
  height,
  accentSlots: brandTheme.accentSlots,
  meta: editorMeta,
});
```

That is the whole file. Only `component`, `projectName`, `fps`, `width` and
`height` are required; a template with no palette, no editor vocabulary and no
stylesheet of its own drops the last three lines and the CSS import.

## Two rules

**`meta` and `accentSlots` must be module-level constants, never inline object
literals.** `LayeredTimeline` is `memo`ized with a shallow compare and it
re-renders on every playhead frame; a fresh object each render defeats the memo
entirely and makes playback stutter. Import them, or wrap them in `useMemo` —
never write `meta={{ … }}` at the call site.

**`accentSlots` has no default.** Omitting it means the inspector's accent editor
offers no palette — it never falls back to some colour core picked. A brand's
colours reach the editor through this prop or not at all.

## What the host ships that no brand configures

- Beats snapping. The toggle is always rendered; a reel without `meta.guidesMs`
  disables it by itself, so there is no per-brand flag.
- Undo/redo (⌘Z / ⌘⇧Z), Escape to deselect, Space to play/pause, ⌫ to delete.
- Save (⌘S or the header button) POSTs `{ props: { reel } }` to `/save`; the
  initial reel is loaded from `/props`. A dirty reel arms a `beforeunload` guard.
- Focus/Zoom on the preview: pinch to zoom a clip's crop, two-finger scroll or
  drag to move its focal point.

## `mountEditorHost(options, container?)`

Renders `<EditorHost>` into `container`, defaulting to `#root`. Throws if
neither exists. `EditorHost` itself is exported from `./EditorHost` for hosts
that manage their own React root.

## The Node side: `.editor/vite.config.mts`

The browser host above needs a dev server behind it. Core ships that too —
the Vite dev-server plugin backing `/props`, `/save`, `/render`,
`/project-state` and `/sources` (`editor-plugin.mts`), and the Vite config
factory that wires it up (`vite-config.mts`). A brand's `.editor/` is then
just `index.html`, `main.tsx` (above), and a short `vite.config.mts`.

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// Relative, not aliased: THIS file is what creates the @video-toolkit/lib alias,
// so it cannot import through it.
import { createEditorViteConfig } from '../../../toolkit/lib/editor/host/vite-config.mts';

export default defineConfig(
  createEditorViteConfig({
    editorDir: path.dirname(fileURLToPath(import.meta.url)),
    compositionId: 'LayeredCampaignReel',
    plugins: [react(), tailwindcss()],
    brandLib: true,
  }),
);
```

A brand with no Tailwind and no `brand-lib/` tier drops `tailwindcss()` and
`brandLib`; one that needs extra Remotion render CLI flags (e.g. a software
GL renderer) adds `extraArgs: ['--gl=angle']`.

`createEditorViteConfig` returns a plain object, not a value wrapped in
Vite's `defineConfig` — core has no `vite` dependency to import that from, so
the brand's own `defineConfig` call does the wrapping. It roots Vite at
`editorDir`, serves the project's `public/` dir, aliases `@`,
`@video-toolkit/lib` (and `@brand-lib` when `brandLib: true`) plus the
timeline-editor's dependencies from the *project's* `node_modules` (the
toolkit submodule's own `node_modules` walk can't reach them), pins a single
`zod` instance resolved from the project, re-resolves `@remotion/transitions`
subpaths so the shared at-cut engine's runtime imports work, and appends
`createEditorPlugin({ templateRoot, compositionId, extraArgs })` after any
plugins the brand passed in. `editorDir`'s parent is taken as the project
root, matching `remotion.config.ts`'s own layout assumption
(`lib/project/README.md`).

**Import `createEditorViteConfig` by relative path, never through
`@video-toolkit/lib`.** Vite loads a config file by externalizing bare
specifiers and resolving them through plain Node resolution — before the
alias the config is about to *return* exists — so the alias can't be used to
load the file that defines it. Same rule as `remotion.config.ts` and
`vitest.config.ts`; see `lib/project/README.md`.

**`createEditorPlugin`'s return type is `satisfies Plugin`, not `: Plugin`.**
Vite/Rollup type every plugin hook (including `configureServer`) as
`ObjectHook<T>` — a union of a plain function and `{ handler, order }` —
and calling a union through a non-callable arm is a TS error at any call
site typed through that interface, including this module's own test
(`plug().configureServer!(server)`). `satisfies Plugin` checks structural
compatibility with Vite's `Plugin` shape without widening the returned
literal's type to it, so callers see the concrete object type — whose
`configureServer` is the exact function defined here, callable at the test
call site — while remaining fully substitutable wherever a real `Plugin` is
expected (Vite's `plugins` array, `createEditorViteConfig`'s spread above).
