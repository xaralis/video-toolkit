# Phase 5 — brand migration notes

Phase 5 is **core-only**, the same discipline as Phase 4: nothing here has been applied to
either brand repo. This document is written for a **brand author** — someone maintaining a
`brands/<brand>/`, a template, or a project in a repo that vendors this toolkit as a `toolkit/`
submodule — not for this programme's own internal record. If you want the internal design
rationale, staged-migration history, and measurement log, read
`docs/superpowers/phase5-single-mount-design.md` and
`.superpowers/sdd/phase5-single-mount-design/task-5-report.md` instead.

## The headline: bump the pin, re-render, done

**`buildVideoNodes` keeps its exact signature** — `(items, opts) => React.ReactNode[]`, same
options bag (`renderItem`, `width`, `height`, `fps`, `palette`, `transitions`, `background`). Every
brand call site that already builds a video track this way keeps compiling and keeps rendering,
with no code change required. You get the single-mount fix (no more colour-flash / stall at a
transition boundary in Studio or the editor `<Player>`) for free the moment you bump the
`toolkit/` submodule pin past this commit.

**If your brand does not register its own transition kinds and does not call `presentationFor`
directly**, that is the entire migration: bump the pin, re-render, verify.

If your brand registers a **custom transition kind** on `BrandTheme.transitions` — neither brand
repo does this today, but the surface exists — read the rest of this document before your next
registration, because the contract your renderer returns to narrowed in this phase.

## What actually changed under the hood

Before this phase, a transition renderer could hand back either a one-sided `AnyPresentation`
(the shape `@remotion/transitions`' own five presentations use) or a **two-input node** exposing
either `{ composite }` (a React component core mounted at the boundary, receiving both clips as
subtrees it rendered itself) or `{ plan }` (a declarative description core applies to mounts that
already exist). Phase 5 migrated every one of the toolkit's own 20 catalog kinds off `composite`
onto `plan`, one mechanism at a time across five stages, and this task — the last one — **deletes
the `composite` arm entirely**. A `TransitionNode` is now:

```ts
interface TransitionNode {
  plan: (props: TransitionPlanProps) => TransitionComposite;
}
```

There is no `composite` field any more, at the type level. If you have a brand renderer that
returns `{ composite: SomeComponent }`, it will now fail to compile.

**What you almost certainly do NOT need to touch:** if your renderer returns a plain
`AnyPresentation` (the same `{ component, props }` shape `@remotion/transitions/fade` etc.
return) — the ordinary way to register a one-sided custom transition — nothing changes for you.
Core lifts that into `plan` automatically (`wrapRemotionPresentation`, previously
`fromRemotionPresentation`), the same as it always has for the five official presentations.

**What DOES need a migration:** only a renderer that used to hand back `{ composite: MyComponent }`
directly — a natively two-input transition your brand wrote by hand, receiving `from`/`to` as
already-instantiated subtrees. That renderer now needs to return `{ plan: myPlan }` instead. See
"Writing a `plan` node" below for the shape.

## The new authoring surface, for anyone writing a native two-input node

A `plan` is a **plain function**, not a React component — it cannot call hooks, and it is invoked
once per live frame with a prop bag describing both sides of the boundary as **handles**
(`LayerHandle`, `{ range: [number, number] }`), not as React subtrees:

```ts
function myPlan(props: TransitionPlanProps): TransitionComposite {
  return {
    from: { style: { opacity: 1 - props.progress } },
    to: { style: { opacity: props.progress } },
  };
}
```

It returns a `TransitionComposite` describing how to STYLE the mounts that already exist, not
JSX to render:

- **`from` / `to`** (`LayerOp`, optional on each side) — `style` merged onto that side's shell,
  `z` to override the default stacking order (incoming over outgoing), `ghosts` for extra styled
  copies of the clip, and `wrap` for anything a style object can't express (an SVG mask, a
  `foreignObject`).
- **`layers`** (`PlateLayer[]`) — media-free full-frame plates (`under`/`between`/`over` the two
  clips), for a colour sheet, an SVG filter's `<defs>`, a cell grid — anything that isn't a copy
  of a clip.
