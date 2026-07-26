# Core's type-check gate: `examples/layered-minimal`

**Command:**

```bash
cd examples/layered-minimal && npm run typecheck    # tsc --noEmit, then a coverage-shrink guard (see below)
```

**Baseline: 0 errors.** Any error is a regression — there is no pre-existing
noise to filter out. (Established 2026-07-26, on branch `fix/core-has-remotion`.)

**Nothing runs this automatically.** There is no CI in this repo — `.github/workflows/`
only builds Docker images, cuts releases, and syncs the Remotion skill from upstream — and no
root-level script. This gate, `lib/editor`'s `vitest`/`tsc`, and the brand-leak grep are all
manual; run them yourself before calling render/transitions work done. They're listed together
in `CLAUDE.md`'s "Quality Gates" section and `docs/superpowers/HANDOFF.md`'s "Working
conventions established".

## Why this gate exists

Core has two type-check surfaces, and until now they left a hole:

| Surface | Covers | Does **not** cover |
|---|---|---|
| `lib/editor` (`cd lib/editor && npx tsc --noEmit`, baseline **4**) | `src`, `app`, `host`, `../theming`, plus 7 `lib/render` modules its own tests pull in: `audio-gain.ts`, `transition-record.ts`, `video-track-layout.ts`, `fonts.ts`, `layered-composition-props.ts`, `load-fonts.ts`, `overlay-routing.ts` | The render `.tsx` components (`at-cut-transitions.tsx`, `audio-track.tsx`, `layered-composition.tsx`, `video-track.tsx`) and all of `lib/transitions/` |
| `examples/layered-minimal` (this gate, baseline **0**) | its own `src`, plus every `lib/**` file the render actually pulls in — `lib/render` (9 files, including the 4 `.tsx` components above), `lib/transitions` (14 files — every presentation, `index.ts`, and `TransitionGallery.tsx`; see below), `lib/theming` (20), `lib/reel-config-base` (8), `lib/transcripts` (1) | anything no reel imports (editor UI, host) |

Before this, the entire render surface — including ~1900 lines of transition
presentations in `lib/transitions/presentations/*.tsx` — was type-checked by
**nothing** except the 7 non-`.tsx` `lib/render` modules `lib/editor` pulls in
incidentally through its own tests. This example was already a complete, installed
Remotion 4.0.425 project with its own `tsconfig.json`, `@remotion/transitions`, `react`,
`@types/react` and `typescript`. It was a few config lines from being the gate.

The two surfaces are complementary, not redundant. Keep both green.

### `TransitionGallery.tsx` is covered too

`lib/transitions/index.ts` deliberately doesn't re-export `TransitionGallery` (see the
comment at the bottom of that file — it would pull `@remotion/transitions` into barrel-import
time for every consumer), so nothing in `examples/layered-minimal/src` imports it, and it
doesn't ride in for free the way the presentations do. It's added directly to this project's
`tsconfig.json` `include` list instead:
`"../../lib/transitions/TransitionGallery.tsx"`. All of its own imports (`remotion`,
`@remotion/transitions` and its subpaths, five presentations) already resolve through the
`paths` mappings below, so this was a clean addition — no contortion of `src/` needed.

