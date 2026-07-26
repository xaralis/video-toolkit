# At-cut transition findings — all 20 catalog kinds, both directions

**Status:** closes the Phase 3 programme's last open risk. Before this, only
`burn` had ever had its **at-cut appearance** confirmed; the other 19 kinds had
wiring coverage only (`lib/editor/src/at-cut-transitions.test.tsx`), which runs
under jsdom and settles resolution, mounting and param delivery — nothing about
pixels.

**Why a wiring test could not settle this.** At a cut, `buildVideoNodes`
(`lib/render/video-track.tsx`) puts each item in its **own sibling `Sequence`**
and wraps it in its own `AtCutTransition`. The item leaving the cut gets the
**exiting** presentation; the item arriving gets the **entering** one, from the
same transition record, over the **same frame window** — the incoming item's
sequence starts `floor(frames/2)` frames early, borrowing handle frames. The two
layers therefore run *simultaneously*, and the incoming item's sequence is drawn
**on top**. Nothing about that composite is visible in jsdom.

## How this was measured

Apparatus (committed, re-runnable):

- `examples/layered-minimal/src/TransitionMatrix.tsx` — registers three probe
  compositions **per catalog kind** (`TRANSITION_CATALOG`, never a hardcoded
  list), so a kind added later is probed automatically:
  - `Probe-<kind>-enter` — one clip carrying the kind as its `transitionIn`.
    The **entering** presentation alone, nothing beneath it.
  - `Probe-<kind>-exit` — one clip carrying it as its `transitionOut`. The
    **exiting** presentation alone.
  - `Probe-<kind>-cut` — two clips across a real cut. The **composite** the reel
    actually renders.
- `examples/layered-minimal/scripts/render-transition-matrix.mjs` — bundles once,
  then renders stills and assembles one contact sheet per kind.

**Rendered: 20 kinds × 3 modes × 5 progress points = 300 stills**, at progress
0 / 0.25 / 0.5 / 0.75 / 1, 540×960, transition length fixed at 20 frames for
every kind. (In `exit` mode progress 1 falls one frame past the composition's
last, so that cell is really progress 0.95.) Plus 10 extra stills of
`Probe-pixelate-cut` at frames 45–119 to bound its blackout. Content is a flat
colour plus a large numeral — clip **1** orange, clip **2** blue, composition
background mid-grey `#4a4a52` (deliberately *not* black, so a presentation that
paints black is distinguishable from the background). No video: that is where
the known render flake lives.

Every verdict below was reached by **looking at the rendered stills**. Where a
verdict names a mechanism, the mechanism was then read out of the presentation's
source; those two facts are stated separately.

**The single sharpest discriminator** turned out to be one cell: **`cut` mode at
progress 0 must still show the OUTGOING clip.** 17 kinds do. Three do not, and
those three are exactly the three defects.

## The findings table

`enter` / `exit` describe the direction in isolation; the "at a cut" column is
what the composite does, which is what a reel actually renders.

