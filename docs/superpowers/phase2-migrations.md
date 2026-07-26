# Brand-repo migrations — Phase 1 + Phase 2

> ## ✅ APPLIED — 2026-07-26
>
> **Every item in this document has been applied to both brand repos and verified.** Both repos
> are green (`npm test`, `npx tsc --noEmit`), one reel per brand renders byte-identically to its
> pre-migration baseline, and both editors open, edit and save. This file is now a **record of
> what was done** and the **reference for the next brand repo** — not pending work.
>
> - **PP** `~/Workspace/progpce/video-toolkit`, branch `chore/phase2.5-toolkit-migration`:
>   `7a4d698` (submodule pin), `f8ff467` (**G** + **C**), `f7f4095` (**B**, **A**, Part 1 items
>   **2** and **5**, the endpoint fix), `ff955c6` (**E** + **F**).
> - **roost** `~/Workspace/roost/video-toolkit`, branch `chore/phase2.5-toolkit-migration`:
>   `18953c3` (submodule pin), `aaa7279` (pin bumped again, to pick up the host fix below),
>   `cfe7bd5` (everything else).
> - **A core fix the migration forced:** `cb51d4d`. `@remotion/player` could not be resolved from
>   the out-of-tree `EditorHost.tsx`, so **the editor served `/` and `/props` but never mounted**.
>   The Vite pre-plugin now re-resolves *every* Remotion specifier from the project root, not just
>   `@remotion/transitions`. This was invisible to every automated check on both sides — it was
>   found by opening a migrated editor in a browser.
>
> Applying the document also found **seven** places where it was wrong or incomplete. Those are
> corrected in place below (most consequentially: the `tsconfig` `paths` block in item **C**, and
> the PP half of Part 1 item **3**, which the document had exactly backwards). Read the corrected
> text, not the commit messages.

**What this is.** Core's Phase 1 and Phase 2 were deliberately *core-only*: nothing under
`~/Workspace/progpce/video-toolkit` (Progresivní Pardubice) or `~/Workspace/roost/video-toolkit`
(ROOST) was modified. This file is the complete set of edits a brand repo must apply when it
bumps its `toolkit/` submodule pin past Phase 2 — Phase 1's five items **plus** Phase 2's. One
document is enough; nothing else needs to be read.

Every snippet below was checked against the real files in both brand repos and against core's
actual exports, and then **corrected against what applying it actually did**. Where a snippet is
*not* literally paste-able (a trailing comma, a module that does not exist yet), it says so.

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

# Part 1 — Phase 1's migrations, carried forward

From `docs/superpowers/HANDOFF.md`, with item 4 made obsolete by Phase 2 and items **1**, **3**
and **5** corrected against what applying them found (more files than listed in 1 and 5; item 3
had PP exactly backwards).

### 1. roost — `withTransitionOverrides` *(tsc-caught)*

`projects/roost-reel-01/src/LayeredRoostReel.tsx:110` spreads `Transition | undefined`, which
yields `kind?:` and no longer satisfies the tightened `VideoItem['transitionOut']`. Core now
exports `withTransitionOverrides()` for exactly this. Rendering is unaffected; nothing parses at
render time.

**Three files, not one.** The same `{ ...it.transitionOut, mask, glowColor }` spread also lives at
`templates/roost-reels/src/config/composition-theme.tsx:14` and
`projects/roost-promo-01/src/config/composition-theme.tsx:14` — it moved there when the template
became a thin wrapper. Those two passed `tsc` only because an
`(it.transitionOut as { kind?: string } | undefined)` cast was masking the discriminant. **Delete
the cast when you put the helper in**; leaving it keeps the hole open.

### 2. PP — union mirror *(tsc-caught)*

`projects/pp-05-zastupitelsky-klub/src/config/types.ts:18` hand-mirrors the transition union and
needs `color?: string`. Only that project; the template has no such mirror.

### 3. The endpoint rule — **asymmetric: roost drops it, PP must pass it** *(tsc-caught)*

