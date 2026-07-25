# The zod version contract

**Core and every brand repo pin `zod` at exactly `3.22.3`.** Not a range. Not zod 4.

This is not a style preference — it is a constraint imposed by Remotion, and getting it
wrong produces a **silent** failure (a Studio sidebar in which every field reads
"undefined (not editable)"), not an error. Read the evidence before changing it.

---

## The pin

| Where | Field | Value |
|-------|-------|-------|
| `package.json` (core) | `devDependencies.zod` | `3.22.3` |
| `examples/layered-minimal/package.json` | `dependencies.zod` | `3.22.3` |
| every brand repo's `templates/*/package.json` | `dependencies.zod` | `3.22.3` |

Exact, not `^3.22.0`: `@remotion/zod-types@4.0.425` declares an exact peer,
`peerDependencies: { "zod": "3.22.3" }`. npm does not enforce it — installing zod 4 against
this exact peer raises no ERESOLVE, and PP's own `^3.22.0` currently resolves to `3.25.76`
and behaves correctly (see "Status today" below). So the exact pin here is not npm
enforcing Remotion's peer — it is **us** enforcing it: `3.22.3` is the exact version
Remotion was tested against, and pinning it exactly is how every install is guaranteed to
land on that version rather than on whatever `^3.22.0` happens to resolve to on a given
day.

## Why one version at all

A brand repo vendors core as `toolkit/` and bundles core's schema modules into its own
Remotion build. `lib/project/remotion-config.ts:63` sets a webpack alias `zod$` to the
**project's** zod, resolved from the project root (`defaultResolveZod`, line 31), and
`lib/project/vitest-config.ts` does the same via `dedupe: ['zod']` + `deps.inline`. That is
deliberate — two zod instances break `z.discriminatedUnion` (`instanceof ZodLiteral` fails
across duplicate module instances) — but it means **core's schema code executes against
whatever zod the brand pinned**. Core does not get to have its own.

## What actually decides the version: Remotion

Core's own code is very nearly major-agnostic (see the next section). Remotion is not.

**Remotion 4.0.425** — what `examples/layered-minimal` and PP's `campaign-reels` /
`web-program-intro` pin — is **zod 3 only**:

- `remotion/dist/cjs/Composition.d.ts:3` — `import type { AnyZodObject } from 'zod'`.
  zod 4 has no `AnyZodObject` at its root entry point (only under `zod/v3`).
- `@remotion/zod-types@4.0.425` — `peerDependencies: { "zod": "3.22.3" }`.
- `@remotion/studio@4.0.425`, `.../SchemaEditor/ZodSwitch.js:28-109` — dispatches on
  `schema._def.typeName` against `z.ZodFirstPartyTypeKind`. In zod 4 a schema has
  `_def.type === 'object'` and **no `_def.typeName`**, so every branch misses and the
  function falls through to `ZodNonEditableValue` with `label: \`${typeName} (not
  editable)\``.

**Remotion 4.0.489** — what roost's `roost-reels` pins — supports **both** majors:

- `remotion/dist/cjs/any-zod-type.d.ts` —
  `AnyZodObject = z3.AnyZodObject | z4.$ZodObject | StandaloneZodV3Object`, where the
  third member is documented as "standalone zod v3 (e.g. 3.22.x)".
- `@remotion/zod-types@4.0.489` — no zod peer dependency.
- `@remotion/studio@4.0.489`, `.../SchemaEditor/zod-schema-type.js` — a
  `getZodSchemaType` that normalises v3's `_def.typeName` and v4's `_def.type` to one
  vocabulary, with a `v3TypeNameMap`.

So the supported sets are **{3.22.3}** for Remotion 4.0.425 and **{3.x, 4.x}** for
Remotion 4.0.489. The intersection — the only version that is correct on every template
the toolkit has today — is **3.22.3**.

## Status today

Nothing is currently broken by its own pin, and the pin below prevents a break rather than
repairing one:

- **roost is correct today.** Remotion 4.0.489 genuinely supports zod 4, and
  `roost-reels`'s `src/` imports zod nowhere and passes no `schema=` prop to
  `<Composition>` — so roost's Remotion-4.0.489-plus-zod-4 combination has nothing to trip
  over as things stand.
- **The Studio "(not editable)" failure is scoped to templates that actually pass
  `schema=`.** The only `schema=` consumers anywhere in the toolkit are
  `templates/web-program-intro/src/Root.tsx:12` and 5 `pp-program-*` projects — all on
  Remotion 4.0.425, and all **already on zod 3**. So that failure mode is a guardrail
  against ever moving PP to zod 4 while it stays on Remotion 4.0.425, not a live defect —
  and it is not, by itself, an argument for moving roost.
- **The actual case for moving roost** is uniformity across brands — one exercised zod
  major running everywhere — plus the `ZodNumber.minValue` divergence in core's own shared
  schema code (next section): without the move, that divergence is exercised only by
  roost, on a major core's CI does not run.

## What core's own code does and does not care about

Measured, not assumed: the full core suite was run against zod 4.4.3 by aliasing `zod` in
a scratch copy of `lib/editor/vitest.config.ts`. Result: **560 passed, 1 failed** — so
core is *almost* major-agnostic, with exactly one real divergence.

