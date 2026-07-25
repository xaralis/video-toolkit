# Brand-repo migrations — everything pending as of Phase 2

**What this is.** Core's Phase 1 and Phase 2 were deliberately *core-only*: nothing under
`~/Workspace/progpce/video-toolkit` (Progresivní Pardubice) or `~/Workspace/roost/video-toolkit`
(ROOST) was modified. This file is the complete set of edits a brand repo must apply when it
bumps its `toolkit/` submodule pin past Phase 2 — Phase 1's five still-pending items **plus**
Phase 2's. One document is enough; nothing else needs to be read.

Every snippet below was checked against the real files in both brand repos (read-only) and
against core's actual exports on branch `refactor/phase2-core-shell`. Where a snippet is *not*
literally paste-able (a trailing comma, a module that does not exist yet), it says so.

**Each item is marked:**

- **tsc-caught** — you will get a compile error if you skip or botch it.
- **loud** — no compile error, but it fails immediately and unmistakably at runtime.
- **silent** — nothing tells you. These are the dangerous ones.

---

## Two rules that break a brand repo if you get them wrong

**Rule 1 — config files import core by RELATIVE path, never through `@video-toolkit/lib`.**

Applies to `remotion.config.ts`, `vitest.config.ts` and `.editor/vite.config.mts`. Vite and
esbuild load a config file by externalizing bare specifiers and resolving them through plain
Node `node_modules` resolution — *before* the `resolve.alias` that this very file is about to
return exists — and they do not consult tsconfig `paths`. `@video-toolkit` is not a real package
in any `node_modules`, so the bare form cannot resolve.

- From `<repo>/templates/<name>/` or `<repo>/projects/<name>/`: `../../toolkit/lib/...`
- From `<repo>/templates/<name>/.editor/` or `<repo>/projects/<name>/.editor/`: `../../../toolkit/lib/...`

Verified empirically in Task 3 (a `vitest.config.ts` with the bare specifier fails to load with
`Cannot find module '@video-toolkit/lib/project/vitest-config'`; the relative form loads and
runs) and re-verified in Task 6 by executing both real `.editor/vite.config.mts` snippets through
Vite's own `loadConfigFromFile` against a symlinked copy of core. Remotion's config loader
*happens* to tolerate the bare form today, but only through an accident of tsconfig `paths`
beating `packages: 'external'` — do not rely on it.

Bare `@video-toolkit/lib/...` stays correct **inside `src/` and inside `.editor/main.tsx`** —
code that a bundler with the alias applied actually handles.

**Rule 2 — a template's own `tsconfig.json` must still declare `@video-toolkit/lib/*` itself.**

TypeScript's `compilerOptions.paths` does **not** merge across a single `extends`: the extending
config's `paths` object replaces the base's wholesale (verified with `tsc --showConfig` against
TypeScript 5.9.3). Core's `lib/project/tsconfig.base.json` therefore declares **no `paths` at
all** — a base-level entry would be silently discarded by every real template (all of which
declare their own `@/*`), and with `baseUrl: "."` set at the template it would resolve
`@video-toolkit/lib/foo` to `templates/foo.ts` — one directory short of the right file, with no
error (confirmed with `--traceResolution`).

---

# Part 1 — Phase 1's pending migrations, carried forward

Unchanged from `docs/superpowers/HANDOFF.md`, except item 4, which Phase 2 makes obsolete.

### 1. roost — `withTransitionOverrides` *(tsc-caught)*

`projects/roost-reel-01/src/LayeredRoostReel.tsx:110` spreads `Transition | undefined`, which
yields `kind?:` and no longer satisfies the tightened `VideoItem['transitionOut']`. Core now
exports `withTransitionOverrides()` for exactly this. One file — the template is a shim with no
spread. Rendering is unaffected; nothing parses at render time.

### 2. PP — union mirror *(tsc-caught)*

`projects/pp-05-zastupitelsky-klub/src/config/types.ts:18` hand-mirrors the transition union and
needs `color?: string`. Only that project; the template has no such mirror.

### 3. roost — drop `applyEndpoint` *(tsc-caught)*

