# lib/render

Shared "at-the-cut" transition engine for layered-model reel renderers (every brand template consumes it), split into two files because core has no `remotion`/`@remotion/transitions` installed: `transition-record.ts` is the pure, Remotion-free "is this a real transition?" gate (`TransitionRecord`, `getTransitionRecord`) and is unit-tested here in core (`lib/editor/src/transition-record.test.ts`); `at-cut-transitions.tsx` is the Remotion engine (`presentationFor`, `TransitionLayer`, `AtCutTransition`, plus a re-export of the pure gate so consumers can import everything from one path) and, since it can't be imported without Remotion installed, is instead verified by render parity in the consuming templates.

Neither file defines what a transition *is*: the vocabulary lives in `lib/reel-config-base/transition-schema.ts` (the catalog `TransitionSchema` and the editor's `TRANSITION_KINDS` are both built from). `presentationFor` maps it to Remotion via a `Record<TransitionKind, …>`, so adding a kind to the catalog produces a **compile error** here until the renderer handles it — rather than a kind that silently plays as a hard cut.

`layered-composition-props.ts` is on the pure side of that split too — it deliberately has no `remotion` import. It is the one definition of the `<Composition>` prop bundle every layered reel needs (`layeredCompositionProps`, `layeredDurationInFrames`): id/component/fps/width/height passthrough, the placeholder `durationInFrames`, and the `calculateMetadata` that derives the real duration from `meta.totalDurationMs` with the 60-frame floor. A brand `Root.tsx` spreads it onto `<Composition>` alongside its own `defaultProps` literal. Unit-tested in `lib/editor/src/layered-composition-props.test.ts`.

The same split applies to brand font loading: `fonts.ts` is the pure side — `FontSpec`, `fontFaceDescriptors` — normalising a brand's font list into `FontFace` descriptors (defaulting `weight` to `'400'`, `style` to `'normal'`, and — critically — `display` to `'block'` so a render never bakes in a fallback-font frame), with no `remotion` import, unit-tested in `lib/editor/src/fonts.test.ts`. `load-fonts.ts` is the Remotion shell — `loadBrandFonts` — that turns those descriptors into real `FontFace` objects, registers them via `delayRender`/`continueRender`, and is not unit-tested here for the same reason as `at-cut-transitions.tsx`. Its `{ timeoutInMilliseconds: 120_000, retries: 2 }` defaults are not padding: under multi-tab render concurrency, fresh browser contexts re-reading TTFs from disk can exceed Remotion's 28s default under I/O contention, which is the flake that used to force `--concurrency=1`. Call `loadBrandFonts` once at module scope of the brand's reel component so Studio, the editor Player, and a headless render all pick it up.

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
