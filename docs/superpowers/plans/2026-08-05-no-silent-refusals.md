# No Silent Refusals — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every edit the editor refuses tells the user why — and the codebase, not diligence, is what
keeps that true.

**The rule, from the user, verbatim:** *"všechno co může ten Drag/trim odmítnout tam musí
reportovat"* and *"žádná neprovedená akce na základě kontroly nesmí zůstat bez odezvy k uživateli"* —
no action skipped because of a check may go without feedback.

**Architecture:** A refusal becomes a **value**, not a control-flow early exit. One module owns the
predicates (`refusal.ts`); each command's early exits DELEGATE to its predicate, so the reason shown
and the refusal applied come from one computation and cannot drift — the pattern that already worked
for `resizeBoundsMs` (bound + reason) and `slipBounds` (clamp + reason). The invariant is then
enforced by an **equivalence test**: for a matrix of fixtures, a command returns an unchanged reel
**if and only if** its predicate names a reason. A new silent early exit fails that test.

**Tech Stack:** TypeScript, React, vitest.

**Source:** `docs/superpowers/specs/2026-08-04-editor-feedback-and-grading-design.md` (Feature 1 —
this extends it from "blocked drags" to "every refusal").

## Global Constraints

- Editor UI strings ENGLISH. No user-facing sentences in `lib/editor/src/timeline/` — codes there,
  copy in `lib/editor/app/block-reason-copy.ts`.
- No brand vocabulary in `lib/` (grep stays at exactly 2, both comments).
- `LayeredTimeline` is memoized and re-renders every playhead frame — no unstable props, no new
  per-pointer-move re-render. `useTransientHint.publish` de-dupes by identity; rely on that.
- Reason codes are named after the CONSTRAINT, not the gesture, unless two gestures genuinely need
  different sentences (the slip codes earned their split; check before adding more).
- **Verify library/DOM behaviour before relying on it.** The previous plan assumed a range input
  could express an over-max value (it cannot — the browser sanitises first) and cost a fix round.
  If a step depends on how the vendored timeline or a DOM control behaves, measure it and record
  what you saw.
- MEASURE, don't assume. Never pipe a gate command through `tee`. `tsc --noEmit | grep -c` prints 0
  when tsc crashes — read exit codes separately.
- Commits: no `Co-Authored-By`. If signing fails, immediately re-run with `--no-gpg-sign`.
- Another session may work in this tree: stage only files you change, never `git add -A`.

## The refusal surface (audited 2026-08-05 — verify, do not trust)

Every site that currently declines an edit and says nothing:

| # | Where | Condition | File |
|---|---|---|---|
| 1 | move drag | locked lane (`brand`, `transitions`) | `LayeredTimeline.tsx:1384` |
| 2 | move drag | the music bed (pinned at 0) | same |
| 3 | move drag | audio linked to a clip (`linkedAudioIds`) | same |
| 4 | split | selection is not on the video lane | `layered-adapter.ts:968` |
| 5 | split | item is not `clip`/`broll` (card, outro, photo, multi-clip) | `:972` |
| 6 | split | playhead is not inside the item | `:974` |
| 7 | duplicate | selection is not on the video lane | `:1008` |
| 8 | delete | the single music bed is not deletable | `:908` |

Already covered by the existing hint feature (do not re-do): resize bounds, the transition-Length
cap, and slip.

Out of scope, deliberately: `setItemSpeed`'s and `applyRipple`'s no-ops at `:460`, `:464`, `:538-562`,
`:689-693`. Those are "nothing changed" identity returns on a value the user is still dragging, not
refusals of a requested action — a message there would fire continuously mid-gesture. If a later
review disagrees, that is a follow-up, not this plan.

---

### Task 1: The predicates, and the reasons they name

**Files:**
- Create: `lib/editor/src/timeline/refusal.ts`, `lib/editor/src/timeline/refusal.test.ts`
- Modify: `lib/editor/src/timeline/block-reason.ts` (new codes), `lib/editor/app/block-reason-copy.ts` (copy)