`templates/roost-reels/src/overlays/TextOverlay.tsx:43` and its vendored copy in
`projects/roost-reel-01/`. **This is a PURE DELETION of `applyEndpoint={false}`.** Do **not**
pass an `endpointKey`: roost deliberately has the endpoint rule off, and absent `endpointKey` now
means off. Passing one would switch on an accent rule roost disabled and change its rendered
captions. PP needs nothing.

### 4. All editor hosts — pass `meta` — **✅ SUPERSEDED BY PHASE 2. DO NOT HAND-EDIT.**

This was 14 files: 12 in PP (`templates/campaign-reels/.editor` + 11 `projects/*/.editor`) and 2
in roost (`templates/roost-reels/.editor` + `projects/roost-reel-01/.editor`). Verified: those
are exactly the `.editor/` directories that exist today.

**Core's `EditorHost` passes `meta` to both `LayeredTimeline` and `LayeredInspector` itself**
(`lib/editor/host/EditorHost.tsx`). Adopting `mountEditorHost` (Part 2, item **E**) therefore
fulfils this migration at all 14 sites as a side effect. Do not do the 14-file hand-edit — it is
wasted work and it will be overwritten.

Caveat: passing an *actual* `EditorMeta` still requires the brand to author one. See item **E**
— the `editorMeta` module does not exist in either brand today.

### 5. PP web-program-intro — pass the palette *(silent, latent)*

`projects/pp-program-{klima,obvody,verejny-prostor}/src/WebProgramIntro.tsx:26` calls
`presentationFor(t, { width, height })` with no palette, so a `wipe` carrying an accent key would
resolve to `#000` instead of the brand colour. Latent only — there is currently zero
`kind: 'wipe'` in any project. Pass `palette: theme.accentSlots`. Related: the old wipe
presentation defaulted an unset colour to lime; it is now `#000`. Intended (core must not default
to a brand colour), affects nothing today.

---

# Part 2 — Phase 2

What Phase 2 landed, and what each brand does about it:

| # | Core module | Replaces, in the brand | Severity |
|---|---|---|---|
| A | `lib/render/layered-composition-props.ts` | each layered `Root.tsx`'s hand-copied `calculateMetadata` + 60-frame floor | loud if mis-spelled, otherwise tsc-caught |
| B | `lib/render/{fonts,load-fonts}.ts` | `src/lib/load-fonts.ts` (3 copies) | tsc-caught; **one silent behaviour change** |
| C | `lib/project/{paths,remotion-config,vitest-config}.ts` + `tsconfig.base.json` | `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` boilerplate | loud |
| D | — | the duplicate `roostReelDurationInFrames` floor | silent |
| E | `lib/editor/host/{EditorHost.tsx,mount.tsx}` | `.editor/main.tsx` (489/504 lines → ~12–17) | tsc-caught |
| F | `lib/editor/host/{editor-plugin.mts,vite-config.mts,prettier-format.ts}` | `.editor/vite.config.mts` + `.editor/editor-plugin.mts` (deleted) | loud |
| G | `docs/zod-version.md` | the `zod` version range in `package.json` | **silent** |

---

## Section 1 — Progresivní Pardubice (`~/Workspace/progpce/video-toolkit`)

**Layout, verified:** `templates/{campaign-reels,web-program-intro}/`, 16 `projects/pp-*/`, of
which 11 have a `.editor/`. `brand-lib/` exists; both templates use Tailwind.

**`web-program-intro` is NOT a layered reel.** Its `src/Root.tsx` passes a `schema=` prop and
computes duration from `buildReelConfig(props)` + `totalDurationFrames`; it has no `.editor/`
directory. It takes items **B**, **C** and **G** only — never **A**, **D**, **E** or **F**.

---

### A. `src/Root.tsx` → `layeredCompositionProps`

**Applies to:** `templates/campaign-reels/src/Root.tsx` and all 16 `projects/pp-*/src/Root.tsx`
that declare `id="LayeredCampaignReel"`. **Not** `web-program-intro`.

**Before** (campaign-reels; the projects are identical in these lines):

