# Phase 2 — Core Owns the Brand Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the brand repos' editor host, composition wiring, build config and font
loading into core, so a brand's `.editor/` shrinks from ~735 lines to ~35 and a brand
`Root.tsx` collapses to an id plus its `defaultProps` literal.

**Architecture:** Core already ships the editor's *parts* (`EditorShell`,
`LayeredTimeline`, `LayeredInspector`, `RenderButton`, the save/render/project-state
endpoints) as raw `.tsx`/`.ts` consumed through the `@video-toolkit/lib` alias and
bundled by the brand's own Vite. Phase 2 adds the *assembly*: `lib/editor/host/` (a
browser-side `EditorHost` component + `mountEditorHost`, and Node-side
`createEditorPlugin` / `createEditorViteConfig`), `lib/render/layered-composition-props.ts`,
`lib/project/` build-config presets, and `lib/render/load-fonts.ts`. Everything is
parameterized by configuration only — the two existing hosts differ by 63 lines out of
1489 and every one of those lines is a value, not a structure.

**Tech Stack:** TypeScript, React 19, Vite 5/6, Vitest 2 + jsdom + @testing-library/react,
`@remotion/player` (available in `lib/editor/node_modules`), zod 3.

---

## Global Constraints

Copied verbatim from the session brief. Every task's requirements implicitly include
this section.

- **Phase 2 is CORE-ONLY.** Never modify a brand repo
  (`~/Workspace/progpce/video-toolkit`, `~/Workspace/roost/video-toolkit`). Read them for
  reference only. Every forced brand change is written up as a paste-ready before/after
  in the task report; it is never applied.
- **The roost repo has uncommitted changes that are the user's own editor work.** Do not
  touch, revert, stash, or characterise them as damage.
- **Rendering an existing baked `LayeredReel` literal must not change.** Derivation output
  is free to change.
- **A project's cut is the `defaultProps` literal in `src/Root.tsx`.** `reel.config.json`
  is a one-way generator INPUT and is *expected* to diverge. Never validate against it,
  never sync it back over a tuned literal.
- **Test baseline:** `cd lib/editor && npx vitest run` = 47 files / **485 tests**. Never
  finish a task below that count; new tests only add.
- **`tsc --noEmit` baseline: 34 pre-existing errors** (4 real, the rest missing-React/JSX).
  Add none. Verify by diffing error *sets*, not counts.
- **Core has no `remotion` and no `vite` installed.** Any core module a brand's *Node-side*
  config imports (`.mts` host files, `lib/project/*`) must use **type-only** imports for
  `vite` / `@remotion/cli` / `@remotion/tailwind-v4` and take runtime plugin objects as
  parameters. Browser-side core modules may import `remotion` / `@remotion/player`
  normally — the brand's Vite resolves them, and `lib/editor/node_modules` has them for tests.
- **Brand-leak gate** must stay clean:
  `grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'`
- **Commits:** repo style, imperative subject, no `Co-Authored-By`. If signing fails on a
  1Password error, immediately re-commit with `--no-gpg-sign`. Signing is never a blocker.

### One deliberate, pre-approved exception to "no brand constants in core"

The extracted host uses `#b6ff5a` for its "toggle is on" pill. This is **not** a new brand
leak: `lib/editor/app/EditorShell.module.css:42` already ships that exact literal as core's
editor-chrome accent, and the host's toolbar must match the shell it sits in. Editor chrome
is core UI, distinct from a brand's *video* theming (which flows through `accentSlots`).
Task 4 centralises it as one exported constant so there is one place to change, and the
gate does not match it (it is a hex, and the word "lime" must not appear in the comment —
say "the editor accent").

---

## File Structure

**Created in core:**

| File | Responsibility |
|---|---|
| `lib/render/layered-composition-props.ts` | `layeredDurationInFrames()` + `layeredCompositionProps()` — the `<Composition>` prop bundle with `calculateMetadata` and the 60-frame floor. Pure; no `remotion` import. |
| `lib/render/fonts.ts` | `FontSpec`, `fontFaceDescriptors()` — pure normalisation of a font list into FontFace ctor args. Testable. |
| `lib/render/load-fonts.ts` | `loadBrandFonts(fonts, opts?)` — the `delayRender`/`FontFace`/`continueRender` shell. Imports `remotion`; not unit-tested here. |
| `lib/project/remotion-config.ts` | `applyToolkitWebpack(Config, opts)` — zod$ alias, `resolve.modules` fix, `existsSync` guard, alias map, optional Tailwind. |
| `lib/project/vitest-config.ts` | `createToolkitVitestConfig(opts)` — plain object, zod dedupe/inline, alias map. |
| `lib/project/tsconfig.base.json` | Shared compiler options + the `@video-toolkit/lib/*` path. |
| `lib/project/paths.ts` | `resolveToolkitPaths(projectRoot)` — the single place that knows a template sits at `<repo>/templates/<t>/` or `<repo>/projects/<p>/`. Used by both configs above. |
| `lib/editor/host/ui.ts` | `EDITOR_ACCENT`, `BTN_H`, `BTN_FONT`, `zoomBtn`, `toggleBtn` — shared inline-style tokens. |
| `lib/editor/host/toolbar.tsx` | `MagnifierIcon`, `Timecode` — presentational toolbar pieces. |
| `lib/editor/host/host-duration.ts` | `framesForReel(reel, fps)` — the editor's own "spans to the last item end" duration. Pure. |
| `lib/editor/host/crop-gestures.ts` | `attachCropGestures(el, read)` — pinch/scroll/drag focal+zoom control, returns a cleanup fn. Pure DOM, testable in jsdom. |
| `lib/editor/host/EditorHost.tsx` | The whole editor app, parameterized by `EditorHostOptions`. |
| `lib/editor/host/mount.tsx` | `mountEditorHost(options, container?)`. |
| `lib/editor/host/prettier-format.ts` | `formatWithProjectPrettier()` — Save's project-Prettier pass. |
| `lib/editor/host/editor-plugin.mts` | `createEditorPlugin(options)` — the Vite dev-server plugin (`/sources`, `/props`, `/save`, `/render`, `/project-state`). |
| `lib/editor/host/vite-config.mts` | `createEditorViteConfig(options)` — returns a plain Vite `UserConfig` object. |
| `lib/editor/host/README.md` | How a brand `.editor/` consumes the host; the two files that must stay brand-side. |

**Modified in core:**

- `examples/layered-minimal/src/Root.tsx` — adopt `layeredCompositionProps` (proves the API on a real, rendering example).
- `lib/render/README.md` — record the new pure/JSX split members.
- `docs/creating-templates.md` — the new brand-side shell (what a template still owns).
- `docs/superpowers/HANDOFF.md` — Phase 2 outcome + the migration list.
- `package.json` — zod pin (Task 7).

**Deliberately NOT moved** (must stay in each brand repo):
`.editor/vite.config.mts` (it *creates* the `@video-toolkit/lib` alias, so it cannot be
imported through it — shrinks to ~10 lines) and `.editor/index.html` (Vite's entry).

---

## Task 1: `layeredCompositionProps`

**Files:**
- Create: `lib/render/layered-composition-props.ts`
- Test: `lib/editor/src/layered-composition-props.test.ts`
- Modify: `examples/layered-minimal/src/Root.tsx`
- Modify: `lib/render/README.md`

**Interfaces:**
- Consumes: `LayeredReel` from `lib/reel-config-base/layered-schema`.
- Produces:
  - `layeredDurationInFrames(reel: LayeredReel, fps: number): number`
  - `layeredCompositionProps<C>({ id, component, fps, width, height }: LayeredCompositionOptions<C>): LayeredCompositionProps<C>`

**Why it matters:** all three brand `Root.tsx` files repeat the same `calculateMetadata` +
`Math.max(60, …)` floor, and roost declares that floor a second time as an exported
`roostReelDurationInFrames`. One definition removes the drift channel *and* the class of
bug where the composition duration and the render disagree.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/src/layered-composition-props.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  layeredCompositionProps,
  layeredDurationInFrames,
} from '@video-toolkit/lib/render/layered-composition-props';
import type { LayeredReel } from '@video-toolkit/lib/reel-config-base/layered-schema';

const reel = (totalDurationMs: number): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs },
    tracks: { video: [], audio: [], music: { baseVolumeDb: 0 }, overlays: [], brand: [] },
  }) as unknown as LayeredReel;

const Stub = () => null;

describe('layeredDurationInFrames', () => {
  it('converts ms to frames at the given fps', () => {
    expect(layeredDurationInFrames(reel(12_000), 30)).toBe(360);
  });

  it('rounds to the nearest frame rather than truncating', () => {
    // 1234ms @30fps = 37.02 frames
    expect(layeredDurationInFrames(reel(1234 + 10_000), 30)).toBe(337);
  });

  it('never returns fewer than 60 frames', () => {
    // Remotion refuses a composition shorter than a frame; the floor is what
    // keeps a half-authored reel openable in Studio instead of crashing it.
    expect(layeredDurationInFrames(reel(0), 30)).toBe(60);
    expect(layeredDurationInFrames(reel(500), 30)).toBe(60);
  });
});