- **`post`** (`filter`/`transform` only) — applied to the WHOLE video track for the live window;
  narrow on purpose, because anything wider (`opacity`, `mixBlendMode`) would change how the
  track blends against what's beneath it, which is a reel-level decision no single boundary is
  entitled to make.

Three rules carry real consequences if you break them — none of them are enforced by a compile
error, and two of them are enforced by a dev-only console warning (the third, `wrap`'s stability,
has no dev warning at all — see "the one known gap" below):

1. **`ghosts.length` must not vary with `progress`.** Each ghost is an extra mount of the clip; a
   count that changes mid-window destroys and recreates a media element mid-transition — the
   exact defect this whole phase exists to remove, reintroduced by a node instead of by the
   assembly. Vary a ghost's `style` (e.g. `opacity: 0` for "not showing right now"), never its
   presence. **Warned** (`video-track:ghosts-vary:<boundary>:<side>`, once per boundary per side).
2. **A `wrap` must be a STABLE component reference for the item's whole mounted life**, not just
   for the frames your transition's own window is live — core mounts a declared `wrap` life-long,
   with an `active` prop telling it whether its boundary is currently live, precisely so the
   element type at that tree position never changes and nothing remounts. Returning a fresh
   closure on different calls (`(props) => ({ from: { wrap: () => <Foo/> } })`, where the inline
   arrow is a new function every call) violates this and reintroduces a remount, even though
   nothing else about your node changed. Build any `wrap` component ONCE, outside your `plan`
   function, and return the same reference every time.
3. **`plan` cannot call hooks.** It is a plain function, invoked directly, not mounted as a
   component. If your node genuinely needs live state (e.g. reading the current progress inside a
   styled sub-component), put that in a `wrap` instead — `wrap` IS a real React component and may
   use hooks (it can read `useActiveTransitionProgress()` for the live progress, scoped correctly
   even when the same node is shared across two different boundaries).

At most one live boundary may set `post` on a given frame — a second is a **warned** conflict
(`video-track:post-conflict:<a>+<b>`), and the later one wins. This closes a carried hazard: two
`scanline-glitch`-shaped boundaries sharing an SVG filter id resolve the URL by document order,
which can pick up the earlier boundary's filter parameters even though "the later one wins" is
the stated rule for the VALUE. It is benign today only by arithmetic (the only reachable
simultaneity is two abutting windows both at progress 0 or 1, where the filter is the identity) —
if you write a `post`-using kind whose filter is non-identity at its endpoints, do not assume this
stays benign; the warning is what will tell you if it stops being so.

### `'mask-scale'` (added Stage 4) — a cheap alternative to a 64-mount carve-out

`checkerboard`'s `squareAnimation: 'scale'` and `'flip'` sub-options are authored, visible-on-purpose
multi-mount effects: at progress 1 they render **`gridSize²` separate mounts** of the incoming
clip (one per cell) so each cell can independently scale/flip in. This is a deliberate exception
to the "avoid extra mounts" spirit of the single-mount contract, not an oversight — some visual
effects genuinely need per-cell independent transforms, and `ghosts` is exactly the contract for
"extra STYLED copies, count held constant within any one progress value" (it varies from `0` at
progress 0 to `gridSize²` at progress 1, in discrete jumps as each cell "locks in" — never varying
*mid-cell*, so `auditGhosts`' dev warning does not fire for it).

If your brand does not need the exact per-cell scale/flip look, `'mask-scale'` is the cheap
alternative added in the same stage: it reuses `checkerboard`'s default SVG-mask technique (3
mounts total, not `gridSize²`) with a scale-shaped mask animation. **It is visually SIMILAR, not
IDENTICAL** to `'scale'`/`'flip'` — if your brand's look depends on the exact per-cell picture,
keep the real sub-option; if you just want "a checkerboard-flavoured scale reveal, cheaply",
`'mask-scale'` is that.

### `rgb-split`'s 6 media elements per cut — also deliberate

