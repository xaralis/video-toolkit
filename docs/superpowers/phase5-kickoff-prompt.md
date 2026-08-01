# Phase 5 kickoff prompt

Paste the block below to open the next session. It is written to be self-contained: it
assumes no memory of Phase 4 and points at the two documents that carry it.

---

Execute **Phase 5** at `docs/superpowers/phase5-single-mount-design.md` in
`/Users/xaralis/Workspace/progpce/core`. Read it first — it is the spec, and it was written
and reviewed at the end of Phase 4 while the evidence was fresh.

**STATE:** Phase 4 is **COMPLETE and fully reviewed** on `refactor/phase4-node-contract`
@ `0faed98` — six workstreams, two unplanned tasks (R1/R2), 128 commits, final whole-branch
review verdict *mergeable with fixes, no Critical*, and its closing fix wave landed and
re-reviewed. **Not merged. NOT PUSHED** — see "Push first" below. Branch off it or continue
on it; do **not** branch off `main`, which lacks all of it.

**READ FIRST:** `docs/superpowers/HANDOFF.md` — the durable cross-session record. Read the
Phase 4 outcome section, "The final whole-branch review", the Workstreams 3–6 section, the
two laws, the gate-economy policy, and everything down to "Carried out of Phase 4". It
carries the gate table, the traps, and ~37 deferred minors that have no other home.

## What Phase 5 is, and the one thing it must not be mistaken for

Phase 4 established the **NLE node contract**: one node per boundary, differentiated by
*arity* not by being two systems — two inputs, one clamped progress, one shared `ParamField`
descriptor, `alignment`, `enabled`. That is what made `wipe` expressible, made the "exiting
no-op" category cease to exist, and made the trailing edge fall out of the model as
`to === null`. **Phase 5 does not revert any of it.**

What Phase 5 changes is the **rendering strategy** underneath: today a node receives
`from`/`to` as `React.ReactNode` **subtrees it instantiates**, which forces each clip to be
mounted twice around a boundary — the cause of an editor stutter the user reported and of up
to four `<video>` elements alive at one cut. Phase 5 makes a node return a **declarative
two-sided composite plan** that core applies to each clip's **single existing mount**.
Arity 2, one progress, one parameter set, one implementation, `to === null` at the edge:
all preserved. Still exactly one invocation seeing both sides.

**The user's standing requirement, in their words:** *"We need to make sure it is sound,
won't break stuff and will allow for flexibility we're after. We still need an NLE best
practice applied to Remotion world."* If a change would re-open the at-cut defect family
Task 1.3 closed (`wipe`'s simultaneous halves, the exiting no-ops, `checkerboard`'s empty
cells, the undefined trailing edge), **stop and report** rather than trading correctness for
smoothness.

## What the design already settled — do not re-derive

- **17 of 20 catalog kinds are pixel-exact by construction**, 2 need a deliberate
  re-baseline (`rgb-split`, `scanline-glitch`), 1 is a carve-out (`checkerboard`'s
  `scale`/`flip` sub-options), **0 not expressible**.
- **The brand cost is near zero.** Neither brand repo has a line touching `TransitionNode` /
  `composite` / `transitionNodeFor` / `fromRemotionPresentation` / `TransitionRegistry`, and
  neither registers a transition kind. They consume `buildVideoNodes` (signature preserved)
  and `presentationFor`. At the end both bump the pin and re-render — **no brand code change**.
- **It gives back a capability**: a plan adapts *downward* into a one-sided presentation, so
  all 20 kinds become `TransitionSeries`-drivable again. Today four **silently hard-cut**
  there, which is why the gallery needed `NodeTransitionDemo` and why PP's `web-program-intro`
  cannot use `wipe`/`pixelate`/`checkerboard`/`scanline-glitch`.
- **Measured element counts at an interior cut today**: `wipe` 2, `fade`/`pixelate`/
  `fade-to-color` 3, `scanline-glitch` 7, **`checkerboard` 66**. Single-mount is 2 — except
  `rgb-split`, which writes its input 3× and is 6 until its ghosts become an SVG filter.
- **Stage 0 needs no contract change at all**: `checkerboard` as an SVG alpha mask (66→3,
  pixel-exact for its default sub-option) and `scanline-glitch` as an SVG filter (7→3).
- It **deletes** R1's Fix 1+2, R2's `drawnThrough`, `rebased()`, `BOUNDARY_TAIL`, the boundary
  `Sequence`, and `lib/render/preview-environment.ts` entirely — the preview/render divergence
  goes away. That is a benefit; name it when it lands.

**⚠️ THE BIGGEST RISK, named by the design itself:** the 300-cell re-baseline is the **only**
instrument that can prove neutrality, and it is a judgement call. **Stage 1.2's acceptance
criterion — assembly lands, ZERO kinds migrated, every golden byte-identical — exists to
isolate it and MUST NOT be merged into Stage 2.** 60 cells are guaranteed to move
(`glitch` clock origin, `rgb-split`, `scanline-glitch`, `checkerboard` — 15 each); the other
240 are *expected* byte-identical and must be **verified, not assumed**. The 24 bimodal cells
(`clock-wipe` 9, `iris` 7, `light-leak` 8) re-seed at `--repeat=24`.

## Push first, before anyone else touches a brand repo

Both brand repos pin core commits reachable from **no remote branch**, so
`git submodule update` fails for anyone but this machine. roost is at `f71b85d` pinning core
`d5582a8`; PP pins an earlier one. **Ask the user, then push.** This has been open since
2026-07-29 and is the one item that blocks other people rather than the work.