**Interfaces produced** (Tasks 2-4 consume):

```ts
export function moveRefusal(args: { lane: LaneId; actionId: string; linkedAudioIds: ReadonlySet<string> }): BlockReason | null;
export function splitRefusal(reel: LayeredReel, selectedId: string, atFrame: number, fps: number): BlockReason | null;
export function duplicateRefusal(reel: LayeredReel, selectedId: string): BlockReason | null;
export function deleteRefusal(reel: LayeredReel, selectedId: string): BlockReason | null;
```

New codes to add to `BLOCK_REASONS` — **decide the final names yourself and justify them**, but they
must cover: a locked lane, audio that follows its clip, a playhead outside the clip being split, a
kind that cannot be split, a command that only applies to video items, and the undeletable music bed.
Reuse `timeline-start` for the music bed's move refusal — its existing copy ("The music bed is pinned
to the start of the reel.") already says exactly the right thing, and a second code for the same fact
would be the duplication this plan exists to prevent.

Copy rules, per existing convention: English, ≤90 chars, `severity: 'warn'`, and where the remedy is
not obvious the sentence carries it. The split-playhead one is the important sentence in this
task — it is the first message that is a genuine instruction ("Move the playhead inside the clip to
split it"), not just an explanation.

- [ ] **Step 1: Write the failing tests** — one `describe` per predicate. Each needs the refusing
  cases AND at least one non-refusing case (a predicate that always fires is as useless as one that
  never does). For `splitRefusal`, cover: non-video lane, a `card` item, playhead before the item,
  playhead after the item, playhead exactly at the item's edges (the adapter's own condition is
  `atMs <= startMs + 1 || atMs >= endMs - 1` — match it exactly, this is a boundary the equivalence
  test in Task 2 will hold you to), and a legitimate mid-clip split ⇒ `null`.
- [ ] **Step 2: Run them, confirm they FAIL** (`cd lib/editor && npx vitest run src/timeline/refusal.test.ts`).
- [ ] **Step 3: Implement the predicates**, deriving each condition from the adapter's existing early
  exits — read them, do not re-invent. Add the codes and copy.
- [ ] **Step 4: Run, confirm GREEN.**
- [ ] **Step 5:** Confirm the derived copy-coverage test still passes (`app/block-reason-copy.test.ts`
  iterates `BLOCK_REASONS`, so a new code without copy fails it — check that it does by adding a code
  without copy briefly, then removing it).
- [ ] **Step 6: Commit** — `feat(editor): name every refusal a command can return`

---

### Task 2: The adapters delegate, and the invariant is enforced

**Files:** `lib/editor/src/timeline/layered-adapter.ts`, `lib/editor/src/timeline/refusal.test.ts`

This is the task that makes the rule structural rather than aspirational.

- [ ] **Step 1: Write the equivalence test first.** For each of `splitItem`, `duplicateItem`,
  `deleteItem`, over a fixture matrix that covers every lane present in a realistic reel × the item
  kinds × a playhead inside / before / after the selected item:

  > the command returns the reel **unchanged** (`result.reel === reel`, reference identity) **if and
  > only if** the matching predicate returns non-null.

  Build the matrix programmatically from the fixture reel's own tracks so a new lane or kind enters
  it automatically — a hand-listed matrix would go stale exactly like the counts this repo just
  removed from CLAUDE.md. State in a comment that this test is the guarantee behind the "no silent
  refusal" rule.
- [ ] **Step 2: Run it. Expect FAILURES** on any early exit whose predicate does not yet agree —
  that list IS the work. Record it in your report before fixing.
- [ ] **Step 3: Make the adapters delegate** — each command calls its predicate first and returns
  unchanged when it fires, deleting the now-duplicated inline conditions. Where a condition cannot
  move (e.g. it depends on values computed mid-function), say so in the report rather than leaving
  two copies of the same rule.
- [ ] **Step 4: Green, plus the whole adapter suite** (`npx vitest run src/timeline/`).
- [ ] **Step 5: Commit** — `refactor(editor): one rule per refusal, shared by the command and the message`

