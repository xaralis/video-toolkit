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
npm run pixel-gate:self-test    # ~0.1s, no rendering — proves the checks go red
npm run pixel-gate:update       # re-baseline: 600 stills, ~90s (see below)

node scripts/render-transition-matrix.mjs wipe iris   # only these kinds
node scripts/render-transition-matrix.mjs --sheets    # also write contact sheets (ImageMagick)
```

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

It renders every still **twice** and requires the two to agree (third render breaks a
tie, and the key is reported). That is not paranoia — see "the iris flake" below.

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
goldens recorded, if a golden exists for a kind that no longer does, if a covered kind
has no golden, or if the probe's geometry / progress list / mode list has changed out
from under the goldens.

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

`examples/layered-minimal`'s own `MinimalReel` uses `wipe` at its first cut, so the
repo's frame-45 render-parity hash is expected to be re-baselined by the same work.

## The iris flake — measured, not assumed

Renders here are **almost** byte-deterministic. `iris` in `cut` mode is the exception:

- The first seeding run produced one hash for `iris__cut__p05`; six consecutive
  re-renders of the same still then produced a different hash, six times out of six.
- The next re-baseline (double-rendering everything) caught the same bimodality on
  `iris__cut__p075` instead.
- `clock-wipe__cut__p1` and `clock-wipe__enter__p075` and `iris__enter__p075` each did
  it once across roughly 2500 stills rendered while building this.

So it is a low-rate, cell-local flake on curved-edge frames — not a regression, and not
general non-determinism. Roughly **one still in 500**. Three consequences are built in:

1. On a verify run, a mismatch triggers **one re-render** before it is called drift, and
   the retry is printed (`RETRY …`) — never silent. If the second render matches, a
   `FLAKE RECOVERED` note is emitted.
2. If the two renders inside one run disagree with each other, a `NON-DETERMINISTIC
   render` note names the still.
3. If a mismatch *survives* the retry but the 8×8 picture still agrees within
   `FP_TOLERANCE` (2 per channel), it is reported as `NEAR` and counted rather than
   failed. **A run with a non-zero NEAR count cannot be used to claim byte-identical
   rendering** — the summary line reports both numbers precisely so Task 1.3 can require
   `300 byte-identical, 0 same-picture-different-bytes`.

The trade this makes, stated plainly: a *real* rendering change confined to a handful of
pixels would be downgraded from a failure to a printed, counted warning. That is the
price of a gate that is green when nothing changed. The full-sweep reference run
(2026-07-27) was **300 byte-identical, 0 near, 0 drifted, 1 retried** in 44s.

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
