# The transition pixel harness

**What it is.** The first gate in this repo that asserts on **pixels**. It renders
every transition kind in `TRANSITION_CATALOG` across three reel scenarios and five
progress points, compares each rendered frame against a committed golden hash, and
independently checks a handful of properties that are true of a *correct* transition
regardless of what its golden says.

**Why it exists.** The `scanline-glitch` and `wipe` defects were found by a human
looking at a contact sheet, using one discriminator: *at progress 0 the composite must
still show the outgoing clip.* Nothing mechanical would have caught a **new** kind
repeating that mistake, and nothing would have caught a rewrite of transition rendering
quietly changing what the already-correct kinds draw. It exists so
"behaviour-preserving" can be a measurement.

Files:

| Path | Role |
|---|---|
| `examples/layered-minimal/scripts/render-transition-matrix.mjs` | the harness / gate |
| `examples/layered-minimal/scripts/lib/pixel-metrics.mjs` | hashing, plate measurement, the semantic checks |
| `examples/layered-minimal/scripts/lib/png.mjs` | dependency-free PNG decoder |
| `examples/layered-minimal/scripts/lib/harness-self-test.mjs` | teeth-check, no rendering |
| `examples/layered-minimal/goldens/transition-matrix.json` | the committed goldens |
| `examples/layered-minimal/src/TransitionMatrix.tsx` | the probe compositions (kind list derived from the catalog) |

## Running it

```bash
cd examples/layered-minimal

npm run pixel-gate              # the gate: 300 stills, ~45s, exit 0 = green
npm run pixel-gate:strict       # …with NEAR fatal — REQUIRED for any parity claim
npm run pixel-gate:self-test    # ~0.1s, no rendering — proves the checks go red
npm run pixel-gate:update       # re-baseline: 600 stills, ~90s (see below)
npm run pixel-gate:audit        # re-sample the recorded bimodal cells

node scripts/render-transition-matrix.mjs wipe iris   # only these kinds
node scripts/render-transition-matrix.mjs --sheets    # also write contact sheets (ImageMagick)
node scripts/render-transition-matrix.mjs --update-goldens --repeat=12   # re-seed bimodal cells
```

**If you are claiming a change left rendering unchanged, run `--strict`.** The default
is lenient so a rasteriser wobble does not redden day-to-day iteration; `--strict` makes
a `NEAR` result fatal. There is no exempted kind: the renderer's (real, measured)
nondeterminism is recorded per cell as a second accepted hash instead. See "the renderer
flake" for what lenient mode forgives and why that matters for a compositing rewrite.

Measured on this machine, 2026-07-27: **300 stills in 44s** (46s wall including the
one-off webpack bundle) for a full gate run. Per kind that is ~2.2s, so
`node scripts/render-transition-matrix.mjs <kind>` while iterating on one presentation
takes about 5s end to end. `--update-goldens` renders everything twice: ~88s.

## Re-baselining

`--update-goldens` rewrites `goldens/transition-matrix.json`, prints every key it
added / removed / changed, and tells you to review the diff. **That is the whole
safety model:** a re-baseline is a committed edit a reviewer sees, not a silent
overwrite. It refuses to reduce the number of covered kinds unless you also pass
`--allow-shrink`.

It renders every still `--repeat=N` times (default **2**) and requires them to agree (a third render breaks a
tie, and the key is reported; three mutually different renders fail as `UNSTABLE` rather
than inventing a majority; at `--repeat=8` or more, two hashes are *recorded* as a
bimodal cell instead). That is not paranoia — see "the renderer flake" below. It also
refuses to write the file at all if the run recorded any failure, so `--update-goldens`
cannot be used to launder a red run.

## The axis called `mode` is not "direction"

The matrix is **kind × mode × progress**, where a `mode` is a *reel-level scenario*
defined by how the probe reel is configured, not by any internal renderer parameter:

- `enter` — one clip carrying the kind as its `transitionIn`: a clip's head with
  nothing before it.
- `exit` — one clip carrying it as its `transitionOut`: a clip's tail with nothing
  after it.
- `cut` — two clips meeting at a real cut: the composite a reel actually renders.