describe('layeredCompositionProps', () => {
  it('passes id, component and the frame geometry straight through', () => {
    const props = layeredCompositionProps({
      id: 'MyReel',
      component: Stub,
      fps: 30,
      width: 1080,
      height: 1920,
    });
    expect(props.id).toBe('MyReel');
    expect(props.component).toBe(Stub);
    expect(props.fps).toBe(30);
    expect(props.width).toBe(1080);
    expect(props.height).toBe(1920);
  });

  it('supplies a placeholder durationInFrames so <Composition> type-checks', () => {
    // Remotion requires durationInFrames even when calculateMetadata overrides it.
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 30, width: 2, height: 3 });
    expect(props.durationInFrames).toBeGreaterThan(0);
  });

  it('derives the real duration through calculateMetadata at the composition fps', () => {
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 25, width: 2, height: 3 });
    expect(props.calculateMetadata({ props: { reel: reel(8_000) } })).toEqual({
      durationInFrames: 200,
    });
  });

  it('applies the floor through calculateMetadata too', () => {
    const props = layeredCompositionProps({ id: 'X', component: Stub, fps: 30, width: 2, height: 3 });
    expect(props.calculateMetadata({ props: { reel: reel(100) } })).toEqual({ durationInFrames: 60 });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run src/layered-composition-props.test.ts
```

Expected: FAIL — `Failed to resolve import "@video-toolkit/lib/render/layered-composition-props"`.

- [ ] **Step 3: Implement**

Create `lib/render/layered-composition-props.ts`:

```ts
// The <Composition> prop bundle every layered reel needs, in one place.
//
// Each brand Root.tsx used to repeat the same three things: a calculateMetadata
// deriving the duration from meta.totalDurationMs, the 60-frame floor, and a
// throwaway durationInFrames to satisfy the prop type. Two copies of a floor is
// how a composition and its render drift apart, so core owns it.
//
// NOT a component and it must not import `remotion`: core has no remotion
// installed. It returns a plain object the brand spreads onto <Composition>.
import type { LayeredReel } from '../reel-config-base/layered-schema';

/** Remotion cannot mount a composition of zero frames, and a reel is routinely
 *  opened in Studio before its timing is authored. Two seconds is enough to be
 *  scrubbable without ever being mistaken for real content. */
const MIN_FRAMES = 60;

/** The authored length of a reel in frames — the ONE definition. */
export function layeredDurationInFrames(reel: LayeredReel, fps: number): number {
  return Math.max(MIN_FRAMES, Math.round((reel.meta.totalDurationMs / 1000) * fps));
}

/** The props a layered reel's <Composition> takes, minus `defaultProps` (the
 *  brand's own authored literal, which stays in Root.tsx as the source of truth). */
export interface LayeredCompositionOptions<C> {
  id: string;
  component: C;
  fps: number;
  width: number;
  height: number;
}

export interface LayeredCompositionProps<C> extends LayeredCompositionOptions<C> {
  durationInFrames: number;
  calculateMetadata: (arg: { props: { reel: LayeredReel } }) => { durationInFrames: number };
}

export function layeredCompositionProps<C>({
  id,
  component,
  fps,
  width,
  height,
}: LayeredCompositionOptions<C>): LayeredCompositionProps<C> {
  return {
    id,
    component,
    fps,
    width,
    height,
    // Placeholder: calculateMetadata replaces it on every mount. Required by
    // the <Composition> prop type all the same.
    durationInFrames: MIN_FRAMES,
    calculateMetadata: ({ props }) => ({
      durationInFrames: layeredDurationInFrames(props.reel, fps),
    }),
  };
}
```

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd lib/editor && npx vitest run src/layered-composition-props.test.ts
```

- [ ] **Step 5: Adopt it in the example**

`examples/layered-minimal/src/Root.tsx` — replace the hand-written
`calculateMetadata` / `durationInFrames` / `fps` / `width` / `height` / `id` / `component`
attributes with a spread, keeping `defaultProps` exactly as authored. Read the file
first; the result must look like:

```tsx
import { Composition } from 'remotion';
import { layeredCompositionProps } from '@video-toolkit/lib/render/layered-composition-props';
import { LayeredMinimalReel } from './LayeredMinimalReel';

export const RemotionRoot: React.FC = () => (
  <Composition
    {...layeredCompositionProps({
      id: 'LayeredMinimalReel',
      component: LayeredMinimalReel,
      fps: 30,
      width: 1080,
      height: 1920,
    })}
    defaultProps={{ /* …the existing literal, byte-for-byte unchanged… */ }}
  />
);
```

**Do not alter a single character inside `defaultProps`.** `example-default-props.test.ts`
runs the real `readDefaultProps` against this file and is the guard that the surgical
reader still finds the literal after the refactor — if the id or the literal moves in a
way the reader cannot follow, that test fails and tells you.

- [ ] **Step 6: Full suite + docs**

```bash
cd lib/editor && npx vitest run
```

Expected: 48 files / 490 tests, all passing (485 baseline + 5 new).

Then add `layered-composition-props.ts` to the pure-side list in `lib/render/README.md`
with a one-line note that it deliberately has no `remotion` import.

- [ ] **Step 7: Commit**

```bash
git add lib/render/layered-composition-props.ts lib/editor/src/layered-composition-props.test.ts examples/layered-minimal/src/Root.tsx lib/render/README.md && git commit -m "feat(render): core owns the layered <Composition> prop bundle"
```

---

## Task 2: `loadBrandFonts`

**Files:**
- Create: `lib/render/fonts.ts`
- Create: `lib/render/load-fonts.ts`
- Test: `lib/editor/src/fonts.test.ts`
- Modify: `lib/render/README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface FontSpec { family: string; file: string; weight?: string; style?: string; display?: FontDisplay }`
  - `fontFaceDescriptors(fonts: readonly FontSpec[]): Array<{ family: string; file: string; descriptors: FontFaceDescriptors }>`
  - `loadBrandFonts(fonts: readonly FontSpec[], opts?: { label?: string; timeoutInMilliseconds?: number; retries?: number }): void`

**Why it matters:** three copies exist and only campaign's carries the
`{ timeoutInMilliseconds: 120_000, retries: 2 }` hardening — which was added to fix a real
render flake ("delayRender was called but not cleared" under multi-tab concurrency, which
forced `--concurrency=1`). The fix never propagated to the other two. That hardening is the
baseline here.

The split follows `lib/render/README.md`'s existing convention: the pure normalisation is
testable in core, the `remotion`-importing shell is not.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/src/fonts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fontFaceDescriptors, type FontSpec } from '@video-toolkit/lib/render/fonts';

describe('fontFaceDescriptors', () => {
  it('keeps family and file, and passes an explicit weight through', () => {
    const fonts: FontSpec[] = [{ family: 'Geist', file: 'fonts/Geist-Bold.ttf', weight: '700' }];
    expect(fontFaceDescriptors(fonts)).toEqual([
      {
        family: 'Geist',
        file: 'fonts/Geist-Bold.ttf',
        descriptors: { weight: '700', style: 'normal', display: 'block' },
      },
    ]);
  });

  it('defaults weight to 400 and style to normal', () => {
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf' }])[0].descriptors).toEqual({
      weight: '400',
      style: 'normal',
      display: 'block',
    });
  });

  it('supports a variable-font weight range verbatim', () => {
    // Roost ships FamiljenGrotesk-Variable at "400 600"; a range must survive
    // untouched or the variable axis collapses to a single instance.
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf', weight: '400 600' }])[0].descriptors.weight)
      .toBe('400 600');
  });

  it('forces display:block unless overridden', () => {
    // `block` is what makes text render in the FINAL font in frame 1 instead of
    // flashing a fallback — invisible in Studio, baked into an MP4 forever.
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf' }])[0].descriptors.display).toBe('block');
    expect(fontFaceDescriptors([{ family: 'F', file: 'f.ttf', display: 'swap' }])[0].descriptors.display)
      .toBe('swap');
  });

  it('preserves declaration order', () => {
    const out = fontFaceDescriptors([
      { family: 'A', file: 'a.ttf' },
      { family: 'B', file: 'b.ttf' },
    ]);
    expect(out.map((f) => f.family)).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run src/fonts.test.ts
```

Expected: FAIL — cannot resolve `@video-toolkit/lib/render/fonts`.

- [ ] **Step 3: Implement the pure half**

Create `lib/render/fonts.ts`:

```ts
// Pure font-spec normalisation. No `remotion` import — see load-fonts.ts for
// the loading shell and lib/render/README.md for why the split exists.

/** One font file a brand wants available to its compositions. `file` is a path
 *  inside the project's `public/` (it goes through Remotion's staticFile). */
export interface FontSpec {
  family: string;
  file: string;
  /** CSS weight or a variable-font range, e.g. '700' or '400 600'. Default '400'. */
  weight?: string;
  /** Default 'normal'. */
  style?: string;
  /** Default 'block' — the render must never bake a fallback-font frame. */
  display?: FontDisplay;
}

export interface FontFaceDescriptorSet {
  family: string;
  file: string;
  descriptors: FontFaceDescriptors;
}

/** Fills in the defaults every reel wants, without reordering. A bold face must
 *  be declared explicitly rather than synthesized: synthesized bold reads fuzzy
 *  at caption sizes. */
export function fontFaceDescriptors(fonts: readonly FontSpec[]): FontFaceDescriptorSet[] {
  return fonts.map(({ family, file, weight, style, display }) => ({
    family,
    file,
    descriptors: {
      weight: weight ?? '400',
      style: style ?? 'normal',
      display: display ?? 'block',
    },
  }));
}
```

If `FontDisplay` / `FontFaceDescriptors` are not in scope, add `"DOM"` to the `lib` of the
relevant tsconfig — `lib/editor/tsconfig.json` already has it; check before adding anything.

- [ ] **Step 4: Run the test — expect PASS**

```bash
cd lib/editor && npx vitest run src/fonts.test.ts
```

- [ ] **Step 5: Implement the remotion-side shell**

Create `lib/render/load-fonts.ts`:

```ts
// Brand font loading. Imports `remotion`, so it is NOT unit-tested in core (no
// remotion installed here) — everything decidable lives in ./fonts.ts, which is.
import { continueRender, delayRender, staticFile } from 'remotion';
import { fontFaceDescriptors, type FontSpec } from './fonts';

let handle: number | null = null;

export interface LoadBrandFontsOptions {
  /** Shown in Remotion's "delayRender was called but not cleared" diagnostics. */
  label?: string;
  timeoutInMilliseconds?: number;
  retries?: number;
}

/**
 * Registers a brand's fonts and blocks rendering until they are ready. Call once
 * at module scope of the brand's reel component — Studio, the editor Player and
 * a headless render all reach the fonts only by importing that module.
 *
 * The generous timeout and the retries are not padding. Under multi-tab render
 * concurrency Remotion spawns fresh browser contexts that each re-read the TTFs
 * from disk, and one can exceed the 28s default under I/O contention — the flake
 * that used to force `--concurrency=1`. 120s + 2 retries makes a full-concurrency
 * render reliable, and this default is the whole reason core owns this function:
 * the fix existed in exactly one of the three brand copies.
 */
export function loadBrandFonts(fonts: readonly FontSpec[], opts: LoadBrandFontsOptions = {}): void {
  if (typeof document === 'undefined') return; // SSR safety
  if (handle !== null) return; // already loading or loaded
  if (fonts.length === 0) return;

  handle = delayRender(opts.label ?? 'Loading brand fonts', {
    timeoutInMilliseconds: opts.timeoutInMilliseconds ?? 120_000,
    retries: opts.retries ?? 2,
  });

  const faces = fontFaceDescriptors(fonts).map(
    ({ family, file, descriptors }) => new FontFace(family, `url(${staticFile(file)})`, descriptors),
  );

  Promise.all(faces.map((f) => f.load()))
    .then((loaded) => {
      loaded.forEach((f) => document.fonts.add(f));
      if (handle !== null) continueRender(handle);
    })
    .catch((err) => {
      // Never leave the handle open: an unresolved delayRender hangs the whole
      // render. Losing a font is a cosmetic failure; hanging is a total one.
      console.error('Brand font load failed:', err);
      if (handle !== null) continueRender(handle);
    });
}
```

- [ ] **Step 6: Full suite + docs**

```bash
cd lib/editor && npx vitest run
```

Expected: previous count + 5 new tests, all green.

Add both files to `lib/render/README.md`'s pure/JSX split table.

- [ ] **Step 7: Commit**

```bash
git add lib/render/fonts.ts lib/render/load-fonts.ts lib/editor/src/fonts.test.ts lib/render/README.md && git commit -m "feat(render): core owns brand font loading, with the render-concurrency hardening as the default"
```

---

## Task 3: Build-config presets

**Files:**
- Create: `lib/project/paths.ts`
- Create: `lib/project/remotion-config.ts`
- Create: `lib/project/vitest-config.ts`
- Create: `lib/project/tsconfig.base.json`
- Test: `lib/editor/src/project-config.test.ts`
- Modify: `lib/project/README.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `resolveToolkitPaths(projectRoot: string): { toolkitLib: string; brandLib: string; projectNodeModules: string }`
  - `toolkitAliases(projectRoot: string, opts?: { brandLib?: boolean }): Record<string, string>`
  - `applyToolkitWebpack(config: ToolkitConfigApi, opts?: ApplyToolkitWebpackOptions): void`
  - `createToolkitVitestConfig(opts: { projectRoot: string; brandLib?: boolean }): Record<string, unknown>`

**Why it matters:** four places per template re-declare the same alias, and all three
`remotion.config.ts` carry the same three verbatim workarounds (the `zod$` single-instance
alias, the `resolve.modules` fix, the `existsSync` guard). Each of those workarounds exists
because of a specific failure that took real debugging; copies rot separately.

**Critical resolution rule:** `require.resolve('zod')` must resolve **from the project
root**, not from core. The whole point is a single zod instance shared with the project's
`src/`; resolving from core's own location would produce a second one and reintroduce the
`z.discriminatedUnion` crash the alias exists to prevent. Use
`createRequire(path.join(projectRoot, 'index.js')).resolve('zod')`.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/src/project-config.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyToolkitWebpack,
  toolkitAliases,
  resolveToolkitPaths,
} from '@video-toolkit/lib/project/remotion-config';
import { createToolkitVitestConfig } from '@video-toolkit/lib/project/vitest-config';

// A template lives at <repo>/templates/<name>/ or <repo>/projects/<name>/, with
// the toolkit vendored at <repo>/toolkit/ — two hops up in both layouts.
const PROJECT = '/repo/templates/campaign-reels';

describe('resolveToolkitPaths', () => {
  it('finds toolkit/lib and brand-lib two hops above the project', () => {
    expect(resolveToolkitPaths(PROJECT)).toEqual({
      toolkitLib: path.resolve('/repo/toolkit/lib'),
      brandLib: path.resolve('/repo/brand-lib'),
      projectNodeModules: path.resolve(PROJECT, 'node_modules'),
    });
  });
});

describe('toolkitAliases', () => {
  it('maps the core lib alias', () => {
    expect(toolkitAliases(PROJECT)['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
  });

  it('omits @brand-lib unless the brand asks for it', () => {
    // Roost has no brand-lib tier; a dangling alias to a nonexistent directory
    // is a resolution failure waiting for the first import that touches it.
    expect(toolkitAliases(PROJECT)).not.toHaveProperty('@brand-lib');
    expect(toolkitAliases(PROJECT, { brandLib: true })['@brand-lib']).toBe(path.resolve('/repo/brand-lib'));
  });
});

describe('applyToolkitWebpack', () => {
  const fakeConfig = () => {
    const calls: Array<(c: Record<string, any>) => Record<string, any>> = [];
    return {
      calls,
      api: { overrideWebpackConfig: (fn: (c: Record<string, any>) => Record<string, any>) => calls.push(fn) },
    };
  };

  it('registers exactly one webpack override', () => {
    const { calls, api } = fakeConfig();
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod: () => '/z/zod.js' });
    expect(calls).toHaveLength(1);
  });

  it('adds the project node_modules first in resolve.modules', () => {
    // toolkit/lib lives OUTSIDE the project tree, so node resolution walking up
    // from a toolkit file never reaches the project's node_modules — it stops at
    // the filesystem root. This is what makes @remotion/transitions resolvable.
    const { calls, api } = fakeConfig();
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod: () => '/z/zod.js' });
    const out = calls[0]({ resolve: { alias: { existing: '/keep' } } });
    expect(out.resolve.modules[0]).toBe(path.resolve(PROJECT, 'node_modules'));
    expect(out.resolve.modules).toContain('node_modules');
  });

  it('keeps aliases already on the incoming config', () => {
    const { calls, api } = fakeConfig();
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod: () => '/z/zod.js' });
    const out = calls[0]({ resolve: { alias: { existing: '/keep' } } });
    expect(out.resolve.alias.existing).toBe('/keep');
    expect(out.resolve.alias['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
  });

  it('pins zod to one instance, resolved from the PROJECT', () => {
    const { calls, api } = fakeConfig();
    const resolveZod = vi.fn(() => '/repo/templates/campaign-reels/node_modules/zod/index.js');
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod });
    const out = calls[0]({ resolve: {} });
    expect(resolveZod).toHaveBeenCalledWith(PROJECT);
    expect(out.resolve.alias['zod$']).toBe('/repo/templates/campaign-reels/node_modules/zod/index.js');
  });

  it('throws a diagnosable error when toolkit/lib is not where it should be', () => {
    const { api } = fakeConfig();
    expect(() =>
      applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => false, resolveZod: () => '/z' }),
    ).toThrow(/toolkit\/lib not found/);
  });

  it('runs the caller-supplied tailwind wrapper before the alias merge', () => {
    // enableTailwind is @remotion/tailwind-v4's, a BRAND dependency — core takes
    // it as a parameter rather than importing it (core has no remotion deps).
    const { calls, api } = fakeConfig();
    const tailwind = vi.fn((c: Record<string, any>) => ({ ...c, tailwindApplied: true }));
    applyToolkitWebpack(api, {
      projectRoot: PROJECT,
      existsSync: () => true,
      resolveZod: () => '/z',
      tailwind,
    });
    const out = calls[0]({ resolve: {} });
    expect(tailwind).toHaveBeenCalled();
    expect(out.tailwindApplied).toBe(true);
    expect(out.resolve.alias['@video-toolkit/lib']).toBeDefined();
  });
});