```tsx
import { Composition } from 'remotion';
import { LayeredCampaignReel } from './LayeredCampaignReel';
import { fps, width, height } from './config/reel-config';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LayeredCampaignReel"
      component={LayeredCampaignReel}
      defaultProps={{ /* … the authored reel literal … */ }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(60, Math.round((props.reel.meta.totalDurationMs / 1000) * fps)),
      })}
      durationInFrames={300}
      fps={fps}
      width={width}
      height={height}
    />
  );
};
```

**After** — `defaultProps` is **untouched, byte for byte**. Only the seven other attributes go:

```tsx
import { Composition } from 'remotion';
import { layeredCompositionProps } from '@video-toolkit/lib/render/layered-composition-props';
import { LayeredCampaignReel } from './LayeredCampaignReel';
import { fps, width, height } from './config/reel-config';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      {...layeredCompositionProps({
        id: 'LayeredCampaignReel',
        component: LayeredCampaignReel,
        fps,
        width,
        height,
      })}
      defaultProps={{ /* … the authored reel literal, unchanged … */ }}
    />
  );
};
```

`layeredCompositionProps` returns `{ id, component, fps, width, height, durationInFrames,
calculateMetadata }` — the placeholder `durationInFrames` and the `Math.max(60, …)` floor are
core's now, in one place (`lib/render/layered-composition-props.ts`).

> **⚠️ Spell the call literally, with an inline options object.**
> The editor's surgical Save (`lib/editor/src/default-props-writer.ts`, `idOf()`) finds the
> composition id by matching the spread's **callee source text** against an allowlist containing
> exactly `layeredCompositionProps`, then reading a string-literal `id:` property off the call's
> **first argument**. All of these fail:
>
> - `import { layeredCompositionProps as lcp }` — alias, callee text no longer matches
> - `import * as r from …; {...r.layeredCompositionProps({ … })}` — namespace call
> - `const OPTS = { id: 'X', … }; {...layeredCompositionProps(OPTS)}` — hoisted options, no literal to read
>
> The failure is **loud**, not silent: `readDefaultProps` throws
> `no <Composition> with id="LayeredCampaignReel"` and the editor refuses to load. Two
> `<Composition>` elements sharing an id also throw by name. Pinned by
> `lib/editor/src/default-props-writer.test.ts` (`SPREAD_HOISTED_OPTS_ROOT`,
> `SPREAD_DECOY_ROOT`, `SPREAD_DUPLICATE_ID_ROOT`) and by
> `lib/editor/src/example-default-props.test.ts`, which runs the real reader against
> `examples/layered-minimal/src/Root.tsx` — core's own reference for this exact shape.

---

### B. `src/lib/load-fonts.ts` → **deleted**, replaced by `loadBrandFonts([...])`

**Applies to:** `templates/campaign-reels/`, `templates/web-program-intro/`, and every vendored
copy under `projects/pp-*/`.

**Delete** `src/lib/load-fonts.ts` entirely.

**Before** — the caller (`src/LayeredCampaignReel.tsx:18,24`, `src/WebProgramIntro.tsx:10,14`):

```tsx
import { loadBrandFonts } from './lib/load-fonts';
…
loadBrandFonts();
```

**After** — same call-site position (module scope, before the component), zero-arg call becomes
a font list:

```tsx
import { loadBrandFonts } from '@video-toolkit/lib/render/load-fonts';
…
loadBrandFonts([
  { family: 'Geist', file: 'fonts/Geist-Bold.ttf', weight: '700' },
  { family: 'JetBrains Mono', file: 'fonts/JetBrainsMono-Regular.ttf', weight: '400' },
  { family: 'JetBrains Mono', file: 'fonts/JetBrainsMono-Bold.ttf', weight: '700' },
]);
```

Identical for both templates — they ship the same font set. `style: 'normal'` and
`display: 'block'` are core's defaults, so they are omitted; `file` still goes through Remotion's
`staticFile`, so it stays a path inside the project's `public/`.

The `delayRender` hardening (`timeoutInMilliseconds: 120_000, retries: 2`) — which existed in
**only one** of the three brand copies — is now everyone's default. `web-program-intro` gains it:
it previously used Remotion's 28s default with 0 retries.