This was chosen deliberately because transition rendering is moving from a one-sided
model (an `entering`/`exiting` presentation per side) to a two-input one. "Direction"
may not survive that; "a clip's head", "a clip's tail" and "two clips meeting" are
scenarios a reel can always be in, and they stay observable in the output. Nothing in
the harness reads `presentationDirection`. If a future model makes one of the three
scenarios unrepresentable, that is a coverage change and the harness's own axis guard
will fail rather than quietly cover less.

## What is asserted

**Golden hashes.** One per `kind__mode__progress`, taken over the **decoded RGBA
buffer** rather than the PNG file, so a PNG-encoder change is not reported as a
rendering change. 300 entries today.

**Semantic checks** (`pixel-metrics.mjs`), which hold for any correct kind and are
independent of its golden:

| Check | Statement |
|---|---|
| `cut@p0-shows-outgoing` | at the start of a cut the composite is still the clip we are leaving |
| `cut@p1-shows-incoming` | by the end it is the clip we arrived at |
| `enter@p1-settles-on-clip` | a clip's head resolves to the clip |
| `exit@p0-starts-on-clip` | a clip's tail starts from the clip |
| `cut@p05-is-mid-transition` | a kind with a duration is not pixel-identical to a hard cut halfway through (skipped for the instant `cut` kind) |

Frames are classified per pixel against the two probe plate colours, which are
**derived** at run time from a rendered reference still, never restated in the
harness. Pixels near neither plate (the white numerals, the grey backdrop, any blend)
are left unclassified, which is what lets "shows neither clip" be told apart from
"shows a mix".

**Coverage guards.** The gate fails if the number of covered kinds is lower than the
goldens recorded, if a golden exists for a kind that no longer does, if any catalog kind
has a matrix cell with no golden, if `semanticXfail` and `knownDefective` drift apart,
or if the probe's geometry / progress list / mode list has changed out from under the
goldens.

All of these are computed from the catalog and the golden file, **not** from what a
given run happened to render — so `node scripts/render-transition-matrix.mjs fade` still
reports that some *other* kind was added without goldens. That last one is why the check
is a cross-product of `kinds × modes × progress` against the golden keys rather than an
observation made while rendering: an earlier version only noticed a missing golden for a
kind the run had rendered, which meant a newly added kind slipped through a filtered run
in silence.

## The four known-defective kinds

`checkerboard`, `pixelate`, `scanline-glitch` and `wipe` are defective **today** (see
`at-cut-transition-findings.md`; they are also pinned `it.fails` in
`lib/editor/src/at-cut-transitions.test.tsx`). Their goldens record what they render
now, which is **wrong-but-current**. A change to those specific goldens in Workstream 2
is expected and is not evidence of a regression. The harness prints this on every run.

Two lists in the golden file, kept separate on purpose:

- **`knownDefective`** — all four. Documentation: "these goldens are expected to
  change."
- **`semanticXfail`** — `pixelate`, `scanline-glitch`, `wipe`. The subset the semantic
  checks actually catch. If one of these starts passing, the harness **fails** with
  `XPASS` so the list has to be updated in the same commit as the fix.

`checkerboard` is deliberately *not* in `semanticXfail`. Its defect is that its exiting
layer does nothing, which is pixel-identical to the seven kinds that legitimately do
nothing when exiting (`fade`, `dissolve`, `fade-coal`, `burn`, `clock-wipe`, `iris`,
`gradient-wipe`). No pixel test can separate those, so `checkerboard` is pinned by its
golden hashes alone. Claiming otherwise would be a gate that covers less than it says.

`examples/layered-minimal`'s own `MinimalReel` uses `wipe` at its first cut, so one of
its five render-parity frames was expected to be re-baselined by the same work.

**Both of those paragraphs were settled by Task 2.1, and both predictions were partly
wrong — the measurements replace them:**

- `checkerboard`'s goldens did **not** move. Making it one two-input implementation is
  structurally real (no direction branch, no empty cells) but **pixel-identical** in all
  15 of its cells: the empty exiting cells drew nothing and the entering layer's
  `progress < 0.01` fill was already transparent, so removing them changed no pixel. It
  is graded parity-preserving, and it is off `knownDefective` because it is no longer
  defective, not because its pixels moved.
- The frame that moved is **90**, not 45. The cut sits at 3000 ms, so its boundary window
  is frames 80-100; frame 45 is mid-clip and hashes exactly what it always did.
- `knownDefective` and `semanticXfail` are now **both empty**, and a full
  `pixel-gate:strict` run reports **zero** expected semantic failures.

