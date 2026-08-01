# Phase 5 kickoff — Stage 2 onward (paste-ready)

> Self-contained prompt for the next session. Everything below is intended to be pasted as-is.

---

Continue Phase 5 (single-mount transitions) in `/Users/xaralis/Workspace/progpce/core`, on branch
`refactor/phase5-single-mount` @ `026d2a2`. The spec is
`docs/superpowers/phase5-single-mount-design.md`; read it, but read the two warnings about it below
first.

**STATE: Stages 0 and 1 are COMPLETE, plus a controller-scheduled Task 1.4. 16 commits, pushed, not
merged.** Stage 2 has not started. Task 2.1 is fully briefed at
`.superpowers/sdd/phase5-single-mount-design/task-2.1-brief.md` and is the next thing to dispatch.

**READ FIRST:** `docs/superpowers/HANDOFF.md` — specifically the section **"🟡 Phase 5 —
single-mount transitions"**, and the naming-collision warning in "The programme" table above it.
That section carries the gate table, the four design-document corrections, the method findings and
the carried items, and it is the durable record. The working ledger at
`.superpowers/sdd/phase5-single-mount-design/progress.md` is gitignored, present on this machine
only, and has the per-task detail including every deferred minor.

## What Phase 5 is, and the one thing it must not be mistaken for

Phase 4 established the NLE node contract: one node per boundary, differentiated by **arity, not by
being two systems** — two inputs, one clamped progress, one shared `ParamField` descriptor,
`alignment`, `enabled`. That is what made `wipe` expressible, made the "exiting no-op" category
cease to exist, and made the trailing edge fall out of the model as `to === null`. **Phase 5 does
not revert any of it.**

What Phase 5 changes is the rendering strategy underneath: a node stops returning `from`/`to` as
`React.ReactNode` subtrees it instantiates — which forces each clip to be mounted twice around a
boundary, the cause of the editor stutter the user reported — and starts returning a declarative
two-sided composite plan that core applies to each clip's **single existing mount**. Arity 2, one
progress, one parameter set, one implementation, `to === null` at the edge: all preserved. Still
exactly one invocation seeing both sides.

The user's standing requirement, in their words: *"We need to make sure it is sound, won't break
stuff and will allow for flexibility we're after. We still need an NLE best practice applied to
Remotion world."* If a change would re-open the at-cut defect family Phase 4's Task 1.3 closed
(`wipe`'s simultaneous halves, the exiting no-ops, `checkerboard`'s empty cells, the undefined
trailing edge), **stop and report rather than trading correctness for smoothness.**

## ⚠️ The design document's architecture has held. Four of its concrete prescriptions have not.

Every structural claim it makes has survived measurement. Four specific instructions in it were
**measured wrong** and are now corrected in place, in the document itself. Expect a fifth; verify
before building.

1. §2.4's `checkerboard` row prescribed a **CSS `mask` on a div** — that renders the layer *fully
   invisible* in this renderer. The working technique is `burn.tsx`'s `<foreignObject mask>` +
   `maskUnits="userSpaceOnUse"` + pixel geometry. (CSS `filter: url(...)` is a different property
   and works fine — that is what `glitch` uses.)
2. §2.3 named the new per-frame props bag `TransitionRenderProps` — **an identifier that already
   exists**, is exported, has 16 references across 4 files and means something else. The new bag is
   **`TransitionPlanProps`**.
3. §2.6 specified `isolation: 'isolate'` **unconditionally**; measured, that drifts **37 of 300
   goldens plus 24 fatal NEARs** with zero kinds migrated. It ships **conditional on the reel
   containing a plan boundary**, reviewed and upheld on the merits.
4. §4.6 promised a `warnOnce` for unstable `wrap`. Only `ghosts.length` variance has one. A dev
   warning for brand authors — who never run core's test suite — is a real gap and **unscheduled**.

Also settled: `LayerHandle.source` is **retired** (it could only ever be `'clip'`; `from === null`
already carries the whole meaning), and `LayerOp.wrap` now mounts **life-long with an `active`
prop**, single-sourced from the structural sample.

## What is next

