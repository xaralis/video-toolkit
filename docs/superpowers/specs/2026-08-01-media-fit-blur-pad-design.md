# Media fit — `blur-pad` for off-aspect footage

**Date:** 2026-08-01
**Status:** design, approved for planning
**Scope:** `lib/reel-config-base`, `lib/theming/segment/SegmentMedia.tsx`, `lib/editor/app` (inspector + frame overlay), `commands/cut.md`

---

## Problem

`SegmentMedia` renders every footage item with `objectFit: 'cover'`, hard-coded
(`lib/theming/segment/SegmentMedia.tsx:101`). When a source's aspect ratio does not
match the composition's, cover silently crops the difference away. That is the right
default when the mismatch is small; it is destructive when it is large.

The case that forced this: `pp-program-bydleni` (web-program-intro, 1920×1080) has 21
b-roll clips shot on a phone, all portrait 1080×1920. Cover throws away ~68 % of each
frame — the shop window full of flat prices, the crane over the construction site.

Nothing in core or in either brand repo does anything but cover today. `objectFit:
'contain'` appears zero times outside a watermark's `maskSize`.

## Not a duplicate of

Checked before designing, because the neighbours are close:

| Existing | What it is | Why it isn't this |
|---|---|---|
| PP `blend` / `blendTo` | gradient reveal **between two different sources** | second *source*, not a second copy of one |
| `crop`, `focalX/Y`, `kenBurns` | move/zoom **within** the cover crop | they decide *what gets cropped*; this decides *that nothing does* |
| `blur(...)` in core (5 sites) | all inside transition presentations — a time-based effect | not a spatial fill |
| `placement.ts` "letterbox" | an overlay *plate* must not stretch across the frame | different layer |

## Design

### Schema

One optional field on the three footage kinds (clip / broll / photo) in
`lib/reel-config-base`:

```ts
fit: z.enum(['cover', 'blur-pad']).optional().default('cover')
backdropBlur: z.number().min(0).max(80).optional().default(32)   // px
backdropDim:  z.number().min(0).max(1).optional().default(0.45)  // 0 = untouched, 1 = black
```

The backdrop's look is **authored, not constant** — both values are ordinary schema
fields and both are editable in the editor. `backdropDim` stores the dimming directly
rather than storing `brightness` and inverting it for display: the render computes
`brightness(1 - backdropDim)`, so what is in the config reads the same direction as what
is on the slider, and there is no conversion to get backwards.

`'contain'` is deliberately **not** in the enum. Bare black bars are never what a
non-technical editor wants; if a use for them appears, the day it appears is when the
third member gets added. Default `'cover'` means every existing project renders
byte-identically with no migration.

### Render

`fit: 'cover'` — unchanged. The same tree as today, no extra wrapper, no extra element.

`fit: 'blur-pad'` — two copies of the same `OffthreadVideo`, same `src`, same
`startFrom`/`endAt`:

