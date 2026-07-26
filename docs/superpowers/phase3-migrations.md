# Brand-repo migrations — Phase 3

> **STATUS: NOT APPLIED.** Phase 3 was core-only. Nothing under
> `~/Workspace/progpce/video-toolkit` (Progresivní Pardubice, "PP") or
> `~/Workspace/roost/video-toolkit` (ROOST) was modified. This is the pending work.

**What this is.** Core now ships a generic for every kind a reel can contain, plus the registry
that lets a brand override any of them (see `phase3-extension-contract.md` for the contract
itself). Every one of those generics is worthless until a brand adopts it. This file is the
adoption list: 16 items, each with verified paths, a paste-ready replacement, a **parity grade**,
and a verification command.

**This document is a hypothesis, not an inventory.** Its predecessor,
`phase2-migrations.md`, was written by inspecting both brand repos carefully — and applying it
still found seven places where it was wrong, one of which ("PP needs nothing") cost a real
rendering regression. Every item below was written by opening the real brand file. Where the
plan that commissioned this document disagreed with the file, **the file won**; those
corrections are listed in §0 and repeated inline. Expect this document to be wrong somewhere
too, and check before you paste.

---

## Two things to read before item 1

### The roost baseline is FROZEN and the working tree is NOT it

Every roost item below is written against **branch `chore/phase2.5-toolkit-migration`
(`aecf1b9`), toolkit pinned at core `59d4b30`** — the reviewed Phase 2.5 state named in
`HANDOFF.md`. It was read with `git show chore/phase2.5-toolkit-migration:<path>`, not from the
working tree.

The working tree at `~/Workspace/roost/video-toolkit` is **checked out on
`claude/exciting-hellman-35e25a`** with concurrent work from another session: its log carries
`bump toolkit -> core e84473f9 / 1b4dd491 / edd43d3a`, core SHAs that do not exist in this repo's
history, and files have already moved mid-flight —
`templates/roost-reels/src/lib/resolve-video-source.ts` existed at the start of the session that
wrote this and is gone now. **Every roost item must be re-verified against the branch you are
actually on before it is applied.** Line numbers especially.

PP (`~/Workspace/progpce/video-toolkit`) is stable and clean, and its items were read from the
working tree. **Its branch, re-verified 2026-07-26: `ffcc442` is on `main`, not on
`chore/phase2.5-toolkit-migration`** — that branch sits behind at `04fd0d1`. The SHA an earlier
draft gave was right; the branch name was wrong. Check out `main` (or just confirm you are at
`ffcc442`) before pasting any PP item.

### The PP projects are STALE, so item 15 runs FIRST

This is the single most consequential thing this document found, and it reorders the whole list.

PP has **11 campaign-shaped projects** with a vendored `src/`, and **their `src/` is on the
pre-Phase-2 assembly.** Verified by `diff -rq projects/<p>/src templates/campaign-reels/src` for
every one of them:

- the projects have **no `src/config/composition-theme.tsx`** and **no
  `src/config/video-item-renderers.tsx`** — those files exist only in the template;