**Task 2.1** — migrate the six `fromRemotionPresentation` kinds (`fade`, `dissolve`, `slide`,
`flip`, `clock-wipe`, `iris`, plus `fade-to-color`'s no-colour fallback) onto `LayerOp.wrap`. The
brief is written and carries three things a successor must not lose:

- **This task's golden run is the plan path's FIRST PIXEL EVIDENCE, not a regression check.** Every
  task so far rendered a plan path that drew nothing. A moved cell means "the plan path draws
  differently", and must be adjudicated **against a hand-inspected picture, not a hash**.
- **Two effects will be mixed in whatever moves**: the `isolate` flag flipping on for a reel with a
  plan boundary, and the migration itself. Separate them by rendering the six kinds with the flag
  forced on *while still unmigrated*. The 37 drifting cells named `light-leak`, `whip-pan`,
  `zoom-blur`, `pixelate`, `scanline-glitch`, `rgb-split` — none of the six — **but that is an
  inference from a list, not a measurement.**
- **`clock-wipe` (9) and `iris` (7) carry 16 of the 24 bimodal cells**, whose second recorded hash
  came from a DOM arrangement that will no longer exist. Re-seed with `--repeat`; never de-list a
  bimodal cell on absence.

Then: **2.2** (`wipe`, `fade-to-color`, `pixelate`, `gradient-wipe`) · **2.3** (`burn`, `glitch` —
15 cells move on clock origin — `light-leak`, `whip-pan`, `zoom-through`, `zoom-blur`) · **3**
(`rgb-split`, `scanline-glitch`) · **4** (`checkerboard`'s carve-out) · **5** (the flip: delete the
`composite` arm and §6's deletion table, full 300-cell re-baseline reviewed, re-seed the bimodals,
write `phase5-migrations.md`, bump both brand pins).

## Gate baselines — measured at `637e141`. Re-derive at your own HEAD.

```
cd lib/editor && npx vitest run --no-file-parallelism      # 107 files / 1717 (1713 passed, 4 skipped)
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"          # exactly 3, EXIT 2 — same three files, check IDENTITY
cd examples/layered-minimal && npm run typecheck            # 0 + coverage guard 13/16/26/10/1
grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'   # exactly 2
grep -n 'it\.fails' lib/editor/src/at-cut-transitions.test.tsx    # ZERO (escaped — prose matches the unescaped form)
./.venv/bin/python -m pytest video_toolkit/tests/test_sync_template.py -q    # 36 — the FILE, not the suite (the suite is 105)
cd examples/layered-minimal && npm run pixel-gate:strict    # 300 accepted, 0 drifted, 0 missing
```

`npx tsc --noEmit | grep -c 'error TS'` returns **0 when tsc crashes** — bitten three times; read
the exit code separately. **Filter the pixel harness while iterating**:
`node scripts/render-transition-matrix.mjs fade iris` renders 30 stills in seconds instead of 300.
The unfiltered run is the gate, not the iteration loop.

## The laws, earned the hard way — they apply to every task

1. **PIN THE WIRING, NOT JUST THE PURE FUNCTION.** A capability has shipped one-line-deletable with
   a fully green suite **six times** in this programme, and **every single one was found by a
   reviewer's deletion sweep, never the implementer's.** Before reporting DONE, delete each line
   carrying your change and run the suite.
2. **The deletion sweep's own method has failed twice, one level up each time.** A capability-list
   sweep missed five delivery lines; an axis-enumerated sweep then missed six more, two of them
   inside an axis that had just been declared complete — because "the props bag" and "shell/host"
   are *themselves lists*. **Prefer the rule that generates the set**: derived pins
   (`Record<keyof Props, predicate>` so the compiler demands an entry per member), each with a
   vacuity guard that is **itself mutation-tested**.
3. **USE `git grep` FROM INSIDE THE REPO.** Six occurrences of a text filter manufacturing a false
   result. Print hits and inspect them; never filter hits away.
4. **ONE RENDER IS NOT EVIDENCE, in either direction.** Renders here are bimodal and
   process-dependent; separate processes are the enumerating axis.
5. **A brief's premise is not evidence — and neither is a report's claim.** Both have been wrong
   repeatedly, including a fix wave's own report. Re-derive.
6. **The pixel harness cannot see editor mount-lifecycle defects at all** — 300 independent stills
   never exercise cross-frame mount reuse. `lib/editor/src/video-track-remount.test.tsx` is the gate
   for that class, and it now carries a **derived ratchet**: plan kinds must pass DOM identity,
   composite kinds are asserted to **fail** it, and the partition is pinned. Migrating a kind moves
   it across that partition, which is what makes a migration impossible to do quietly.
7. **Date a hazard from the design's §7, never from a code comment.** Two hazards were dated one
   stage late that way.
8. **When a proof fails, fix the formulation, not the fixture.** A tolerance proof that failed on
   the incoming side was "fixed" by relocating it to the outgoing side, where the question was
   already settled — true on the easy case, false on half the real ones.
9. **Do not let a comment claim something no test enforces.** Three comments this phase had to be
   walked back for exactly that.

## Method

Subagent-driven: fresh implementer per task, two-stage review after each, final whole-branch review
on the most capable model. Sonnet implementers, opus first review, sonnet re-reviews, opus final —
escalate an implementer to opus only for genuinely structural work. Gate economy: run what the diff
can break, once, in parallel; state every skip and its reason; the exit gate is unchanged, so
nothing ships on a skipped gate. Mutation discipline: for each capability a task claims to ADD,
write the test FIRST and confirm it goes RED against the pre-change tree.

## Constraints

Core-only by default. Brand migrations get written into a `phase5-migrations.md`, graded
parity-preserving or deliberate look change. **Ask before editing a brand repo** — PP
`/Users/xaralis/Workspace/progpce/video-toolkit` @ `54561ca`, roost
`/Users/xaralis/Workspace/roost/video-toolkit` @ `15f3d34`; both currently pin core `2e6265e` and
both are pushed. Never edit a `defaultProps` literal in a brand project; `examples/layered-minimal`
is core's and is fair game. `buildVideoNodes` must keep its signature — 12 hand-rolled call sites
across the two brand repos depend on it. zod pinned exactly `3.22.3`. Commits: repo style, never
`Co-Authored-By`, always `--no-gpg-sign`.

## Open items, decide explicitly rather than drifting

- **A dev warning for unstable `wrap`**, for brand authors who never run core's suite. Real gap,
  unscheduled.
- **`glitch.tsx:86` and `:104` conditionally mount** overlays on `glitchIntensity` thresholds —
  progress-varying element count, a structural-constancy violation **Stage 2.3 must fix** when
  `glitch` migrates. Not a pattern to copy.
- **`wrapFor` is deliberately uncached and that is LOAD-BEARING** — it is what keeps an unstable
  `wrap` detectable. A future `WeakMap` cache would silently disable that detection. Re-measure once
  Stage 2.1 lands real `wrap`-using kinds.
- **`stripGeneratedIds`' `/id="[^"]*"/` is unanchored**, so it also rewrites `data-testid`. Latent,
  not live. Anchor to `/\bid="[^"]*"/` next time that helper is touched.
- **`IDENTITY_OBSERVED_FLOOR_PLAN` equals `observed` exactly on two of four axes** (zero margin) —
  any one-frame change in window geometry flips the *guard* rather than the metric.
- Inherited from Phase 4 and still unowned: widening `BrandLayerItemSchema.kind` (docs say
  brand-layer kinds are open; the schema closes them to `z.enum(['watermark','disclaimer'])`), and
  `_internal/toolkit-registry.json`'s 17 dead `tools/<x>.py` paths.
- **Phase 3.5** (apply the seventeen Phase 3 brand migrations) is still pending; roost's
  `projects/roost-reel-01` sits at tsc 0 → 2 un-migrated.
- Two reviewer scratch stashes remain (`stash@{0}` `rgbprobe`, `stash@{1}` `review-probes-revert`);
  the safety net blocks dropping them. Tree is clean; both are scratch only.

Only stop for a decision that is genuinely the user's. Otherwise run to done.
