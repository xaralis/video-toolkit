# Follow-up: core DOES have remotion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct a false premise that was propagated through Phase 2 — "core has no
`remotion` installed" — and collect the coverage that premise cost us.

**Architecture:** Core has `remotion` twice over: 4.0.498 in `lib/editor/node_modules` (a
hard dependency of `@remotion/player`, which core itself declares), and a *complete*
Remotion 4.0.425 project in `examples/layered-minimal` (with `@remotion/transitions`,
`react`, `@types/react` and `typescript`). Three existing tests already
`vi.mock('remotion', …)`. Only `at-cut-transitions.tsx` was genuinely untestable, because
it imports `@remotion/transitions/*`, which is absent from `lib/editor/node_modules` — and
present in the example. This plan makes both facts explicit rather than accidental, tests
what the false premise left untested, and turns the example into a real type-check gate
over `lib/render/` and `lib/transitions/`, which today have **zero** type coverage.

**Tech Stack:** TypeScript, Vitest 2 + jsdom, Remotion 4.0.x, React.

## Global Constraints

- **Test baseline: 55 files / 564 tests.** Never finish below it; new tests only add.
- **`tsc --noEmit` in `lib/editor`: 34 pre-existing errors.** Add none.
- **Brand-leak gate** must keep returning exactly its 2 known pre-existing hits (comments
  in `lib/theming/segment/SegmentMedia.tsx`, `lib/transitions/presentations/burn.tsx`):
  `grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'`
- **Core-only.** `~/Workspace/progpce/video-toolkit` and `~/Workspace/roost/video-toolkit`
  are READ-ONLY reference and are currently clean. Brand changes are written as
  paste-ready migrations, never applied.
- **Rendering an existing baked `LayeredReel` literal must not change.** This plan adds
  tests and type coverage; it must not change render output. Any behaviour change found
  necessary is a finding to report, not a silent fix.
- **Commits:** repo style, imperative subject, never `Co-Authored-By`. Commit signing is
  broken (1Password "failed to fill whole buffer") — use `--no-gpg-sign` from the start.

### Measured facts this plan rests on — do not re-derive, do not assume

- `examples/layered-minimal/src/` type-checks **clean** against a real `<Composition>`
  today, and a negative test (`totalDurationMs` → a string) errors correctly. So
  `layeredCompositionProps`'s inference is **not** defeated: Phase 2's stated top residual
  risk is **closed, favorably**.
- `examples/layered-minimal` currently reports **151** tsc errors, almost all bare-specifier
  resolution failures from `lib/**/*.tsx` files that sit outside the example's
  `node_modules` ancestry. With `paths` entries for `remotion`, `@remotion/transitions/*`,
  `react` and `react/jsx-runtime` (mapping react to **`@types/react`**, not to
  `node_modules/react`, or every consumer goes implicitly `any`), that falls to **39**:
  21× `TS18048` (possibly-undefined) concentrated in the transition presentations,
  17× `TS2307`, 1× `TS7053`. `src/` is clean either way.

---

## Task 1: Make the remotion dependency explicit, and test `loadBrandFonts`

**Files:**
- Modify: `lib/editor/package.json`
- Test: `lib/editor/src/load-fonts.test.ts` (create)
- Modify: `lib/render/README.md`

**Why:** `remotion` reaches core's tests only by npm hoisting it out of `@remotion/player`.
If `@remotion/player` ever moved it to a peer dependency, or npm hoisted differently, the
alias in `lib/editor/vitest.config.ts:20` would resolve nothing and the failure would look
like anything but its cause. Declaring it makes a fact the config already depends on
intentional. `@remotion/transitions` is added for Task 3.

Then collect what the false premise cost: `loadBrandFonts` shipped with **no** test, on the
stated grounds that core cannot test remotion-importing modules — which is untrue, and
which `lib/editor/src/{segment-media,generic-watermark,text-overlay-base}.test.tsx` already
disprove three times over. Read one of those for the established mocking shape before writing.

- [ ] **Step 1: Declare the dependencies**

In `lib/editor/package.json` `devDependencies`, add `"remotion": "4.0.x"` and
`"@remotion/transitions": "4.0.x"` (matching the existing `"@remotion/player": "4.0.x"`
style), then install:

```bash
cd lib/editor && npm install
```

Confirm the tree still resolves the same major, and that `npx vitest run` is unchanged at
55 files / 564 tests. If `npm install` wants to change unrelated lockfile entries, keep the
diff to the two additions and say so in the report.

- [ ] **Step 2: Write the failing test**