Also update the stale pointer in `templates/campaign-reels/src/styles/global.css:16`, which names
`src/lib/load-fonts.ts`.

> **Silent, worth knowing:** the module-level `handle` guard means a *second* `loadBrandFonts`
> call from a different composition inside one JS realm is a no-op. This mirrors all three brand
> originals exactly, so it is not a regression — but Studio can mount several compositions, and
> if two of them ever want different font sets, the second set never loads and nothing says so.

---

### C. Build config — `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`

**Applies to:** both templates and all 16 projects (same directory depth, same hop count).

**`remotion.config.ts`** — replaces ~40 lines of `require.resolve('zod')` / `resolve.modules` /
`existsSync` boilerplate:

```ts
import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';
import { applyToolkitWebpack } from '../../toolkit/lib/project/remotion-config';

applyToolkitWebpack(Config, {
  projectRoot: process.cwd(),
  brandLib: true,
  tailwind: enableTailwind,
});
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
```

**`vitest.config.ts`** (campaign-reels and every `pp-*` project):

```ts
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { createToolkitVitestConfig } from '../../toolkit/lib/project/vitest-config';

export default defineConfig(
  createToolkitVitestConfig({
    projectRoot: path.dirname(fileURLToPath(import.meta.url)),
    brandLib: true,
  }),
);
```

`web-program-intro` also has a top-level `tests/` directory; use `extraTestInclude`, which
**appends** to the default `['src/**/*.test.ts', 'src/**/*.test.tsx']` rather than replacing it:

```ts
export default defineConfig(
  createToolkitVitestConfig({
    projectRoot: path.dirname(fileURLToPath(import.meta.url)),
    brandLib: true,
    extraTestInclude: ['tests/**/*.test.ts'],
  }),
);
```

**`tsconfig.json`** — `extends` the core base, but keeps its own `paths` (Rule 2):

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

The base supplies `target`, `module`, `moduleResolution`, `jsx`, `strict`, `esModuleInterop`,
`skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule` — exactly the nine
options every brand tsconfig repeats today, and nothing else.

`applyToolkitWebpack` and `createToolkitVitestConfig` both throw a diagnosable
`toolkit/lib not found at …` if the layout is wrong, instead of failing later as a confusing
"module not found".

---

### E. `.editor/main.tsx` → `mountEditorHost`

**Applies to:** `templates/campaign-reels/.editor/` and the 11 `projects/pp-*/.editor/`.
489 lines → 17.

**After** (the whole file):

```tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { LayeredCampaignReel } from '../src/LayeredCampaignReel';
import { brandTheme } from '../src/config/brand-theme';
import { editorMeta } from '../src/config/editor-meta'; // ⚠️ see note — this module does NOT exist yet
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

> **⚠️ `src/config/editor-meta` does not exist in campaign-reels today.** Verified: the config
> directory holds `brand-theme.tsx`, `composition-theme.tsx`, `reel-config.ts`, `theme.ts`,
> `types.ts`, `video-item-renderers.tsx` — and no `EditorMeta` is declared anywhere in the
> template. You must either **author `src/config/editor-meta.ts`** (exporting a module-level
> `EditorMeta` constant — lane colours, overlay labels, effect and video-prop vocabulary) or
> **drop the import *and* the `meta:` line**. Do not inline a literal: `meta={{ … }}` is a fresh
> object on every render and defeats `LayeredTimeline`'s shallow-compare memo, which re-renders
> on every playhead frame — the result is stuttering playback.
>
> The same stability rule applies to `accentSlots`. `brandTheme.accentSlots` is a module-level
> constant, so it is fine as written.

`projectName` is the header label; use the project's own name in a `projects/pp-*/.editor/`
copy. `accentSlots` has **no default** — omit it and the inspector's accent editor offers no
palette rather than falling back to a colour core invented.

`.editor/index.html` is unchanged (it is the one file that cannot move to core, along with
`vite.config.mts`). It must keep `<div id="root">`; `mountEditorHost` throws if neither `#root`
nor an explicit container is present.

