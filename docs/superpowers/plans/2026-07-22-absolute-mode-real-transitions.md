# Unified Transition System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** A unified transition system — full `@remotion/transitions` catalog + toolkit customs, at-the-cut handle rendering, uniform across every boundary (clip↔clip, clip↔card/outro, edge fades from/to coal), with a derived Transitions lane.

**Architecture:** Core owns the catalog (`transitions.ts` metadata + `lib/transitions` custom presentations). A boundary transition is `transitionOut` on the item before it (any item, incl. last → coal) or `transitionIn` on the first item (opening). The composition renders every boundary the same way — both sides render into a window centered on the cut, blended by the kind's presentation; video sides use handle frames, card/outro/coal sides just render. No derivation change (transitions carried through).

**Tech Stack:** TypeScript, Zod, Vitest, Remotion + `@remotion/transitions` 4.0.425.

## Global Constraints

- Editor strings English; no `Co-Authored-By`; brand-repo commits `-c commit.gpgsign=false`.
- No derivation timing change; clips stay butted. Center-at-cut. Window `[Tf−floor(N/2), Tf+ceil(N/2)]`.
- Catalog (kind → presentation): `cut`→none; `fade`/`dissolve`→`fade()`; `fade-coal`→coal-tinted `fade()`; `slide`→`slide({direction})`; `wipe`→`wipe({direction})`; `flip`→`flip({direction})`; `clock-wipe`→`clockWipe(...)`; `iris`→`iris(...)`; `glitch`/`whip-pan`/`zoom-through`/`gradient-wipe`→`lib/transitions` customs.
- Timeline action start/end in SECONDS (like every lane — `act()` divides by MS).
- In scope: full catalog, unified render (all neighbours + edge fades), lane + inspector edit. Deferred: alignment, drag-block-edge, drag-to-create.
- Core suite + `tsc` green each task boundary.

---

### Task 1: Core catalog + `transitionIn` schema field

**Files:**
- Modify: `lib/editor/app/transitions.ts`, `lib/reel-config-base/layered-schema.ts`
- Test: `lib/editor/app/transitions.test.ts`, `lib/editor/src/layered-schema.test.ts`

- [ ] **Step 1: Failing catalog tests.** Extend `transitions.test.ts`: `TRANSITION_KINDS` includes `fade`, `slide`, `flip`, `clock-wipe`, `iris` (alongside existing cut/dissolve/fade-coal/glitch/whip-pan/zoom-through/wipe/gradient-wipe); assert `defaultTransition('slide',{frames:12})` → `{kind:'slide',frames:12,direction:'left'}` (a sensible default direction); `subOptionsFor('slide')`/`'flip'` → a 4-way direction enum; `subOptionsFor('clock-wipe')`/`'iris'`/`'fade'` → `[]`.

- [ ] **Step 2: Run — fail.** `export PATH="/Users/xaralis/.nvm/versions/node/v20.18.1/bin:$PATH"; cd lib/editor && npx vitest run app/transitions.test.ts`

- [ ] **Step 3: Extend the catalog.** In `transitions.ts` add the new kinds to `TRANSITION_KINDS` (with labels: Slide/Flip/Clock wipe/Iris/Fade), wire `subOptionsFor` (slide/flip → `DIRECTION_4WAY`; clock-wipe/iris/fade → none) and `defaultTransition` (default direction `left` for the direction kinds). Keep existing kinds untouched.

- [ ] **Step 4: Failing schema test + field.** In `layered-schema.test.ts` assert a clip parses with `transitionIn: { kind: 'fade', frames: 12 }`. Add `transitionIn: z.record(z.string(), z.unknown()).optional()` to `VideoContainerBase` (mirror `transitionOut`).

- [ ] **Step 5: Run all + tsc green.** `cd lib/editor && npx vitest run && npx tsc --noEmit`.

- [ ] **Step 6: Commit** `feat(transitions): full Remotion+custom catalog; add transitionIn schema field`.

---

### Task 2: Adapter — unified Transitions lane

**Files:** Modify `lib/editor/src/timeline/layered-adapter.ts`; Test `lib/editor/src/timeline/layered-adapter.test.ts`.

**Interfaces:** `LANES` includes `'transitions'` (already added). `layeredToTimeline(reel, fps)` emits, on that lane:
- per item `i` with a non-`cut` `transitionOut.frames`: `{ id:'transition:'+item.id, start:(item.endMs−halfMs)/MS, end:(item.endMs+halfMs)/MS, effectId:kind }` — **including the last item** (closing → coal).
- for the FIRST item with a non-`cut` `transitionIn.frames`: `{ id:'transition-in:'+item.id, start:0, end:(halfMs*2)/MS, effectId:kind }` (opening, anchored at 0).
`parseActionId` handles `transition:` and `transition-in:` → `{ lane:'transitions', itemId, edge:'out'|'in' }`.

- [ ] **Step 1: Failing tests.** transitionOut on the LAST item yields a transition action; a first-item `transitionIn` yields a `transition-in:` action at start 0; `parseActionId` returns the edge.

- [ ] **Step 2: Run — fail.**