- their `src/LayeredCampaignReel.tsx` is the old ~400-line inline assembly ("HYBRID assembly
  (plan D5)"), not the template's 30-line wrapper around `LayeredReelComposition`.

**Consequence:** items 1, 2, 3, 5, 6 and 12 edit files that *do not exist in any project*. Doing
them in the template and then running `sync_template` (item 15) is one edit each. Doing them
"per project" is impossible. **Order: item 15 first (to bring the projects onto the template's
shape), then the template edits, then item 15 again to propagate.**

---

## §0 — Where the plan was wrong

Recorded the way Phase 2.5's "six things the migration document got wrong" section is, because
this is the most reusable output of the exercise.

| # | The claim | What the file says |
|---|---|---|
| 1 | Item 1 (`overlayItems` → `overlays`) applies to **both** repos | **PP only, and one file.** `git grep overlayItems` over roost's baseline returns nothing — roost never used the composition tier. PP has exactly two hits, both in `templates/campaign-reels/src/config/composition-theme.tsx` (lines 76 and 173). |
| 2 | "all **12** PP brand items have `startMs: 0`" | **24**, not 12: 2 per Root (watermark + disclaimer) × 11 projects + the template. The *fact* holds — every one is `startMs: 0` — but the count was half. |
| 3 | "most `project.json` files lack a `template` field" | **False for PP.** All 15 PP `project.json` files that exist carry it. The two real gaps are different in kind: `projects/pp-ricni-sauna/` **has no `project.json` at all**, and roost's `projects/roost-reel-01/project.json` carries only `{name, phase, updated}`. |
| 4 | web-program-intro has "**4** pre-existing `TS2322`s" | **18.** `templates/web-program-intro` → 1; `pp-program-bydleni` → 1; `pp-program-klima` → 9; `pp-program-mobilita` → 7; `pp-program-obvody` → 0; `pp-program-verejny-prostor` → 0. All the same class (a segment literal missing `audioMode`), all in `Root.tsx`, all pre-existing. |
| 5 | Item 6 (`MultiClipSegment` → `GenericMultiClip`) is "parity-preserving only if every literal maps to a token" | **Not a token problem.** `GenericMultiClip` renders **no overlay at all**, and PP's one live multi-clip (`pp-05-zastupitelsky-klub` `seg-001`) carries an anchored **title** (`seg-001-ov`) that `MultiClipSegment.tsx:132` draws. Adopting the generic **deletes that title from the frame.** Regraded: **deliberate look change.** |
| 6 | Item 15 is "mechanical, but 11 directories" | **Not mechanical, and 16 directories.** 11 campaign-shaped + 5 web-program-intro-shaped have a vendored `src/`. `sync_template` protects only `{Root.tsx, config/demo.config.json}` (`video_toolkit/sync_template.py:50`), and **four projects carry project-authored files under `src/` that it would overwrite or (under `--strict`) delete** — see item 15. |
| 7 | "brand `.editor/main.tsx` files still use the hand-written `editor-meta`" | **No brand authors an `editor-meta` at all.** `grep -rn editorMeta` over both repos' `templates/` and `projects/` returns nothing; every one of the 12 PP `main.tsx` files and roost's are the same 13-line `mountEditorHost` call with no `meta:`. The migration is an **addition** (a new capability), not a replacement — regraded accordingly in item 16. |
| 8 | Task 8's "`--strict` risk is nil today — zero extra files" | True of `.editor/`, **false of `src/`**, which the same tool mirrors. See item 15. |
| 9 | roost's `Watermark` migration needs `{vertical: 40, horizontal: 36}` | Correct — and **incomplete**. `GenericWatermark` has no `variant` prop, so roost's per-item `props.variant` (`'black' \| 'white' \| 'brown'`) would be silently ignored. See item 7. |

Two of the plan's harder claims were **confirmed exactly** by opening the file, and are worth
saying so: `frameOffsetSec` really does have 8 application sites (item 3), and PP's
`watermark.png` really is 256×256 square (`sips`, item 8).

---

## The items

Grades, used throughout:

- **parity-preserving** — the rendered frame is unchanged. Prove it with a still render, not an
  argument.
- **deliberate look change** — the frame changes. Adopt only with the user's agreement on what
  it should look like afterwards.
- **latent** — parity on today's data; the divergence goes live the first time a cut writes a
  value that today happens not to occur. Says so explicitly.

---

### 15. `sync_template` the vendored project copies — **DO THIS FIRST**

**Grade: parity-preserving in intent, and no longer destructive — but NOT mechanical. Expect
`PROTECTED` output on every project, and read it.**

**Where.** 16 vendored `src/` trees: 11 campaign-shaped (`pp-05-zastupitelsky-klub`,
`pp-cyklostezka-chrudimka`, `pp-druzstevni-parkovani`, `pp-mov-koalice`,
`pp-namesti-republiky`, `pp-paro-2026`, `pp-plovarna-napojeni`, `pp-program-klima-reel`,
`pp-program-mobilita-reel`, `pp-rezidentni-parkovani`, `pp-ricni-sauna`) and 5
web-program-intro-shaped (`pp-program-bydleni`, `pp-program-klima`, `pp-program-mobilita`,
`pp-program-obvody`, `pp-program-verejny-prostor`). Only the 11 campaign ones have `.editor/`;
neither WPI's template nor its projects ship one.

**What `sync_template` now carries** (Phase 3 Task 8): `src/`, plus `.editor/`,
`remotion.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tailwind.config.ts`,
`.prettierrc.json`, and a **merging** `package.json`.

**What changed, and what you must still expect.** This document originally listed four hazards,
because at the time `PROJECT_OWNED = frozenset({"Root.tsx", "config/demo.config.json"})` was the
*entire* protected set under `src/` — a dry run against the real PP repo with **no flags**
reported `updated  src/segments/OutroSegment.tsx` for `pp-mov-koalice`, i.e. it would have
silently destroyed 83 lines of client work sitting at the template's exact path. **That is fixed
in core (`66fff5f`)** by a `.template-sync.json` provenance manifest: the tool records the hash it
wrote at each path, and any file that differs from its record — **or has no record at all** — is
treated as project-authored and reported `PROTECTED`, never written. `--strict` only deletes files
the manifest says the tool placed and the project has not touched. `--force` is the only way to
lose content, and it is never the first move.

**Consequence you must plan for: every existing project will report `PROTECTED` files on its
first sync.** Measured 2026-07-26: PP has **16** vendored `src/` trees and roost **1**, and **not
one of them carries a `.template-sync.json`** (`find . -name '.template-sync.json' -not -path
'*/node_modules/*'` → 0 in both repos). No manifest means unknown provenance, and unknown
provenance deliberately reads as *authored*. So the first run on each project prints several
`PROTECTED` lines. **This is correct and safe — it is the fix working, not a failure.** Legacy
projects self-bootstrap: files already byte-identical to the template are provably safe and get
recorded on that first run, so the second run is quiet. Read every `PROTECTED` line, confirm
whether it really is project work, and only then decide. **Do not reach for `--force`.**

The four specific files that were the original hazards are exactly the ones you should expect to
see reported, and each is genuinely project-authored:

1. `pp-mov-koalice/src/segments/OutroSegment.tsx` — an 83-line coalition outro drawing a Noví
   lidovci partner logo over the PP stinger (the template's is 10 lines). The right long-term fix
   is to convert it to a **registered `outro` renderer** (see item 5's note); until then,
   `PROTECTED` is the correct outcome.
2. `pp-05-zastupitelsky-klub/src/lib/`, `pp-paro-2026/src/segments/plates/LinkPlate.tsx`,
   `pp-program-klima-reel/src/graphics/` — project-authored trees that `--strict` would once have
   deleted. The manifest now refuses to delete what it cannot prove it placed.
3. Still true, and still a rule rather than an observation: the project **root** is unreachable to
   deletion (`_mirror_file` has no delete path), so `CLAUDE.md` / `project.json` / `public/`
   survive regardless of flags.

**Also fixed here (a prerequisite, not a nicety):** `--template` defaults to `project.json`'s
`template` field. `projects/pp-ricni-sauna/` has **no `project.json`**, and roost's
`projects/roost-reel-01/project.json` has no `template` key. Backfill both — it is the
difference between one loop and hand-passing `--template` per invocation.

```bash
# projects/pp-ricni-sauna/project.json  (CREATE — the file does not exist)
{
  "name": "pp-ricni-sauna",
  "template": "campaign-reels",
  "phase": "complete"
}
```

```jsonc
// projects/roost-reel-01/project.json — ADD the one key
{
  "name": "roost-reel-01",
  "template": "roost-reels",   // <-- add
  "phase": "…",
  "updated": "…"
}
```

**Paste-ready run (PP), dry first, always:**

```bash
cd ~/Workspace/progpce/video-toolkit
for p in pp-05-zastupitelsky-klub pp-cyklostezka-chrudimka pp-druzstevni-parkovani \
         pp-mov-koalice pp-namesti-republiky pp-paro-2026 pp-plovarna-napojeni \
         pp-program-klima-reel pp-program-mobilita-reel pp-rezidentni-parkovani \
         pp-ricni-sauna; do
  echo "=== $p ==="
  python3 -m video_toolkit.sync_template "$p" --dry-run
done
```

Read every `updated` **and** every `PROTECTED` line before dropping `--dry-run`. `updated` means
the tool can prove it placed that file and the project has not touched it. `PROTECTED` means it
cannot prove that, so it is leaving the file alone — expect a handful per project on the first
run (see above), and treat each one as a question to answer, not noise to suppress.

**Verify:**
```bash
cd projects/<p> && npx tsc --noEmit && npm test
git diff --stat            # expect src/ churn; expect NO churn in Root.tsx
npm run render -- --frames=45   # one still per project, diffed against its pre-sync baseline
```

---

### 1. PP — collapse `overlayItems` into the unified `overlays`

**Grade: parity-preserving.** The two registries merge with the composition tier winning per
kind, so both shapes work today; this just removes the deprecated tier.
**Correction: PP only.** Roost has no `overlayItems` (verified: `git grep overlayItems` over the
roost baseline returns nothing).

**Where.** `templates/campaign-reels/src/config/composition-theme.tsx` — declaration at line 76,
use at line 173. `brandTheme.overlays` is already the modern form
(`src/config/brand-theme.tsx:20`), and reaches the theme via the `...brandTheme` spread at line
163. The merge below is what keeps both.

```diff
-const overlayItems: CompositionTheme['overlayItems'] = {
+const overlayItems: NonNullable<CompositionTheme['overlays']> = {
   title: { routing: 'anchored' },
```
```diff
 export const compositionTheme: CompositionTheme = {
   ...brandTheme,
   background: '#0a0a0a',
   video: { … },
-  overlayItems,
+  // ONE registry (Phase 3 Task 1). brandTheme.overlays carries the core `text`
+  // adapter; these are campaign's own kinds. Spread order = the old precedence:
+  // the composition tier won per kind.
+  overlays: { ...brandTheme.overlays, ...overlayItems },
   renderBrandTrack: (items) => <CampaignBrandTrack items={items} />,
   resolveAudioSource,
 };
```

**Verify:** `cd templates/campaign-reels && npx tsc --noEmit` (0 new errors) **and** a still
render at a frame carrying a chevron or stat-callout, byte-compared to baseline.

---

### 2. PP — `blend` as a registered effect; delete `extractEffects`

**Grade: deliberate look change unless a still render proves otherwise — and there are TWO
independent hazards, not one.**

**Where.** `templates/campaign-reels/src/config/video-item-renderers.tsx:35-55` defines
`extractEffects`; it has **exactly one call site**, `BrollItem` at line 166. It pulls
`ken-burns` (now core's, applied inside `SegmentMedia`) and `blend` out of `item.effects[]` and
turns them back into the named `kenBurns` / `blendTo` / `blend` props `FootageSegment` still
takes (`brand-lib/segments/FootageSegment.tsx:66-82`, consumed at 121-188).

**Hazard 1 — expressibility.** `blend` is a gradient-masked cross-blend of a *second video
source* (`FootageSegment.tsx:180-187`, a `linear-gradient` mask sweeping a second
`<OffthreadVideo>`). Core has no primitive for it: `grain`/`scanlines`/`vignette`/`grade`/
`transform` are all single-layer decorations. So `blend` must be registered as a **brand
effect**, not mapped onto a generic.

**Hazard 2 — coverage, and this is the one that bites.** `applyEffects` is wired at
`renderVideoItemNode` in `lib/render/layered-composition.tsx`, so an effect wraps the video
renderer's **entire returned tree**. PP's `FootageSegment` returns one `AbsoluteFill`
(`FootageSegment.tsx:216`) containing `SegmentMedia` (218), the `CaptionStrip` (241) **and** the
`TitleOverlay` (252). A registered `blend` — or any future core `grade`/`grain` on a PP clip —
would therefore also cover the caption and the title, which the current in-body implementation
does not. (Roost is unaffected: `RoostSegment`'s `vintageWrap` is already its renderer's root,
and it draws no text.)

```tsx
// templates/campaign-reels/src/config/composition-theme.tsx — ADD
import { BlendEffect } from '../effects/BlendEffect';   // extracted from FootageSegment

export const compositionTheme: CompositionTheme = {
  …
  effects: {
    blend: { renderer: BlendEffect, params: [
      { prop: 'to',        label: 'Blend to',  type: 'string' },
      { prop: 'direction', label: 'Direction', options: ['tl-br','tr-bl','bl-tr','br-tl'] },
      { prop: 'startPct',  label: 'Start %',   type: 'number' },
      { prop: 'endPct',    label: 'End %',     type: 'number' },
      { prop: 'softness',  label: 'Softness',  type: 'number' },
    ] },
  },
};
```
…then delete `extractEffects` (lines 35-55) and the destructure at line 166, and drop
`kenBurns` / `blendTo` / `blend` from `BrollItem`'s `segment` literal (lines 181-183).

**Verify (mandatory, both):**
```bash
cd projects/<a-project-with-a-blend-broll> && npx tsc --noEmit
npm run render -- --frames=<mid-blend frame>   # diff against baseline; the sweep must be identical
npm run render -- --frames=<a frame with a title AND a blend>   # hazard 2 shows here or nowhere
```

---

### 3. PP — `frameOffsetSec`: all **8** application sites move together

**Grade: parity-preserving if and only if all 8 move together.** A migration that moves four
leaves four behind and silently desynchronises titles from captions on handle-bearing items.

**Where.** `templates/campaign-reels/src/config/video-item-renderers.tsx`. **Computed at 4
sites** — 129 (`ClipItem`), 163 (`BrollItem`), 203 (`MultiClipItem`), 236 (`PhotoItem`), each
`const frameOffsetSec = handles.inHalf / fps;`. **Applied at 8:**

| # | Line | What |
|---|---|---|
| 1 | 136 | `ClipItem` `trimIn: Math.max(0, item.sourceInMs / 1000 - frameOffsetSec)` |
| 2 | 143 | `ClipItem` `titleOverlaySpec(titleOverlay, item, frameOffsetSec)` |
| 3 | 155 | `ClipItem` `boundTranscript(item, boundAudio, frameOffsetSec)` |
| 4 | 171 | `BrollItem` `trimIn` |
| 5 | 184 | `BrollItem` `titleOverlaySpec` |
| 6 | 195 | `BrollItem` `boundTranscript` |
| 7 | 228 | `MultiClipItem` `titleOverlaySpec` |
| 8 | 248 | `PhotoItem` `titleOverlaySpec` |

Confirmed by opening the file — the plan's "8, not 4" is right. Note `trimOut` at 137 and 172
uses `handles.outHalf / fps` **directly**, not `frameOffsetSec`; it is a fifth and sixth handle
site but not a `frameOffsetSec` one, and it must not be folded in by a careless regex.

The offset exists because a video item's Sequence starts *earlier* than its authored `startMs`
when it borrows an entering handle (core's `buildVideoNodes`), so a body computing its own
timing off `useCurrentFrame()` sees a local frame 0 that no longer lines up. The three consumers
each need it in their own unit: seconds off a trim (1, 4), **milliseconds** added to `appearAt`
(2, 5, 7, 8 — see `titleOverlaySpec`, line 83: `frameOffsetSec * 1000`), and **seconds** added
to word times (3, 6 — `boundTranscript`, line 106).

**There is no core replacement for this yet.** It is not "delete and adopt"; it is "know that any
refactor of these renderers must carry all 8". Recorded here so the next person does not
discover it by shipping a reel whose captions run 200 ms ahead of its title.

**Verify:** a still render at the **first frame after a handle-bearing cut** on a clip that
carries both a title and captions. That single frame is the only one where a missed site shows.

---

### 4. roost — `vintage`: **STAYS brand-registered. Do not migrate.**

**Grade: deliberate look change, and the recommendation is NOT to make it.** This is what the
registry is for.

**Where (baseline).** `templates/roost-reels/src/effects/VintageOverlay.tsx` (73 lines) and
`templates/roost-reels/src/segments/RoostSegment.tsx:29-59`.

Roost has two vintage modes and neither maps onto core's primitives:

| Roost | Core primitive | Verdict |
|---|---|---|
| `film`: `<HtmlInCanvas effects={[paper({folds:0,scale:0.3,amount:0.6,colorFront:'#6b4f34',colorBack:'#f6efdd'}), noise({amount:0.1,seed:frame})]}>` (`RoostSegment.tsx:34-45`) | — | **No mapping.** A different *rendering mechanism* — `@remotion/effects` on a canvas — not a harder CSS filter. |
| `FILM_FILTER = 'sepia(0.22) saturate(0.82) contrast(0.94) brightness(1.03)'` (`VintageOverlay.tsx:13`) | `grade` | **No.** `sepia(0.22)` needs a non-diagonal white-balance matrix; core's `gradeWbMatrixValues` covers temperature/tint, not sepia. |
| `VHS_FILTER` incl. `hue-rotate(-8deg)` (line 14) | `grade` | **No.** No hue-rotate in core's grade. |
| VHS scanlines: `repeating-linear-gradient` at a **1-in-4 duty cycle** (0-1px dark, 2-4px clear), `multiply`, opacity 0.6 (lines 50-54) | `scanlines` | **No.** Core's primitive has no duty-cycle parameter. |
| VHS grain: a **scrolled PNG tile**, `staticFile('brand/grain.png')`, 512px, deterministic per-frame offset `(frame*37)%512`, `overlay` blend (lines 18-35) | `grain` | **No.** Core's grain is an `feTurbulence` filter, not a tiled asset. |
| VHS tracking band: a 120px gradient translating upward at 9px/frame, `screen`, opacity 0.5 (lines 57-67) | — | **No mapping.** |
| VHS vignette: `radial-gradient(ellipse at center, rgba(0,0,0,0) 60%, rgba(0,0,0,0.30) 100%)` (lines 68-70) | `vignette` | **Yes** — exactly `{ radiusPct: 60, strength: 0.30 }`. |

One of seven maps. **Migrating `vintage` is a deliberate look change, not a refactor.** Implementer
and reviewer agreed independently, and the controller ruled it: it stays registered on
`BrandTheme.effects`. The only work here is *declarative*, so the editor learns the kind:

```ts
// templates/roost-reels/src/config/brand-theme.ts — ADD to the existing BrandTheme
  effects: {
    vintage: {
      // No `renderer`: roost applies vintage inside RoostSegment's own wrap
      // (vintageWrap), so this registration is params-only — and per the
      // resolution rule it does NOT mask any core generic (there is none for
      // 'vintage' anyway).
      params: [{ prop: 'mode', label: 'Vintage', options: ['film', 'vhs'] }],
    },
  },
```

**Verify:** `cd templates/roost-reels && npx tsc --noEmit`, then open the editor and confirm a
`vintage` effect offers the two-value dropdown. No render change is expected; a still render
should be byte-identical.

---

### 5. PP — `OutroSegment` → `GenericOutro`

**Grade: parity-preserving for 11 of 12 files; `pp-mov-koalice` is a deliberate look change and
must NOT be migrated.**

**Where.** `templates/campaign-reels/src/segments/OutroSegment.tsx` (10 lines), rendered by
`OutroItem` at `video-item-renderers.tsx:270` (`() => <OutroSegment />` — it takes no props at
all). `md5` across the 12 copies: **11 byte-identical**, 1 divergent
(`projects/pp-mov-koalice/src/segments/OutroSegment.tsx`, 83 lines — see below).

The structure is identical to core's: muted `<OffthreadVideo>` + separate `<Audio>`
(`OutroSegment.tsx:6-7` vs `GenericOutro.tsx:43-44`). Both assets are `brand/`-role, which has
no folder in `ROLE_FOLDERS`, so `resolveGenericSource` is the identity — the resolved URLs are
byte-identical.

Delete the registration and move the asset names into the item's `props`:

```diff
 // templates/campaign-reels/src/config/composition-theme.tsx
   video: {
     clip: { renderer: ClipItem },
     broll: { renderer: BrollItem },
     'multi-clip': { renderer: MultiClipItem },
     photo: { renderer: PhotoItem },
     card: { renderer: CardItem },
-    outro: { renderer: OutroItem },
   },
```
…then delete `OutroItem` (`video-item-renderers.tsx:270`), its `OutroSegment` import (line 21),
and `src/segments/OutroSegment.tsx` itself. Each outro item in every `Root.tsx` gains:

```ts
{ id: 'outro', kind: 'outro', startMs: …, endMs: …,
  props: { video: 'brand/outro.mp4', audio: 'brand/outro.mp3' } },
```

**`pp-mov-koalice` is the counterexample, and it is a good one.** Its `OutroSegment` draws a
Noví lidovci partner logo (`logos/novi-lidovci.svg`) over the PP stinger with a tuned
fade+slide (appear f36, entry 12f, fade-out 165→180f). `GenericOutro` cannot express that.
That project keeps a registered `outro` renderer — which is precisely the extension contract
working as designed, not a failure of it. **See item 15: `sync_template` would overwrite that
file.**

**Verify:**
```bash
cd projects/<p> && npx tsc --noEmit
npm run render -- --frames=<a frame inside the outro>   # byte-compare to baseline
```

---

### 6. PP — `MultiClipSegment` → `GenericMultiClip`

**Grade: DELIBERATE LOOK CHANGE — regraded. The plan called this "parity-preserving only if
every literal maps to a token"; the literals are not the problem.**

**The blocker.** `GenericMultiClip` renders **no overlay whatsoever**. PP's
`brand-lib/segments/MultiClipSegment.tsx:129-132` dispatches four overlay kinds, and
`MultiClipItem` (`video-item-renderers.tsx:228`) feeds it an anchored **title**. PP's one live
multi-clip — `projects/pp-05-zastupitelsky-klub` `seg-001` — carries exactly that:
`seg-001-ov`, `content.kind: 'title'`, `anchorVideoId: 'seg-001'`,
text `'Spojili jsme {lime:síly}{teal:.}'`, span 1500-4500 ms. **Adopting the generic deletes it
from the frame.** Fix that first (re-route `title` to `track` for multi-clip items, or keep a
thin brand renderer that composes `GenericMultiClip` + `TitleOverlay`) or do not adopt.

**Three further divergences, all real, all verified:**

1. **`pip` layout draws a label on the full-bleed pane.** Core: `renderLabel(0)` at
   `GenericMultiClip.tsx:143`. PP: `<div …>{renderClip(0)}</div>` at
   `MultiClipSegment.tsx:97` — no label. A pip whose source[0] has a `label` gains one.
2. **The `quad` grid cell count differs for sparse `sources`.** PP maps `[0,1,2,3]`
   unconditionally (line 117) → always four grid cells. Core filters
   (`.filter((i) => item.sources[i])`, line 177) → fewer cells, so the surviving panes *resize*.
3. **Bare sub-source filenames route to a different folder — LATENT.** PP's `resolveSource`
   (lines 24-27) defaults a bare name to **`broll/`**. Core synthesises the sub-item as
   `kind: 'clip'` (`GenericMultiClip.tsx:84`), so `resolveMediaSource` gives it role `clip` →
   **`recordings/`**. Latent today: `pp-05`'s two sub-sources are `recordings/seg01a.MP4` and
   `recordings/seg01b.MP4`, full paths, and the slash rule returns both untouched. It goes live
   the first time a cut writes a bare sub-source name.

**The token mapping itself is complete** — enumerated against `MultiClipSegment.tsx`:

```ts
// templates/campaign-reels/src/config/composition-theme.tsx
  tokens: {
    multiClip: {
      borderPx: 4,               // lines 75, 86: '4px solid #0a0a0a'
      borderColor: '#0a0a0a',
      background: '#0a0a0a',     // lines 115, 127
      quadGapPx: 4,              // line 114
      pip: { width: 360, height: 480, right: 60, bottom: 280,
             borderPx: 4, borderColor: '#c6f432' },   // lines 99-101
      label: { fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
               fontSize: 22, color: '#c6f432', top: 24, left: 24,
               letterSpacing: '0.08em',
               textShadow: '0 2px 8px rgba(0,0,0,0.6)' },   // lines 62-66
    },
  },
```

**Verify (mandatory):** a still render at a frame **inside** `seg-001` of
`projects/pp-05-zastupitelsky-klub` — the title is either there or it is not.

---

### 7. roost — `Watermark.tsx` → `GenericWatermark` `mode: 'tint'`

**Grade: parity-preserving for the one shipping item; the `variant` prop is a functional loss
that must be handled, not ignored.**

**Where (baseline).** `templates/roost-reels/src/overlays/Watermark.tsx` (49 lines);
`templates/roost-reels/src/config/composition-theme.tsx:30-47` (`RoostBrandTrack`) and its
registration at line 54; `templates/roost-reels/src/config/theme.ts:24`.

Confirmed against core: roost's technique — the PNG as an alpha **mask** over a solid-colour div
— is exactly what `mode: 'tint'` does (`GenericWatermark.tsx:93-111`; every `WebkitMask*`
longhand matches roost's lines 38-45, `maskSize: 'contain'` included). Margins confirmed:
`{ top|bottom: 40 }` and `{ right|left: 36 }` (`Watermark.tsx:23-24`) → `margin: { vertical: 40,
horizontal: 36 }`. `sizePx: 170` and `alpha: 0.7` from `theme.ts:24`.

**The gap the plan missed.** `WatermarkProps` has **no `variant`**. Roost's `Watermark` maps
`'black' | 'white' | 'brown'` → `#090c0b` / `#f4efe2` / `#2f0c02` (`Watermark.tsx:7-11`), chosen
per item (`composition-theme.tsx:43`). The one brand item at the baseline —
`projects/roost-reel-01/src/Root.tsx:187-197` — carries `variant: 'black'`, so a straight port
to `color: theme.colors.black` is parity **for that item**. But any future item switching to
`white` or `brown` silently loses the switch. Two honest options: carry `color` on the item's
`props` at cut time, or keep a thin registered renderer that maps `variant` → `color`.

```ts
// templates/roost-reels/src/config/brand-theme.ts — ADD
  tokens: {
    watermark: {
      mode: 'tint',
      color: theme.colors.black,                    // '#090c0b'
      margin: { vertical: 40, horizontal: 36 },
    },
  },
```
```ts
// projects/roost-reel-01/src/Root.tsx — the brand item, `variant` → the generic's vocabulary
{
  id: 'brand-watermark', kind: 'watermark', startMs: 0, endMs: 13900,
  props: { asset: 'brand/watermark.png', corner: 'top-right',
           sizePx: 170, alpha: 0.7, mode: 'tint', color: '#090c0b' },
},
```
…then delete `RoostBrandTrack` (`composition-theme.tsx:28-47`), the
`renderBrandTrack` line (54), the `Watermark` import (10), and
`src/overlays/Watermark.tsx`.

**Latent span change, shared with item 8 — read it once, it applies to both brands.**
`RoostBrandTrack` mounts `from={0}` regardless of the item's `startMs`
(`composition-theme.tsx:38`); `defaultRenderBrandTrack` mounts each item over its own
`[startMs, endMs)` (`brand-track.tsx:78-79`). **Verified genuinely latent:** every brand item in
both repos has `startMs: 0` (roost: the one item above; PP: all 24). It goes live the moment a
cut writes a non-zero `startMs`.

**Verify:** `cd templates/roost-reels && npx tsc --noEmit`, then a still render of
`roost-reel-01` at any frame in `[0, 13900)` — the mark's colour, size and corner offsets must
be byte-identical.

---

### 8. PP — `PersistentOverlay` → `GenericWatermark` + `GenericDisclaimer`

**Grade: SPLIT. The watermark half is a pure refactor. The disclaimer half is a ~4 px look
delta.**

**Where.** `templates/campaign-reels/src/layers/PersistentOverlay.tsx` (40 lines,
**byte-identical across all 12 copies** — `md5`), mounted by `CampaignBrandTrack`
(`composition-theme.tsx:48-57`), registered at line 174. Values from
`src/config/theme.ts:14-26`.

**Watermark half — parity-preserving, correcting the plan.** The plan expected a look change
because `PersistentOverlay` hardcodes a square box (`width: sizePx, height: sizePx`,
`PersistentOverlay.tsx:5`) while `GenericWatermark` uses `height: 'auto'`
(`GenericWatermark.tsx:116`). **PP's `templates/campaign-reels/public/brand/watermark.png` is
256×256 — square** (`sips -g pixelWidth -g pixelHeight`, measured twice, independently
re-measured while writing this). `height: 'auto'` on a square asset in a 160px-wide box renders
160×160. **Pure refactor.** Corner/size/margin/alpha all map exactly.

**Disclaimer half — a real, small look delta.** `PersistentOverlay.tsx:28` sets
`padding: '6px 40px 4px'`. `GenericDisclaimer.tsx:45` emits `padding: 0 ${paddingX}px` — there
is **no vertical-padding token**. Since the div is bottom-anchored at `bottom: 0`
(`theme.ts:25`), dropping the 4 px bottom padding moves the legal line **down ~4 px**. Small,
but it is a look change and must be graded as one, not waved through. Either accept it, or lift
`bottomOffsetPx` to 4 to compensate (which is *not* the same thing — it also removes the 6 px
of top breathing room, which is invisible here only because nothing sits above the line).

Everything else maps: `textAlign: 'right'`, `fontFamily: 'JetBrains Mono, monospace'`,
`fontSize: 18`, `color: '#9a9a95'`, `letterSpacing: '0.05em'`, no background (core deliberately
has none), and no `alpha` (both default to 1).

```ts
// templates/campaign-reels/src/config/composition-theme.tsx
  tokens: {
    watermark: { /* mode 'image' is the default */ },
    disclaimer: {
      bottomOffsetPx: 0,       // theme.ts:25 — note the ~4px delta above
      paddingX: 40,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 18,
      color: '#9a9a95',
      letterSpacing: '0.05em',
      textAlign: 'right',
    },
  },
```
```ts
// each Root.tsx — the two brand items gain props
{ id: 'wm',   kind: 'watermark',  startMs: 0, endMs: <contentEnd>,
  props: { asset: 'brand/watermark.png', corner: 'top-right', sizePx: 160,
           marginPx: 48, alpha: 0.85 } },
{ id: 'disc', kind: 'disclaimer', startMs: 0, endMs: <contentEnd>,
  props: { text: 'Zpracovatel: Progresivní Pardubice · Zadavatel: Progresivní Pardubice' } },
```
…then delete `CampaignBrandTrack` (`composition-theme.tsx:48-57`), the `renderBrandTrack` line
(174), the `PersistentOverlay` import (18), and `src/layers/PersistentOverlay.tsx`.

**Also note the DOM-count change.** `CampaignBrandTrack` mounts **one** `PersistentOverlay`
spanning the union of the two items' end times, precisely because there is no separate
watermark-only body to reuse (its own comment, lines 41-47). `defaultRenderBrandTrack` mounts
**two** Sequences. Same pixels today (both items span `[0, contentEnd)`), different tree.

**Verify:**
```bash
cd projects/<p> && npx tsc --noEmit
npm run render -- --frames=45
# expect: watermark region byte-identical; disclaimer text ~4px lower.
```
Do **not** accept "the diff is small" as a pass — look at the two crops.

---

### 9. PP — `CaptionStrip` → `GenericCaptions` + `CaptionTokens`

**Grade: parity-preserving for the live mode, with the live module constants — and one latent
divergence in the dead mode.**

**Where.** `brand-lib/overlays/CaptionStrip.tsx` (293 lines), mounted from
`brand-lib/segments/FootageSegment.tsx:240-246` with `caption`, `transcript` and
`liftWindows` (computed at `FootageSegment.tsx:208-213` from title overlays).

**Three disagreeing sources of caption config, and only one renders.** Confirmed by opening all
three:

| Source | Status | Evidence |
|---|---|---|
| `CaptionStrip.tsx` module constants (13-20, 33, 35, 40, 146-152) | **LIVE — authoritative** | this is what draws |
| `templates/campaign-reels/src/config/theme.ts:36-45` | **DEAD** | `grep -rn 'theme\.caption'` over `templates/ brand-lib/ projects/` returns **nothing** |
| `brands/progresivni-pardubice/brand.json` `reels.caption` | **DEAD** | no `.ts`/`.tsx` in the repo reads `brand.json` at all |

Core took the live constants. **`theme.ts`'s `bottomPct: 0.28` is a trap**: adopting it would
move PP's captions 8% of frame height (207 px at 1920). And `brand.json`'s
`verticalPosition: 'lower-third'` is **not** `bottomPct` — it is a different vocabulary with no
defined numeric mapping. It also disagrees with the live code on two more values
(`background: 'rgba(10,10,10,0.85)'` vs the live opaque `#0a0a0a`; `paddingX: 24, paddingY: 16`
vs the live `POP_PAD_X 22 / POP_PAD_Y 10`). Do not map from it.

**The mapping, every field checked against the live constant:**

```ts
// templates/campaign-reels/src/config/composition-theme.tsx
  tokens: {
    caption: {
      mode: 'pop-focus',                            // CAPTION_MODE, line 116
      fontFamily: 'JetBrains Mono, monospace',      // FONT_FAMILY, 13
      fontSize: 52,                                 // FONT_SIZE, 14
      fontWeight: 700,                              // FONT_WEIGHT, 15
      color: '#f5f5f0',                             // POP_INACTIVE_COLOR, 151  <-- see below
      activeColor: '#c6f432',                       // POP_ACTIVE_COLOR, 152
      background: '#0a0a0a',                        // pill background, 196
      strokeColor: '#0a0a0a',                       // STROKE_COLOR, 17
      strokeWidthPx: 4,                             // STROKE_WIDTH_PX, 18
      maxWidthPct: 0.86,                            // MAX_WIDTH_PCT, 19
      bottomPct: 0.2,                               // BOTTOM_PCT, 20 — NOT theme.ts's 0.28
      liftBottomPct: 0.42,                          // LIFT_BOTTOM_PCT, 33
      gapBreakMs: 350,                              // SILENCE_BREAK_SEC 0.35, line 35
      lastLineGraceMs: 600,                         // LAST_LINE_GRACE_MS, 40
      maxChars: 28,                                 // linesFromWords default, 47
      maxWordsPerChunk: 4,                          // POP_CHUNK_SIZE, 147
    },
  },
```

**The latent divergence.** PP has **two different inactive colours**, one per mode:
highlight-mode `TEXT_COLOR = '#c6f432'` (line 16, used at 252) and pop-focus
`POP_INACTIVE_COLOR = '#f5f5f0'` (line 151). Core collapsed both onto the single token `color`.
Mapping to `#f5f5f0` is parity for the **live** mode; it would change highlight mode's line
colour from lime to linen. Latent because `CAPTION_MODE` is a hardcoded module constant
(line 116) and highlight is unreachable — but if a brand ever flips `mode: 'highlight'` via
tokens, that is what it will get. The halo is fine: PP hardcodes
`rgba(198,244,50, …)` (line 267), core derives it from `activeColor` via `withAlpha`, and
`#c6f432` → `rgb(198,244,50)` exactly.

**Verify:**
```bash
cd projects/<p> && npm run render -- --frames=<a frame mid-caption>
npm run render -- --frames=<a frame inside a title's lift window>   # exercises liftBottomPct
```

---

### 10. PP — delete the two dead caption config blocks

**Grade: cleanup. No render change (they are dead — proven in item 9).**

Delete `templates/campaign-reels/src/config/theme.ts:36-45` (the whole `caption:` block, whose
`bottomPct: 0.28` is actively dangerous — it is the one wrong number a future migrator would
most plausibly reach for), and `reels.caption` from
`brands/progresivni-pardubice/brand.json`.

**Or wire one instead of deleting both**, if the brand wants `brand.json` to be the source of
truth. That is a design decision, not a cleanup: `brand.json` is read by no TypeScript in the
repo today, so wiring it means building a loader **and** resolving the four value conflicts
listed in item 9 (`background` alpha, `paddingX`/`paddingY`, and `verticalPosition` vs
`bottomPct`). Do not do it by hand-porting numbers that already disagree with what renders.

**Verify:** `cd templates/campaign-reels && npx tsc --noEmit` and a still render — the frame must
be **byte-identical**. If it is not, the block was not dead and item 9's premise is wrong.

---

### 11. roost — delete `src/lib/resolve-video-source.ts`; use core's `resolveMediaSource`

**Grade: parity-preserving — core took roost's rule verbatim.**

> **Re-verify before applying.** At the frozen baseline this file exists; in the working tree at
> the time of writing it is **already gone**, removed by the concurrent session. Check which
> state you are in.

**Where (baseline).** `templates/roost-reels/src/lib/resolve-video-source.ts` (29 lines),
`templates/roost-reels/src/lib/resolve-video-source.test.ts`, and its one consumer
`templates/roost-reels/src/segments/RoostSegment.tsx` — import at line 23 (with the
`UPSTREAM-PENDING` comment at 22), applied at 103-106.

The rules are the same rule:

```ts
// roost, resolve-video-source.ts:24-28
if (raw.startsWith('http') || raw.includes('/')) return raw;
if (kind === 'clip')  return `recordings/${raw}`;
if (kind === 'broll') return `broll/${raw}`;
return raw;

// core, lib/theming/media-source.ts:61-68 — same predicates, table-driven
if (raw.startsWith('http')) return raw;
if (raw.includes('/')) return raw;
return ROLE_FOLDERS[role] ? `${ROLE_FOLDERS[role]}${raw}` : raw;
// ROLE_FOLDERS = { clip: 'recordings/', broll: 'broll/', audio: 'recordings/' }
```

Identical for `clip`/`broll`/`photo`. Core additionally covers `audio`/`music`/`brand`, which
roost never resolved. PP's bare filenames resolve identically under it — pinned by the
idempotence test in `lib/editor/src/media-source.test.ts`, which carries **both** brands' real
source strings and turns red when the PP prefix-list rule is swapped in.

**The simplification is bigger than a delete: `SegmentMedia` now resolves internally**
(`SegmentMedia.tsx:41,48` — `item.kind` maps 1:1 onto `MediaRole`). So `RoostSegment` does not
need to pre-resolve at all:

```diff
 // templates/roost-reels/src/segments/RoostSegment.tsx
-// UPSTREAM-PENDING: swap to `@video-toolkit/lib/theming` once core exports it.
-import { defaultResolveVideoSource } from '../lib/resolve-video-source';
@@
 export const RoostSegment: React.FC<VideoRenderProps> = ({ item, handles, config }) => {
   const displayMode = (item.props?.displayMode as string | undefined) ?? 'full-bleed';
-  const resolved =
-    item.kind === 'clip' || item.kind === 'broll' || item.kind === 'photo'
-      ? { ...item, source: defaultResolveVideoSource(item.source, item.kind) }
-      : item;
   return vintageWrap(
     vintageMode(item),
-    displayModeWrap(displayMode, <SegmentMedia item={resolved} handles={handles} config={config} />),
+    // Core's SegmentMedia applies the ONE media-path rule itself (Phase 3
+    // Task 6) — it is the same rule this file used to carry.
+    displayModeWrap(displayMode, <SegmentMedia item={item} handles={handles} config={config} />),
   );
 };
```
…then delete `src/lib/resolve-video-source.ts` and `src/lib/resolve-video-source.test.ts`.

**This one matters more than it looks.** Roost registers **no** source resolver on its theme and
renders core's `LayeredReelComposition` directly, so after this, core's `resolveMediaSource` is
**the only thing** standing between roost and broken media paths.

**Verify:**
```bash
cd templates/roost-reels && npx tsc --noEmit && npx vitest run
cd ../../projects/roost-reel-01 && npm run render -- --frames=45   # byte-compare
```
A wrong path here is loud (a 404 / black frame), not subtle.

---

### 12. PP — `resolveAudioSource` → core's default

**Grade: parity-preserving, proven by the Task 6 idempotence test.**

**Where.** `templates/campaign-reels/src/config/composition-theme.tsx:35-37`, registered at line
175.

```ts
// PP
return raw.startsWith('recordings/') || raw.startsWith('broll/') ? raw : `recordings/${raw}`;
// core: defaultResolveAudioSource = (raw) => resolveMediaSource(raw, 'audio')
//       → http passthrough; any slash passthrough; else 'recordings/' + raw
```

Identical on every input PP produces: its audio sources are bare filenames (the file's own
comment, lines 25-32) → both give `recordings/<name>`; an already-prefixed `recordings/…` or
`broll/…` contains a slash → both pass it through. Core's rule is the strict superset (it also
passes through `media/…`, which PP's would have broken into `recordings/media/…`).

```diff
-function resolveAudioSource(raw: string): string {
-  return raw.startsWith('recordings/') || raw.startsWith('broll/') ? raw : `recordings/${raw}`;
-}
@@
   renderBrandTrack: (items) => <CampaignBrandTrack items={items} />,
-  resolveAudioSource,
 };
```

**Note the precedence you are giving up.** `resolveAudioSource` **wins over**
`resolveMediaSource` on the audio track when present (`types.ts:204-209`). Remove it only
together with — or before — registering any wholesale `resolveMediaSource`, never after, or the
override silently stops applying to audio.

**Verify:** `npx tsc --noEmit`, then render any project with voice and confirm the audio is
present (a wrong path is silence, not a crash).

---

### 13. PP — dissolve `brand-lib/`

**Grade: per file. Two of eleven are blocked by item 14 — this cannot be finished until WPI
moves.**

**Where.** `brand-lib/` is at the **repo root** (not inside the template), reached via the
`@brand-lib` alias. 11 files, 1613 LOC, confirmed by `wc -l`:

| File | LOC | Disposition |
|---|---|---|
| `segments/FootageSegment.tsx` | 259 | **Blocked** — imported by WPI (`WebProgramIntro.tsx:5`). Shrinks to a thin `SegmentMedia` + captions wrapper once items 2, 9 land. |
| `segments/MultiClipSegment.tsx` | 135 | **Blocked** — imported by WPI (`WebProgramIntro.tsx:6`). Superseded by `GenericMultiClip`, but see item 6's blocker. |
| `overlays/CaptionStrip.tsx` | 293 | Deleted by item 9 (→ `GenericCaptions`). |
| `overlays/QuotePullOverlay.tsx` | 347 | Stays brand-registered — it is already the `text` renderer via `QuotePullAdapter` (`brand-theme.tsx:8-20`). Move under `templates/campaign-reels/src/overlays/`. |
| `overlays/TitleOverlay.tsx` | 108 | Stays brand — no core generic; move under the template. |
| `overlays/StatCalloutOverlay.tsx` | 59 | Stays brand — registered at `composition-theme.tsx:105`. |
| `overlays/SourceTagOverlay.tsx` | 47 | Stays brand — registered at 121. |
| `overlays/UpdateBadgeOverlay.tsx` | 175 | Stays brand — registered at 135. |
| `overlays/PartyLogosOverlay.tsx` | 104 | Stays brand — registered at 148, and **unreachable from the current schema** (its own comment). Candidate for deletion, not migration. |
| `overlays/AIVisualTag.tsx` | 67 | Stays brand — used inside `FootageSegment.tsx:247`. |
| `segments/GradeDefs.tsx` | 19 | **Delete.** `SegmentMedia` now emits its own self-contained white-balance `<filter>` def (`SegmentMedia.tsx:79-87`), so the brand-side `<GradeDefs>` at `FootageSegment.tsx:217` is redundant. |

So "dissolve" overstates it: **one file is genuinely replaced by core** (`CaptionStrip`), **one
is genuinely obsolete** (`GradeDefs`), **two are blocked on WPI**, and **seven are legitimate
brand components that simply live in the wrong directory** — they belong under
`templates/campaign-reels/src/overlays/`, registered as they already are. That is a move, not a
migration, and it is worth saying plainly rather than letting "1613 LOC" imply 1613 lines of
deletable duplication.

**Verify:** after each move, `cd templates/campaign-reels && npx tsc --noEmit` (the `@brand-lib`
alias must be updated in `tsconfig.json`, `vitest.config.ts` and `.editor/vite.config.mts` —
remember Rule 1 from `phase2-migrations.md`: config files import by **relative** path), then a
full still render.

---

### 14. PP — migrate `web-program-intro` onto `LayeredReelComposition`

**Grade: SCOPED SPEC, not a paste-ready diff. This item needs its own planning session.**

Writing this as a diff is how `phase2-migrations.md` acquired its false negatives. Here is what
a plan for it has to solve, each point verified by opening the file.

**1. WPI does not use the layered schema at all.** `src/config/schema.ts` (62 lines) is
`z.discriminatedUnion('type', [ClipSegmentSchema, BrollSegmentSchema, MultiClipSegmentSchema])`
inside `segments: z.array(SegmentSchema).min(1)` — an **implicitly ordered, seconds-based** list.
The layered model is **absolute-ms tracks** (`video`/`audio`/`overlay`/`brand`/`music`) with
explicit `startMs`/`endMs`. This is a config-shape rewrite, not a renderer swap. Every one of
the 5 vendored WPI projects' `Root.tsx` literals has to be re-derived.

**2. `TransitionSeries` SHRINKS; core EXTENDS handles. Durations WILL change.** WPI uses
`<TransitionSeries>` (`WebProgramIntro.tsx:115`), whose transitions consume frames from the
adjacent sequences — which is exactly why it passes `handles: { inHalf: 0, outHalf: 0 }` at
lines 167 and 171, with the reason spelled out in its own comment (lines 134-136). Core's
`buildVideoNodes` instead borrows handle frames beyond the authored trim so a transition renders
without moving any item's span. **The total duration and every item's on-screen span change
unless the literal is re-derived.** Budget for that; do not assume a mechanical port holds
timing.

**3. The music ducking maps — but not as an identity, and it gains a fade.** WPI's system
(lines 60-111) rebuilds its own frame timeline (67-82), classifies each frame
`voice | broll-silent | none` from the segment's `audioMode` (87-105), and multiplies the base
volume by `10^(6/20)` for `broll-silent` (84-85, 107-111). Core's `computeMusicEnvelope`
(`lib/reel-config-base/music-envelope.ts`) does the structurally identical thing — a
`findPrimaryVideoItemAt` scan (32-42) with the *same* "latest-starting wins" tie-break, times
`10^(item.musicBoostDb/20)` (48-49). **The difference is where the number comes from:** core
reads an explicit per-item `musicBoostDb` field; WPI *derives* it from `audioMode`. So the
migration must compute `musicBoostDb: 6` at cut time for every item WPI's `classifyFrame` would
call `broll-silent`, and `0` otherwise. That is expressible, and checkable — write the
derivation, then assert the two `volumeAt` functions agree frame-by-frame over the whole reel
before switching.

  **What is NOT lossless:** core applies a **default 1 s fade-out** anchored to the music trim or
  the last outro (`music-envelope.ts:26-30`), and hard-zeros the bed after the outro end
  (45-46). WPI has **no fade at all** and **no outro**. Adopting core's envelope therefore adds
  a fade unless the literal sets `fadeOutMs: 0`. Decide deliberately; do not inherit it by
  accident.

**4. The 18 `TS2322`s are pre-existing, not a bump regression** — and there are 18, not 4
(§0 #4). All are the same class: a segment literal missing `audioMode`, which is
`.optional().default('voice')` and therefore **required in the inferred output type**. Settled by
controlled experiment in Phase 2.5 (old core 15 errors → new core 11; the new core *reduced*
them). Fix them or don't, but do not attribute them to this migration.

**5. It blocks item 13.** WPI is the only remaining consumer of `@brand-lib/segments/`
`FootageSegment` and `MultiClipSegment` outside campaign-reels. `brand-lib/` cannot be dissolved
until this lands.

**6. WPI has no `.editor/`** (neither the template nor any of the 5 projects). Moving to the
layered model makes the reel editor available to it for the first time — a genuine gain, and
also new surface to scope.

**Recommended scope for its own plan:** (a) write the layered literal for **one** project
(`pp-program-obvody` — it is one of the two with zero `tsc` errors); (b) prove the music
envelope agrees frame-by-frame; (c) accept and *document* the duration delta from
shrink-vs-extend; (d) only then do the other four.

---

### 16. Both — derive the editor vocabulary from the theme

**Grade: an ADDITION, not a replacement — regraded (§0 #7). No render change; new editor
capability.**

**Correction first.** The claim that brand `.editor/main.tsx` files "still use the hand-written
`editor-meta`" is **false for both repos**: `grep -rn 'editorMeta\|EditorMeta'` over PP's
`templates/ projects/ brand-lib/` and over roost's baseline `templates/ projects/` returns
**nothing**. Every one of the 12 PP `main.tsx` files
(`templates/campaign-reels/.editor/main.tsx` + 11 projects) is the same 13-line
`mountEditorHost` call differing only in `projectName`, and roost's is the same shape.
`EditorHost`'s `meta` prop (`lib/editor/host/EditorHost.tsx:36`) is optional and **nobody passes
it**. So there is no hand-written meta to migrate *from*; the work is to start passing one.

```diff
 // templates/campaign-reels/.editor/main.tsx  (and each project's copy)
 import { mountEditorHost } from '@video-toolkit/lib/editor/host/mount';
+import { editorMetaFromTheme } from '@video-toolkit/lib/editor/app/editor-meta';
 import { LayeredCampaignReel } from '../src/LayeredCampaignReel';
-import { brandTheme } from '../src/config/brand-theme';
+import { compositionTheme } from '../src/config/composition-theme';
 import { fps, width, height } from '../src/config/reel-config';
 import '../src/styles/global.css';

 mountEditorHost({
   component: LayeredCampaignReel,
   projectName: 'campaign-reels',
   fps,
   width,
   height,
-  accentSlots: brandTheme.accentSlots,
+  accentSlots: compositionTheme.accentSlots,
+  // ONE declaration serves render and editor: every `params` on a theme
+  // registration becomes an inspector field. Evaluated once at module scope,
+  // which is what keeps the reference stable (EditorHost.tsx:30-35).
+  meta: editorMetaFromTheme(compositionTheme),
 });
```

**This is only useful once registrations carry `params`** — which items 2, 4 and the contract's
worked example are what add. Doing this before them yields an empty derived meta (harmless, but
pointless).

`.editor/main.tsx` is mirrored by `sync_template` and is **not** in `PROJECT_OWNED`, so editing
the template's copy and re-running item 15 propagates it to all 11 projects — except for
`projectName`, which differs per project and which the mirror **will overwrite**. Confirm how
the mirror handles that before running it across all 11 (all 12 `main.tsx` files currently have
distinct hashes for exactly this reason).

**Verify:** `cd templates/campaign-reels && npx tsc --noEmit`, then open the editor and confirm
the inspector offers the declared fields. Still renders must be **byte-identical** — this touches
no render path.

---

## Suggested order

1. **15** (`sync_template`, dry-run first; `pp-mov-koalice` no longer needs excluding — its outro
   is reported `PROTECTED` rather than overwritten) — everything else assumes the projects match
   the template.
2. **12**, **11**, **10** — the three clean parity items, one repo each. Cheap confidence.
3. **1**, **5**, **8** — structural, small, well-understood. Item 8 carries the one 4 px delta.
4. **9** then **13** (partial) — captions move to core, `brand-lib` sheds two files.
5. **7**, **4** — roost's two items. 4 is declarative only.
6. **2**, **6** — the two that need real still renders and a look decision.
7. **16** — after registrations carry `params`.
8. **14** — its own plan, its own session.
9. **15** again, to propagate.