**Caveat: this covers a copy with no runtime consumer.** `showcase/transitions/src/TransitionGallery.tsx`
is a separate, divergent fork of this file — it's what `showcase/transitions/src/Root.tsx` and
`npm run render` in that project actually use, and it sits outside this gate entirely (nothing
adds it to any `tsconfig.json` `include`). The showcase copy still has the exact `TransitionDemo`
`presentation: ReturnType<typeof glitch>` mis-typing this gate caught and fixed in the *lib* copy
below — this gate's "0 errors" says nothing about it. So: this gate type-checks
`lib/transitions/TransitionGallery.tsx`, which nothing renders; the copy that does render is
unchecked. See `docs/superpowers/HANDOFF.md` ("New in the fix-pass-2 re-review, now a Phase 3
candidate") for the full diff and a recommendation on which copy should survive.

Pulling it in surfaced one real, pre-existing type error: `TransitionDemo`'s `presentation`
prop was pinned to `ReturnType<typeof glitch>` (i.e. `TransitionPresentation<GlitchProps>`)
but the component renders whichever transition's presentation is passed to it — every other
call site was silently accepted only because nothing type-checked the file. Fixed by making
`TransitionDemo` generic over its presentation's props (`<Props extends Record<string,
unknown>>`) and, since TS can't infer a single `Props` from a call site that stores several
different presentations in one array, wrapping each entry's `TransitionDemo` JSX in a closure
returned by a small generic factory (`makeTransitionEntry` / `makeNamedTransitionEntry`) so
`Props` is resolved once, locally, per entry — never widened into a union the array has to
carry. No `any`, no assertion, no runtime change: same components, same props, same render
output, just correctly typed. See the comments beside `TransitionEntry` in
`lib/transitions/TransitionGallery.tsx`.

## Why the `paths` entries are needed

`lib/**` reaches this project through `"@video-toolkit/lib/*": ["../../lib/*"]`,
but those files physically live **outside** the project tree. TypeScript resolves
a bare specifier (`remotion`, `react`, `@remotion/transitions/wipe`) by walking
`node_modules` upward **from the importing file** — which for `../../lib/render/…`
never reaches `examples/layered-minimal/node_modules`, where the packages actually
are. Result before the fix: 151 errors, nearly all resolution failures and their
`TS7031`/`TS2875` cascade.

This is the same class of problem, in three toolchains:

- **webpack / Remotion render** — solved by the `resolve.modules` line every
  consuming `remotion.config.ts` must carry (see `lib/render/README.md`).
- **Vite / the reel editor** — solved by the transitions re-resolver in
  `lib/editor/host/`.
- **tsc** — solved by the `paths` block below.

Fixing it is a matter of naming each bare specifier explicitly:

```jsonc
"paths": {
  "@video-toolkit/lib/*": ["../../lib/*"],
  "remotion": ["./node_modules/remotion"],
  "@remotion/transitions": ["./node_modules/@remotion/transitions"],
  "@remotion/transitions/*": ["./node_modules/@remotion/transitions/dist/presentations/*"],
  "react": ["./node_modules/@types/react"],
  "react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime"]
}
```

`lib/editor/tsconfig.json` carries the same `"remotion"` entry for the same
reason (it was worth 5 errors there, taking it from 34 to 29).

### Trap 1: map `react` to `@types/react`, never to `node_modules/react`

The runtime `react` package ships no declarations. Point `paths` at it and every
consumer becomes implicitly `any` — the type coverage this gate exists to add is
silently deleted while the error count *looks* good. Verified twice: in
`lib/editor`, mapping `react` to the JS package took its count from then-29 to 101;
here it hollows out the whole render surface. Always map to `@types/react`.

If you want to confirm the gate is real rather than `any`-ed, append a deliberate
error to a `lib/transitions/presentations/*.tsx` file and check tsc reports it —
e.g. `const p: React.CSSProperties = { nope: 1 };` must produce `TS2353`.

### Trap 2: `@remotion/transitions/*` declarations are NOT under `dist/esm`

`dist/esm/` holds only `.mjs` runtime code. The `.d.ts` files for the subpath
imports (`@remotion/transitions/wipe` etc.) live in **`dist/presentations/`** —
read the package's own `exports` map (`"types": "./dist/presentations/fade.d.ts"`)
rather than guessing. Mapping to `dist/esm/*` leaves the `TS2307`s in place.

## What the gate found on first green run

Six `TS2344` in three files:
`lib/transitions/presentations/{wipe,scanline-glitch,gradient-wipe}.tsx`.
`@remotion/transitions` constrains `TransitionPresentation<T>` to
`T extends Record<string, unknown>`. TypeScript gives a **type alias** an implicit
index signature but an **interface** none — so exactly the three presentations
that declared their props with `export interface` failed the constraint, while
the nine that used `export type` passed.

Fix: convert those three to `export type`. Declaration-form only — the types are
structurally identical, no runtime code was touched, no transition renders
differently. If you add a presentation, declare its props as a `type`.

## The covered file set is import-driven — guard against it silently shrinking

This gate's coverage isn't declared, it's *derived*: `lib/**` files show up in the program only
because `examples/layered-minimal/src` imports them. Delete an import (e.g. from `src/theme.tsx`)
and the covered set shrinks — `tsc --noEmit` still exits 0, the error count stays **0**, and
nothing says the gate now checks less than it used to. A green run and a quietly-smaller green
run look identical from the exit code alone.

`npm run typecheck` (in `examples/layered-minimal`) runs `tsc --noEmit` and then
`scripts/verify-typecheck-coverage.mjs`, which re-derives the same `--listFiles` counts as the
table above and fails if any of `lib/render/`, `lib/transitions/`, `lib/theming/`,
`lib/reel-config-base/`, `lib/transcripts/` drops below its last-recorded count. Run it directly
with `npm run verify-coverage`. If a count legitimately changes (a file is deliberately deleted
or moved), update `EXPECTED_MINIMUMS` in the script and the counts in this doc's table together
— never let one drift from the other.

## Rules for this gate

- **Never loosen `strict`** (or `noEmit`/`skipLibCheck` semantics) to make an
  error go away.
- **Never change render behaviour to satisfy the checker.** Eleven transition
  kinds still have no at-cut visual confirmation (`docs/superpowers/HANDOFF.md`);
  a "cleanup" there is unverifiable. A narrowing check or a documented non-null
  assertion that provably preserves behaviour is fine. Anything that could alter
  output is a decision for the user, not a fix.
- **Keep `examples/layered-minimal/src/` at zero.** It is additionally pinned by
  `lib/editor/src/example-default-props.test.ts`, which runs the real
  `readDefaultProps` against its `Root.tsx`.