- [ ] **Step 3: Implement.** Change the loop to iterate ALL items (not `length-1`) for `transitionOut`; add the first-item `transitionIn` action; extend `parseActionId`. Keep seconds (`/MS`).

- [ ] **Step 4: Tests + tsc green.**

- [ ] **Step 5: Commit** `feat(layered-adapter): unified transitions lane (transitionOut incl. last + first transitionIn)`.

---

### Task 3: Timeline render + full-catalog inspector

**Files:** Modify `lib/editor/app/LayeredTimeline.tsx`, `lib/editor/app/LayeredInspector.tsx`.

- [ ] **Step 1: Timeline.** Render both `transition:` and `transition-in:` actions on the locked `transitions` lane; marker + `"<kind> · <frames>f"` label (`frames = round((end−start)*fps)`).

- [ ] **Step 2: Inspector — one shared full-catalog editor.** Extract the transition-editing body into a small local component/helper used by BOTH the video-lane "Transition out" section and the new transitions-lane route (kill the divergence). It renders: kind `SelectField` over `TRANSITION_KINDS`; for each `subOptionsFor(kind)` entry a `SelectField` (enum) or `NumberField` (number); and a length `NumberField` gated by `kindNeedsFrames`. Writes via `defaultTransition` on kind-change and field-patches otherwise, targeting the outgoing clip's `transitionOut` (or the first clip's `transitionIn` when `edge==='in'`). No reposition.

- [ ] **Step 3: Tests + tsc green.** `cd lib/editor && npx vitest run && npx tsc --noEmit`.

- [ ] **Step 4: Commit** `feat(editor): unified transitions lane render + full-catalog inspector (shared editor)`.

- [ ] **Step 5: Browser check (controller, after review).** Pilot editor: transitions lane shows the dissolve marker; inspector lists the full catalog incl. slide/flip/clock-wipe/iris; changing kind + sub-option + length persists.

---

### Task 4: Pilot composition — unified at-cut render

**Files:** Modify `../video-toolkit/projects/pp-namesti-republiky/src/LayeredCampaignReel.tsx`.

- [ ] **Step 1: `presentationFor(t)`** covering the full catalog. Import Remotion presentations (`fade` from `@remotion/transitions/fade`; `slide`/`wipe`/`flip`/`clockWipe`/`iris` from their subpaths) + customs (`glitch`, `whipPan`, `zoomThrough`, `wipe as customWipe`, `gradient-wipe`) from `@video-toolkit/lib/transitions` (the path pp-05's `CampaignReel.tsx` uses). `fade-coal` = `fade()` (coal shows through the background). `cut`/none → null.

- [ ] **Step 2: Unified at-cut render.** For each boundary (each item's `transitionOut`, incl. last → coal; first item's `transitionIn` → from coal), render the window centered on the boundary with both sides + the presentation (`exiting`/`entering`, progress from `useCurrentFrame()`):
  - video side → extend its Sequence + trim into handle frames (exiting: `trimOut + ceil(N/2)/fps`, extend end; entering: `trimIn − floor(N/2)/fps` clamped ≥ 0, start earlier);
  - card/outro side → render it shifted into the window (no source clamp);
  - coal side (edge fade / missing neighbour) → nothing to mount; the presentation fades the single side against the coal `AbsoluteFill`.
  Remove `FadeIn`, the old `TransitionRecord` fade path, AND the hardcoded opening/outro fade-out (now expressed as `transitionIn`/`transitionOut` data).

- [ ] **Step 3: Pilot data for the edge check.** In `Root.tsx` (unsigned commit ok) optionally add a `transitionIn: { kind: 'fade', frames: 12 }` on the first video item and a `transitionOut: { kind: 'fade-coal', frames: 30 }` on the outro, so the parity render exercises opening + closing edge fades. Keep the existing `dissolve:12`.

- [ ] **Step 4: Typecheck** the pilot (`npx tsc --noEmit`) — no NEW errors vs the known baseline.

- [ ] **Step 5: Commit (unsigned)** the composition (+ Root.tsx if changed): `feat(pilot): unified at-the-cut transition render (full catalog, edge fades)`.

---

### Task 5: Pilot render-parity verification

- [ ] **Step 1: Render** the dissolve-into-outro window AND the opening + closing windows at `--concurrency=1 --timeout=90000` (avoids the font flake). E.g. opening `--frames=0-40`, dissolve `--frames=1180-1250`, closing near the end.

- [ ] **Step 2: Verify** a real dissolve into the outro (both visible), a fade-in from coal at the open, and a fade to coal at the close — all via the same mechanism. Total duration UNCHANGED (`46301`ms). Audio intact.

- [ ] **Step 3: Record** PASS/FAIL in `.superpowers/sdd/progress.md`; clean up render artifacts.

---

## Self-Review

- **Spec coverage:** catalog + schema (T1), unified lane (T2), lane render + full-catalog inspector (T3), unified at-cut render incl. edge fades (T4), parity (T5).
- **No derivation change** (model B). Only schema add: `transitionIn`.
- **No placeholders:** T1–T3 carry concrete code/refs; T4 carries the render approach; T5 is verification.
- **Deferred:** alignment, drag-block-edge, drag-to-create.