## Gate baselines — hold them, measure, never assume

Measured at `4e1f13f`; **re-derive at your own HEAD rather than trusting these.**

```bash
cd lib/editor && npx vitest run --no-file-parallelism   # 103 files / 1466 (1462 passed, 4 skipped)
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"      # exactly 3, EXIT 2 — check the exit code SEPARATELY
cd examples/layered-minimal && npm run typecheck        # 0 + coverage guard 12/16/26/10/1
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'   # exactly 2, both comments
grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx   # ZERO (escaped — prose matches the unescaped form)
./.venv/bin/python -m pytest video_toolkit/tests/test_sync_template.py -q   # 36 — the FILE, not the suite (the suite is 105; a fix wave already got this wrong once)
cd examples/layered-minimal && npm run pixel-gate:strict          # 300 accepted, 0 drifted, 0 missing, ~60s
```

`npx tsc --noEmit | grep -c 'error TS'` returns **0 when tsc crashes**. Bitten three times.
**Filter the pixel harness while iterating** — `node scripts/render-transition-matrix.mjs wipe
pixelate` renders 30 stills in seconds instead of 300; the unfiltered run is the gate, not the
iteration loop.

## The laws, earned the hard way — they apply to every task

1. **PIN THE WIRING, NOT JUST THE PURE FUNCTION.** Four tasks in Phase 4 shipped a capability
   that was deletable in **one line** with the entire suite green (3.2, 3.3, 4.2, and 6.2 one
   level up — its ten conformance tests pinned a *private copy* of the fixture rather than the
   shipped example). Every one was found by a reviewer's own deletion sweep. **Before
   reporting DONE, delete each line carrying your change and run the full suite.**
2. **USE `git grep` FROM INSIDE THE REPO.** Six occurrences of a text filter manufacturing a
   false result, two in `phase4-migrations.md` itself, one appearing *one task after* that doc
   was corrected for exactly it. Print hits and inspect them; never filter hits away.
3. **ONE RENDER IS NOT EVIDENCE**, in either direction. Renders here are bimodal and
   process-dependent; a frame recorded byte-identical from one sample was re-measured
   nondeterministic at whole-frame Δ25 at a fixed pin. Separate processes are the enumerating
   axis. Never de-list a bimodal cell on absence.
4. **An enumeration presented as exhaustive** has been wrong four times in
   `phase4-migrations.md` alone. Prefer the rule that generates a set over a list of today's
   members.
5. **A brief's premise is not evidence — and neither is a report's claim.** Three briefs were
   wrong on measurement; so was the final fix wave's own report. Re-derive.
6. **The pixel harness cannot see editor mount-lifecycle defects at all** — 300 *independent*
   stills never exercise cross-frame mount reuse. `lib/editor/src/video-track-remount.test.tsx`
   is the gate for that class. Phase 5 changes exactly this area: extend that test, do not
   replace it, and note identity tests are easy to write vacuously (capture the reference
   once, compare with `toBe` — R1 hit both failure shapes).

## Method

Subagent-driven: fresh implementer per task, two-stage review after each, final whole-branch
review on the most capable model. **Model tiers:** sonnet implementers, **opus first review**,
sonnet re-reviews, opus final — escalate an implementer to opus only for genuinely structural
work (Phase 5 Stage 1's contract widening qualifies; Stage 0 does not), and scale a re-review
up when the fix is a rewrite rather than a patch. **Gate economy:** run what the diff can
break, once, in parallel; state every skip and its reason; the exit gate is unchanged, so
nothing ships on a skipped gate.

**Mutation discipline:** for each capability a task claims to ADD, write the test FIRST and
confirm it goes RED against the pre-change tree.

## Constraints

Core-only by default; brand migrations get **written** into
`docs/superpowers/phase4-migrations.md` (or a Phase 5 successor), graded parity-preserving or
deliberate look change. **Ask before editing a brand repo** — PP
`/Users/xaralis/Workspace/progpce/video-toolkit` @ `0e2dfb9`, roost
`/Users/xaralis/Workspace/roost/video-toolkit` @ `f71b85d`. Never edit a `defaultProps`
literal in a brand project; `examples/layered-minimal` is core's and is fair game. zod pinned
exactly `3.22.3`. Commits: repo style, never `Co-Authored-By`, always `--no-gpg-sign`.

## Open items inherited, decide explicitly rather than drifting

- **Widening `BrandLayerItemSchema.kind`** — docs say brand-layer kinds are open, the schema
  closes them to `z.enum(['watermark','disclaimer'])`. The doc half is fixed; the schema half
  is **deferred and unowned**.
- **`_internal/toolkit-registry.json` has 17 dead `tools/<x>.py` paths** — the directory has
  not existed since the package rename. `CLAUDE.md` calls the registry canonical for paths.
  Pre-existing, its own task.
- **Two unpinned edges** found by the final review's deletion sweep: `video-track.tsx`'s
  `{position:'absolute', inset:0}` preview hardening, and `key={b.key}` on the boundary
  `Sequence`. Both vanish if Phase 5 deletes those code paths — check before pinning them.
- **`editorMetaFromTheme` has zero non-test callers** in core or either brand, so Task 4.4's
  editor surface is reachable by no host that exists. Exact parity with the workaround it
  replaced, so not a regression — but "the editor surface shipped" is true only of the
  derivation function.

Only stop for a decision that is genuinely the user's. Otherwise run to done.
