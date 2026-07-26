# Core's type-check gate: `examples/layered-minimal`

**Command:**

```bash
cd examples/layered-minimal && npm run typecheck    # tsc --noEmit
```

**Baseline: 0 errors.** Any error is a regression — there is no pre-existing
noise to filter out. (Established 2026-07-26, on branch `fix/core-has-remotion`.)

## Why this gate exists

Core has two type-check surfaces, and until now they left a hole:

| Surface | Covers | Does **not** cover |
|---|---|---|
| `lib/editor` (`cd lib/editor && npx tsc --noEmit`, baseline **29**) | `src`, `app`, `host`, `../theming` | `lib/render/`, `lib/transitions/` |
| `examples/layered-minimal` (this gate, baseline **0**) | its own `src`, plus every `lib/**` file the render actually pulls in — `lib/render` (9 files), `lib/transitions` (13 files), `lib/theming` (9), `lib/reel-config-base` (8), `lib/transcripts` (1) | anything no reel imports (editor UI, host) |

Before this, the entire render surface — including ~1900 lines of transition
presentations in `lib/transitions/presentations/*.tsx` — was type-checked by
**nothing**. This example was already a complete, installed Remotion 4.0.425
project with its own `tsconfig.json`, `@remotion/transitions`, `react`,
`@types/react` and `typescript`. It was a few config lines from being the gate.

The two surfaces are complementary, not redundant. Keep both green.

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
`lib/editor`, mapping `react` to the JS package took its count from 29 to 101;
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