`rgb-split` mounts the clip **6 times** at its cut (3 ghosts per side: the base copy plus a
red-shifted and a cyan-shifted copy, each side). This is authored and intentional — the RGB-split
look needs three independently-offset copies of the same footage compositing together — not a
regression from the single-mount contract. An SVG-filter rewrite that would collapse this to the
same 1-mount-per-side technique `scanline-glitch` already uses (`feOffset`/`feColorMatrix`/
`feBlend`) is a real, separate, optional future task — not something this phase or this
migration note commits you to.

## Goldens: 68 cells moved across Stages 2-4, and why

If you pin an OLDER core commit than this one and re-render, you will see pixel differences on
**68 of 300** golden cells versus a core commit from before Phase 5 started (measured across
Stages 2-4; **0 moved** at this task, Stage 5 — see the flip's own report for the full
zero-movement measurement). Each was argued from a measured cause at the time it moved, not a
side effect of "changing the strategy":

- **Stage 2 (48 cells).** `glitch` moved 15 cells — it is the one presentation that reads
  `useCurrentFrame()` itself, so its own internal clock changed when its mount moved from a
  freshly-instantiated boundary subtree to a life-long shell (this exact clock-origin shift was
  already measured and accepted back in Phase 4 Task 1.3 for the SAME reason, the first time
  `glitch` crossed a mount-strategy boundary). The rest of Stage 2's movement is `checkerboard`'s
  and `scanline-glitch`'s technique rewrites (SVG mask / SVG filter chain replacing a DOM-copy
  technique) landing on the `plan` arm.
- **Stage 3 (20 cells).** `rgb-split` (moved to un-conditioned `ghosts`) and `scanline-glitch`
  (moved to `post`) — 10 cells each, reviewed picture by picture; the other 10 of each kind's 15
  were already byte-exact at the endpoints where the relevant threshold/blend is inert.
- **Stage 4 (0 cells).** `checkerboard`'s carve-out (the mask/`foreignObject` mechanism itself was
  unchanged — only its host, a `LayerOp.wrap` instead of a JSX sibling inside a `composite`,
  moved) was measured byte-identical against its own Stage 0.1 goldens.

If your brand's `projects/` renders were captured against a pre-Phase-5 core, expect these 68
cells' worth of kinds (`glitch`, `checkerboard`, `scanline-glitch`, `rgb-split`) to look very
slightly different after the pin bump, and treat that as expected, reviewed drift — not a
regression to chase.

## The one known gap: no dev warning for an unstable `wrap`, for a brand author specifically

Core's own test suite catches an unstable `wrap` reference — a fresh component on different
calls — through a derived DOM-identity check
(`lib/editor/src/video-track-remount.test.tsx`), because core's own CI-adjacent gates run that
suite. **A brand author does not run core's test suite**, so if your custom node's `wrap` is
accidentally unstable, nothing will tell you except the exact symptom this whole phase exists to
remove (a colour flash / stall at your transition's boundary in Studio or the Player). A `warnOnce`-style
dev diagnostic for this specific contract violation was scoped by the original design
(`docs/superpowers/phase5-single-mount-design.md` §4.6) but never actually built in any stage of
this phase — this is a real, acknowledged gap for brand authors specifically, not a subtle bug.
If you write your own `wrap`, the rule to hold onto by hand is: **build it once, outside `plan`,
and never construct a new component inline inside `plan`'s own body.**

## Nothing else in the public contract moved

`TransitionRenderProps`, `TransitionRegistry`, `TransitionRegistration`, `resolveTransition`,
`presentationFor`, `isTransitionNode` — all unchanged in shape and behaviour. `presentationFor`
still returns `null` and warns once for a kind that resolves to a native two-input node (unusable
with `TransitionSeries`); only the warning's wording changed (it no longer names the deleted
`AtCutTransition` as an alternative — it names `buildVideoNodes`). If your brand calls
`presentationFor` directly to drive `TransitionSeries` (as PP's `web-program-intro` template
does, per the design census), nothing about that call site's behaviour changes for any of the 20
catalog kinds; if you author a NEW brand kind returning a native `{ plan }` node, `presentationFor`
will (correctly) hard-cut it with a warning, exactly as it already does for `wipe`/`checkerboard`/
`pixelate`/`gradient-wipe`/`rgb-split`/`scanline-glitch`/coloured `fade-to-color` today.
