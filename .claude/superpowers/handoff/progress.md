# Progress: reel editor — save spine

Branch: feat/reel-editor
Plan: .claude/superpowers/plans/2026-07-20-reel-editor-save-spine.md
Base (before Task 1): 68245c5

Task 1: complete (commits 68245c5..add415a, review clean after 1 fix)
Task 2: complete (commits add415a..9862c8d, review clean after 1 fix)
ALL TASKS COMPLETE.

Final whole-branch review (opus): Ready to merge = YES. No Critical/Important.
  Applied post-review Minor fix: verify-before-rename guard (536f928) — readDefaultProps(next) before overwriting Root.tsx; test proves original untouched on error.
  Deferred to Plan 2 (record, non-blocking):
    - resolve() callback is the ENTIRE path-confinement security boundary; Plan 2's dev-server resolve must reject ../, absolute escapes, symlinks (add assertion/test).
    - Minor cosmetic: rewritten defaultProps uses column-0 JSON indentation (prettier/Studio reformats). Optional ts-morph formatText.
    - Minor cosmetic: numeric-literal key {1:'x'} throws with "computed property names" wording (safe; reel data has no numeric keys).
    - package.json has no main/exports/types + no README; add when Plan 2 imports as a package boundary.

Final verification (controller, Node 20.18.1): `npx vitest run` 13/13 passed; `npx tsc --noEmit` exit 0.
Head after all work: 536f928

---
# Plan 2 (editor skeleton) — pre-work
Branch: feat/reel-editor-skeleton
Spike (browser-verified): campaign-reels composition mounts in @remotion/player.
DECISION: template-hosted Vite host (core ships lib/editor UI+logic; template carries thin Vite entry + vite.config.mts).
  Working wiring captured in .superpowers/sdd/plan2-spike-report.md (manual resolve.alias port of remotion.config.ts, @tailwindcss/vite, publicDir, .mts config).
Brand-repo spike artifacts REVERTED (template pristine).
Status: Plan 2 not yet written.

Plan 2 written + committed (feat/reel-editor-skeleton). Executing.
Task 1 (core EditorShell): complete (6b41b0d, review ✅ Approved; 15/15+tsc clean)
  Minor (defer): 'document runtime copies' note not added -> put in template README when it lands; layout-position not asserted (jsdom limit).
Task 2 (template Vite host, brand repo): complete (video-toolkit 63690c0 + fix a27be39; review ✅ Approved; BROWSER-VERIFIED reel renders + /props). Fixed 2 Important dep pins (@remotion/player exact 4.0.425, ts-morph aligned 24.0.0) + 500-leak. Minor deferred: existsSync alias guard.
Task 3 (Save wiring, brand repo): complete (video-toolkit 3826521 + revert; review ✅ Approved; BROWSER-VERIFIED full round-trip: topic edit->Save 200->Root.tsx updated & valid & inline->Studio loads). Fixed Important: reverted committed test artifact (Root.tsx back to demo 'Demo'). Informational: props payload not schema-validated pre-save (inherited from Plan-1 createSaveHandler) -> harden in Plan 3 (real editing) with ReelConfigSchema.

INTEGRATION NOTE (reversible, logged): video-toolkit/toolkit submodule locally checked out to core 6b41b0d (feat/reel-editor-skeleton) so toolkit/lib/editor (EditorShell) is visible to the template. Verified 8394f4d (prev pin) is an ancestor + reel-config-base/components/transitions byte-identical -> no composition regression. Submodule pointer NOT committed in video-toolkit. To restore: cd toolkit && git checkout 8394f4d. LANDING requires pushing core + proper submodule bump later.
PLAN FIX: Task 2/3 revised — editor reads props via readDefaultProps server-side (GET /props); Root.tsx stays inline literal (avoids Studio-Save-breaking reference trap I originally wrote).