Everything else the old `main.tsx` implemented is now core's and needs no configuration: beats
snapping (the toggle always renders and disables itself when a reel has no `meta.guidesMs`),
undo/redo, Escape/Space/⌫, Save via ⌘S or the header button, the `beforeunload` guard, and
Focus/Zoom crop gestures on the preview.

---

### F. `.editor/vite.config.mts` → `createEditorViteConfig`; `.editor/editor-plugin.mts` → **deleted**

**Applies to:** the same 12 `.editor/` directories. 58 + 176 lines → 15, and one file fewer.

**Delete** `.editor/editor-plugin.mts`.

**`.editor/vite.config.mts`, after** (the whole file):

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

Note the `.mts` **suffix inside the specifier** — it is required, and it is deliberate.

`createEditorViteConfig` returns a plain object (core has no `vite` dependency to import
`defineConfig` from), so the brand's own `defineConfig` does the wrapping. It roots Vite at
`editorDir`, takes `editorDir`'s parent as the project root, serves the project's `public/`,
defaults the port to `3100` (override with `port:`), aliases `@`, `@video-toolkit/lib`,
optionally `@brand-lib`, and the timeline editor's `@xzdarcy/*` deps from the project's own
`node_modules`, pins `zod$` resolved **from the project root**, re-resolves
`@remotion/transitions` subpaths, and appends `createEditorPlugin({ templateRoot, compositionId,
extraArgs })` after the plugins you passed.

The plugin serves `/props`, `/save`, `/render`, `/project-state` and `/sources`. Save's file path
is closed over `templateRoot` at config time and is never read from the request — pinned by
`lib/editor/src/editor-plugin.test.ts` (`POST /save ignores a client-supplied rootPath`).
Prettier formatting on save moved to core as `formatWithProjectPrettier`, which resolves the
*project's* Prettier config and degrades gracefully (logs, writes unformatted) when Prettier is
not installed.

---

### G. Pin `zod` to exactly `3.22.3` *(silent — recommended hygiene for PP, not a break)*

PP currently has `"zod": "^3.22.0"`, which resolves to `3.25.76` on a fresh install. That is
still zod-3 classic and behaves correctly, so **this is not urgent** — the lockfiles hold all
18 PP `package.json`s at 3.22.3 today. But `@remotion/zod-types@4.0.425`'s peer is the exact
string `3.22.3`, so do this the next time those files are touched.

`templates/campaign-reels/package.json:24`, `templates/web-program-intro/package.json:22`, and
optionally each `projects/pp-*/package.json` (16 files):

```diff
-    "zod": "^3.22.0"
+    "zod": "3.22.3"
```

> **⚠️ Not literal-exact for 10 of the 16 projects.** `zod` is not the last key in
> `dependencies` there, so the real line reads `"zod": "^3.22.0",` **with a trailing comma**.
> Apply by line content, not by copy-paste. The 6 that match the diff literally are
> `pp-namesti-republiky`, `pp-program-bydleni`, `pp-program-klima`, `pp-program-mobilita`,
> `pp-program-obvody`, `pp-program-verejny-prostor`.

Then per changed directory: `npm install && npm test && npx tsc --noEmit`, plus one
`npm run studio` on a representative project to confirm the schema sidebar still renders real
controls rather than `… (not editable)`.

Full reasoning: `docs/zod-version.md`.

---

## Section 2 — ROOST (`~/Workspace/roost/video-toolkit`)

**Layout, verified:** `templates/roost-reels/` and one project, `projects/roost-reel-01/`, both
with a `.editor/`. **No Tailwind, no `brand-lib/`.**

---

### A. `src/Root.tsx` → `layeredCompositionProps`

**Applies to:** `templates/roost-reels/src/Root.tsx` and `projects/roost-reel-01/src/Root.tsx`.

**Before:**

