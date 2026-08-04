# The brand lane is derived, so it must not be editable

**Status:** decided 2026-08-04, deferred — to be implemented after the
timeline-ms/source-ms plan (`docs/superpowers/plans/2026-08-04-timeline-vs-source-ms.md`).

## The report

"Brand logo nemizí i když na timeline je čas jeho konce upravený" — the watermark
keeps drawing after the end time set for it in the editor.

Reproduced on `pp-u-kamenne-vily` (progpce brand repo) with
`brand-watermark.endMs` set to 34000 while `brand-disclaimer.endMs` stayed at
41667. The watermark drew to 41667.

## Two independent causes, in two different repos

### 1. The brand's own track renderer collapses the items (brand repo)

`projects/<name>/src/config/composition-theme.tsx`, `CampaignBrandTrack`:

```tsx
const brandEndMs = items.length > 0 ? Math.max(...items.map((b) => b.endMs)) : 0;
return (
  <Sequence from={0} durationInFrames={Math.round((brandEndMs / 1000) * fps)}>
    <PersistentOverlay />
  </Sequence>
);
```

Every brand item is collapsed into ONE Sequence whose length is the **maximum**
end across all of them, holding a single `<PersistentOverlay />` that draws the
watermark and the disclaimer together and never receives the items at all (it
reads its styling from the theme). So an individual item's `endMs` is
structurally unreachable: the renderer only ever feeds it into a `Math.max`.
Lowering the watermark's end changes nothing unless it happens to be the
maximum, and if it is, it moves the disclaimer too.

Note that **core already does this correctly**: `defaultRenderBrandTrack`
(`lib/theming/brand-track.tsx:63-89`) mounts each item in its own
`[startMs, endMs)` Sequence via its registered per-kind renderer. The brand
overrode that with the collapse because `PersistentOverlay` is one component
drawing both marks, and the brand registers no per-kind brand renderers.

### 2. The editor offers an edit it cannot honour (core)

`lib/editor/app/LayeredInspector.tsx:1969-1971` gives a selected brand item two
editable timecode fields:

```tsx
<TimecodeField lbl="Start" ms={b.startMs} … onCommit={… patchItem('brand', id, { startMs: ms })} />
<TimecodeField lbl="End"   ms={b.endMs}   … onCommit={… patchItem('brand', id, { endMs: ms })} />
```

Meanwhile the timeline treats the same lane as locked — `LOCKED_LANES`
(`lib/editor/app/LayeredTimeline.tsx:615`) contains `brand`, which removes its
resize handles (`flexible: false`) and refuses to move it. **The two surfaces
disagree about whether brand timing is editable at all**, and the inspector is
the one that lets a value through.

## The decision

Not "make per-item ends work". The brand lane's span is **derived from the
content end** — that is what `CLAUDE.md` has always said it is — so an editable
control for it is itself the defect. From the user, verbatim in intent:

> mělo by to fungovat tak, že na outro už to vidět není a současně by pak nemělo
> být možné editovat časování v editoru, protože když to jde a ono to nefunguje,
> je to matoucí

So:

1. **The brand overlay ends where the content ends** — before the outro, derived
   rather than authored. The watermark and disclaimer must not draw over the
   outro.
2. **The editor must not offer to edit brand timing.** Remove the two
   `TimecodeField`s from the brand panel and show the derived span read-only, so
   the inspector agrees with the timeline's already-locked lane.

The general principle, worth stating because it will recur: **a control that
cannot change the output is worse than no control.** A missing affordance is a
question the user asks once; a dead one costs them a debugging session and their
trust in every other field on the panel.

## What implementing this must not break

- Reels already published depend on today's rendered picture. Splitting the two
  marks into per-kind renderers (if that route is taken for cause 1) changes the
  DOM they render in, so it needs a visual check, not just a passing typecheck.
- Whatever derives "the content end" must agree with what the timeline draws for
  the brand lane, or the two disagree again in the opposite direction.
- `defaultRenderBrandTrack` is core's contract and is correct; do not change it
  to match the brand's collapse.