=== PLAN 2 (SKELETON) COMPLETE ===
Final whole-branch review (opus, cross-repo): Ready to merge = WITH FIXES. NO code defects.
Only blocker is a LANDING PROCESS step (USER action, I can't push): push core feat/reel-editor-skeleton, then bump video-toolkit toolkit/ submodule pin together — else a clean clone can't resolve imports.
Deferred to Plan 3 (real editing): ReelConfigSchema validation + body-size/content-type guard on /save; move topic input from preview slot into inspector; single-source durationInFrames; note React 19(core)/18(template) authoring skew.
Branches (UNPUSHED):
  core: feat/reel-editor-skeleton (EditorShell + English labels f586271 + plan/spec docs)
  video-toolkit: feat/reel-editor-skeleton (.editor host: 63690c0, a27be39, 3826521, +Root.tsx revert)
video-toolkit toolkit/ submodule locally checked out to core f586271 (pointer NOT committed). Restore: cd toolkit && git checkout 8394f4d.
STOPPING here per autonomous contract — awaiting async human review before Plans 3-4.

UPDATE: editor UI switched to English (user pref). Core f586271; submodule re-synced to f586271.

=== PLAN 3 (DIRECT MANIPULATION) — checkpoint-gated ===
Plan: .claude/superpowers/plans/2026-07-20-reel-editor-direct-manipulation.md
CP1 base: (core HEAD after plan commit)
CP1 Task 1 (EditorShell slots): complete (8df2927; 17/17+tsc; slots+fallback tested). Accepted on visible tests (CP1-boundary review re-checks).
CP1 Task 2 (Timeline render+select): complete (214f419; review ✅ Approved; 21/21+tsc; added @video-toolkit/lib alias -> core lib/, verified). Minor: label index=array position (matches brief).
CP1 Task 3 (Inspector reel/scene): complete (a7dede9; 29/29+tsc; 8 tests). Fast-tracked on passing tests + validated Timeline pattern (CP1-boundary review re-checks).
CP1 Task 4 (wire main.tsx, brand): complete (video-toolkit 210cd4f; BROWSER-VERIFIED: timeline scenes proportional, click select+inspector reflect, deselect, topic edit+save 200). NOTE: topic edit not visible in preview (demo renders 'chevron' not 'topic') -> CP1 follow-up: Inspector should edit chevron too. Not a bug.
CP1 Task 5a (core applyTrim+drag): complete (41fca3c + test fix 09e2681; review ✅ Approved after 1 test-fidelity fix; 42/42+tsc). applyTrim clamps broll>=3s/clip>=0.5s/multi-clip>=1000ms, verified by hand.
CP1 Task 5b (brand drag wiring): complete (video-toolkit 8d892ed; BROWSER-VERIFIED: drag resizes block+Player duration, clamps clip0.5s/broll3.0s, Save persists trimOut, Root.tsx reverted). Concern: deselect-after-drag UX quirk (cosmetic, CP2 polish).
=== CP1 COMPLETE — core suite 42/42 + tsc clean (controller-verified). STOP for human review. ===
STOP after CP1 for human review.

=== CP1 REFINEMENTS (from human feedback) ===
#2 Timeline playhead: core 147a509 + template wiring cc86baa (playerRef 'frameupdate'). BROWSER-VERIFIED: red cursor moves in sync with playback.
#1 View over real project: vendored editor (.editor/ + devDeps) into projects/pp-program-klima-reel (19 real scenes, real footage) — UNCOMMITTED demo enablement. BROWSER-VERIFIED + /props 200 smoke (topic Klima, 19 segments).
BONUS BUG FOUND+FIXED (real projects would ALL have broken): readDefaultProps/evaluateLiteral threw on `as const` -> core fix e54bbf6 (AsExpression + SatisfiesExpression unwrap, 3 tests). 51/51 + tsc clean. Submodule re-synced to e54bbf6.
FOLLOW-UP (write-side, later): rewriteDefaultProps JSON.stringify STRIPS `as const` on Save -> may widen TS literal types / surface tsc errors in saved Root.tsx on real projects. Flagged, not yet fixed.
PRODUCTIZATION NOTE: editor host lives in template (new projects get it via cp); existing projects need it vendored via /toolkit:sync-template (did it manually for the demo).

=== CP1 REFINEMENT 2: Timeline as transport (human feedback: scrub/timing/click, drop video controls) ===
Core: 77b6bef (time ruler mm:ss + click/drag seek + timeline-util helpers, 79/79) ; selection-regression fix 3b96a4b (seek pointer-capture ate the click -> pointerdown hit-test drives onSelect, 80/80).
Template: 095c4fd (onSeek->seekTo, play/pause button, time readout, dropped Player controls).
BROWSER-VERIFIED over real project (pp-program-klima-reel): ruler 0:00..1:30, click+drag seeks video, play/pause, no built-in scrubber, trim doesn't seek. Selection fix unit-tested (click->select+seek; trim->neither); full-browser re-verify folded into CP2.
Submodule re-synced to 3b96a4b (shared by template + vendored real project).
--- Moving to CP2 per user instruction ("pokracuj na cp2") ---

=== CP2a COMPLETE — editable inspector (content) ===
Core: accent helpers 281c9ef (wrapAccent/stripAccents), editable Inspector f2ebb2a (reel chevron/topic, audioMode per type, overlay text + Lime/Teal accent). Template: dd03650 wiring (onReelChange/onSegmentChange patches).
BROWSER-VERIFIED over pp-program-klima-reel: chevron live (KLIMA->DOPRAVA), overlay quote-pull text live, Lime accent renders on frame, audioMode ok, selection/seek/trim no regression, Save 200 + /props 200 (as-const not corrupted at parse level). Core suite green + tsc.
IMPORTANT UX FOLLOW-UP (write-side): Save (ts-morph rewriteDefaultProps via JSON.stringify) regenerates the WHOLE defaultProps literal -> STRIPS all `as const` AND all human comments (e.g. "── Úsek 1 ──" section headers) from real Root.tsx every save. Still valid+parses, but loses literal-type narrowing + the author's structure/comments. Needs a write-side preservation pass (surgical edit instead of full-literal regen) before this is comfortable on real client files.
CP2 remaining (CP2b): FrameOverlay (focus/crop on frame), take/source picker, brand-rule warnings; polish: deselect-after-drag, WYSIWYG accent syntax-hiding, write-side preservation.
CP2a done. Write-side surgical Save fa04d90 (review ✅ Approved; preserves comments+as const; 105/105). Minor (note): no explicit multi-leaf test (covered indirectly); satisfies/as-T dropped on changed leaf.
=== CP2b in progress (autonomous, stop after) ===
CP2b-1 FrameOverlay: DONE core d480449 + wire 786519e (BROWSER-VERIFIED: dot on clip/broll not outro, drag reframes live, no seek/play block). Surgical added-key fix 8a2bff5 (adding focalY etc. preserves siblings as const+comments; 117/117).
CP2b-2 take/source picker: DONE core 8509169 + wire b0bd633 (BROWSER-VERIFIED: /sources 12 rec+8 broll, swap updates Player+source, Save surgical). Minor: new string values serialize with double-quotes vs file single-quote style (cosmetic write-side).
CP2b-3 brand warnings: DEFERRED (do after UX audit / CP3 if context allows; usability prioritized per mandate).
UX AUDIT DONE (ux-audit-report.md). Fix queue (usability mandate):
  [1] Blocker: no unsaved-changes signal + reload silently discards -> dirty indicator + beforeunload + Save emphasis + Escape-deselect: DONE (brand b2124d9 + core EditorShell dirty prop f273d39; browser-verified). Submodule synced to f273d39.
  [2] DONE: WYSIWYG AccentEditor (core b80c48c runs-model + Inspector switch cbd81ea, browser-verified no braces/no nesting, data-driven colors prop). 
  [3][4][5] DONE: clarity batch 6ea23df (timeline index labels+title tooltips, focus x/y readout+tooltip, Chevron-first with 'shown on screen' vs Topic 'internal' helpers). 151/151.
  
  
  [6] Minor: trim retimes whole reel silently (accept/note); double-quote serialize style (write-side cosmetic).
  Good: click=select+seek+inspector; playback/playhead sync; trim live feedback.

=== AUTONOMOUS FINALE MANDATE (user away ~full day) ===
Goal: finish reel editor to a genuinely USABLE finale; UX-friendly is the priority; probe whether it makes sense from a user's POV; cleanest architecture where uncertain. Commit signing DISABLED (commit.gpgsign=false) in both repos (biometric unavailable). Produce a findings summary at the end.
Remaining plan:
  A. Finish CP2b: source-picker wiring (/sources endpoint + main.tsx) + browser-verify; brand-rule warnings (reuse check-brand) non-blocking.
  B. UX AUDIT pass: drive the editor over the real project, evaluate the full reviewer workflow, list friction, fix top issues (discoverability, deselect-after-drag, focus-dot-needs-seek, layout, labels). Consider frontend-design skill for polish.
  C. CP3: transitions (timeline junction popover) + multi-clip list editing.
  D. Brand-driven accent palette (user-prioritized): brand declares accent slots (key/label/color); accent-parser + schema + editor read from brand, not hardcoded lime/teal. Cleanest-arch design.
  E. Consolidate: full suites green, ledger, findings summary.


=== NEXT (user-prioritized): brand-driven accent palette ===
Clean arch: brand.json declares accents:[{key,label,color}] (+endpoint accent key); core accent-parser accepts arbitrary brand keys (backward-compat: lime/teal still work); render maps key->brand color; editor reads brand slots -> AccentEditor colors prop (already data-driven). Backward-compatible, DON'T break composition render. Template schema enum changes (stat-callout/wipe color) = noted follow-up, not now.

Brand-accent foundation DONE e3cf8e1 (parser brand-key-agnostic backward-compat + editor types string; 156/156). Spec 1a5bf65. Full rollout = follow-up.
=== FINALE: skipping CP3(transitions)/multi-clip/full-accent-rollout/warnings under context limits -> documented as remaining. Doing final holistic UX verify + findings summary. ===

=== FINALE COMPLETE ===
Final verify: items 1-9 PASS, 10 PASS (2 cosmetic save-format findings -> fixed via Prettier hook b1e5cad/ab5a496). Verdict: genuinely usable by non-technical reviewer.
Final state: core 160/160 + tsc clean; core b1e5cad, brand ab5a496; submodule synced; nothing pushed; commit signing left OFF.
Findings summary written: .superpowers/sdd/FINDINGS-reel-editor.md
Remaining (scoped in findings): CP3 transitions/multi-clip, full brand-accent rollout, brand warnings, prettier-normalize existing project files before landing, deselect-after-drag polish, take thumbnails.

=== CP3 COMPLETE ===
Transitions: core 369249d (TransitionPicker b9a2f2e + Inspector section + Timeline junction badges) + brand 1407663. BROWSER-VERIFIED over pp-program-klima-reel.
Multi-clip: core ceb7106 (Inspector layout/sub-clips/audio). BROWSER-VERIFIED over pp-05-zastupitelsky-klub (real multi-clip). 209/209 + tsc clean. Submodule synced to ceb7106.
Minor note: number inputs show locale comma (7,5) but save '.' decimals - i18n display polish.

=== LAYERED TIMELINE REDESIGN (new epic) ===
Spec: .claude/superpowers/specs/2026-07-21-layered-timeline-model-design.md (approved). Staged migration via derivation, pilot on pp-namesti-republiky, close-parity, branch latitude.
Plan 1 (foundation): .claude/superpowers/plans/2026-07-21-layered-model-schema-derivation.md
  T1 LayeredReel schema (lib/reel-config-base/layered-schema.ts): pending
  T2 deriveLayered (lib/reel-config-base/derive-layered.ts): pending
  T3 pilot smoke (derive real pp-namesti-republiky): pending
NEXT PLAN: layered composition + pilot render/edit (needs composition tree exploration).
