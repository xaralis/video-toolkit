# Creating Templates

A template is a brand's reel: its look, its renderers, its copy discipline. It is
**not** a video assembly — core owns that. `LayeredReelComposition`
(`lib/render/layered-composition.tsx`) renders every track of a `LayeredReel` the
same way for every brand, so what a template adds is a `CompositionTheme` and
whatever custom renderers that theme registers.

Templates live in a **brand repo**, never in core (core ships no brand identity).
The reference implementation of the contract is `examples/layered-minimal` —
four small files that render end to end. Read it first; this document is the
narration around it.

## The contract in one picture

```
LayeredReel (data)        CompositionTheme (look)
  tracks.video    ─┐        accentSlots      ← the brand's palette keys
  tracks.audio     │        background
  tracks.music     ├──►  LayeredReelComposition  ──►  frames
  tracks.overlays  │        overlays / video    ← per-kind renderer registrations
  tracks.brand    ─┘        overlayItems        ← per-kind routing
                            brand               ← per-kind brand-layer renderers
                            prepareVideoTrack
                            renderBrandTrack    ← whole-track escape hatch
                            resolveAudioSource
```

The reel is DATA: one absolute-millisecond timeline, independent tracks, every
item carrying its own `[startMs, endMs)`. It is what `/toolkit:cut` writes, what
the editor edits, and what lives inline in a project's `Root.tsx` `defaultProps`.

The theme is CODE: React components and functions. That split is why a template
needs a thin wrapper component — `defaultProps` must stay JSON-serializable, so
the theme is bound in code and only the reel travels through props:

```tsx
export const MyBrandReel: React.FC<{ reel: LayeredReel }> = ({ reel }) => (
  <LayeredReelComposition reel={reel} theme={compositionTheme} />
);
```

## Template structure

```
templates/my-template/
├── package.json
├── tsconfig.json          # extends core's base; declares its own paths
├── remotion.config.ts     # applyToolkitWebpack(Config, {...})
├── vitest.config.ts       # createToolkitVitestConfig({...})
├── src/
│   ├── index.ts           # registerRoot
│   ├── Root.tsx           # layeredCompositionProps + the reel literal in defaultProps
│   ├── MyBrandReel.tsx    # the wrapper that binds the theme (and loads the fonts)
│   └── config/
│       ├── composition-theme.tsx   # the CompositionTheme
│       └── …                       # renderers, brand constants
├── .editor/               # the reel editor — three small files, see below
│   ├── index.html
│   ├── main.tsx           # mountEditorHost({...})
│   └── vite.config.mts    # createEditorViteConfig({...})
└── public/                # fonts/, brand/, recordings/, broll/
```

A template sits **two hops below the brand repo root**, alongside the `toolkit/`
submodule — `<repo>/templates/<name>/`, the same depth as `<repo>/projects/<name>/`.
Every path below assumes that layout, and core's helpers compute their own paths
from it.

## What a template owns, in full

Everything mechanical is core's. What follows is the complete build/editor surface
a template still writes — six short files. They match
[lib/project/README.md](../lib/project/README.md) and
[lib/editor/host/README.md](../lib/editor/host/README.md) verbatim; if any of the
three ever disagree, those two are the source of truth.

### Two rules that break a template if you get them wrong

**Config files import core by RELATIVE path, never through `@video-toolkit/lib`.**
Vite and esbuild load a config file by externalizing bare specifiers and resolving
them through plain Node resolution — *before* the alias the config is about to
return exists — and they do not read tsconfig `paths`. From
`templates/<name>/` that means `../../toolkit/lib/…`; from
`templates/<name>/.editor/` it is `../../../toolkit/lib/…`. Bare
`@video-toolkit/lib/…` stays correct inside `src/` and inside `.editor/main.tsx`,
which a configured bundler handles.

**A template's own `tsconfig.json` must still declare `@video-toolkit/lib/*`.**
TypeScript's `compilerOptions.paths` does not merge across `extends` — the
extending config's `paths` replaces the base's wholesale — which is why core's
`tsconfig.base.json` deliberately declares no `paths` at all.

### `remotion.config.ts`

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

`applyToolkitWebpack` carries the workaround that used to be copy-pasted into every
template and drift: `lib/render` does a **runtime** import of
`@remotion/transitions/*`, and `lib/` sits outside the project's own tree, so
webpack's default upward module walk never reaches the project's `node_modules`.
It sets `resolve.modules` for that, the `@video-toolkit/lib` (and optional
`@brand-lib`) alias, the `zod$` single-instance pin resolved **from the project
root**, and a `toolkit/lib not found at …` guard so a layout mistake fails
diagnosably instead of as a confusing "module not found".