Core commit `07eeca9` removed `applyBrandEndpoint`'s `'teal'` default. The old signature was
`(text, ...rest: [endpointKey?: string])` with `rest.length === 0 ? 'teal' : rest[0]` — a
rest-tuple that deliberately distinguished *omitted* (→ default `'teal'`) from *explicitly
undefined* (→ rule disabled). It is now `(text, endpointKey: string | undefined)` with
`if (!endpointKey) return text`. **Absent now means off.** Both halves below follow from that one
change, and they point in opposite directions — a migrator meets both, so read both.

**roost — a PURE DELETION of `applyEndpoint={false}`. Three files, not two:**
`templates/roost-reels/src/overlays/TextOverlay.tsx:43`, its vendored copy in
`projects/roost-reel-01/`, and `projects/roost-promo-01/src/overlays/TextOverlay.tsx:43`. Do
**not** pass an `endpointKey`: roost deliberately has the endpoint rule off. Passing one would
switch on an accent rule roost disabled and change its rendered captions.

> Same caveat as item **D**: `projects/roost-promo-01/` is untracked (`git status` shows
> `?? projects/roost-promo-01/`) and is the user's own in-progress work. Apply it only when that
> project is itself part of the migration being carried out — do not reach into it
> opportunistically.

**PP — the opposite: two call sites MUST gain an explicit `'teal'`.** (An earlier version of this
document said "PP needs nothing." That was wrong, and it cost a real rendering regression.)
`brand-lib/overlays/TitleOverlay.tsx:52` and `brand-lib/overlays/QuotePullOverlay.tsx:258` call
`applyBrandEndpoint` with a single argument and relied on the removed default. After the pin bump
both no-op, so **every PP caption silently lost its brand endpoint accent**: the sentence-final
period in "Říční sauna na Labi." rendered white instead of teal `#2ad4c5`. Pass PP's own slot
explicitly at both sites — `'teal'`, declared at
`templates/campaign-reels/src/config/theme.ts:4`. That restores byte-identical output.

Severity is **tsc-caught** (`TS2554: Expected 2 arguments, but got 1`) — but nobody saw the error,
because the brand-side `tsc` gate was drowning in ~160 spurious `TS2307`s until item **C**'s
`paths` block was corrected (see there). What actually caught it was **comparing rendered stills
before and after the bump**: 306 differing pixels out of 2.07M, peak channel delta 203/255.

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

**Six files, not three.** The `presentationFor(t, { width, height })` call sits at line 26 of
`src/WebProgramIntro.tsx` in `templates/web-program-intro`, `projects/pp-program-bydleni`,
`projects/pp-program-klima`, `projects/pp-program-mobilita`, `projects/pp-program-obvody` and
`projects/pp-program-verejny-prostor`. With no palette, a `wipe` carrying an accent key resolves
to `#000` instead of the brand colour. Latent only — there is currently zero `kind: 'wipe'` in any
project. Related: the old wipe presentation defaulted an unset colour to lime; it is now `#000`.
Intended (core must not default to a brand colour), affects nothing today.

> **"Pass `palette: theme.accentSlots`" is not executable as written.** None of the six
> `src/config/theme.ts` files declares `accentSlots` at all, and `WebProgramIntro.tsx` imported no
> theme. Resolved by adding the same two slots `campaign-reels` declares (`lime #c6f432`,
> `teal #2ad4c5`) to all six web themes, plus the theme import in `WebProgramIntro.tsx`. Note that
> this is a **brand-data addition**, not a mechanical wiring change — and it stays latent either
> way, since no project uses a `wipe`.

---

# Part 2 — Phase 2

What Phase 2 landed, and what each brand does about it:

| # | Core module | Replaces, in the brand | Severity |
|---|---|---|---|
| A | `lib/render/layered-composition-props.ts` | each layered `Root.tsx`'s hand-copied `calculateMetadata` + 60-frame floor | loud if mis-spelled, otherwise tsc-caught |
| B | `lib/render/{fonts,load-fonts}.ts` | `src/lib/load-fonts.ts` (3 copies) | tsc-caught; **one silent behaviour change** |
| C | `lib/project/{paths,remotion-config,vitest-config}.ts` + `tsconfig.base.json` | `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` boilerplate | loud |
| D | `lib/render/layered-composition-props.ts` (`layeredDurationInFrames`) | roost's duplicate `roostReelDurationInFrames` (deleted, both files) | tsc-caught |
| E | `lib/editor/host/{EditorHost.tsx,mount.tsx}` | `.editor/main.tsx` (489/504 lines → ~13–16) | loud (bad module path) / silent (mistyped option key) — never tsc-caught |
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

**Applies to:** `templates/campaign-reels/src/Root.tsx` and the **11** `projects/pp-*/src/Root.tsx`
that declare `id="LayeredCampaignReel"` (the same 11 that have `.editor/`). The other 5 projects
declare `id="WebProgramIntro"` and are **not** in scope for this item.

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