describe('createToolkitVitestConfig', () => {
  it('inlines and dedupes zod so lib and src schemas share one module instance', () => {
    // Without this, z.discriminatedUnion cannot recognise literals defined in the
    // lib half: instanceof ZodLiteral fails across duplicate module instances.
    const cfg = createToolkitVitestConfig({ projectRoot: PROJECT }) as any;
    expect(cfg.test.server.deps.inline).toContain('zod');
    expect(cfg.resolve.dedupe).toContain('zod');
  });

  it('aliases the core lib and includes only src tests', () => {
    const cfg = createToolkitVitestConfig({ projectRoot: PROJECT }) as any;
    expect(cfg.resolve.alias['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
    expect(cfg.test.include).toEqual(['src/**/*.test.ts', 'src/**/*.test.tsx']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run src/project-config.test.ts
```

Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `lib/project/paths.ts`**

```ts
// The ONE place that knows a brand repo's layout.
//
//   <repo>/toolkit/            ← this repo, vendored as a submodule
//   <repo>/brand-lib/          ← optional shared brand components
//   <repo>/templates/<name>/   ← a template     (projectRoot)
//   <repo>/projects/<name>/    ← a video project (projectRoot)
//
// Both project locations are two hops below the repo root, which is why one
// resolver serves templates and projects alike.
import path from 'node:path';

export interface ToolkitPaths {
  toolkitLib: string;
  brandLib: string;
  projectNodeModules: string;
}

export function resolveToolkitPaths(projectRoot: string): ToolkitPaths {
  const repoRoot = path.resolve(projectRoot, '../..');
  return {
    toolkitLib: path.resolve(repoRoot, 'toolkit/lib'),
    brandLib: path.resolve(repoRoot, 'brand-lib'),
    projectNodeModules: path.resolve(projectRoot, 'node_modules'),
  };
}

/** The module aliases every toolkit build surface needs. `@brand-lib` is opt-in:
 *  not every brand has that tier, and an alias pointing at a directory that does
 *  not exist fails only later, at the first import that touches it. */
export function toolkitAliases(
  projectRoot: string,
  opts: { brandLib?: boolean } = {},
): Record<string, string> {
  const { toolkitLib, brandLib } = resolveToolkitPaths(projectRoot);
  return {
    '@video-toolkit/lib': toolkitLib,
    ...(opts.brandLib ? { '@brand-lib': brandLib } : {}),
  };
}
```

- [ ] **Step 4: Implement `lib/project/remotion-config.ts`**

Re-export `resolveToolkitPaths` and `toolkitAliases` from `./paths` so a brand has one
import site. Then:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveToolkitPaths, toolkitAliases } from './paths';

export { resolveToolkitPaths, toolkitAliases };

/** Just the slice of @remotion/cli/config this uses — typed structurally so core
 *  needs no @remotion/cli dependency of its own. */
export interface ToolkitConfigApi {
  overrideWebpackConfig: (fn: (current: Record<string, any>) => Record<string, any>) => void;
}

export interface ApplyToolkitWebpackOptions {
  /** The project root. In a remotion.config.ts this is `process.cwd()` — NOT
   *  __dirname, which inside a Remotion config resolves to
   *  node_modules/@remotion/cli/dist. */
  projectRoot?: string;
  brandLib?: boolean;
  /** `enableTailwind` from @remotion/tailwind-v4, when the brand uses Tailwind.
   *  Passed in rather than imported: it is a brand dependency. */
  tailwind?: (config: Record<string, any>) => Record<string, any>;
  /** Seams for testing. */
  existsSync?: (p: string) => boolean;
  resolveZod?: (projectRoot: string) => string;
}

const defaultResolveZod = (projectRoot: string): string =>
  // Resolve FROM THE PROJECT: the alias exists to pin one zod instance shared
  // with the project's own src/. Resolving from core would create a second one
  // and bring back the "discriminator value for key `type` could not be
  // extracted" crash it prevents.
  createRequire(path.join(projectRoot, 'index.js')).resolve('zod');

export function applyToolkitWebpack(
  config: ToolkitConfigApi,
  opts: ApplyToolkitWebpackOptions = {},
): void {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const exists = opts.existsSync ?? fs.existsSync;
  const { toolkitLib, projectNodeModules } = resolveToolkitPaths(projectRoot);

  if (!exists(toolkitLib)) {
    throw new Error(
      `toolkit/lib not found at ${toolkitLib} (projectRoot=${projectRoot}). ` +
        `The alias resolves relative to the working directory, which must be the project root.`,
    );
  }

  const zodMain = (opts.resolveZod ?? defaultResolveZod)(projectRoot);
  const aliases = toolkitAliases(projectRoot, { brandLib: opts.brandLib });

  config.overrideWebpackConfig((current) => {
    const c = opts.tailwind ? opts.tailwind(current) : current;
    return {
      ...c,
      resolve: {
        ...c.resolve,
        // toolkit/lib is addressed by absolute-path alias and lives outside the
        // project tree, so resolution walking up from a toolkit/lib/** file never
        // reaches the project's node_modules — it stops at the filesystem root.
        // Needed since lib/render/at-cut-transitions.tsx runtime-imports
        // '@remotion/transitions/*', which is installed in the project.
        modules: [projectNodeModules, 'node_modules'],
        alias: { ...aliases, ...(c.resolve?.alias ?? {}), zod$: zodMain },
      },
    };
  });
}
```

Note the alias merge order — core aliases first, the incoming config's next (so anything
Remotion or Tailwind already set wins), `zod$` last (it must never be overridden).

- [ ] **Step 5: Implement `lib/project/vitest-config.ts`**

```ts
// Returns a PLAIN OBJECT, not defineConfig(...): core has no `vite` installed,
// so it cannot import defineConfig — which is an identity function anyway. The
// brand wraps it: `export default defineConfig(createToolkitVitestConfig({...}))`.
import { toolkitAliases } from './paths';

export interface ToolkitVitestOptions {
  /** The project root — in a vitest.config.ts, `path.dirname(fileURLToPath(import.meta.url))`. */
  projectRoot: string;
  brandLib?: boolean;
}

export function createToolkitVitestConfig(opts: ToolkitVitestOptions): Record<string, unknown> {
  return {
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      environment: 'node',
      // Dedupe zod so schemas from @video-toolkit/lib/reel-config-base share the
      // module instance used by src/config — otherwise z.discriminatedUnion can't
      // recognise the lib half's literals (instanceof ZodLiteral fails across
      // duplicate module instances).
      server: { deps: { inline: ['zod'] } },
    },
    resolve: {
      alias: toolkitAliases(opts.projectRoot, { brandLib: opts.brandLib }),
      dedupe: ['zod'],
    },
  };
}
```

- [ ] **Step 6: Create `lib/project/tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@video-toolkit/lib/*": ["../*"]
    }
  }
}
```

`paths` in an extended config resolve relative to **the file that declares them**, i.e.
this file — so `../*` is `lib/*` of this repo and is correct for any extending template,
wherever it sits. A template still declares its own `@/*` and `@brand-lib/*` (both
brand-relative) plus `outDir`/`include`/`exclude`. Put exactly that note in a comment
block above the JSON in `lib/project/README.md`, not in the JSON itself.

- [ ] **Step 7: Run the tests — expect PASS**

```bash
cd lib/editor && npx vitest run src/project-config.test.ts && npx vitest run
```

- [ ] **Step 8: Document + commit**

Add a "Build config" section to `lib/project/README.md` showing the three consumption
snippets (remotion.config.ts, vitest.config.ts, tsconfig.json extends).

```bash
git add lib/project lib/editor/src/project-config.test.ts && git commit -m "feat(project): one home for the toolkit's webpack/vitest/tsconfig workarounds"
```

---

## Task 4: Editor-host primitives

**Files:**
- Create: `lib/editor/host/ui.ts`
- Create: `lib/editor/host/toolbar.tsx`
- Create: `lib/editor/host/host-duration.ts`
- Create: `lib/editor/host/crop-gestures.ts`
- Test: `lib/editor/app/host-duration.test.ts`
- Test: `lib/editor/app/crop-gestures.test.ts`

**Reference source:** `~/Workspace/progpce/video-toolkit/templates/campaign-reels/.editor/main.tsx`
(read-only). Lines 18–97 and 262–339 are what this task extracts.

**Interfaces:**
- Consumes: `LayeredReel`, `formatTimecode` (`lib/editor/app/timeline-util`).
- Produces:
  - `EDITOR_ACCENT: string`, `BTN_H: number`, `BTN_FONT: number`, `zoomBtn: CSSProperties`, `toggleBtn(on: boolean): CSSProperties`
  - `MagnifierIcon({ sign }: { sign: 'plus' | 'minus' })`
  - `Timecode({ playerRef, durationInFrames, fps })`
  - `framesForReel(reel: LayeredReel, fps: number): number`
  - `attachCropGestures(el: HTMLElement, read: () => CropGestureTarget | undefined): () => void`
  - `interface CropGestureTarget { zoom: number; focalX: number; focalY: number; setZoom(z: number): void; setFocal(x: number, y: number): void }`
  - `MAX_ZOOM: number`

**Why split these out:** `framesForReel` and the gesture handler are the only parts of the
489-line host with real logic, and both are testable without mounting the editor.
Extracting them first means Task 5 is an assembly job over already-proven pieces.

- [ ] **Step 1: Write the failing duration test**

Create `lib/editor/app/host-duration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { framesForReel } from '../host/host-duration';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

const reel = (over: Partial<LayeredReel['tracks']> & { totalDurationMs?: number } = {}): LayeredReel =>
  ({
    version: 'layered-1',
    meta: { topic: 'T', totalDurationMs: over.totalDurationMs ?? 6000 },
    tracks: {
      video: over.video ?? [],
      audio: over.audio ?? [],
      music: { baseVolumeDb: 0 },
      overlays: over.overlays ?? [],
      brand: over.brand ?? [],
    },
  }) as unknown as LayeredReel;

describe('framesForReel', () => {
  it('uses meta.totalDurationMs when nothing extends past it', () => {
    expect(framesForReel(reel({ totalDurationMs: 6000 }), 30)).toBe(180);
  });

  it('extends to the last item end on ANY track', () => {
    // Absolute placement: dragging a clip past the derived total must lengthen
    // the editor timeline, or the item becomes invisible and unrecoverable.
    const r = reel({ totalDurationMs: 6000, video: [{ id: 'v', endMs: 9000 } as any] });
    expect(framesForReel(r, 30)).toBe(270);
  });

  it('considers overlays, audio and brand items too', () => {
    expect(framesForReel(reel({ totalDurationMs: 1000, overlays: [{ id: 'o', endMs: 4000 } as any] }), 30)).toBe(120);
    expect(framesForReel(reel({ totalDurationMs: 1000, audio: [{ id: 'a', endMs: 5000 } as any] }), 30)).toBe(150);
    expect(framesForReel(reel({ totalDurationMs: 1000, brand: [{ id: 'b', endMs: 3000 } as any] }), 30)).toBe(90);
  });

  it('never returns fewer than 60 frames', () => {
    expect(framesForReel(reel({ totalDurationMs: 0 }), 30)).toBe(60);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run app/host-duration.test.ts
```

Expected: FAIL — `../host/host-duration` does not exist.

- [ ] **Step 3: Implement `lib/editor/host/host-duration.ts`**

```ts
import type { LayeredReel } from '../../reel-config-base/layered-schema';

/** The editor's timeline length. Deliberately NOT
 *  `layeredDurationInFrames`: the render uses the authored total, but the editor
 *  must show anything an item currently reaches, so dragging a clip past the end
 *  extends the view instead of hiding it. */
export function framesForReel(reel: LayeredReel, fps: number): number {
  const ends = [
    reel.meta.totalDurationMs,
    ...reel.tracks.video.map((v) => v.endMs),
    ...reel.tracks.overlays.map((o) => o.endMs),
    ...reel.tracks.audio.map((a) => a.endMs),
    ...reel.tracks.brand.map((b) => b.endMs),
  ];
  return Math.max(60, Math.round((Math.max(...ends) / 1000) * fps));
}
```

- [ ] **Step 4: Run it — expect PASS**

- [ ] **Step 5: Write the failing gesture test**

Create `lib/editor/app/crop-gestures.test.ts`. The gesture logic is currently an inline
`useEffect` (campaign `main.tsx:262-339`) reading a mutable ref; extracted, it takes a
`read()` callback returning the current target or `undefined` when the control is off.

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { attachCropGestures, MAX_ZOOM, type CropGestureTarget } from '../host/crop-gestures';

function harness(active = true) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  // jsdom gives every element a zero-size rect; the handler divides by it.
  el.getBoundingClientRect = () => ({ width: 100, height: 200, left: 0, top: 0, right: 100, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const target: CropGestureTarget = {
    zoom: 1,
    focalX: 0.5,
    focalY: 0.5,
    setZoom: vi.fn(),
    setFocal: vi.fn(),
  };
  const cleanup = attachCropGestures(el, () => (active ? target : undefined));
  return { el, target, cleanup };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('attachCropGestures', () => {
  it('treats a ctrl+wheel (trackpad pinch) as zoom', () => {
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, cancelable: true }));
    expect(target.setZoom).toHaveBeenCalled();
    expect(target.setFocal).not.toHaveBeenCalled();
    // deltaY -10 → factor (1 - -10*0.01) = 1.1
    expect((target.setZoom as any).mock.calls[0][0]).toBeCloseTo(1.1, 5);
  });

  it('treats a plain wheel (two-finger scroll) as a focal pan', () => {
    // The browser cannot distinguish 2 from 3 fingers, so the gesture split is
    // exactly the one it CAN report: ctrlKey means pinch.
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 20, cancelable: true }));
    expect(target.setZoom).not.toHaveBeenCalled();
    expect(target.setFocal).toHaveBeenCalledWith(0.6, 0.6);
  });

  it('accumulates a pan across a wheel burst', () => {
    // Each wheel event carries only a delta, so the run must be accumulated or
    // the focal point snaps back to the start value on every tick.
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
    expect((target.setFocal as any).mock.calls.at(-1)[0]).toBeCloseTo(0.7, 5);
  });

  it('clamps the focal point into [0,1]', () => {
    const { el, target } = harness();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: -1000, deltaY: -1000, cancelable: true }));
    expect(target.setFocal).toHaveBeenCalledWith(0, 0);
  });

  it('pans opposite the drag, so dragging right reveals what is on the left', () => {
    const { el, target } = harness();
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 0 }));
    expect(target.setFocal).toHaveBeenCalledWith(0.4, 0.5);
  });

  it('stops panning after pointerup', () => {
    const { el, target } = harness();
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointerup', {}));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    expect(target.setFocal).not.toHaveBeenCalled();
  });

  it('does nothing at all when no target is active', () => {
    const { el, target } = harness(false);
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true, ctrlKey: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    expect(target.setZoom).not.toHaveBeenCalled();
    expect(target.setFocal).not.toHaveBeenCalled();
  });

  it('removes every listener on cleanup', () => {
    const { el, target, cleanup } = harness();
    cleanup();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 0 }));
    expect(target.setFocal).not.toHaveBeenCalled();
  });

  it('caps zoom at MAX_ZOOM and never below 1', () => {
    const { el, target } = harness();
    target.zoom = MAX_ZOOM;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true }));
    expect((target.setZoom as any).mock.calls.at(-1)[0]).toBe(MAX_ZOOM);
    target.zoom = 1;
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true }));
    expect((target.setZoom as any).mock.calls.at(-1)[0]).toBe(1);
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run app/crop-gestures.test.ts
```

- [ ] **Step 7: Implement `lib/editor/host/crop-gestures.ts`**

Port campaign `main.tsx:262-339` behaviour, with two changes: clamping moves inside (so
the caller's `setZoom` no longer has to), and the mutable-ref read becomes the `read()`
parameter.

```ts
/** How far a clip's crop may zoom in (zoom = 1 / crop.width). */
export const MAX_ZOOM = 6;