Create `lib/editor/src/load-fonts.test.ts`. `loadBrandFonts` holds module-level state, so
each test needs a fresh module — use `vi.resetModules()` + a dynamic `import()`, and mock
`remotion` so `delayRender`/`continueRender`/`staticFile` are observable. Cover:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const delayRender = vi.fn(() => 42);
const continueRender = vi.fn();

vi.mock('remotion', () => ({
  delayRender: (...a: unknown[]) => delayRender(...a),
  continueRender: (...a: unknown[]) => continueRender(...a),
  staticFile: (p: string) => `/static/${p}`,
}));

// A FontFace test double: records construction and resolves/rejects load() on demand.
class FakeFontFace {
  static made: Array<{ family: string; src: string; desc: unknown }> = [];
  static mode: 'resolve' | 'reject' = 'resolve';
  constructor(public family: string, public src: string, public desc: unknown) {
    FakeFontFace.made.push({ family, src, desc });
  }
  load() {
    return FakeFontFace.mode === 'resolve' ? Promise.resolve(this) : Promise.reject(new Error('boom'));
  }
}

const load = async () => (await import('@video-toolkit/lib/render/load-fonts')).loadBrandFonts;

beforeEach(() => {
  vi.resetModules();
  delayRender.mockClear();
  continueRender.mockClear();
  FakeFontFace.made = [];
  FakeFontFace.mode = 'resolve';
  vi.stubGlobal('FontFace', FakeFontFace);
  vi.stubGlobal('document', { ...document, fonts: { add: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

const FONTS = [{ family: 'Geist', file: 'fonts/Geist-Bold.ttf', weight: '700' }];

describe('loadBrandFonts', () => {
  it('passes the render-concurrency hardening to delayRender', async () => {
    // THE headline claim of the task that introduced this function: the timeout+retries
    // fix that existed in one of three brand copies is now everyone's default. Under
    // multi-tab render concurrency, fresh browser contexts re-reading TTFs can exceed
    // Remotion's 28s default — the flake that used to force --concurrency=1.
    (await load())(FONTS);
    expect(delayRender).toHaveBeenCalledWith('Loading brand fonts', {
      timeoutInMilliseconds: 120_000,
      retries: 2,
    });
  });

  it('lets the caller override the label, timeout and retries', async () => {
    (await load())(FONTS, { label: 'X', timeoutInMilliseconds: 1, retries: 0 });
    expect(delayRender).toHaveBeenCalledWith('X', { timeoutInMilliseconds: 1, retries: 0 });
  });

  it('builds one FontFace per spec, through staticFile, with the normalised descriptors', async () => {
    (await load())([...FONTS, { family: 'JBM', file: 'fonts/JBM.ttf' }]);
    expect(FakeFontFace.made).toEqual([
      { family: 'Geist', src: 'url(/static/fonts/Geist-Bold.ttf)', desc: { weight: '700', style: 'normal', display: 'block' } },
      { family: 'JBM', src: 'url(/static/fonts/JBM.ttf)', desc: { weight: '400', style: 'normal', display: 'block' } },
    ]);
  });

  it('registers the faces and clears the handle once they load', async () => {
    const fn = await load();
    fn(FONTS);
    await vi.waitFor(() => expect(continueRender).toHaveBeenCalledWith(42));
  });

  it('ALWAYS clears the handle, even when a font fails to load', async () => {
    // An unresolved delayRender hangs the entire render. Losing a font is cosmetic;
    // hanging is total — so the catch path must still continueRender.
    FakeFontFace.mode = 'reject';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (await load())(FONTS);
    await vi.waitFor(() => expect(continueRender).toHaveBeenCalledWith(42));
  });

  it('does not call delayRender for an empty font list', async () => {
    (await load())([]);
    expect(delayRender).not.toHaveBeenCalled();
  });

  it('is a no-op under SSR, where there is no document', async () => {
    vi.stubGlobal('document', undefined);
    (await load())(FONTS);
    expect(delayRender).not.toHaveBeenCalled();
  });

  it('ignores a second call — the module-level guard is per-realm, NOT per-composition', async () => {
    // Documented hazard: Studio can mount several compositions in one realm, and a second
    // brand's fonts would then silently never load. This test pins the CURRENT behaviour
    // so the limitation is visible in the suite rather than only in prose.
    const fn = await load();
    fn(FONTS);
    fn([{ family: 'Other', file: 'other.ttf' }]);
    expect(delayRender).toHaveBeenCalledTimes(1);
    expect(FakeFontFace.made.map((f) => f.family)).toEqual(['Geist']);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd lib/editor && npx vitest run src/load-fonts.test.ts
```

Expected: FAIL until the mocking shape is right. `loadBrandFonts` should need **no**
production change — it is being tested, not fixed. If a test cannot be made to pass without
touching `lib/render/load-fonts.ts`, stop and report that as a finding: it means the module
has a real defect, and changing it needs a decision, not a quiet edit.

- [ ] **Step 4: Make it pass, then verify by mutation**

For each of the eight tests, break the line it targets in `lib/render/load-fonts.ts`
(drop the `retries` default; drop the `?? 'Loading brand fonts'`; remove the
`fonts.length === 0` guard; remove the `typeof document === 'undefined'` guard; delete the
`continueRender` from the `.catch`; delete the `handle !== null` guard), confirm the named
test fails, restore. Report each outcome. A test that does not kill its mutant is a defect.

- [ ] **Step 5: Correct the false claim in `lib/render/README.md`**

Line ~9 says `load-fonts.ts` "is not unit-tested here for the same reason as
`at-cut-transitions.tsx`". That reason never applied: `remotion` is available. Replace it
with what is now true — the module is unit-tested in `lib/editor/src/load-fonts.test.ts`
against a mocked `remotion` — and state the *real* distinction the pure/JSX split rests on:
`at-cut-transitions.tsx` needs `@remotion/transitions`, which is a different matter (and
which Task 3 addresses). Do not overstate: keep saying that a module importing `remotion`
still cannot be *rendered* here.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/package.json lib/editor/package-lock.json lib/editor/src/load-fonts.test.ts lib/render/README.md && git commit --no-gpg-sign -m "test(render): cover loadBrandFonts, and declare the remotion dep it always had"
```

---

## Task 2: Turn `examples/layered-minimal` into a type-check gate

**Files:**
- Modify: `examples/layered-minimal/tsconfig.json`
- Modify: `examples/layered-minimal/package.json` (a `typecheck` script)
- Modify: `examples/layered-minimal/README.md`
- Create: `docs/superpowers/core-typecheck-gate.md`

**Why:** `lib/editor/tsconfig.json` includes only `src`, `app`, `host` and `../theming`.
`lib/render/` and `lib/transitions/` — the entire render surface, 1900+ lines of transition
presentations — are checked by **nothing**. The example already has a full Remotion install
and a tsconfig; it is a few lines away from being the gate that covers them.

- [ ] **Step 1: Reproduce the baseline**

```bash
cd examples/layered-minimal && npx tsc --noEmit 2>&1 | grep -c 'error TS'
```

Expected: 151. Save the full output; you will diff against it.

- [ ] **Step 2: Add the `paths` mappings**

`lib/**/*.tsx` reaches this project through the `@video-toolkit/lib/*` path mapping, but it
physically lives outside the project tree, so TypeScript's own node_modules walk (upward
from each importing file) never reaches `examples/layered-minimal/node_modules`. Map the
bare specifiers those files need. **Map `react` to `@types/react`, not to
`node_modules/react`** — pointing at the JS package makes every consumer implicitly `any`
and silently deletes the type coverage this task exists to add.

```jsonc
"paths": {
  "@video-toolkit/lib/*": ["../../lib/*"],
  "remotion": ["./node_modules/remotion"],
  "@remotion/transitions/*": ["./node_modules/@remotion/transitions/dist/esm/*"],
  "react": ["./node_modules/@types/react"],
  "react/jsx-runtime": ["./node_modules/@types/react/jsx-runtime"]
}
```

Verify the `@remotion/transitions/*` target resolves — the measured run still had 17
`TS2307`, so that mapping is probably not yet right. Inspect the package's actual layout
(`ls node_modules/@remotion/transitions`, and read its `package.json` `exports`) and map to
whatever really holds the declarations. Getting from 39 to as few as possible is the point
of this step; report the number you reach and what each remaining `TS2307` is.

- [ ] **Step 3: Triage what the gate reveals**

Expect ~21 `TS18048` ("possibly undefined"), concentrated in
`lib/transitions/presentations/*.tsx`, plus a `TS7053`. For each, decide and record:

- a **real** latent bug → fix it, and add or point at a test;
- a false positive from a genuinely-safe access → make the safety explicit in code (a
  narrowing check or a documented non-null assertion), never by loosening `strict`;
- not resolvable now → leave it and record it in the baseline file below.

**Do not change render behaviour to satisfy the type checker.** These modules are the
transition presentations, and eleven of their kinds already have no at-cut visual
confirmation (see `docs/superpowers/HANDOFF.md`). If a fix would alter what a transition
renders, stop and report it — that is a decision, not a cleanup.

- [ ] **Step 4: Make it runnable and recorded**

Add to `examples/layered-minimal/package.json`:

```json
"typecheck": "tsc --noEmit"
```

Create `docs/superpowers/core-typecheck-gate.md` recording: what the gate covers that
`lib/editor` does not, exactly why the `paths` entries are needed (out-of-tree files cannot
walk up to this project's `node_modules` — the same class of problem `resolve.modules`
solves for webpack and the transitions re-resolver solves for Vite), the `@types/react`
trap from Step 2, the command, and the **numeric baseline you finish at** so the next person
can tell a regression from a pre-existing error. Cross-link it from `lib/render/README.md`.

- [ ] **Step 5: Verify and commit**

```bash
cd examples/layered-minimal && npx tsc --noEmit 2>&1 | grep -c 'error TS'   # your new baseline
cd ../../lib/editor && npx vitest run                                       # still 55 / 564+
```

`examples/layered-minimal/src/` must remain at **zero** errors.

```bash
git add examples/layered-minimal docs/superpowers/core-typecheck-gate.md lib/render/README.md && git commit --no-gpg-sign -m "chore(examples): make layered-minimal a type-check gate over lib/render and lib/transitions"
```

---

## Task 3: Cover `at-cut-transitions.tsx`

**Files:**
- Test: `lib/editor/src/at-cut-transitions.test.tsx` (create)
- Modify: `lib/render/README.md`
- Modify: `docs/superpowers/HANDOFF.md`

**Why:** this is the one module the "no remotion" claim was *right* about — it imports
`@remotion/transitions/*`. Task 1 installed that package, so the reason is gone. It matters
because `HANDOFF.md` carries an open risk: **11 transition kinds have no at-cut visual
confirmation** — the six wired in during Phase 1 plus `wipe`, `glitch`, `whip-pan`,
`zoom-through`, `gradient-wipe`. Only `burn` is confirmed. At-cut composites differently
from the `TransitionSeries` path (handle-borrowed overlap, not a shrinking sequence), so a
presentation that looks right in `showcase/transitions` can still misbehave at a cut.

**Be honest about what a unit test can and cannot settle.** It cannot confirm that a
transition *looks* right — that needs a render, which core still cannot do. It can confirm
the wiring: that every catalog kind resolves to a presentation, that none throws when
mounted, that direction/params reach the presentation, and that the accent palette resolves.
Aim at exactly that, and say so plainly in what you write. Do not let this task's output
imply the visual risk is closed — it is not.

- [ ] **Step 1: Read the module and the catalog first**

Read `lib/render/at-cut-transitions.tsx`, `lib/render/transition-record.ts` and the
`CATALOG` in `lib/reel-config-base/transition-schema.ts`. Establish the real list of kinds
from `CATALOG` rather than hardcoding one — a test that hardcodes a list stops covering new
kinds the day someone adds one.

- [ ] **Step 2: Write the failing test**

Create `lib/editor/src/at-cut-transitions.test.tsx`. Drive it from the catalog:

```tsx
// Every kind the catalog declares must resolve to a mountable presentation. This is a
// WIRING test, not a visual one: core cannot render, so "looks right at a cut" stays
// unconfirmed (see docs/superpowers/HANDOFF.md).
const KINDS = CATALOG.map((entry) => entry.kind);

describe.each(KINDS)('transition kind %s', (kind) => {
  it('resolves to a presentation and mounts without throwing', () => { /* … */ });
  it('carries its authored params through to the presentation', () => { /* … */ });
});
```

Fill those in against the module's real API. Include a case that a kind carrying an accent
key resolves through the palette rather than falling back to a default colour, and a case
covering the direction-branching that the handoff names as a specific suspect
(`checkerboard`'s cell clipping, `pixelate`'s opaque black root).

Mock `remotion`'s `useCurrentFrame` as the existing component tests do; let the real
`@remotion/transitions` presentations load, since Task 1 installed them.

- [ ] **Step 3: Run, implement nothing, report anything real**

```bash
cd lib/editor && npx vitest run src/at-cut-transitions.test.tsx
```

This task adds coverage to existing code. If a test fails, you have found a real defect —
**report it, do not fix it silently.** Several of these kinds have never been executed by
anything; a genuine failure here is the most valuable output this plan can produce, and it
needs a decision about render behaviour before any change.

- [ ] **Step 4: Update the open-risk entry honestly**

In `docs/superpowers/HANDOFF.md`, amend the "11 transition kinds have no at-cut visual
confirmation" entry: say precisely which of them now have *wiring* coverage and which
still have no *visual* confirmation, and that the second still needs a render in a brand
repo. Do not downgrade the risk further than the evidence supports.

- [ ] **Step 5: Commit**

```bash
git add lib/editor/src/at-cut-transitions.test.tsx lib/render/README.md docs/superpowers/HANDOFF.md && git commit --no-gpg-sign -m "test(render): wiring coverage for every at-cut transition kind"
```

---

## Task 4: Correct the record, and rewrite migration B

**Files:**
- Modify: `docs/superpowers/HANDOFF.md`
- Modify: `docs/superpowers/phase2-migrations.md`
- Modify: `CLAUDE.md` (only if a claim there is now wrong)

**Why:** the false premise is written into the durable record, where it will mislead the
next phase exactly as it misled this one. And the user has decided how migration B should
resolve.

- [ ] **Step 1: Fix the false claims**

`docs/superpowers/HANDOFF.md:270` states "Core has no `remotion` installed, so anything
importing it cannot be unit tested here." Replace it with the measured truth:

- `remotion` 4.0.498 resolves in `lib/editor/node_modules` as a hard dependency of
  `@remotion/player` — and is now declared outright (Task 1);
- `examples/layered-minimal` is a complete Remotion 4.0.425 project, which is what makes
  the type-check gate possible (Task 2);
- a module importing `remotion` **can** be unit-tested with `vi.mock('remotion')`, as
  `segment-media`, `generic-watermark`, `text-overlay-base` and now `load-fonts` all do;
- what core still cannot do is **render**.

Then check `HANDOFF.md:247`, which uses the same false reason to explain why
`layeredCompositionProps` was never type-checked against a real `<Composition>` — see Step 2.

- [ ] **Step 2: Record that the top residual risk is closed**

`HANDOFF.md` names as Phase 2's top residual risk that `layeredCompositionProps` has never
been type-checked against a real Remotion `<Composition>`, and that its unconstrained `<C>`
might silently loosen a brand's `defaultProps` check. That is now settled **favorably**, by
measurement:

- `examples/layered-minimal/src/` type-checks clean against the real `<Composition>`;
- a negative test — changing `totalDurationMs` to a string — produces
  `error TS2322: Type 'string' is not assignable to type 'number'`, so the check is real
  and not vacuous.

Reproduce both yourself before writing them down. Then rewrite the entry as closed, keeping
the negative-test evidence, and remove the corresponding "check this first" instruction from
`phase2-migrations.md`'s verification section — replacing it with the one thing still worth
doing on the brand side.

- [ ] **Step 3: Rewrite migration B for `roostReelDurationInFrames`**

The user has decided: **it must go, replaced by a suitable alternative, and bit-identity is
explicitly not required.** So the migration is no longer a warning about a behavioural
difference — it is a straight replacement with core's `layeredDurationInFrames`.

Rewrite the item with: the deletion of the export from both
`templates/roost-reels/src/LayeredRoostReel.tsx` and
`projects/roost-reel-01/src/LayeredRoostReel.tsx`; the import of `layeredDurationInFrames`
from `@video-toolkit/lib/render/layered-composition-props`; and the updated call at
`projects/roost-reel-01/src/LayeredRoostReel.tsx:141`, which uses it to size a music
fade-out. Verify that line and the template's own usage against the read-only repo before
writing the before/after.

State the one real difference plainly and then dismiss it with its own numbers: core's
function applies a `Math.max(60, …)` floor, so the two disagree only for reels shorter than
2 seconds, and the affected reel is 17.5 s. Keep the item's severity marker accurate — with
the export deleted, a missed call site is **tsc-caught**.

- [ ] **Step 4: Verify and commit**

```bash
cd lib/editor && npx vitest run
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'
```

Re-read both documents end to end before committing — four tasks have edited them, and a
document edited in pieces is where contradictions hide.

```bash
git add docs CLAUDE.md && git commit --no-gpg-sign -m "docs: correct the 'core has no remotion' claim and close the composition-props risk"
```

---

## Verification summary

| Gate | Command | Expected |
|---|---|---|
| Tests | `cd lib/editor && npx vitest run` | ≥ 564, all green |
| Editor types | `cd lib/editor && npx tsc --noEmit` | 34, the pre-existing baseline |
| **Render/transition types (new)** | `cd examples/layered-minimal && npm run typecheck` | the Task 2 baseline; `src/` at zero |
| Brand leak | the `grep -riE` above | exactly the 2 known hits |
| Brand repos untouched | `git status --short` in both | empty |