### `vitest.config.ts`

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

`extraTestInclude` **appends** to the default `['src/**/*.test.ts',
'src/**/*.test.tsx']`, so a project with its own `tests/` dir can never silently
drop the `src/` globs.

### `tsconfig.json`

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

The base supplies `target`, `module`, `moduleResolution`, `jsx`, `strict`,
`esModuleInterop`, `skipLibCheck`, `forceConsistentCasingInFileNames` and
`resolveJsonModule`.

### `src/Root.tsx` — an id, a literal, nothing else

```tsx
import { Composition } from 'remotion';
import { layeredCompositionProps } from '@video-toolkit/lib/render/layered-composition-props';
import { MyBrandReel } from './MyBrandReel';
import { fps, width, height } from './config/reel-config';

export const RemotionRoot: React.FC = () => (
  <Composition
    {...layeredCompositionProps({
      id: 'MyBrandReel',
      component: MyBrandReel,
      fps,
      width,
      height,
    })}
    defaultProps={{ reel: { /* … the authored literal … */ } }}
  />
);
```

`layeredCompositionProps` owns the `calculateMetadata` that derives the duration
from `meta.totalDurationMs`, the 60-frame floor, and the placeholder
`durationInFrames` — one definition, so a composition and its render cannot drift.

**Spell the call literally, with an inline options object.** The editor's surgical
Save finds the composition id by matching the spread's callee *source text* against
an allowlist and reading a string-literal `id:` off the first argument. An import
alias (`as lcp`), a namespace call (`r.layeredCompositionProps`) and hoisted options
(`layeredCompositionProps(OPTS)`) all fail — loudly, with
`no <Composition> with id="…"`, but they fail. `examples/layered-minimal/src/Root.tsx`
is the reference, and a test runs the real reader against it.

### Fonts

Do not write a `src/lib/load-fonts.ts`. Call core's, once at module scope of the
reel component (`MyBrandReel.tsx`), so Studio, a headless render and the editor's
`<Player>` all reach the fonts by importing that one module:

```ts
import { loadBrandFonts } from '@video-toolkit/lib/render/load-fonts';

loadBrandFonts([
  { family: 'Geist', file: 'fonts/Geist-Bold.ttf', weight: '700' },
  { family: 'JetBrains Mono', file: 'fonts/JetBrainsMono-Regular.ttf', weight: '400' },
]);
```

`file` is a path inside `public/` (it goes through `staticFile`). `style: 'normal'`
and `display: 'block'` are the defaults. A bold face must be declared explicitly
rather than synthesized — synthesized bold reads fuzzy at caption sizes. The
generous `delayRender` timeout (120s) and 2 retries are the default because under
multi-tab render concurrency Remotion re-reads the TTFs per browser context and can
exceed the 28s default.

### `.editor/main.tsx`

```tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { editorMetaFromTheme } from '@video-toolkit/lib/editor/app/editor-meta';
import { MyBrandReel } from '../src/MyBrandReel';
import { brandTheme } from '../src/config/brand-theme';
import { fps, width, height } from '../src/config/reel-config';
import '../src/styles/global.css';

// The theme's registrations ARE the editor vocabulary: every kind you
// registered with `params` is editable, every effect type you registered is
// addable. Declare each kind once, in the theme. The optional second argument
// is an explicit EditorMeta that wins per field — for the things the theme has
// no place for (`laneColors`, `overlayLabels`) or a host-only override.
const editorMeta = editorMetaFromTheme(brandTheme);

mountEditorHost({
  component: MyBrandReel,
  projectName: 'my-template',
  fps,
  width,
  height,
  accentSlots: brandTheme.accentSlots,
  meta: editorMeta,
});
```

That is the whole file. Only `component`, `projectName`, `fps`, `width` and
`height` are required — a template with no palette, no editor vocabulary and no
stylesheet drops the last three lines and the CSS import.

**`meta` and `accentSlots` must be module-level constants, never inline literals.**
`editorMetaFromTheme` returns a fresh object per call, so call it once at module
scope (as above) — never inline in the `mountEditorHost` argument.
`LayeredTimeline` is memoized with a shallow compare and re-renders on every
playhead frame; a fresh object each render defeats the memo and stutters playback.
**`accentSlots` has no default** — omitting it means no palette in the accent
editor, never a colour core invented.