---

### Task 3: Drag refusals report

**Files:** `lib/editor/app/LayeredTimeline.tsx`, `lib/editor/app/LayeredTimeline.test.tsx`

- [ ] **Step 1:** Failing test for a pure helper (this file's convention — `resizeHintFor`,
  `slipHintFor`, `zoomFactorFor` are all exported and tested directly): a locked lane, the music
  lane, a linked audio action, and a plain video action ⇒ null.
- [ ] **Step 2: RED, then implement.** `onActionMoving` currently returns `false` for the three
  refusing cases (`:1381-1384`). Rewrite it to ask the predicate, publish the hint when it fires, and
  return `false` — one place, no second copy of the condition. Release the hint when the gesture
  ends (`onActionMoveEnd`), exactly as the resize and slip paths do; a publish with no matching
  release sits in the bar forever (that defect has already been found and fixed twice in this
  feature — do not re-introduce it).
- [ ] **Step 3:** Verify the memo is intact: no new prop, and a refused drag that fires on every
  pointer move must not re-render the timeline (identity de-dupe). Say how you checked.
- [ ] **Step 4: Commit** — `feat(editor): say why a drag was refused`

---

### Task 4: Command refusals report

**Files:** `lib/editor/host/EditorHost.tsx`, `lib/editor/app/EditorHost.test.tsx`

- [ ] **Step 1: Failing tests** — with a fixture where each command is refused, invoking it publishes
  the matching hint and leaves the reel untouched; with a fixture where it is allowed, it publishes
  no warning and the reel changes.
- [ ] **Step 2: RED, then implement.** `handleSplit` / `handleDuplicate` / `handleDelete`
  (`EditorHost.tsx:156-180`) ask the predicate first and publish through the SAME stable `handleHint`
  the timeline and inspector already use. Do not create a second hint channel.
- [ ] **Step 3:** Decide and state: does a refused command release the hint on a timer like a gesture
  does, or stay until the next publish? A command has no "gesture end", so the countdown is the only
  clock it has — the inspector's Length control faced exactly this and the answer there was
  publish-then-release. Follow it unless you can argue better.
- [ ] **Step 4: Commit** — `feat(editor): say why a command did nothing`

---

### Task 5: Gates, and write the rule down

- [ ] **Step 1:** Full editor suite, redirected not piped: `cd lib/editor && npx vitest run --no-file-parallelism > /tmp/gate.log 2>&1; echo "exit=$?"`. **Report exit code and failures only — this repo's gate rows record criteria, not counts (see CLAUDE.md, "Gate rows record CRITERIA, never counts"). Do not add a count to any doc.**
- [ ] **Step 2:** `cd lib/editor && npx tsc --noEmit ; echo "exit=$?"` — exit 2, exactly the three
  known errors BY IDENTITY (`LayeredInspector.tsx` `hide`, `derive-layered.test.ts:292` `CutConfig`,
  `../theming/envelope.test.ts:1` vitest types). A fourth is yours.
- [ ] **Step 3:** `cd examples/layered-minimal && npm run typecheck` (0 errors, guard passes); the
  brand-leak grep (exactly 2); `npx vitest run src/editor-css.test.ts`. Pixel harness: SKIP with the
  reason stated (no transition kind, presentation or effect axis is touched).
- [ ] **Step 4:** Add the rule to `CLAUDE.md`, in the editor section, as a standing invariant —
  something a future contributor reads before adding a guard: **every check that declines a user
  action publishes a reason; the check and the message come from one predicate in
  `lib/editor/src/timeline/refusal.ts`; the equivalence test in `refusal.test.ts` is what keeps that
  true.** Name the test so the next person can find it.
- [ ] **Step 5:** Update `docs/superpowers/specs/2026-08-04-editor-feedback-and-grading-design.md` —
  Feature 1 now covers every refusal, not only blocked drags.
- [ ] **Step 6: Commit** — `docs: no silent refusals, and the test that keeps it true`