```tsx
// src/Root.tsx
import { Composition } from 'remotion';
import { LayeredRoostReel } from './LayeredRoostReel';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="LayeredRoostReel"
    component={LayeredRoostReel}
    defaultProps={{ /* … the authored reel literal … */ }}
    calculateMetadata={({ props }: { props: { reel: { meta: { totalDurationMs: number } } } }) => ({
      durationInFrames: Math.max(60, Math.round((props.reel.meta.totalDurationMs / 1000) * 30)),
    })}
    durationInFrames={300}
    fps={30}
    width={1080}
    height={1920}
  />
);
```

**After** — `defaultProps` untouched; note roost inlines its dimensions (it has no
`src/config/reel-config` module):

```tsx
// src/Root.tsx
import { Composition } from 'remotion';
import { layeredCompositionProps } from '@video-toolkit/lib/render/layered-composition-props';
import { LayeredRoostReel } from './LayeredRoostReel';

export const RemotionRoot: React.FC = () => (
  <Composition
    {...layeredCompositionProps({
      id: 'LayeredRoostReel',
      component: LayeredRoostReel,
      fps: 30,
      width: 1080,
      height: 1920,
    })}
    defaultProps={{ /* … the authored reel literal, unchanged … */ }}
  />
);
```

The hand-written `calculateMetadata` type annotation goes away with it — core's signature is
typed. All three warnings in PP's item **A** (literal spelling, inline options object, loud
failure) apply identically here.

---

### B. `src/lib/load-fonts.ts` → **deleted**, replaced by `loadBrandFonts([...])`

**Applies to:** `templates/roost-reels/` and `projects/roost-reel-01/`.

**Delete** `src/lib/load-fonts.ts`.

In `src/LayeredRoostReel.tsx` (line 9 imports it, line 11 calls it in the template; line ~58 in
the project):

```tsx
import { loadBrandFonts } from '@video-toolkit/lib/render/load-fonts';
…
loadBrandFonts([
  { family: 'Coda Caption', file: 'fonts/CodaCaption-ExtraBold.ttf', weight: '800' },
  { family: 'Familjen Grotesk', file: 'fonts/FamiljenGrotesk-Variable.ttf', weight: '400 600' },
]);
```

The `'400 600'` variable-font weight range survives verbatim (pinned by
`lib/editor/src/fonts.test.ts`). roost's original omitted `style`; core defaults it to
`'normal'`, which is what the `FontFace` constructor did implicitly — no behaviour change.

roost **gains** the concurrency hardening (its copy used a bare `delayRender` with Remotion's 28s
default and 0 retries) and a `console.error` diagnostic where its old `.catch()` swallowed the
error silently.

> **Silent, deliberate:** roost's own `delayRender` label was `'Loading ROOST fonts'`. Core's
> default label is generic. This only shows up in Remotion's "delayRender was called but not
> cleared" diagnostics. Pass `{ label: 'Loading ROOST fonts' }` as the second argument to
> `loadBrandFonts` if you want the label back:
> `loadBrandFonts([...], { label: 'Loading ROOST fonts' })`.

---

### C. Build config — `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`

**`remotion.config.ts`** — the roost-specific ANGLE renderer line stays; it is outside the
preset's scope:

```ts
import { Config } from '@remotion/cli/config';
import { applyToolkitWebpack } from '../../toolkit/lib/project/remotion-config';

applyToolkitWebpack(Config, { projectRoot: process.cwd() });
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// The `vintage: 'film'` treatment renders paper()/noise() inside <HtmlInCanvas>,
// which needs a real WebGL2 context — headless Chromium's default renderer
// fails with "Failed to acquire WebGL2 context". Force the ANGLE renderer here
// so `npm run render` / studio work without a manual `--gl=angle` flag (harmless
// when no clip uses film). See templates/roost-reels/CLAUDE.md.
Config.setChromiumOpenGlRenderer('angle');
```

No `brandLib`, no `tailwind`.

**`vitest.config.ts`:**

```ts
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';
import { createToolkitVitestConfig } from '../../toolkit/lib/project/vitest-config';

export default defineConfig(
  createToolkitVitestConfig({
    projectRoot: path.dirname(fileURLToPath(import.meta.url)),
  }),
);
```