Core ships the rest with no configuration: beats snapping (the toggle disables
itself when a reel has no `meta.guidesMs`), undo/redo, Escape/Space/⌫, Save via
⌘S or the header button, the `beforeunload` guard, and Focus/Zoom crop gestures.

### `.editor/vite.config.mts`

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
    compositionId: 'MyBrandReel',
    plugins: [react(), tailwindcss()],
    brandLib: true,
  }),
);
```

A brand with no Tailwind and no `brand-lib/` drops `tailwindcss()` and `brandLib`;
one that needs extra Remotion render CLI flags (e.g. a software GL renderer) adds
`extraArgs: ['--gl=angle']`. The `.mts` suffix inside the specifier is required.

`createEditorViteConfig` returns a plain object rather than a `defineConfig` call —
core has no `vite` dependency to import that identity function from, so the brand's
own `defineConfig` wraps it. It appends `createEditorPlugin({ templateRoot,
compositionId, extraArgs })`, the dev-server plugin backing `/props`, `/save`,
`/render`, `/project-state` and `/sources`. Save's target file path is closed over
`templateRoot` at config time and is never read from the request.

**There is no `.editor/editor-plugin.mts`.** It lives in core.

### `.editor/index.html`

The one editor file that cannot move to core (Vite needs a real entry document).
It must keep `<div id="root">` — `mountEditorHost` throws otherwise.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>my-template — editor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

## Writing the theme

Only two fields are required — `accentSlots` and `background`. Everything else is
an opt-in override of a core default.

```tsx
export const compositionTheme: CompositionTheme = {
  // The brand owns the palette: the COUNT and the KEYS are yours. Accent markup
  // in overlay text (`{accent:…}`) and any transition that takes a colour name
  // one of these keys — never a hex.
  accentSlots: [
    { key: 'accent', label: 'Accent', color: '#f2b544' },
    { key: 'cool', label: 'Cool', color: '#5ec8d8' },
  ],
  background: '#07090f',

  // Per-kind overlay renderer. Omit it and core's GenericTextOverlay draws text.
  overlays: { text: { renderer: BrandText, config: { …brand knobs } } },

  // Per-kind video renderer. clip/broll/photo already fall back to core's
  // SegmentMedia (trim, crop, focal point, grade, Ken Burns); card/outro/
  // multi-clip render ONLY when you register them.
  // `params` declares a kind's editable fields ONCE, here. The editor derives
  // its vocabulary from these registrations (editorMetaFromTheme), so a kind
  // you register renders AND is editable — no second declaration to keep in
  // sync. Declare `type` for any field the item may not carry yet; without it
  // an absent field has nothing to be typed from and saves a string.
  video: {
    outro: { renderer: OutroSegment, params: [{ prop: 'style', options: ['organic', 'fade'] }] },
    card: { renderer: CardSegment },
  },

  // How a kind reaches the screen: 'track' (its own absolute Sequence, the
  // default) or 'anchored' (handed to the owning video renderer instead).
  overlayItems: {
    title: { routing: 'anchored' },
    'stat-callout': { render: (item) => <StatCallout item={item} /> },
  },

  // The brand layer needs NO code: core dispatches tracks.brand by kind
  // (watermark / disclaimer) through GenericWatermark / GenericDisclaimer,
  // Sequencing each item over its OWN [startMs, endMs). Recolour with
  // tokens.watermark / tokens.disclaimer; register a kind to replace one
  // renderer; reach for renderBrandTrack ONLY when the whole track has to be
  // one hand-written node (it wins outright and the default never runs).
  brand: { watermark: { renderer: BrandMark } },
};
```

### Effects, and the reserved types

An effect is a **wrapper**: it receives the media node and returns a decorated
one. Register a type and it both renders and becomes addable in the editor's
"+ Add effect":

```tsx
effects: { vintage: { renderer: VintageEffect, params: [{ prop: 'mode', options: ['film', 'vhs'] }] } },
```

Core already draws `grain`, `scanlines`, `vignette`, `grade` and `transform`
generically; a type neither you nor core has is **silently skipped**, never
thrown, so a typo'd effect leaves the reel rendering.

**`ken-burns` is RESERVED and cannot be overridden on this axis.** It is not a
wrapper — it composes into the media element's own transform inside
`SegmentMedia`, alongside the crop. `applyEffects` therefore skips it *before*
resolution, so writing `effects: { 'ken-burns': { renderer: MyKenBurns } }` does
nothing: your renderer never runs, and (because the editor derives its catalog
from the same reserved list) your `params` never appear in the inspector either.
The silence is deliberate and symmetric — the editor shows exactly what will
render — but it is silence, so it is worth knowing about before you spend an
afternoon on it.

**The escape is the video axis, not the effect axis.** A brand that wants its
own Ken Burns registers a video renderer for the footage kinds, because the
renderer that owns the media element is what owns its transform:

```tsx
video: { clip: { renderer: MyFootage }, broll: { renderer: MyFootage }, photo: { renderer: MyFootage } },
```

`RESERVED_EFFECT_TYPES` in `lib/theming/effects/index.ts` is the list, and it is
consulted at both ends — render and edit.

### What core already does for you

Do not re-implement these in a template:

| Concern | Where it lives |
|---|---|
| Video track assembly + at-the-cut handle borrowing | `lib/render/video-track.tsx` |
| Real transitions across a cut | `lib/render/at-cut-transitions.tsx` |
| The transition vocabulary | `lib/reel-config-base/transition-schema.ts` |
| Footage rendering (trim/crop/focal/grade/Ken Burns) | `lib/theming/segment/SegmentMedia.tsx` |
| Overlay appear/hold/disappear envelope | `lib/theming/envelope.ts` (`useOverlayEnvelope`) |
| Placement vocabulary | `lib/theming/placement.ts` (`PLACEMENTS`) |
| Accent markup parsing | `lib/transcripts/accent-parser.ts` (`parseAccents`) |
| Audio track, music envelope | `lib/render/audio-track.tsx`, `lib/reel-config-base/music-envelope.ts` |

A renderer receives a static prop bag (`OverlayRenderProps` / `VideoRenderProps`)
and reads frame-derived values from Remotion hooks inside itself. Keep it that
way — that is what lets the same renderer run under Studio, a render, and the
editor's `<Player>`.

### Transitions

A transition is declared **once**, by the item leaving the cut
(`transitionOut`), and the next item borrows handle frames automatically. Adding
a new kind means appending one catalog entry in
`lib/reel-config-base/transition-schema.ts` — the zod union, the editor dropdown,
its sub-option controls and its defaults all follow, and the compiler then
demands a mapping in `lib/render/at-cut-transitions.tsx`. See
[lib/transitions/README.md](../lib/transitions/README.md) for the per-transition
options.

### Frame-based animation

Always Remotion's `interpolate`/`spring` off `useCurrentFrame()`, never CSS
transitions — CSS animation does not exist at render time:

```tsx
const frame = useCurrentFrame();
const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
```

And always `<OffthreadVideo>`, never a raw `<video>` element.

## Starting a new template

1. In a brand repo, copy an existing template
   (`cp -r templates/campaign-reels templates/my-template`), or start from
   `examples/layered-minimal` when you want the smallest possible base.
2. Rename it in `package.json`. As long as the copy stays at `templates/<name>/` or
   `projects/<name>/`, the relative hops keep working: `applyToolkitWebpack`,
   `createToolkitVitestConfig` and `createEditorViteConfig` all compute
   `toolkit/lib` themselves from the project root, so there is no second copy of
   the path to keep in sync. Only the literal specifiers still have to match the
   depth — `../../toolkit/…` from the template root, `../../../toolkit/…` from
   `.editor/`, plus the `@video-toolkit/lib/*` entry in `tsconfig.json` `paths`.
   Move the copy to a different depth and all of those resolve to nothing.
3. Write `src/config/composition-theme.tsx`: accent slots, background, then only
   the renderers your brand genuinely needs.
4. Keep the reel literal inline in `Root.tsx` `defaultProps` — Studio and the
   toolkit editor read it out of the file and write edits back in place, which
   they can only do while it is literally there.
5. Verify by rendering, not by typechecking: `npx remotion still src/index.ts
   <Id> out/frame.png --frame=<n>` at a clip, a transition midpoint and an
   overlay window.
6. Record it in the brand repo's own registry/docs. Core's
   `_internal/toolkit-registry.json` tracks core's components and transitions;
   templates are brand-owned.

## Template ideas

- **Product demo**: problem → solution → demo → CTA
- **Tutorial**: chapter-based with a progress indicator
- **Changelog**: version header with a feature list
- **Comparison**: before/after, via a `multi-clip` item