1. **backdrop** — `objectFit: 'cover'`, blurred and darkened (`filter:
   blur(${backdropBlur}px) brightness(${1 - backdropDim})`, scaled slightly past the
   edges so the blur doesn't sample transparent margin), filling the frame. Carries
   *nothing* else: no crop, no focal, no ken burns, no grade, no style effects, no media
   effects. It is dumb fill.
2. **foreground** — `objectFit: 'contain'`, right-aligned (`objectPosition: '100% 50%'`),
   carrying the entire existing style chain unchanged.

Right-aligned, not centred, because the template's hard framing rule keeps the left
third of the 16:9 frame clean for the website's `<h1>` overlay, and the talking-head
segments already put the speaker in the right third. A 1080×1920 source contained into
1920×1080 is 607 px wide, so flush-right lands it in the right third — the same optical
centre of gravity as the speaker, so a cut from clip to b-roll doesn't jump.

### Effects contract

The rule in one line: **what belongs to the clip goes on the clip; the blurred backdrop
is dumb fill that nothing touches.**

Core already has the two axes this needs, so the rule lands on existing structure:

| Axis | Where it applies today | Under `blur-pad` |
|---|---|---|
| `scope: 'clip'` effects (grain, scanlines, vignette) — `applyEffects` wraps the whole renderer output from outside | around the segment's entire output | **unchanged.** Covers backdrop and foreground alike, which is correct: a vignette is a look on the *frame*, not on the clip |
| style axis — `item.grade`, ken burns, crop/focal, brand style effects | merged into the media element's `style` | **foreground only** |
| `scope: 'media'` effects — `applyMediaEffects` wraps the media element from inside `SegmentMedia` | around the media element | **foreground only**, with `mediaStyle` = the foreground's computed style |
| anchored overlays | wrapped around the media node | around the pair — they are positioned against the frame, not the media |

Applying the style axis to both copies would double every grade and run ken burns twice
on one picture. Applying it to neither would silently drop a brand's look.

### Interaction with zoom and crop focus

| `fit` | Zoom (`crop.width`) | Crop focus X/Y |
|---|---|---|
| `cover` | zooms within the crop | chooses **what gets cropped away** |
| `blur-pad`, zoom = 1 | — | **inert** — nothing is cropped |
| `blur-pad`, zoom > 1 | zooms the foreground | active again, within the narrower frame |

### Editor UI

The user arriving at this control is not asking "which objectFit do I want", they are
saying "that shot is cut off". Strings are English, per the editor's convention.

A **Framing** group in the inspector, for clip / broll / photo:

- **Fit** — a segmented control of two tiles with a small glyph each: `Fill frame`
  (default) and `Whole shot + blurred backdrop`. First in the group, because it decides
  what the two controls under it mean.
- **Zoom** — relabelled from `Zoom (1 = fit)` to `Zoom (1 = none)`. The word "fit" is now
  the name of the control above it and cannot mean two things on one row.
- **Crop focus X / Crop focus Y** — renamed from `Focal X` / `Focal Y`.
- **Backdrop blur** (px) and **Backdrop dim** (0–1) — the backdrop's two knobs, disabled
  under `fit = cover` by the same grey-out pattern (value preserved, re-enabled on
  switching back), since there is no backdrop to tune.

When `fit = blur-pad` and zoom = 1, `Crop focus X/Y` are **disabled, not hidden and not
cleared**, with a one-line reason beneath: *"Nothing is cropped — the whole shot is
visible."* This is the pattern the grade panel already uses when an authored `grade`
effect takes over (`LayeredInspector.tsx`, Phase 4 Task 3.4) — greyed, value preserved,
re-enabled when the condition lifts. A dead control that doesn't say why it is dead is
the specific thing this design is trying not to ship.

`FrameOverlay` draws a draggable focus dot for `focalX/focalY`. Under the same condition
it must be hidden — nothing is cropped, so the dot would be pointing at a decision that
isn't being made. It already takes a `visible` prop; this is one condition, not new
machinery.

### The control most users should never find

`/toolkit:cut` already probes every source with ffprobe. It sets `fit: 'blur-pad'` itself
when a source's orientation doesn't match the composition's. The editor control is the
override, not the discovery path. This is the toolkit's stated split — the AI does the
heavy lifting, the editor is for final tuning.

## Testing

- **Parity is proven, not claimed.** `segment-media-merge-baseline.test.tsx` pins the
  18-cell style matrix byte-for-byte. It must pass **unmodified**; touching it would
  destroy the evidence it exists to provide.
- Backdrop carries no grade / ken burns / crop — asserted directly, since this is the
  contract's load-bearing claim.
- `scope: 'media'` effect wraps the foreground only, and receives the foreground's style
  as `mediaStyle`.
- `scope: 'clip'` effect still wraps the whole output, backdrop included.
- Zoom > 1 under `blur-pad` reaches the foreground's transform.
- `backdropBlur` / `backdropDim` reach the backdrop's filter, and `backdropDim` inverts
  into `brightness` exactly once (a dim of 0.45 must render `brightness(0.55)`, not
  `brightness(0.45)`).
- Inspector: disabled state and its reason line appear exactly under `blur-pad` + zoom 1;
  the stored `focalX/focalY` survive being greyed, and so do the backdrop knobs when
  greyed under `cover`.
- `FrameOverlay` hidden under the same condition.

## Gates

Per `CLAUDE.md`. The editor suite's test count **moves** with this change — re-derive it,
never carry the prior number forward. Typecheck by identity of the three known
pre-existing errors, not by count. The pixel harness renders transitions, not media
fitting, so it is untouched by this work and can be skipped with that reason stated.

## Out of scope

- `objectFit: 'contain'` without a backdrop.
- Vertical alignment. Right-aligned horizontally, centred vertically, fixed.
- A brand-level default for `backdropBlur` / `backdropDim`. The schema defaults are the
  only defaults; a brand wanting its own look sets them per item until a second brand
  needs otherwise.
