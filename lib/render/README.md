# lib/render

Shared "at-the-cut" transition engine for layered-model reel renderers (campaign-reels today, roost-reels next), split into two files because core has no `remotion`/`@remotion/transitions` installed: `transition-record.ts` is the pure, Remotion-free "is this a real transition?" gate (`TransitionRecord`, `getTransitionRecord`) and is unit-tested here in core (`lib/editor/src/transition-record.test.ts`); `at-cut-transitions.tsx` is the Remotion engine (`presentationFor`, `TransitionLayer`, `AtCutTransition`, plus a re-export of the pure gate so consumers can import everything from one path) and, since it can't be imported without Remotion installed, is instead verified by render parity in the consuming templates.

Neither file defines what a transition *is*: the vocabulary lives in `lib/reel-config-base/transition-schema.ts` (the catalog `TransitionSchema` and the editor's `TRANSITION_KINDS` are both built from). `presentationFor` maps it to Remotion via a `Record<TransitionKind, …>`, so adding a kind to the catalog produces a **compile error** here until the renderer handles it — rather than a kind that silently plays as a hard cut.

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

Without it the bundle fails with `Can't resolve '@remotion/transitions/…'`. (The campaign-reels + roost-reels templates and their projects already carry this.)
