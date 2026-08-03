# Transition handle starvation — brand migration notes

This document is written for a **brand author** — someone maintaining a `brands/<brand>/`, a
template, or a project in a repo that vendors this toolkit as a `toolkit/` submodule — not for
this feature's own internal record. For the design rationale, read
`docs/superpowers/specs/2026-08-03-transition-handle-starvation-design.md`.

## The headline: one new dependency, render-side only

`Root.tsx`'s `<Composition>` — every layered reel's, via `layeredCompositionProps`
(`lib/render/layered-composition-props.ts`) — now measures each `clip`/`broll` source's real
duration during `calculateMetadata`, to detect a transition boundary that borrows more handle
frames than its neighbours actually have. This needs `@remotion/media-utils` at RENDER time
(Studio and `remotion render`), in your project's own `node_modules` — the toolkit submodule
cannot supply it for you, the same way it cannot supply `remotion` itself.

**Your project's editor (`npm run editor` / the Vite dev server) needs nothing added.** The
measuring code lives in `lib/render/measure-sources.ts` and is reached only through a dynamic
`import()` inside `calculateMetadata` — never a static import anywhere your editor's bundle
walks. If you find yourself adding `@remotion/media-utils` to a `.editor/vite.config.mts` alias
list or a `tsconfig.json` `paths` block, stop: that is solving a problem you do not have. See
"What breaks if you skip this" below for what a MISSING dependency looks like, so you can tell
it apart from a correctly-behaving editor.

## What to add *(tsc-caught for the render, but only if you go looking — see below)*

**Applies to:** every template/project `package.json` whose `Root.tsx` spreads
`layeredCompositionProps` — i.e. every layered-model template and every project vendored from
one. `web-program-intro`-shaped templates (non-layered, no `.editor/`, no
`layeredCompositionProps`) are **not** in scope.

```diff
   "dependencies": {
     "remotion": "4.0.x",
+    "@remotion/media-utils": "4.0.x",
```

**Pin it to YOUR project's own Remotion version, not a number copied from this document.**
`@remotion/media-utils` publishes an exact version per Remotion release
(`docs/zod-version.md`'s exact-pin discipline applies here too, for the same reason:
`@remotion/*` packages are checked against each other by exact version at Studio startup). Run:

```bash
npm ls remotion
```

and use that exact version string for `@remotion/media-utils`, then `npm install`.

## What breaks if you don't

**Loud, at render/Studio time — not silent, and not a hang.** `calculateMetadata`'s dynamic
`import('./measure-sources')` resolves inside your project's own webpack bundle
(`lib/project/remotion-config.ts`'s `resolve.modules` override, the same mechanism that already
lets out-of-tree `lib/**` files resolve `remotion`/`@remotion/transitions` from your project
root). Without the package installed, that import rejects with a module-not-found error the
first time any composition opens — in Studio, that composition fails to load; from `remotion
render`, the render fails at the composition-resolution step, before a single frame is drawn.
This is NOT the "renders wrong pictures silently" failure mode the feature itself exists to fix
— it is a normal, loud dependency error, and `npm install` is the entire fix.

**The editor is unaffected either way.** `lib/editor/host/host-duration.ts` imports only
`MIN_FRAMES` (a plain number) from `layered-composition-props.ts`, which itself has no static
import of `remotion` or `@remotion/media-utils` any more — see CRITICAL 2 of the 2026-08-03
whole-branch review that forced this split, and `lib/render/README.md`'s note on the same file.
If your editor fails to load after this pin bump, the cause is something else; do not spend time
looking for a missing `@remotion/media-utils` alias in `.editor/vite.config.mts` or
`tsconfig.json` — none is needed, and adding one is not a fix for anything real.

## What you get for it

A console warning — `[transition] handle starvation — <clip> → <clip>: Needs N frames …` — the
moment a project's render or Studio preview opens a boundary whose neighbours cannot actually
lend what an authored transition asks for. Nothing about your reel's rendered output changes:
this is validation only, and a starved boundary still renders exactly as it did before (wrong,
silently, at the frames the deficit falls on) until you shorten the transition, slip the clip, or
disable it — the render itself is not blocked and nothing throws.

**One residual limitation, worth knowing if your brand overrides `theme.resolveMediaSource`:**
the measuring code resolves each source through core's DEFAULT media-path rule
(`lib/theming/media-source.ts`), not your brand's override, because `calculateMetadata` has no
`CompositionTheme` to read one from. If your brand's renderer serves clips from somewhere the
default rule wouldn't guess, that clip's duration will not be measured — its boundary is treated
as unbounded (never a false starvation warning, just a missed real one). This is a known gap, not
a regression from anything that worked before this feature existed.

## Verifying the pin bump

Per changed directory: `npm install`, then `npm run studio` (a composition should open with no
new console error) and one `npm run render:preview`. If your project has any authored transition
whose neighbours are genuinely tight — trimmed close to a clip's actual start/end — you should
see the new console warning naming it; that is the feature working, not a regression to chase.