Compatible with both majors (verified by direct probe on zod 3.22.3 and zod 4.4.3):

- `z.record(z.string(), z.unknown())` — `layered-schema.ts:15,45,46,58,65,97`. The
  **2-argument** form is required by zod 4 and accepted by zod 3, and core already uses
  it everywhere. Never write the 1-arg `z.record(z.unknown())`.
- `.passthrough()` — `layered-schema.ts:26` (`EffectSchema`). Still present in zod 4's
  *classic* entry point (deprecated in favour of `z.looseObject`), and still keeps extra
  keys. It is absent from `zod/v4-mini` only.
- `z.discriminatedUnion` with `z.literal` discriminants built from a derived catalog —
  `transition-schema.ts:337`, `layered-schema.ts:61`.
- The `AccentKey` marker in `transition-schema.ts:60-71`, which patches an instance's own
  `describe()` so clones stay in `ACCENT_SCHEMAS`. `.describe()` clones in both majors,
  `.optional()`/`.default()` wrap rather than clone in both, and the patch survives every
  chain order tested.
- `_def.innerType` unwrapping (`transition-schema.ts:405-407`), `instanceof z.ZodEnum` /
  `ZodNumber` / `ZodBoolean`, `ZodEnum.options`, `.isOptional()`, `ZodObject.shape`.

**The one divergence — `ZodNumber.minValue`:**

| | `z.number().minValue` (unbounded) | `z.number().min(1).minValue` |
|---|---|---|
| zod 3.22.3 | `null` | `1` |
| zod 4.4.3 | `-Infinity` | `1` |

`defaultValueForField` (`lib/reel-config-base/transition-schema.ts:514`) used to read
`inner.minValue ?? 0`. Under zod 4 that would have seeded a **required, unbounded** number
field with `-Infinity` instead of `0` the moment a catalog kind added one — no catalog kind
did at the time this was written, so the failure was latent, caught only by
`lib/editor/app/transitions.test.ts:453`, which pins the rule ahead of any kind depending
on it.

**Fixed.** The guard is now `Number.isFinite(min) ? min : 0`, which is behaviour-identical
on zod 3 (`null` is not finite, so the result is still `0`) and correct on zod 4. This is
no longer a zod-4 prerequisite — it is done, and the existing test above covers it
unchanged (verified by mutation: forcing the fallback to a wrong value fails that test).

## How the mismatch presents if ignored

None of these throw. That is the point.

1. **zod 4 schema + Remotion 4.0.425 Studio** — every field in the schema sidebar renders
   as `undefined (not editable)`. No console error. This is the same failure shape the
   Phase 1 handoff records for the `AccentKey` marker ("a field with no editor control at
   all, with no warning"), and it is why this was worth closing rather than tolerating.
2. **Type level** — `import type { AnyZodObject } from 'zod'` inside Remotion 4.0.425's
   `.d.ts` fails under zod 4 (`TS2724: '"zod"' has no exported member named
   'AnyZodObject'`). All three templates set `skipLibCheck: true`, so this is **masked**
   — it will not show up in `tsc --noEmit`. Do not treat a green typecheck as evidence
   the pin is fine.
3. **Two instances of zod in one bundle** — `z.discriminatedUnion` stops recognising the
   other instance's literals ("discriminator value for key `type` could not be
   extracted"). This one *does* throw, and is what the `zod$` alias and vitest `dedupe`
   exist to prevent.

## What would change this decision

Move every template to **Remotion ≥ 4.0.489**. That version drops the exact zod peer,
type-accepts both majors, and normalises v3/v4 in the Studio schema editor — at which
point zod 4 becomes viable toolkit-wide. The prerequisites, in order:

1. Upgrade PP's `campaign-reels` and `web-program-intro` (and core's
   `examples/layered-minimal`) from Remotion 4.0.425 to ≥ 4.0.489.
2. ~~Guard `defaultValueForField` against a non-finite `minValue`, with a test.~~ Done —
   see "The one divergence" above. No longer blocks this move.
3. Re-run the core suite against zod 4 and expect 561/561.
4. Flip this document and all four pins together, in one change.

Anything short of all four leaves one template silently editor-less.

## A pin guard, if one gets added later

Nothing today enforces the pin at install or build time (see "How the mismatch presents
if ignored" above — neither npm nor `tsc` catches it). A cheap fix would be a core-side
assertion in `applyToolkitWebpack` / `createToolkitVitestConfig` that the resolved zod
major is 3. **That guard is deliberately not implemented yet, and if it is added, it must
respect two constraints:**

- **Sequencing: it can only land *after* roost migrates to `3.22.3`.** Added today, it
  would fire the moment any consuming repo's `toolkit/` submodule pin advances — and the
  one repo currently running zod 4 is roost, which per "Status today" above is *correct*
  today. A guard added now would break the one repo that isn't broken.
- **Warn, not throw.** A hard assertion turns a brand's routine `toolkit/` submodule bump
  into a hard stop the moment their own `package.json` drifts from the pin, for reasons
  that may have nothing to do with the bump itself. Log a warning identifying the resolved
  version and pointing at this document; do not fail the build.
