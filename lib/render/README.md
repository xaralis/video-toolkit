# lib/render

Shared "at-the-cut" transition engine for layered-model reel renderers (every brand template consumes it), split into two files: `transition-record.ts` is the pure, Remotion-free "is this a real transition?" gate (`TransitionRecord`, `getTransitionRecord`) and is unit-tested here in core (`lib/editor/src/transition-record.test.ts`); `at-cut-transitions.tsx` is the Remotion engine (`presentationFor`, `TransitionLayer`, `AtCutTransition`, plus a re-export of the pure gate so consumers can import everything from one path). The split originally existed because `lib/editor` had no `@remotion/transitions`, so the engine half could not even be imported here. **That is no longer true** — both `remotion` and `@remotion/transitions` are now declared `lib/editor` devDependencies — so the split is now about what a unit test can *settle*, not what it can load: core still cannot **render**, so whether a transition looks right *at a cut* remains verifiable only by render parity in a consuming template.

Neither file defines what a transition *is*: the vocabulary lives in `lib/reel-config-base/transition-schema.ts` (the catalog `TransitionSchema` and the editor's `TRANSITION_KINDS` are both built from). `presentationFor` maps it to Remotion via a `Record<TransitionKind, …>`, so adding a kind to the catalog produces a **compile error** here until the renderer handles it — rather than a kind that silently plays as a hard cut.

`layered-composition-props.ts` is on the pure side of that split too — it deliberately has no `remotion` import. It is the one definition of the `<Composition>` prop bundle every layered reel needs (`layeredCompositionProps`, `layeredDurationInFrames`): id/component/fps/width/height passthrough, the placeholder `durationInFrames`, and the `calculateMetadata` that derives the real duration from `meta.totalDurationMs` with the exported `MIN_FRAMES` (60-frame) floor. A brand `Root.tsx` spreads it onto `<Composition>` alongside its own `defaultProps` literal. Unit-tested in `lib/editor/src/layered-composition-props.test.ts`. The editor's own `lib/editor/host/host-duration.ts` (`framesForReel`) deliberately does NOT reuse `layeredDurationInFrames` — the editor's timeline must extend past the authored total when an item is dragged beyond it — but it imports this file's `MIN_FRAMES` rather than hardcoding a second copy of the floor.

The same split applies to brand font loading: `fonts.ts` is the pure side — `FontSpec`, `fontFaceDescriptors` — normalising a brand's font list into `FontFace` descriptors (defaulting `weight` to `'400'`, `style` to `'normal'`, and — critically — `display` to `'block'` so a render never bakes in a fallback-font frame), with no `remotion` import, unit-tested in `lib/editor/src/fonts.test.ts`. `load-fonts.ts` is the Remotion shell — `loadBrandFonts` — that turns those descriptors into real `FontFace` objects, registers them via `delayRender`/`continueRender`, and — unlike `at-cut-transitions.tsx` — *is* unit-tested here, in `lib/editor/src/load-fonts.test.ts`, against a mocked `remotion` (`remotion` itself is a declared `lib/editor` devDependency in its own right, alongside `@remotion/player`). The distinction `at-cut-transitions.tsx` rests on is not "importing `remotion`" and no longer "needing a package core lacks" either — it is simply that a module importing `remotion` can be imported against a mock here but never *rendered*. Its `{ timeoutInMilliseconds: 120_000, retries: 2 }` defaults are not padding: under multi-tab render concurrency, fresh browser contexts re-reading TTFs from disk can exceed Remotion's 28s default under I/O contention, which is the flake that used to force `--concurrency=1`. Call `loadBrandFonts` once at module scope of the brand's reel component so Studio, the editor Player, and a headless render all pick it up.

**The spread must be written inline.** The editor's surgical reader/writer (`lib/editor/src/default-props-writer.ts`) resolves a `<Composition>`'s `id` through a `{...layeredCompositionProps({ id: '…', … })}` spread by reading the `id:` property straight out of the call's first-argument object literal — it does not evaluate the call. `{...layeredCompositionProps(OPTS)}` with a hoisted `OPTS` const has no literal to read and fails loudly instead of guessing. Always write the options object inline on `<Composition>`, as every current `Root.tsx` does.

## Consumption requirement (webpack `resolve.modules`)

`at-cut-transitions.tsx` does a **runtime** import of `@remotion/transitions/*`. When a project imports it via the `@video-toolkit/lib` alias, the importing file resolves to `toolkit/lib/render/…`, which lives **outside** the project's own directory tree — so webpack's default module resolution (walking up from the importing file's ancestors) never reaches the project's `node_modules`, where `@remotion/transitions` is actually installed. Any consuming project's `remotion.config.ts` must therefore add its own `node_modules` to `resolve.modules`:

```ts
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: {
    ...c.resolve,
    modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules'],
    alias: { '@video-toolkit/lib': toolkitLib, /* … */ },
  },
}));
```

Without it the bundle fails with `Can't resolve '@remotion/transitions/…'`. (The brand templates and their projects already carry this.)

## Type-check gate

Nothing in `lib/editor`'s tsconfig `include` covers this directory or `lib/transitions` — the surface that type-checks them is **`examples/layered-minimal`**, core's only real Remotion install:

```bash
cd examples/layered-minimal && npm run typecheck    # baseline: 0 errors
```

It reaches these out-of-tree files through the same class of workaround as the `resolve.modules` line above, expressed as tsconfig `paths`. Read **`docs/superpowers/core-typecheck-gate.md`** before editing that tsconfig — notably: `react` must map to `@types/react` (mapping it to the JS package silently `any`s the whole render surface), and `@remotion/transitions/*` declarations live under `dist/presentations/`, not `dist/esm/`.