/** The currently-croppable clip, as the gesture layer needs to see it. */
export interface CropGestureTarget {
  zoom: number;
  focalX: number;
  focalY: number;
  setZoom: (z: number) => void;
  setFocal: (x: number, y: number) => void;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Trackpad + mouse crop control over the preview.
 *
 * The browser cannot tell two fingers from three, so the split uses the gestures
 * it CAN distinguish: a PINCH arrives as ctrl+wheel (zoom), a two-finger SCROLL
 * as a plain wheel (pan), and a click-drag also pans, for anyone without a
 * trackpad. Listeners are non-passive so preventDefault stops the browser's own
 * page pan/zoom. `read()` returning undefined means the control is off — the
 * listeners stay attached but do nothing, so no drag is ever dropped mid-gesture
 * by a re-attach.
 *
 * Returns a cleanup function; call it from the effect that attached this.
 */
export function attachCropGestures(el: HTMLElement, read: () => CropGestureTarget | undefined): () => void {
  // A wheel burst carries only deltas, so a pan run is accumulated here and
  // re-seeded after a short idle.
  let pan: { x: number; y: number } | null = null;
  let panIdle: ReturnType<typeof setTimeout> | undefined;

  const onWheel = (e: WheelEvent) => {
    const t = read();
    if (!t) return;
    e.preventDefault();
    if (e.ctrlKey) {
      pan = null; // pinch → zoom
      const next = t.zoom * (1 - e.deltaY * 0.01);
      t.setZoom(Math.min(MAX_ZOOM, Math.max(1, next)));
      return;
    }
    const r = el.getBoundingClientRect();
    if (!pan) pan = { x: t.focalX, y: t.focalY };
    pan = { x: clamp01(pan.x + e.deltaX / r.width), y: clamp01(pan.y + e.deltaY / r.height) };
    t.setFocal(pan.x, pan.y);
    clearTimeout(panIdle);
    panIdle = setTimeout(() => {
      pan = null;
    }, 200);
  };

  let last: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => {
    if (!read()) return;
    // Capture phase + stop, so a pan doesn't reach the Player under the overlay.
    e.stopPropagation();
    e.preventDefault();
    last = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: PointerEvent) => {
    const t = read();
    if (!last || !t) return;
    const r = el.getBoundingClientRect();
    const dfx = (e.clientX - last.x) / r.width;
    const dfy = (e.clientY - last.y) / r.height;
    last = { x: e.clientX, y: e.clientY };
    // Grab-and-move: dragging right reveals what is on the left, so the focal
    // point travels opposite the pointer.
    t.setFocal(clamp01(t.focalX - dfx), clamp01(t.focalY - dfy));
  };
  const onUp = () => {
    last = null;
  };

  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  return () => {
    clearTimeout(panIdle);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
}
```

- [ ] **Step 8: Run it — expect PASS**

If a test fails on jsdom's `PointerEvent` being undefined, use
`new MouseEvent('pointerdown', {...})` in the test instead — jsdom dispatches by name.
Do not weaken an assertion to make it pass.

- [ ] **Step 9: Implement the two presentational modules**

`lib/editor/host/ui.ts` — port campaign `main.tsx:31-60`:

```ts
import type { CSSProperties } from 'react';

/** The editor chrome's "on" accent. This is core's editor UI colour — the same
 *  literal EditorShell.module.css already uses for its Save button — NOT a brand
 *  colour. A brand's palette reaches the editor only through `accentSlots`. */
export const EDITOR_ACCENT = '#b6ff5a';

/** One button metric across the whole timeline toolbar. */
export const BTN_H = 28;
export const BTN_FONT = 12;

export const zoomBtn: CSSProperties = {
  background: '#26282f',
  color: '#e8e8ea',
  border: '1px solid #34363e',
  borderRadius: 4,
  width: BTN_H,
  height: BTN_H,
  fontSize: BTN_FONT,
  lineHeight: '1',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** A pill toggle (Ripple / Snap / Beats): accented when on, neutral when off. */
export const toggleBtn = (on: boolean): CSSProperties => ({
  background: on ? EDITOR_ACCENT : '#26282f',
  color: on ? '#17181c' : '#e8e8ea',
  border: '1px solid #34363e',
  borderRadius: 4,
  height: BTN_H,
  padding: '0 12px',
  fontSize: BTN_FONT,
  cursor: 'pointer',
});
```

`lib/editor/host/toolbar.tsx` — port `MagnifierIcon` (`main.tsx:63-72`) and `Timecode`
(`main.tsx:79-97`) verbatim, except that `Timecode` gains an `fps: number` prop instead of
closing over a module-level `fps`. Keep its comment about why it is isolated (the
per-frame tick must re-render only that span, or playback stutters).

- [ ] **Step 10: Run the full suite and commit**

```bash
cd lib/editor && npx vitest run
```

Expected: baseline + Task 1/2/3 tests + 14 new here, all green.

```bash
git add lib/editor/host lib/editor/app/host-duration.test.ts lib/editor/app/crop-gestures.test.ts && git commit -m "feat(editor): extract host primitives — duration, crop gestures, toolbar chrome"
```

---

## Task 5: `EditorHost` + `mountEditorHost`

**Files:**
- Create: `lib/editor/host/EditorHost.tsx`
- Create: `lib/editor/host/mount.tsx`
- Test: `lib/editor/app/EditorHost.test.tsx`

**Reference source:** campaign `.editor/main.tsx` (the whole file) and the roost/campaign
diff, both quoted in `docs/superpowers/HANDOFF.md`'s Phase 2 section. **All 63 diff lines
between the two hosts are configuration** — component, fps/width/height, projectName,
accentSlots, the global.css import, and roost's beats toggle.

**Interfaces:**
- Consumes: `framesForReel`, `attachCropGestures`, `MAX_ZOOM`, `CropGestureTarget`,
  `Timecode`, `MagnifierIcon`, `zoomBtn`, `toggleBtn`, `BTN_FONT` (Task 4);
  `EditorShell`, `LayeredTimeline`, `LayeredInspector`, `RenderButton`, `useHistory`,
  `deleteItem`, `EditorMeta`, `AccentSlot`.
- Produces:
  - `interface EditorHostOptions { component: ComponentType<{ reel: LayeredReel }>; projectName: string; fps: number; width: number; height: number; accentSlots?: readonly AccentSlot[]; meta?: EditorMeta }`
  - `EditorHost(props: EditorHostOptions): JSX.Element`
  - `mountEditorHost(options: EditorHostOptions, container?: HTMLElement): void`

**Three behaviours that change relative to the brand hosts — all intended:**

1. **`meta` is passed to both `LayeredTimeline` and `LayeredInspector`.** This *is*
   pending brand migration #4 from Phase 1 (14 silent call sites): adopting the host
   fulfils it instead of hand-editing 14 files. `EditorHostOptions.meta` must be
   documented as needing a **stable reference** — `LayeredTimeline` is memoized with a
   shallow compare and re-renders on every playhead frame, so an inline object literal
   defeats the memo entirely.
2. **Beats snapping is unconditional.** Roost's toggle is
   `disabled={!snapping || !reel?.meta.guidesMs?.length}`, so shipping it in core
   auto-disables it wherever there are no beat guides. Campaign gains it for free. No flag,
   no option.
3. **`accentSlots` has no default.** Absent means the AccentEditor shows no palette —
   never a fallback colour. Core must not invent a brand's accents.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/app/EditorHost.test.tsx`. `@remotion/player` and `remotion` are both
resolvable in this package (see `lib/editor/vitest.config.ts`), so the host mounts for
real. Stub the network.

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { EditorHost } from '../host/EditorHost';
import type { LayeredReel } from '../../reel-config-base/layered-schema';

const REEL: LayeredReel = {
  version: 'layered-1',
  meta: { topic: 'Demo', totalDurationMs: 6000 },
  tracks: {
    video: [{ id: 'seg-001', kind: 'clip', startMs: 0, endMs: 3000, source: 'a.mp4', sourceInMs: 0, sourceOutMs: 3000 }],
    audio: [],
    music: { baseVolumeDb: 0 },
    overlays: [],
    brand: [],
  },
} as unknown as LayeredReel;

const Stub: React.FC<{ reel: LayeredReel }> = () => <div data-testid="stub-composition" />;

const opts = {
  component: Stub,
  projectName: 'test-reels',
  fps: 30,
  width: 1080,
  height: 1920,
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).startsWith('/props')) return { ok: true, json: async () => ({ reel: REEL }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('EditorHost', () => {
  it('shows a loading state before /props resolves', () => {
    render(<EditorHost {...opts} />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('loads the reel from /props and shows the project name', async () => {
    render(<EditorHost {...opts} />);
    await waitFor(() => expect(screen.getByText('test-reels')).toBeInTheDocument());
  });

  it('renders the beats-snap toggle unconditionally, disabled without guides', async () => {
    // Core ships the feature for every brand; the absence of guidesMs is what
    // turns it off, not a per-brand flag.
    render(<EditorHost {...opts} />);
    const btn = await screen.findByTitle(/beat/i);
    expect(btn).toBeDisabled();
  });

  it('enables the beats-snap toggle when the reel carries guides', async () => {
    const withGuides = { ...REEL, meta: { ...REEL.meta, guidesMs: [0, 800, 1600] } } as LayeredReel;
    (globalThis.fetch as any).mockImplementation(async () => ({ ok: true, json: async () => ({ reel: withGuides }) }));
    render(<EditorHost {...opts} />);
    const btn = await screen.findByTitle(/beat/i);
    expect(btn).not.toBeDisabled();
  });

  it('POSTs the reel to /save under a `props` key when Save is clicked', async () => {
    const { getByText } = render(<EditorHost {...opts} />);
    await waitFor(() => getByText('test-reels'));
    // The reel must be wrapped as { props: { reel } }: that shape is what the
    // save spine writes into defaultProps.
    // (Drive the click through the Save control the shell renders.)
  });
});
```

Complete that last test against the real Save control — read `EditorShell.tsx` for its
accessible name and assert the `fetch('/save', …)` body is `{"props":{"reel":…}}`. Do not
leave it as a comment.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run app/EditorHost.test.tsx
```

- [ ] **Step 3: Implement `lib/editor/host/EditorHost.tsx`**

Port campaign `main.tsx:99-487` into a component taking `EditorHostOptions`, with these
mechanical substitutions:

| In the brand host | In core |
|---|---|
| module-level `fps` / `width` / `height` | props |
| `projectName="campaign-reels"` | `projectName` prop |
| `component={LayeredCampaignReel}` | `component` prop |
| `accentSlots={brandTheme.accentSlots}` | `accentSlots` prop (may be undefined) |
| `framesFor(reel)` | `framesForReel(reel, fps)` |
| inline `zoomBtn` / `toggleBtn` / `MagnifierIcon` / `Timecode` | imports from `./ui` and `./toolbar` |
| the inline crop `useEffect` (`main.tsx:278-339`) | `attachCropGestures` in a `useEffect` keyed on `previewMounted` |
| `#b6ff5a` in the Focus/Zoom button | `EDITOR_ACCENT` |
| — (absent) | `snapToBeats` state + toggle, ported from roost's diff hunk |
| — (absent) | `meta={meta}` on `LayeredTimeline` **and** `LayeredInspector` |
| — (absent) | `guidesMs={reel?.meta.guidesMs}` on `LayeredTimeline` |

Everything else — the history hook, the dirty tracking, the beforeunload guard, the
keyboard handler, play/pause isolation, `setFocal`/`setZoom`, the Focus/Zoom overlay —
ports verbatim, comments included. Those comments explain non-obvious decisions (why the
Timecode is isolated, why the crop effect is keyed on mount, why the listeners read
through a ref) and are worth more than the lines they annotate.

Two details that are easy to get wrong:

- **Hook order.** `selVideo`, `setFocal`, `setZoom` and the gesture effect are all
  computed **before** the `if (!reel) return <loading/>` early return. `reel` is null on
  first render; moving any of them below the return makes hook order unstable and React
  throws.
- **The `read()` adapter.** `attachCropGestures` wants a `CropGestureTarget`; the host has
  a `LayeredReel` video item. Build the adapter inside `read()` from a ref, keeping the
  existing rule that only `clip` and `broll` are croppable and that Focus/Zoom must be on:

```tsx
const cropRef = useRef<{ selVideo?: typeof selVideo; showFocus: boolean; setZoom: (z: number) => void; setFocal: (x: number, y: number) => void }>({
  showFocus,
  setZoom,
  setFocal,
});
cropRef.current = { selVideo, showFocus, setZoom, setFocal };

useEffect(() => {
  const el = previewRef.current;
  if (!el) return;
  return attachCropGestures(el, () => {
    const { selVideo: sv, showFocus: sf, setZoom: sz, setFocal: sf2 } = cropRef.current;
    if (!sf || (sv?.kind !== 'clip' && sv?.kind !== 'broll')) return undefined;
    return {
      zoom: 1 / ((sv.crop as { width?: number } | undefined)?.width ?? 1),
      focalX: sv.focalX ?? 0.5,
      focalY: sv.focalY ?? 0.5,
      setZoom: sz,
      setFocal: sf2,
    };
  });
}, [previewMounted]);
```

- [ ] **Step 4: Run the test — expect PASS**

- [ ] **Step 5: Implement `lib/editor/host/mount.tsx`**

```tsx
import { createRoot } from 'react-dom/client';
import { EditorHost, type EditorHostOptions } from './EditorHost';

export type { EditorHostOptions };

/**
 * Mounts the reel editor. A brand's `.editor/main.tsx` is this call plus its own
 * CSS import — see lib/editor/host/README.md.
 */
export function mountEditorHost(options: EditorHostOptions, container?: HTMLElement): void {
  const el = container ?? document.getElementById('root');
  if (!el) throw new Error('mountEditorHost: no #root element (is index.html missing <div id="root">?)');
  createRoot(el).render(<EditorHost {...options} />);
}
```

- [ ] **Step 6: Write `lib/editor/host/README.md`**

Show the complete brand-side `.editor/main.tsx` that results — this is the artifact the
whole task exists to produce:

```tsx
import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
import { LayeredCampaignReel } from '../src/LayeredCampaignReel';
import { brandTheme } from '../src/config/brand-theme';
import { editorMeta } from '../src/config/editor-meta';
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

State explicitly: `meta` and `accentSlots` must be **module-level constants**, never inline
literals, because `LayeredTimeline` is memoized and re-renders every playhead frame.

- [ ] **Step 7: Full suite + leak gate + commit**

```bash
cd lib/editor && npx vitest run
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
```

The grep must print nothing.

```bash
git add lib/editor/host lib/editor/app/EditorHost.test.tsx && git commit -m "feat(editor): core ships the editor host, with beats snapping for every brand"
```

---

## Task 6: The Node side — plugin + Vite config factory

**Files:**
- Create: `lib/editor/host/prettier-format.ts`
- Create: `lib/editor/host/editor-plugin.mts`
- Create: `lib/editor/host/vite-config.mts`
- Test: `lib/editor/src/editor-plugin.test.ts`
- Test: `lib/editor/src/editor-vite-config.test.ts`
- Modify: `lib/editor/host/README.md`

**Reference source:** campaign `.editor/editor-plugin.mts` (176 lines) and
`.editor/vite.config.mts` (58 lines), read-only.

**Interfaces:**
- Consumes: `readDefaultProps`, `createSaveHandler`, `createRenderHandler`,
  `createProjectStateHandler` (all `lib/editor/src/*`); `resolveToolkitPaths` (Task 3).
- Produces:
  - `formatWithProjectPrettier(source: string, filePath: string): Promise<string>`
  - `createEditorPlugin(options: EditorPluginOptions): Plugin` where
    `EditorPluginOptions = { templateRoot: string; compositionId: string; extraArgs?: string[]; format?: (source: string, filePath: string) => Promise<string> }`
  - `createEditorViteConfig(options: EditorViteConfigOptions): Record<string, unknown>` where
    `EditorViteConfigOptions = { editorDir: string; compositionId: string; plugins?: unknown[]; brandLib?: boolean; extraArgs?: string[]; port?: number }`

**Hard constraint — no runtime imports of brand packages.** These files are bundled by the
*brand's* esbuild when Vite loads its config, but they resolve from *core's* location,
where `vite`, `@vitejs/plugin-react` and `@tailwindcss/vite` are not installed. So:

- `import type { Plugin, ViteDevServer } from 'vite'` — type-only, erased. Fine.
- **Never** `import { defineConfig } from 'vite'` — return a plain object. `defineConfig`
  is identity; the brand wraps the result if it wants the type.
- **Never** import `react()` or `tailwindcss()`. The brand passes them in `plugins`.
- `prettier` stays a **dynamic** `await import('prettier')` inside a try/catch, exactly as
  today, so a project without Prettier still saves.

**One deliberate move:** `formatWithProjectPrettier` moves into core. The comment in the
brand copy says core stays formatter-agnostic — that rule is about `createSaveHandler`
(`lib/editor/src/save-endpoint.ts`), which **must keep taking `format` as an option**. The
function itself resolves the project's *own* Prettier config from the file path, so it is
generic machinery, identical in both brands. It becomes the host's default and stays
overridable via `EditorPluginOptions.format`. Say this in the module comment.

- [ ] **Step 1: Write the failing plugin test**

Create `lib/editor/src/editor-plugin.test.ts`. Test the plugin at its seams — it is a
`configureServer` hook over `server.middlewares.use(route, handler)`, so a fake server that
records routes is enough, plus a temp directory for the filesystem routes.

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEditorPlugin } from '@video-toolkit/lib/editor/host/editor-plugin.mts';

let root: string;

function fakeServer() {
  const routes = new Map<string, Function>();
  return { routes, server: { middlewares: { use: (r: string, h: Function) => routes.set(r, h) } } };
}

/** Minimal ServerResponse stand-in capturing what a handler wrote. */
function fakeRes() {
  const res: any = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end(b?: string) { this.body = b ?? ''; this.ended = true; },
    ended: false,
  };
  return res;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-plugin-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/recordings'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/broll'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/Root.tsx'),
    `import { Composition } from 'remotion';
export const RemotionRoot = () => (
  <Composition id="MyReel" component={C} defaultProps={{ reel: { version: 'layered-1' } }} />
);
`,
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const plug = (over: Record<string, unknown> = {}) =>
  createEditorPlugin({ templateRoot: root, compositionId: 'MyReel', ...over });

describe('createEditorPlugin', () => {
  it('is a named vite plugin', () => {
    expect(plug().name).toBe('video-toolkit-editor');
  });

  it('registers every editor route', () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    expect([...routes.keys()].sort()).toEqual(['/project-state', '/props', '/render', '/save', '/sources'].sort());
  });

  it('GET /props returns the defaultProps of the configured composition', async () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/props')!({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ reel: { version: 'layered-1' } });
  });

  it('rejects a non-GET on /props with 405', () => {
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/props')!({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('lists only video files from recordings and broll, sorted', () => {
    fs.writeFileSync(path.join(root, 'public/recordings/b.mp4'), '');
    fs.writeFileSync(path.join(root, 'public/recordings/a.MOV'), '');
    fs.writeFileSync(path.join(root, 'public/recordings/notes.txt'), '');
    fs.writeFileSync(path.join(root, 'public/broll/c.webm'), '');
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/sources')!({ method: 'GET' }, res);
    expect(JSON.parse(res.body)).toEqual({ recordings: ['a.MOV', 'b.mp4'], broll: ['c.webm'] });
  });

  it('returns empty lists when the footage directories do not exist', () => {
    fs.rmSync(path.join(root, 'public/recordings'), { recursive: true });
    fs.rmSync(path.join(root, 'public/broll'), { recursive: true });
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/sources')!({ method: 'GET' }, res);
    // Footage dirs are optional until a project actually has footage — a missing
    // one is not an error, it is an empty project.
    expect(JSON.parse(res.body)).toEqual({ recordings: [], broll: [] });
  });

  it('reports a read failure as 500 rather than crashing the dev server', () => {
    fs.rmSync(path.join(root, 'src/Root.tsx'));
    const { routes, server } = fakeServer();
    plug().configureServer!(server as any);
    const res = fakeRes();
    routes.get('/props')!({ method: 'GET' }, res);
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/Failed to read/);
  });
});
```

Add one more test asserting the security property that the route comments claim: **the
write path is config-time, never client-supplied.** POST `/save` with a body carrying a
`rootPath` pointing somewhere else and assert the file at `<root>/src/Root.tsx` is what
changed and nothing else was written.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run src/editor-plugin.test.ts
```

If vitest will not import an `.mts` file from a `.ts` test, name the module
`editor-plugin.ts` instead and have the brand import it by relative path — the extension
is not load-bearing for esbuild-bundled Vite configs. Record whichever way it went in the
task report, because the brand-side import path depends on it.

- [ ] **Step 3: Implement `prettier-format.ts` and `editor-plugin.mts`**

Port campaign `.editor/editor-plugin.mts` with `compositionId` and `extraArgs` becoming
options, `formatWithProjectPrettier` imported from `./prettier-format`, and the core
endpoint imports switching from the brand's `../../../toolkit/lib/editor/src/...` relative
paths to plain `../src/...`. Keep every route comment, particularly the two that document
why `/props` and `/save` cannot be redirected to an arbitrary path.

- [ ] **Step 4: Run the tests — expect PASS**

- [ ] **Step 5: Write the failing Vite-config test**

Create `lib/editor/src/editor-vite-config.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEditorViteConfig } from '@video-toolkit/lib/editor/host/vite-config.mts';

const EDITOR_DIR = '/repo/templates/campaign-reels/.editor';
const TEMPLATE = '/repo/templates/campaign-reels';

const cfg = (over: Record<string, unknown> = {}) =>
  createEditorViteConfig({ editorDir: EDITOR_DIR, compositionId: 'X', ...over }) as any;

describe('createEditorViteConfig', () => {
  it('roots Vite at the .editor dir and serves the project public dir', () => {
    expect(cfg().root).toBe(EDITOR_DIR);
    expect(cfg().publicDir).toBe(path.resolve(TEMPLATE, 'public'));
  });

  it('aliases @, the core lib and the timeline deps from the PROJECT node_modules', () => {
    // The timeline component lives in the toolkit submodule, whose node_modules
    // walk cannot reach the project's siblings.
    const a = cfg().resolve.alias;
    expect(a['@']).toBe(path.resolve(TEMPLATE, 'src'));
    expect(a['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
    expect(a['@xzdarcy/react-timeline-editor']).toBe(path.resolve(TEMPLATE, 'node_modules/@xzdarcy/react-timeline-editor'));
    expect(a['@xzdarcy/timeline-engine']).toBe(path.resolve(TEMPLATE, 'node_modules/@xzdarcy/timeline-engine'));
  });

  it('omits @brand-lib unless asked', () => {
    expect(cfg().resolve.alias).not.toHaveProperty('@brand-lib');
    expect(cfg({ brandLib: true }).resolve.alias['@brand-lib']).toBe(path.resolve('/repo/brand-lib'));
  });

  it('appends the caller plugins before the editor plugin', () => {
    const mine = { name: 'mine' };
    const names = cfg({ plugins: [mine] }).plugins.map((p: any) => p?.name);
    expect(names).toContain('mine');
    expect(names).toContain('video-toolkit-editor');
    expect(names.indexOf('mine')).toBeLessThan(names.indexOf('video-toolkit-editor'));
  });

  it('ships the @remotion/transitions re-resolver as a pre-enforced plugin', () => {
    // lib/render/at-cut-transitions.tsx runtime-imports @remotion/transitions/*
    // from outside the project tree. A plain dir alias breaks the ESM-only
    // subpaths (iris, wipe) that exist only via the package exports map, so this
    // has to be a resolveId hook, not an alias.
    const p = cfg().plugins.find((x: any) => x?.name === 'resolve-remotion-transitions-from-project');
    expect(p.enforce).toBe('pre');
  });

  it('defaults the dev-server port to 3100 and honours an override', () => {
    expect(cfg().server.port).toBe(3100);
    expect(cfg({ port: 3200 }).server.port).toBe(3200);
  });
});
```

- [ ] **Step 6: Run it and watch it fail, then implement `vite-config.mts`**

Port campaign `.editor/vite.config.mts`, with `templateRoot` derived as
`path.resolve(editorDir, '..')`, the alias map from `toolkitAliases`, `zod$` resolved via
`createRequire` from the **template root** (same rule as Task 3), the transitions
re-resolver kept verbatim, and `plugins: [...(opts.plugins ?? []), transitionsResolver,
createEditorPlugin({...})]`.

- [ ] **Step 7: Run the suite, then write the brand-side snippet into the README**

The resulting brand `.editor/vite.config.mts`, in full — verify each relative hop against
the real layout before writing it down:

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

Roost's is the same minus `tailwindcss()` and `brandLib`, plus `extraArgs: ['--gl=angle']`.

- [ ] **Step 8: Commit**

```bash
cd lib/editor && npx vitest run
git add lib/editor/host lib/editor/src/editor-plugin.test.ts lib/editor/src/editor-vite-config.test.ts && git commit -m "feat(editor): core ships the editor dev-server plugin and Vite config factory"
```

---

## Task 7: Unify zod (the Phase 0 leftover)

**Files:**
- Modify: `package.json`
- Modify: `examples/layered-minimal/package.json` (only if it disagrees with the decision)
- Create: `docs/zod-version.md`
- Modify: `lib/reel-config-base/README.md` if one exists; otherwise add the note to `docs/zod-version.md` only.

**The problem:** roost pins `zod ^4.3.6`, both PP templates pin `^3.22.0`, and all three
compile against the same `lib/reel-config-base/layered-schema.ts`. Core itself pins
`3.22.3` exactly. Nothing detects the mismatch; it fails at whatever the first
version-sensitive call turns out to be.

**The specific risk this creates:** `lib/reel-config-base/transition-schema.ts` marks
accent-carrying fields by patching zod's `describe()` so clones stay marked, and the
Phase 1 handoff already records that several chained-method paths silently lose the mark —
with the failure mode being *a field with no editor control at all, and no warning*. That
mechanism is zod-internals-dependent, so a major-version split across brands is exactly
the shape of latent break worth closing.

- [ ] **Step 1: Establish which version core's code actually requires**

Do not guess. Run the suite against each, in a scratch clone so the working tree is never
left on an experimental install:

```bash
cd lib/editor && npx vitest run 2>&1 | tail -3
```

Then check what zod version is actually resolved at test time and whether the schema
modules use any API whose behaviour differs between zod 3 and 4 — in particular
`z.record(z.string(), z.unknown())` (arity differs), `.describe()` clone semantics,
`z.discriminatedUnion`, and `.passthrough()` (removed in zod 4's core API).

```bash
grep -rn "z\.record\|passthrough\|discriminatedUnion\|\.describe(" lib/reel-config-base lib/editor/app/transitions.ts
```

- [ ] **Step 2: Write the finding down before changing anything**

Create `docs/zod-version.md` recording: the supported version, the evidence (which API
usages decide it), what a brand must pin, and how the mismatch would present if ignored.
This document is the deliverable — the version bump is one line, the reasoning is the part
that has to survive.

- [ ] **Step 3: Pin core**

Set core's `devDependencies.zod` to the decided pin, using a range (`^3.22.0`) rather than
an exact version if and only if the evidence supports it, and align
`examples/layered-minimal/package.json` to the same. State the pin in `docs/zod-version.md`
and in `CLAUDE.md`'s registry-adjacent docs if a natural place exists.

- [ ] **Step 4: Verify**

```bash
cd lib/editor && npx vitest run
```

Expected: full green, count unchanged from the previous task.

- [ ] **Step 5: Write the brand migration into the task report**

Whichever direction the decision goes, one or more brand repos must change a pin and
reinstall. Write the exact before/after `package.json` lines per repo, the reinstall
command, and what to re-run afterwards to confirm (each template's own `npx vitest run`,
plus a Studio open). **Do not apply it.**

- [ ] **Step 6: Commit**

```bash
git add package.json examples/layered-minimal/package.json docs/zod-version.md && git commit -m "chore: pin zod to one version across core and document the contract"
```

---

## Task 8: Documentation and the migration report

**Files:**
- Modify: `docs/superpowers/HANDOFF.md`
- Modify: `docs/creating-templates.md`
- Modify: `CLAUDE.md` (only the lines that become wrong)
- Modify: `_internal/toolkit-registry.json`
- Create: `docs/superpowers/phase2-migrations.md`

**Why a separate task:** the per-task reports live in `.superpowers/sdd/`, which is
gitignored and will not survive a `git clean`. Every migration a brand repo must apply has
to be copied into the repo before this branch is done. Phase 1 learned this the hard way.

- [ ] **Step 1: Write `docs/superpowers/phase2-migrations.md`**

One section per brand repo, each with complete before/after file contents (not diffs
against a file the reader does not have open) for:

- `.editor/main.tsx` → the ~12-line `mountEditorHost` call
- `.editor/vite.config.mts` → the ~15-line `createEditorViteConfig` call
- `.editor/editor-plugin.mts` → **deleted**
- `src/Root.tsx` → `{...layeredCompositionProps({…})}` + the untouched `defaultProps`
- `src/LayeredRoostReel.tsx` → drop the duplicate `roostReelDurationInFrames` export
- `src/lib/load-fonts.ts` → **deleted**, replaced by a `loadBrandFonts([...])` call listing
  that brand's own font files
- `remotion.config.ts` → `applyToolkitWebpack(Config, {...})`
- `vitest.config.ts` → `createToolkitVitestConfig({...})`
- `tsconfig.json` → `extends` the core base
- the zod pin from Task 7

For each, state whether it is **tsc-caught** or **silent**, and mark explicitly that
adopting the host **fulfils Phase 1's pending migration #4** (`meta` at 14 call sites) —
the host passes `meta` itself, so those files do not need the hand-edit any more.

Carry forward, unchanged, the five still-pending Phase 1 migrations from `HANDOFF.md` so
one document is enough to migrate a brand repo from the current pin.

- [ ] **Step 2: Update `HANDOFF.md`**

Mark Phase 2 done with its commit range, the file/line delta, and the final test count.
Move the Phase 2 entries out of "Carried into later phases". Add whatever new deferred
items this branch created. Point at `docs/superpowers/phase2-migrations.md`.

Also record explicitly, under "Carried into later phases", the item this plan deliberately
does **not** do: `video_toolkit/sync_template.py:136,141` still mirrors only
`templates/<t>/src → projects/<p>/src`, so it does not carry `.editor/`. With the host in
core, `.editor/` becomes ~35 lines that rarely change, which lowers the cost — but the
next `.editor/` change still hits 12+ files by hand. Teaching `sync_template.py` to carry
`.editor/` is a Phase 3 task.

- [ ] **Step 3: Update `docs/creating-templates.md`**

Rewrite the build-config and editor sections to describe what a template now owns:
`index.html`, a ~15-line `vite.config.mts`, a ~12-line `main.tsx`, a `Root.tsx` that is an
id plus a literal, and thin `remotion.config.ts` / `vitest.config.ts` / `tsconfig.json`
wrappers. Include the full text of each, matching the READMEs from Tasks 5 and 6 exactly —
if the two disagree, someone will follow the wrong one.

- [ ] **Step 4: Update the registry**

Add the new modules to `_internal/toolkit-registry.json` under whichever section already
carries `lib/` components, following the existing entry shape. Read a neighbouring entry
first; do not invent fields.

- [ ] **Step 5: Check CLAUDE.md for statements this branch falsified**

Read it and fix only what is now wrong. Do not restructure it.

- [ ] **Step 6: Final verification**

```bash
cd lib/editor && npx vitest run
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
```

Then the tsc check, against a worktree at the branch point, comparing error **sets**:

```bash
git worktree add /tmp/phase2-base $(git merge-base main HEAD)
cd /tmp/phase2-base/lib/editor && npx tsc --noEmit 2>&1 | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/tsc-base.txt
cd - && cd lib/editor && npx tsc --noEmit 2>&1 | sed 's/([0-9]*,[0-9]*)//' | sort > /tmp/tsc-head.txt
diff /tmp/tsc-base.txt /tmp/tsc-head.txt
git worktree remove /tmp/phase2-base
```

Expected: no added error lines. Removed ones are fine.

- [ ] **Step 7: Commit**

```bash
git add docs CLAUDE.md _internal/toolkit-registry.json && git commit -m "docs: Phase 2 handoff, template guide, and the paste-ready brand migrations"
```

---

## Verification summary

| Gate | Command | Expected |
|---|---|---|
| Tests | `cd lib/editor && npx vitest run` | ≥ 485, never fewer; all green |
| Types | tsc error-set diff vs merge-base | no added lines |
| Brand leak | the `grep -riE` above | no output |
| Example still readable | `npx vitest run src/example-default-props.test.ts` | green (proves `readDefaultProps` still finds the literal after Task 1) |
| Brand repos untouched | `cd ~/Workspace/progpce/video-toolkit && git status --short` and the same in `~/Workspace/roost/video-toolkit` | unchanged from session start; roost's pre-existing dirty files still dirty, still the user's |