| Kind | Entering | Exiting | At a cut |
|---|---|---|---|
| `cut` | n/a | n/a | **correct** — no transition; the switch lands on the authored frame |
| `dissolve` | **correct** — fades up from the background | **no-op** (see "the trailing-edge caveat") | **correct** crossfade |
| `fade` | **correct** | **no-op** | **correct** crossfade |
| `fade-coal` | **correct** | **no-op** | **correct** crossfade — but see "fade-coal does not dip to black" |
| `glitch` | **correct** — fades in with block/shear artifacts | **correct** — fades out with artifacts | **correct** glitchy crossfade |
| `rgb-split` | **correct** — chromatic ghosts pull apart, fades in | **correct** | **correct** |
| `scanline-glitch` | **DEFECTIVE** — never transparent | **ambiguous** — scanline/RGB shimmer, but no fade-out | **DEFECTIVE** — hard cut, landing early |
| `burn` | **correct** — plain opacity reveal with no `mask` (the catalog seeds none) | **no-op** | **correct** crossfade; the masked look was already confirmed in a brand repo |
| `light-leak` | **correct** — over-exposure + coloured leak, fades in | **correct** — blooms out | **correct** |
| `slide` | **correct** — pushes in from the left | **correct** — pushes out to the right | **correct** push — clip 2 enters leftward, clip 1 leaves rightward, one coherent shove |
| `flip` | **correct** — rotates in over the second half | **correct** — rotates away over the first half | **correct**; background shows at the edge-on midpoint, as a flip should |
| `whip-pan` | **correct** — motion-blurred pan in | **correct** — pan out | **correct** |
| `zoom-through` | **correct** — scales down from oversize while fading in | **correct** — fades/darkens | **correct**, though the fade completes by ~progress 0.5 and the tail is static |
| `zoom-blur` | **correct** — blur + scale, fades in | **correct** | **correct** |
| `clock-wipe` | **correct** — clockwise reveal | **no-op** | **correct** |
| `iris` | **correct** — circle grows from centre | **no-op** | **correct** |
| `wipe` | **DEFECTIVE** — sheet already covers at progress 0 | **correct in isolation** — sheet sweeps in over the outgoing clip | **DEFECTIVE** — flashes to the accent colour; the exiting sweep is never seen |
| `gradient-wipe` | **correct** — soft diagonal band reveal | **no-op** | **correct** (a few percent of the incoming clip is already visible at progress 0 — the softness band's tail, measured, not a defect) |
| `pixelate` | **DEFECTIVE** — opaque black at progress 0 | **correct** — pixel-dissolves to black | **DEFECTIVE** — one full-black frame at the cut |
| `checkerboard` | **correct** — reveals cell by cell | **DEFECTIVE** — no effect at all | **correct** (the entering half carries the composite; the defect is invisible *at a cut*) |

**Tally, 40 kind × direction cells** (counted off the table above, column by
column): **26 correct** — 16 entering, 10 exiting — plus 4 defective,
1 ambiguous, 7 no-op-by-design (see "the trailing-edge caveat") and 2 `n/a`
(`cut`, which is the absence of a transition). 26 + 4 + 1 + 7 + 2 = 40.

By kind, judged on the composite a reel actually renders: **16 correct at a
cut, 3 defective, 1 (`cut`) not a transition.**

## The two predictions

Both were pinned as `it.fails` before any render. Checking them first validated
the apparatus.

### `checkerboard` — **CONFIRMED, exactly as predicted**

Predicted: *renders as a hard cut in the exiting direction.* The `exit` row is
five identical stills across progress 0→1 — the outgoing clip is untouched, at
full opacity, throughout. The cells are laid out (the wiring test proves that)
but carry no content and no background, so they draw nothing over the base copy
of the children beneath them.

Worth adding, because it changes how urgent this is: **at an ordinary cut the
defect is invisible.** The entering half does reveal cell by cell over the
outgoing clip, so the composite reads correctly. It only bites where there is no
successor to enter — a `checkerboard` as the **last** item's `transitionOut`
does nothing at all.

### `pixelate` — **mechanism CONFIRMED, extent REFUTED**

Predicted: *an opaque black frame hiding the neighbouring clip for the whole
shot.*

Confirmed: the entering root is opaque black at progress 0, and at a cut it
hides the neighbour. `Probe-pixelate-cut` frame 49 is the outgoing clip clean;
frame **50 is pure black**; frames 51–55 show the incoming clip emerging from
black through the pixel grid.

Refuted: **not** for the whole shot. `AtCutTransition` clamps progress to `[0,1]`,
and at progress 1 `pixelate` paints nothing — frames 70, 75, 90 and 119 are the
clean incoming clip. The blackout is bounded to the transition window.

Also, the blackout is **entering-only** — and the reason is not that the exiting
layer is transparent. `pixelate` paints the same opaque black root in both
directions; what differs is what sits *on top of it*. In the exiting direction
the layer's own children are the outgoing clip itself, drawn at full opacity
over that black root, so the root is never seen and the outgoing clip survives
the 50 frames before its window opens. In the entering direction the children
are the incoming clip, which the presentation holds at zero opacity at progress
0 — leaving the black root exposed, over the neighbouring clip's sibling
`Sequence` beneath it.

So the defect is real and is a hard black flash at the cut — but it is one
transition long, not one clip long. The `it.fails` pin's comment has been
corrected to say so.

## Two new defects, found by render

Both are the same family as `pixelate`: **an entering presentation that paints
opaquely at progress 0 does not start a transition, it replaces the outgoing clip
instantly** — and, because the incoming item's sequence starts `floor(frames/2)`
frames early to borrow handles, it does so *before* the authored cut.

### `scanline-glitch` — **DEFECTIVE**

*What it does:* at a cut, the incoming clip is fully visible from the
transition's first frame, with a scanline/RGB shimmer over it. The outgoing clip
is never seen during the transition, and the cut effectively lands
`floor(frames/2)` frames early.

*What the kind is meant to do:* a CRT-glitch **dissolve** between two clips.

*Mechanism* (read from `lib/transitions/presentations/scanline-glitch.tsx` after
the render showed the symptom): the presentation never touches `opacity` on its
content and never branches on `presentationDirection`. Its base
`<AbsoluteFill>{children}</AbsoluteFill>` is fully opaque at every progress
value; only the scanline overlay and the two `mixBlendMode: screen` ghosts vary.

### `wipe` — **DEFECTIVE**

*What it does:* at a cut, the whole frame flashes to the accent colour on the
transition's first frame, then the sheet slides off to reveal the incoming clip.
The outgoing clip disappears at the flash. The exiting half — the sheet sweeping
*in* over the outgoing clip, which is visibly correct in `exit`-mode isolation —
is never seen.

*What the kind is meant to do:* a coloured sheet sweeps across covering the
outgoing clip, then continues off-frame uncovering the incoming one.

*Mechanism* (`lib/transitions/presentations/wipe.tsx`): the design is two
sequential beats, but at a cut — and under `TransitionSeries` too — the two beats
run **simultaneously** over the same window, and the entering one is drawn on
top. Its sheet is at `translateX(0%)` (fully covering) at progress 0.

**This one deserves a decision, not just a pin.** Unlike the others it is not a
missing opacity ramp: the kind's whole design presumes the two halves are
sequential, and no compositing model in this toolkit makes them so. Any fix is a
look decision — hold the entering layer transparent for the first half, re-time
the two halves within one window, or make it a single-layer sweep. Note also
that `examples/layered-minimal`'s own `MinimalReel` uses `wipe` at its first cut,
so this is what that example currently renders.

## Nothing was fixed

Per the task's constraint, and because each defect has more than one legitimate
fix, none was applied. Each is pinned as an `it.fails` in
`lib/editor/src/at-cut-transitions.test.tsx` — the same treatment `checkerboard`
and `pixelate` already had — so it flips to a normal `it` the day someone
addresses it, and the runner fails loudly if it starts passing on its own. Each
pin's comment names the fix shape it assumes.

## Two cross-cutting observations

### The trailing-edge caveat — `no-op` exiting directions

Seven kinds do nothing at all in the exiting direction: `fade`, `dissolve`,
`fade-coal`, `burn` (all four are Remotion's `fade()`, whose
`shouldFadeOutExitingScene` defaults to `false`), `clock-wipe`, `iris` (the
official presentations mask only the entering side) and `gradient-wipe`.

**At a cut this is correct** — the entering layer performs the whole transition
over the outgoing clip beneath it, which is exactly how those presentations are
designed to be used.

It matters in one place. `lib/render/video-track-layout.ts` gives the **last**
item an `outRecord` from its own `transitionOut`, and its comment calls that
"the reel's trailing edge fade". There is no successor to enter, so for these
seven kinds **the trailing edge fade does not happen** — the reel simply ends.
Not a defect in any presentation; a mismatch between that comment and what
renders. Recorded here rather than changed, because "should a reel fade out at
the end" is a look decision too.

### `fade-coal` does not dip to black

The kind is labelled "Fade to black" and at a cut it renders as a plain
**crossfade** between the two clips — no dip to black. That is exactly what the
code says it should do (`at-cut-transitions.tsx` maps it to `fade()`, and its
comment explains that opacity < 1 reveals `theme.background`), and it is
indistinguishable from `fade` and `dissolve` in all 15 stills. Confirmed rather
than discovered; noted because the label promises something the render does not
deliver at a cut. In `enter`-mode isolation it does fade up from the theme
background, which is where the name comes from.

## Reproducing

```bash
cd examples/layered-minimal
node scripts/render-transition-matrix.mjs           # all kinds → out/sheets/
node scripts/render-transition-matrix.mjs wipe      # one kind
```

`out/` is gitignored. The stills are throwaway evidence; this document is the
deliverable.