**The spread does not weaken your `defaultProps` type-check.** This was Phase 2's stated top
residual risk (the unconstrained `<C>` possibly defeating Remotion's `Props` inference); it is
now **closed**, settled in core against a real `<Composition>` — see the note under "Suggested
order" step 6, and `docs/superpowers/HANDOFF.md`.

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
> `rewriteDefaultProps: no <Composition> with id="LayeredCampaignReel".` (both readers go
> through `findDefaultPropsAttr`, `lib/editor/src/default-props-writer.ts:161`) and the
> editor refuses to load. Two
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

`templates/web-program-intro` and `projects/pp-program-{bydleni,klima,mobilita,obvody,verejny-prostor}`
each have a top-level `tests/` dir (`tests/reel-config.test.ts` + `tests/schema.test.ts`) and
today's `vitest.config.ts:17` already lists `'tests/**/*.test.ts'` alongside the `src/**` globs.
Use `extraTestInclude`, which **appends** to the default `['src/**/*.test.ts',
'src/**/*.test.tsx']` rather than replacing it — omitting it on any of these six directories
silently drops both `tests/*.test.ts` files from the run and vitest reports green with fewer
tests:

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
      "@brand-lib/*": ["../../brand-lib/*"],
      "remotion": ["./node_modules/remotion"],
      "@remotion/transitions": ["./node_modules/@remotion/transitions"],
      "@remotion/transitions/*": ["./node_modules/@remotion/transitions/dist/presentations/*"],
      "react": ["./node_modules/@types/react"],
      "react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "out"]
}
```

> **⚠️ The last five entries are not optional — without them the brand-side `tsc` gate is
> worthless.** This is the correction that matters most in this document: it is why Part 1 item
> **3**'s PP regression stayed hidden.
>
> Without them every PP directory reports **~160 errors** (campaign-reels 174, web-program-intro
> 159, pp-program-klima 167, pp-05 162) — *all* of them `TS2307 Cannot find module 'remotion'` and
> `TS2875 … 'react/jsx-runtime' …`, and *all* emitted from files **outside** the project:
> `../../toolkit/lib/**` and `../../brand-lib/**`. tsc resolves a bare specifier by walking up
> `node_modules` from the **importing file**; for a file in `toolkit/lib/` that walk never reaches
> the project's `node_modules`. Real errors in your own `src/` are invisible in that noise.
>
> `react` must map to **`@types/react`**, not `react` — the JS package ships no declarations, and
> mapping there silently `any`s the whole React surface instead of erroring.
>
> This mirrors what core already does for itself at `lib/editor/tsconfig.json:14-33` (that block's
> comments spell out the same reasoning) and in `examples/layered-minimal/tsconfig.json`.
>
> **It cannot be hoisted into `lib/project/tsconfig.base.json`** — Rule 2: `paths` does not merge
> across `extends`, so a base-level block is discarded wholesale by every template that declares
> its own `@/*`. Every brand tsconfig must carry these five itself.
>
> Measured: with them, every PP campaign directory went from ~162 errors to **0**.

The base supplies `target`, `module`, `moduleResolution`, `jsx`, `strict`, `esModuleInterop`,
`skipLibCheck`, `forceConsistentCasingInFileNames`, `resolveJsonModule` — exactly the nine
options every brand tsconfig repeats today, and nothing else.

> **Not a no-op for `pp-05-zastupitelsky-klub`.** Its current `tsconfig.json` has no
> `@brand-lib/*` path entry, even though `src/config/brand-theme.tsx:3` imports from
> `@brand-lib/overlays/QuotePullOverlay`. Adding the entry as shown is a real fix (like roost's
> equivalent gap noted below for `@video-toolkit/lib/*`), not a restatement of the status quo.

`applyToolkitWebpack` and `createToolkitVitestConfig` both throw a diagnosable
`toolkit/lib not found at …` if the layout is wrong, instead of failing later as a confusing
"module not found".

---

### E. `.editor/main.tsx` → `mountEditorHost`

**Applies to:** `templates/campaign-reels/.editor/` and the 11 `projects/pp-*/.editor/`.
489 lines → 16.

> **Never tsc-caught.** Every template/project `tsconfig.json` has `"include": ["src/**/*"]`
> (verified against all 18), so `.editor/` sits outside it and `npx tsc --noEmit` never
> type-checks `main.tsx` at all — a bad module path (e.g. a typo in the `mount` import) is
> **loud**: Vite fails to resolve it and the editor refuses to start. A mistyped option key
> passed to `mountEditorHost` (e.g. `accentSlot:` for `accentSlots:`) is **silent**: Vite/esbuild
> strip types without checking, the extra/misspelled key is just ignored at runtime, and the
> editor loads with no palette and nothing says so.

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

**Applies to:** the same 12 `.editor/` directories. 58 + 176 lines → 17, and one file fewer.

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

> **⚠️ The diff is literal-exact for only 8 of PP's 18 `package.json` files. Apply by line
> content, not by copy-paste.** In the other **10** `zod` is not the last key in `dependencies`,
> so the real line reads `"zod": "^3.22.0",` **with a trailing comma** and the paste silently
> produces invalid JSON. The **8** where `zod` *is* the last key are: `templates/campaign-reels`,
> `templates/web-program-intro`, `projects/pp-namesti-republiky`, and
> `projects/pp-program-{bydleni,klima,mobilita,obvody,verejny-prostor}`.

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
      "@video-toolkit/lib/*": ["../../toolkit/lib/*"],
      "remotion": ["./node_modules/remotion"],
      "@remotion/transitions": ["./node_modules/@remotion/transitions"],
      "@remotion/transitions/*": ["./node_modules/@remotion/transitions/dist/presentations/*"],
      "react": ["./node_modules/@types/react"],
      "react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "out"]
}
```

No `@brand-lib` entry — but the five Remotion/React entries are **identical to PP's and equally
required**; see the boxed note in PP's item **C** for why (out-of-project files under
`../../toolkit/lib/**` cannot resolve bare specifiers, and `react` must point at `@types/react`).

> **`projects/roost-reel-01/tsconfig.json` has *no* `@video-toolkit/lib/*` entry today** — only
> `@/*` — even though its `src/` imports through that alias. Adding it as shown fixes
> type-checking and IntelliSense there for the first time. Expect `npx tsc --noEmit` in that
> project to surface previously-hidden errors; that is the entry doing its job, not a regression
> this migration introduced.

Measured: with the block above, all three roost directories type-check at **0 errors**,
`roost-reel-01` included.

---

### D. `src/LayeredRoostReel.tsx` — delete `roostReelDurationInFrames`, use core's *(tsc-caught)*

**Decided by the user: the duplicate goes, replaced by core's `layeredDurationInFrames`.
Bit-identity is explicitly NOT required.** This is a straight replacement, not a judgement
call — do not keep a local unfloored helper "just in case".