## The renderer flake — characterised, not guessed at

Renders here are **not** byte-deterministic. That was chased down over ~2,070 renders,
and the result is specific enough to be *recorded* rather than tolerated:

- **Where.** Every differing pixel in every pair sits in the **rightmost 8 columns** of
  the 540px frame — 16–28 pixels out of 518,400. Alpha never changes.
- **How many values.** Strictly **bimodal**: exactly two globally stable hashes per
  affected cell. The same two recur across independent runs, both orderings, and 16 fresh
  processes, with byte-identical diffs every time. Never a third (max n=27 per cell).
- **How often.** A **per-render coin flip**, 9–50% depending on the cell. (An earlier
  version of this doc claimed eight consecutive isolated renders agree 8/8. That was
  wrong: measured in one process, one browser, `clock-wipe:cut:0.5` → A A B A A B B B and
  `iris:cut:0.5` → A A B A B A B A.)
- **How big.** The worst 8×8 cell mean shift it can produce is **0.0183/255**, so it
  always reports fingerprint delta **0** — two orders of magnitude below `FP_TOLERANCE`.
- **Whose fault.** It reproduces in a **fresh process with a single render**, so it is
  renderer nondeterminism, not harness state. The browser lifecycle is exonerated.
- **Not "curved edges".** Antialiasing is the *site*, not the explanation: on
  `iris__cut__p05` the antialiased boundary spans 1,522 pixels across the full width and
  only 61 of those are in the rightmost 8 columns — 96% of the curve is perfectly
  deterministic. `clock-wipe`'s flaking boundary is a straight radial ray, and
  `light-leak` has no clip path at all.

### What the harness does about it

Because the flake is bimodal and globally stable, both attractors are **recorded**:

```
"iris__cut__p05": "<hashA>|<hashB> <fingerprint>"
```

A frame matching **either** accepted hash is `ok`; anything else is `near`/`drift` exactly
as before. So **byte-exact enforcement still applies to all 300 cells** — there is no
exempted kind and no blind spot, and `--strict` is reliably green on an unchanged tree.

The cells that carry a second hash are listed in `bimodalCells` in the golden file. Two
guards keep that list honest:

- a golden may **not** carry a second hash unless its cell is listed — a newly bimodal
  cell is information, and must arrive as a reviewable one-line addition rather than
  hiding in a hash column;
- `--audit-bimodal[=N]` re-renders each listed cell N times (default 12) and **fails** if
  it produced only one hash — a cell that stopped flaking has to be de-listed, mirroring
  what `semanticXfail` demands of a fixed defect. It also fails on any hash outside the
  accepted pair.

This replaced an earlier kind-level `flakyUnderStrict` exemption, which was wrong three
ways: it blinded 30 cells to cover 10, it keyed on the wrong predictor, and it was
incomplete, so `--strict` could still go red on an unchanged tree.

**Why the scope is a CELL and not a kind, a mode, or a "curved edge".** Every structural
generalisation tried here turned out to be false somewhere:

- *"curved edges flake"* — `clock-wipe`'s flaking boundary is a straight radial ray, and
  `light-leak` has no clip path at all.
- *"only `enter`/`cut` cells can flake, because both presentations apply their clip path
  only when `presentationDirection !== 'exiting'`"* — true of `iris` and `clock-wipe`, and
  false in general: three of `light-leak`'s affected cells are `exit__p025`, `exit__p05`
  and `exit__p075`. `light-leak` has no clip path for the exiting branch to skip.
- *"it is a property of the kind"* — `iris` flakes at progress 0.5 and 0.75 and not at 0,
  0.25 or 1.

A per-cell list needs no theory of *why* a cell flakes, and cannot be wrong about a cell
it has actually sampled. Goldens are keyed per cell already, so the scoping is free.

### The rate is not stationary — so absence never shrinks the list

Measured while re-seeding: `light-leak__exit__p075` was recorded at a **6/12** minority in
one seeding pass and then produced **one hash in 24 renders** in the next. Under a
stationary p=0.5 that has probability 6e-8. So the two attractor *values* per cell are
stable, but the *rate* at which the minority one comes up is **not stationary between
processes**. `iris` and `clock-wipe` reproduced identically across both passes; only
`light-leak`'s cells churned.

Two rules follow, and they are the reason a re-seed is safe to run:

- A seeding pass **unions** what it observes with what is already recorded for a listed
  cell. It never drops an attractor merely because that attractor did not come up — doing
  so would silently un-record a genuinely bimodal cell and hand back the false reds this
  whole mechanism exists to remove.
- It *does* drop the old values when **none** of the observed hashes matches the record:
  that is not absence, it is a different picture, and the cell is re-baselined and
  de-listed.

De-listing on absence is therefore a decision a human asks for explicitly, via
`--audit-bimodal`, never something a re-baseline does on its own. And more than two
accepted values for one cell is a hard `NOT BIMODAL` failure — it would refute the
strictly-bimodal finding, which is important either way and must not be absorbed quietly.

**Practical consequence for sample counts:** listing a cell is cheap (two distinct hashes
is evidence of *presence*), de-listing is expensive (one hash is weak evidence of
*absence*). `BIMODAL_RECORD_SAMPLES` is 8 and `BIMODAL_DELIST_SAMPLES` is 24, and
`--audit-bimodal` defaults to 24 for the same reason.

Three further behaviours, all visible in output, never silent:

1. A mismatch triggers **one re-render** before it is called drift, printed as `RETRY …`.
2. If the two renders inside one run disagree, a `NON-DETERMINISTIC render` note names the
   still.
3. `--update-goldens` renders each still `--repeat=N` times (default 2) so a one-off is
   never baked in; at `--repeat=8` or more it *records* a two-hash cell instead of
   majority-voting one away. Two samples cannot distinguish "bimodal" from "unlucky" when
   the flip is 9–50% per render — which is exactly why the old majority vote produced a
   baseline that could not then be verified.

### What lenient mode forgives — and why `--strict` is not optional for a parity claim

`NEAR` (bytes differ, 8×8 picture agrees within `FP_TOLERANCE`) is non-fatal by default
and fatal under `--strict`. It is worth knowing exactly how wide that tolerance is. At
540×960 an 8×8 grid gives ~8,100 pixels per cell, so `delta ≤ 2` absorbs a per-cell
channel-sum change of ~16,200. Two real regression classes fit inside that:

- **localised**: roughly 4,000–5,400 pixels — about 1% of the frame — can change
  *completely* and still report as a warning. A badge, a numeral, a chevron.
- **global**: a uniform ±1–2/255 shift across the entire frame is `NEAR`. That is exactly
  the artefact a two-input compositing rewrite produces — restacked layers, premultiplied
  vs straight alpha, one extra `AbsoluteFill`. **The single most likely real regression
  from the rewrite this harness exists to police is the one the tolerance is shaped to
  swallow.**

That is not hypothetical. The deliberate `zoom-blur` perturbation used to prove the
harness bites produced `zoom-blur__exit__p1` at **max cell delta 3** — a real change
landing one unit outside tolerance. The drift/near boundary sits *inside* the range real
changes occupy, not comfortably above it.

`FP_TOLERANCE` is deliberately **not** lowered. The flake is already at delta 0, so
lowering the tolerance cannot exclude it and would only convert real drift into a
different failure mode. `--strict` is the answer instead — a flag enforced by the runner,
not a convention enforced by whoever remembers to read the summary line.

The harness sets **no** Chromium OpenGL renderer, and neither does
`examples/layered-minimal/remotion.config.ts`. Do not add one: the one configuration in
this programme measured to be genuinely non-deterministic (a brand reel) is the one that
sets `angle`. Probe content is flat colour and a numeral — no photo, no video. Do not
add media to the fixtures.

## Browser lifecycle (why the harness manages it)

The harness opens **one** warm browser and keeps it for the whole matrix, replacing it
only when a render actually throws (and then retrying that same still once, so a still
is never skipped). Both alternatives were measured and are worse:

- letting `renderStill` launch its own Chrome per still is ~7x slower and dies around
  60 stills with `Timed out after 25000ms while trying to connect to the browser`;
- recycling on a fixed count (every 15 stills) crashes the run with an unhandled
  `EPIPE` when a write lands on a replaced browser's socket, and leaves
  `chrome-headless-shell` processes behind that wedge the *next* run for minutes.

**If a run hangs at startup, check for stray `chrome-headless-shell` processes first.**
The one 105-still hang seen while building this was on a machine still holding orphans
from a killed run; on a clean machine a single instance carries all 300 stills.