> **Not a no-op for roost.** Its current `vitest.config.ts` has no `resolve.alias` at all — only
> `test.include`, `test.environment`, `test.server.deps.inline` and `resolve.dedupe`. This
> migration *adds* a `@video-toolkit/lib` alias that roost's tests did not have. Almost certainly
> an improvement (nothing in roost's `src/` currently resolves that alias in a test context,
> because webpack rather than vitest serves `src/` at runtime today), but it is a change, not a
> rewrite of an equivalent.

**`tsconfig.json`:**

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
      "@video-toolkit/lib/*": ["../../toolkit/lib/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "out"]
}
```

No `@brand-lib` entry.

> **`projects/roost-reel-01/tsconfig.json` has *no* `@video-toolkit/lib/*` entry today** — only
> `@/*` — even though its `src/` imports through that alias. Adding it as shown fixes
> type-checking and IntelliSense there for the first time. Expect `npx tsc --noEmit` in that
> project to surface previously-hidden errors; that is the entry doing its job, not a regression
> this migration introduced.

---

### D. `src/LayeredRoostReel.tsx` — drop the duplicate `roostReelDurationInFrames` *(silent)*

`layeredDurationInFrames(reel, fps)` in `lib/render/layered-composition-props.ts` is now the ONE
definition of a reel's length. roost carries a second one.

**In `templates/roost-reels/src/LayeredRoostReel.tsx:15`** — the export has **no consumer**
anywhere in the template (verified). Delete it and its two-line comment outright:

```ts
// DELETE:
// Single source of truth for the reel length — Root.tsx's calculateMetadata
// MUST use this too so the composition duration and the render never drift.
export const roostReelDurationInFrames = (reel: LayeredReel, fps: number): number =>
  Math.round((reel.meta.totalDurationMs / 1000) * fps);
```

**In `projects/roost-reel-01/src/LayeredRoostReel.tsx:68`** the same export **is** used, at
line 141, to size the music fade-out:

```ts
const totalFrames = roostReelDurationInFrames(reel, fps);
```

Replace the local definition with core's:

```ts
import { layeredDurationInFrames } from '@video-toolkit/lib/render/layered-composition-props';
…
const totalFrames = layeredDurationInFrames(reel, fps);
```

> **⚠️ This is not bit-identical.** roost's version is a bare
> `Math.round((totalDurationMs / 1000) * fps)`; core's applies the 60-frame floor
> (`Math.max(60, …)`). For any reel of 2 seconds or longer the two agree exactly — the current
> reel is 17.5s, so nothing moves. A sub-2s reel would get a longer music-fade window than
> before. If that ever matters, keep a local unfloored helper and say so in a comment; do not
> reintroduce a second *floored* definition.

---

### E. `.editor/main.tsx` → `mountEditorHost`

**Applies to:** `templates/roost-reels/.editor/` and `projects/roost-reel-01/.editor/`.
504 lines → 12.

**After** (the whole file):

```tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { LayeredRoostReel } from '../src/LayeredRoostReel';

// This template has no shared `src/config/reel-config` module — its composition
// dims are inlined in Root.tsx and RoostReel.tsx. Mirror those same literals so
// Studio and the editor's Player never drift.
mountEditorHost({
  component: LayeredRoostReel,
  projectName: 'roost-reels',
  fps: 30,
  width: 1080,
  height: 1920,
});
```

No `accentSlots`, no `meta`, no CSS import — roost declares none of them today. It loses nothing
in the move: its beats toggle becomes core's, shipped to every brand. It *gains* `meta`-driven
timeline and inspector wiring the moment the template declares an `EditorMeta`, and a palette the
moment it declares `accentSlots`.

Note that roost's editor was previously being shown **PP's** `lime`/`teal` accent buttons.
Getting no palette instead is a fix, not a regression (this is Phase 1 migration #4's roost half,
also settled by adoption).

---

### F. `.editor/vite.config.mts` → `createEditorViteConfig`; `.editor/editor-plugin.mts` → **deleted**

62 + 176 lines → 15, and one file fewer. **Delete** `.editor/editor-plugin.mts`.

**`.editor/vite.config.mts`, after** (the whole file):

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Relative, not aliased: THIS file is what creates the @video-toolkit/lib alias,
// so it cannot import through it.
import { createEditorViteConfig } from '../../../toolkit/lib/editor/host/vite-config.mts';

export default defineConfig(
  createEditorViteConfig({
    editorDir: path.dirname(fileURLToPath(import.meta.url)),
    compositionId: 'LayeredRoostReel',
    plugins: [react()],
    extraArgs: ['--gl=angle'],
  }),
);
```

No `tailwindcss()`, no `brandLib`. `extraArgs: ['--gl=angle']` carries forward the value roost
hardcodes today at `.editor/editor-plugin.mts:92` — dropping it would break `vintage: 'film'`
renders launched from the editor's Render button.

Both roost config files above were verified by executing them through Vite's own
`loadConfigFromFile` against a symlinked copy of core: the hop count resolves, `root` /
`publicDir` / `server.port` match, `resolve.alias` has no `@brand-lib`, `zod$` resolves to the
project's real installed zod, and the plugin order is
`[vite:react-babel, vite:react-refresh, resolve-remotion-transitions-from-project, video-toolkit-editor]`.

---

### G. Pin `zod` to exactly `3.22.3` — **REQUIRED** *(silent)*

roost is at `^4.3.6`. Both files match the diff literally (no trailing comma — `zod` is the last
`dependencies` key in each):

**`templates/roost-reels/package.json`** (line 22) and
**`projects/roost-reel-01/package.json`** (line 23):

```diff
-    "zod": "^4.3.6"
+    "zod": "3.22.3"
```

```bash
cd ~/Workspace/roost/video-toolkit/templates/roost-reels && npm install
cd ~/Workspace/roost/video-toolkit/projects/roost-reel-01 && npm install
```

Then, per directory: `npm test`, `npx tsc --noEmit`, and one `npm run studio` +
`npm run render:preview` on the project.

**roost is not broken today** — this is preventive. Remotion 4.0.489 genuinely supports zod 4,
roost's `src/` imports zod nowhere and passes no `schema=` prop. What the split pin costs is that
roost runs core's shared schema code on a major core's CI does not exercise. No Remotion change
is needed (`remotion/dist/cjs/any-zod-type.d.ts` explicitly accepts standalone zod 3.22.x).
`@remotion/studio@4.0.489` keeps `zod@4.3.6` as a real dependency and npm will nest it under
`node_modules/@remotion/studio/` — that is expected and harmless; Studio's `zod-schema-type.js`
handles both, and the `zod$` alias pins the *project's* zod for everything `src/` and core compile
against.

Nothing enforces this pin automatically. `tsc` is blind to it (`skipLibCheck: true` everywhere)
and npm raised no ERESOLVE even against a deliberately conflicting install. A core-side warning
guard is sequenced to land **after** roost migrates — see `docs/zod-version.md`.

---

## Suggested order

Per repo, per directory:

1. **G** (zod pin) — `npm install` once, before anything type-checks against it.
2. **C** (build config) — everything else runs through the alias these files create.
3. **B** (fonts), **A** (composition props), **D** (roost only).
4. **F** (`.editor/vite.config.mts`, delete `editor-plugin.mts`), then **E** (`.editor/main.tsx`).
5. Phase 1's **1**, **2**, **3**, **5** — all small, all independent.
6. Verify: `npm test`, `npx tsc --noEmit`, `npm run studio` (the reel plays and the timeline
   loads), `npm run editor` (the editor loads, edits, and **saves** — Save exercises `readDefaultProps`
   against the new `Root.tsx` spread, which is the one thing that fails loudly if item **A** was
   spelled wrong), and one `npm run render:preview`.

## Not carried by `sync_template.py`

`video_toolkit/sync_template.py:136,141` mirrors only `templates/<t>/src → projects/<p>/src`. It
does **not** carry `.editor/`, `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` or
`package.json`. Items **C**, **E**, **F** and **G** are therefore per-directory manual edits —
14 `.editor/` directories, 20 project/template roots. Teaching `sync_template.py` to carry
`.editor/` is a Phase 3 task.