`layeredDurationInFrames(reel, fps)` in `lib/render/layered-composition-props.ts` is the ONE
definition of a reel's length. roost carries **three** copies of `roostReelDurationInFrames`,
in three files — not two, as an earlier pass here undercounted.

**Severity is *tsc-caught*, not silent.** Once the local `export const` is deleted, any call
site you miss is an unresolved identifier — `tsc` names the file and line. The old *silent*
grade described a world where both definitions coexisted and you had to notice the difference
by reading; deleting the export removes that world.

**This migration's premise is already partly false, and that is good news.** Every `Root.tsx`
that matters — `templates/roost-reels/src/Root.tsx:195`,
`projects/roost-reel-01/src/Root.tsx:201`, and `projects/roost-promo-01/src/Root.tsx:195` —
already inlines `Math.max(60, Math.round((props.reel.meta.totalDurationMs / 1000) * 30))`
directly in `calculateMetadata`, matching core's floor. None of them calls
`roostReelDurationInFrames` today. So the local helper is not a live single source of truth
being migrated away from — it is **already dead code** at every `Root.tsx` call site; the one
live call (`projects/roost-reel-01/src/LayeredRoostReel.tsx:141`, sizing the music fade-out) is
the only place item **D** below changes behaviour. Do not go hunting for `Root.tsx` consumers
of the helper — there are none left to find.

**1. `templates/roost-reels/src/LayeredRoostReel.tsx:15`** — the export has **no consumer**
anywhere in the template (re-verified: `roostReelDurationInFrames` appears in roost at
`templates/roost-reels/src/LayeredRoostReel.tsx:15`,
`projects/roost-reel-01/src/LayeredRoostReel.tsx:68` and `:141`, and
`projects/roost-promo-01/src/LayeredRoostReel.tsx:15` — re-verified against the real working
tree, not just tracked files; before relying on this list, re-run
`grep -rn roostReelDurationInFrames` in the roost repo yourself rather than trusting it
verbatim; it can go stale). Delete it and its two-line comment outright; nothing replaces it
here:

```ts
// DELETE — no import needed, nothing in the template calls it:
// Single source of truth for the reel length — Root.tsx's calculateMetadata
// MUST use this too so the composition duration and the render never drift.
export const roostReelDurationInFrames = (reel: LayeredReel, fps: number): number =>
  Math.round((reel.meta.totalDurationMs / 1000) * fps);
```

(The comment's own premise is already obsolete: after item **A**, `Root.tsx` no longer has a
hand-written `calculateMetadata` to keep in sync — it spreads `layeredCompositionProps`, whose
`calculateMetadata` calls `layeredDurationInFrames`. Deleting this export is what actually
makes the comment's claim true.)

**2. `projects/roost-reel-01/src/LayeredRoostReel.tsx:68`** — the same export, and here it
**is** used, once, at line 141, to size the music fade-out.

**Before:**

```ts
// :68
// Single source of truth for the reel length — Root.tsx's calculateMetadata
// MUST use this too so the composition duration and this component never drift.
export const roostReelDurationInFrames = (reel: LayeredReel, fps: number): number =>
  Math.round((reel.meta.totalDurationMs / 1000) * fps);

// … :141, inside the component:
  const totalFrames = roostReelDurationInFrames(reel, fps);
```

**After** — delete the definition and its comment, add the import beside the file's other
`@video-toolkit/lib` imports, and change the one call:

```ts
import { layeredDurationInFrames } from '@video-toolkit/lib/render/layered-composition-props';

// … :141 (now, with the definition gone, a few lines earlier):
  const totalFrames = layeredDurationInFrames(reel, fps);
```

`totalFrames` feeds `fadeStart = totalFrames - OUTRO_FADE_OUT_FRAMES` and the
`f >= totalFrames → 0` cutoff in `musicVolumeAt` — nothing else reads it.

**3. `projects/roost-promo-01/src/LayeredRoostReel.tsx:15`** — a third copy, byte-identical to
the template's item **1** (same export, same no-consumer status: `roost-promo-01`'s own
`Root.tsx:195` already inlines the floored `Math.max(60, Math.round(…))` form directly, exactly
like the template and `roost-reel-01`). Delete it and its two-line comment the same way as item
**1**; nothing replaces it here either.

> **Note for whoever applies this migration:** `projects/roost-promo-01/` is untracked
> (`git status` shows `?? projects/roost-promo-01/`) and is the user's own in-progress work, not
> a stray copy to clean up incidentally. Treat this item as a fact about what exists today, and
> apply it only when/if that project is itself part of the migration being carried out — do not
> reach into it opportunistically while doing something else in the roost repo.

> **The one real difference, and why it does not matter here.** roost's version is a bare
> `Math.round((totalDurationMs / 1000) * fps)`; core's is
> `Math.max(60, Math.round((totalDurationMs / 1000) * fps))` — a 60-frame (2 s at 30 fps)
> floor. The two therefore return **different values only for reels shorter than 2 seconds**,
> where core's floor would give the music a longer fade window. Neither roost reel is anywhere
> near that: `projects/roost-reel-01` is `totalDurationMs: 18000` (18 s = 540 frames) and the
> template's own literal is `17500` (17.5 s = 525 frames). Both are an order of magnitude above
> the floor, so this replacement moves nothing that renders today. Bit-identity is not required
> and no local helper should be kept to preserve it.

---

### E. `.editor/main.tsx` → `mountEditorHost`

**Applies to:** `templates/roost-reels/.editor/` and `projects/roost-reel-01/.editor/`.
504 lines → 13.

> **Never tsc-caught** — same caveat as PP's item E above: `.editor/` sits outside every
> `tsconfig.json`'s `"include": ["src/**/*"]`, so `npx tsc --noEmit` cannot see `main.tsx` at
> all. A bad module path is loud (Vite fails to resolve it); a mistyped `mountEditorHost` option
> key is silent (ignored at runtime, no palette, no error).

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

No `meta`, no CSS import, and — **for `templates/roost-reels` only** — no `accentSlots`. It loses
nothing in the move: its beats toggle becomes core's, shipped to every brand. It *gains*
`meta`-driven timeline and inspector wiring the moment the template declares an `EditorMeta`.

> **⚠️ `projects/roost-reel-01` DOES declare `accentSlots` — carry it through.** An earlier
> version of this document said roost declares none. True for `templates/roost-reels` and
> `projects/roost-promo-01`; **wrong for `projects/roost-reel-01`**, whose pre-migration
> `.editor/main.tsx` imported `brandTheme` and passed `accentSlots={brandTheme.accentSlots}` to
> `LayeredInspector` — roost's own palette. Dropping it would be a real regression. In that
> project's `.editor/main.tsx`, keep the `brandTheme` import and pass
> `accentSlots: brandTheme.accentSlots` as a `mountEditorHost` option.

Note that roost's editor was previously being shown **PP's** `lime`/`teal` accent buttons wherever
it had no palette of its own. Getting no palette instead is a fix, not a regression (this is
Phase 1 migration #4's roost half, also settled by adoption).

---

### F. `.editor/vite.config.mts` → `createEditorViteConfig`; `.editor/editor-plugin.mts` → **deleted**

62 + 176 lines → 16, and one file fewer. **Delete** `.editor/editor-plugin.mts`.

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

0. **Bump the `toolkit/` submodule pin first.** Every item below — item **C**'s
   `extends "../../toolkit/lib/project/tsconfig.base.json"` and every relative import in items
   **C** and **F** (`../../toolkit/lib/...`, `../../../toolkit/lib/...`) — resolves to nothing
   until the pin moves past Phase 2. `git submodule update --remote toolkit` (or pin to the
   Phase 2 merge commit), commit the pin bump, then proceed.
1. **G** (zod pin) — `npm install` once, before anything type-checks against it.
2. **C** (build config) — everything else runs through the alias these files create.
3. **B** (fonts), **A** (composition props), **D** (roost only).
4. **F** (`.editor/vite.config.mts`, delete `editor-plugin.mts`), then **E** (`.editor/main.tsx`).
5. Phase 1's **1**, **2**, **3**, **5** — all small, all independent.
6. Verify: `npm test`, `npx tsc --noEmit` (does **not** cover item **E** — `.editor/` sits
   outside `tsconfig.json`'s `"include": ["src/**/*"]`, so a mistyped `mountEditorHost` option
   key passes silently; only opening the editor catches it), `npm run studio` (the reel plays
   and the timeline loads), `npm run editor` (the editor loads, edits, and **saves** — Save
   exercises `readDefaultProps` against the new `Root.tsx` spread, which is the one thing that
   fails loudly if item **A** was spelled wrong), and one `npm run render:preview`.

   **Top thing to check here: item E, by opening the editor.** It is the only item on this
   list that **no** automated check on either side can reach. `.editor/` sits outside every
   `tsconfig.json`'s `"include": ["src/**/*"]`, so a mistyped `mountEditorHost` option key
   (`accentSlot:` for `accentSlots:`) is stripped by esbuild without complaint and the editor
   simply loads with no palette. Run `npm run editor`, confirm the reel loads, make one edit,
   and **Save** — Save is also what exercises `readDefaultProps` against item **A**'s new
   spread form, the one thing that fails loudly if **A** was spelled wrong. Everything else
   here has a compiler or a test behind it.

   **What this step actually caught, in practice.** Two of its checks earned their place and one
   gap remained:

   - **`/props` + an editor Save proved item A.** Hitting `/props` confirmed `readDefaultProps`
     resolves the composition id through the new spread, and a surgical Save landed
     `grade: { brightness: 1.15 }` in exactly the right segment. Do both — loading alone is not
     enough.
   - **Render a still before and after the pin bump and compare hashes.** This is the *only*
     thing that caught Part 1 item **3**'s PP endpoint regression (306 pixels of 2.07M). Make it
     part of the procedure, not an afterthought. Caveat: a single still render can flake on a
     video-heavy frame, so a hash mismatch must be **re-rendered and reproduced** before it counts
     as a finding.
   - **The gap that stayed open:** nothing here reached the editor's *mount*. The editor served
     `/` and `/props` correctly while never mounting at all (core `cb51d4d`, see the header). Only
     opening it in a browser and seeing the timeline shows that.

   > **No longer a concern: `layeredCompositionProps` loosening `defaultProps`.** An earlier
   > version of this document told you to treat the first brand-side `npx tsc --noEmit` as the
   > thing that settles whether the unconstrained `<C>` type parameter on
   > `LayeredCompositionOptions<C>['component']` defeats Remotion's own `Props` inference. It
   > does not — settled in core on `fix/core-has-remotion`. `examples/layered-minimal` is a
   > real Remotion project that spreads `layeredCompositionProps` onto a real `<Composition>`;
   > it type-checks at **0 errors**, and changing its `defaultProps`' `meta.totalDurationMs`
   > from `6000` to `'6000'` produces `error TS2322: Type 'string' is not assignable to type
   > 'number'`. Inference survives the spread; item **A**'s *tsc-caught* grade is accurate in
   > direction as well as severity. Run the brand-side `tsc` as ordinary verification, not as
   > risk closure.

## Not carried by `sync_template.py`

`video_toolkit/sync_template.py:136,141` mirrors only `templates/<t>/src → projects/<p>/src`. It
does **not** carry `.editor/`, `remotion.config.ts`, `vitest.config.ts`, `tsconfig.json` or
`package.json`. Items **C**, **E**, **F** and **G** are therefore per-directory manual edits —
14 `.editor/` directories, 20 project/template roots. Teaching `sync_template.py` to carry
`.editor/` is a Phase 3 task.
