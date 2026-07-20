# Reel Editor — non-technical browser editor for campaign-reels

**Date:** 2026-07-20
**Status:** Approved (brainstorming) → ready for plan

## Problem

The toolkit has no non-technical editing surface. Remotion Studio works, but its only editor for a
reel is the auto-generated **Zod schema form** in the right sidebar — a dense list of raw fields
(`trimIn` / `trimOut` in seconds, `durationMs` in **milliseconds**, `focalX` / `focalY`,
`crop.width` / `crop.x` / `crop.y`, `audioMode` enums, `transitionOut.frames` in **frames**,
`{lime:phrase}` accent syntax inline in caption strings). Editing means *guessing numbers, saving,
re-previewing to see what happened*. That assumes the editor holds the timeline/coordinate model in
their head — which a reviewer/comms person does not.

The `/toolkit:fine-tune` command papers over this by launching Studio, but the surface underneath is
still the schema form, and it always needs a terminal (`npm run studio`).

## Goal & persona

Primary persona: **reviewer / fine-tuner** — the reel is already cut (`/toolkit:cut` done). They
need to adjust an existing reel: scene timing, caption text, which take goes where, small crops,
and transitions. Explicit aspiration from the brand owner: **common use should not require opening a
terminal / Claude Code.** (Full "zero terminal" hosting is deferred — see Non-goals — but the design
must not preclude it.)

## Decision: focused custom Player editor over our own config

We build a **purpose-built browser editor** on the free `@remotion/player`, over the toolkit's own
`campaign-reels` config. Considered and rejected:

- **Remotion Editor Starter / Timeline** (paid Remotion Pro products) — a full generic
  timeline editor. Rejected as the base because it carries its **own generic data model** (add any
  asset / font / free-form timeline) that does not map to our opinionated segment model
  (clip / broll / multi-clip + 3-layer overlays), does not enforce brand rules (accent-only,
  3 s minimums, L-cuts), and exposes far more than a reviewer should touch. Adopting it means
  writing a translation layer to a foreign model and fighting its assumptions — often more work than
  a narrow editor over our exact config. (We may still *buy the Timeline component* as a UI building
  block; that's an implementation choice, not an architecture.)
- **Just humanizing Studio's schema form** (seconds not ms, friendlier labels, hide advanced
  fields) — a cheap win worth doing opportunistically for power users, but it hits a hard ceiling:
  Studio has **no trim handles, no drag-on-frame manipulation, no plugin API to inject custom
  widgets**, edits only *default* props, and always needs a terminal. It stays a form; it cannot
  become the non-tech editor.

## Architecture

### Two load-bearing decisions (resolved)

1. **Editor UI lives in core; it runs in the context of a project.** The editor is reusable
   machinery (brand-agnostic, benefits any brand using `campaign-reels`), so it ships from core
   (`lib/editor/`). It renders live preview by mounting **the project's own Remotion composition**
   (`./src/Root`) inside `@remotion/player` with the current config as props — so the preview is
   pixel-identical to the final render. A template gains an `npm run editor` script that serves the
   editor app pointed at that project's `src/` + `public/` and the reel config it reads from
   `src/Root.tsx`.

2. **Single source of truth stays the inlined `defaultProps={{…}}` literal in `src/Root.tsx`.**
   `Root.tsx` deliberately inlines the props as a literal because **Remotion Studio's Save requires
   an inlined literal** (imported references won't persist —
   https://remotion.dev/docs/visual-editing#requirements). We keep that. The editor therefore does
   **not** introduce a `config.json` and needs **no migration**, and `/toolkit:cut` /
   `/toolkit:fine-tune` (which already write this literal) are **unchanged**. Studio Save keeps
   working alongside the editor. *(Rejected the earlier `config.json` import seam: it would have
   broken Studio Save while gaining little — see Save below.)*

### Save

The editor's dev server exposes a small **local Node endpoint** that persists edits by rewriting the
`defaultProps` literal in `src/Root.tsx` **via AST**, reusing Remotion's own save-default-props
mechanism (the same path Studio's Save uses; `@remotion/studio` exposes it). Crucially the **browser
only ever sends plain JSON** to the endpoint — the fragile TSX rewrite happens server-side in Node,
not in the browser. This keeps one source of truth, preserves Studio Save, and avoids any migration.

**Plan prerequisite (de-risk first):** confirm Remotion's save-default-props API can be invoked
headless from our endpoint (not only from a running Studio). If it cannot, fall back to a
purpose-built AST writer (Babel/ts-morph) that replaces the `defaultProps={{…}}` object literal.
This spike is the first task of the plan.

## Editing surface (layout: classic NLE)

Chosen shell: **preview + inspector on top, timeline strip across the bottom** (iMovie/CapCut-like).
Every raw schema field becomes a direct manipulation:

| Schema field | Reviewer interaction |
|---|---|
| `trimIn` / `trimOut` (clip, broll), `durationMs` (multi-clip) | drag scene edges on the timeline **and** a filmstrip handle in the inspector; label shows **seconds** + source in/out ("3,0 s ze záběru, 0:04 → 0:07") |
| `focalX` / `focalY` | drag a focus dot on the preview frame |
| `crop.width` / `crop.x` / `crop.y` | drag a crop rectangle on the preview frame |
| `source` (take) | click a take thumbnail |
| `caption` + `{lime:…}` accent | **inspector text field + "Akcent" button** (select a word → tint). Hides `{lime:}` syntax entirely. *(Chosen over inline-on-frame WYSIWYG: simpler to build, still visual.)* |
| `audioMode` | segmented toggle (hlas / ticho; for multi-clip: první / mix / ticho) |
| `transitionOut` | **badge in the timeline junction between two scenes** (◇ = cut, ● = effect) → popover gallery of the 8 transition types; duration as **presets (krátký/střední/dlouhý) + fine slider in seconds** (frames hidden); contextual sub-options (direction / color / softness) shown only for transitions that have them. *(Inspector-side mirror is a trivial later add.)* |

### Multi-clip segments

Multi-clip scenes (2–4 sub-clips in `split-h` / `split-v` / `pip` / `quad`) are **first-class in
MVP at "list" depth**:

- Segment-level `durationMs` and `transitionOut` edited like any scene (timeline).
- Inspector shows: a **layout switcher** (split-h/v/pip/quad), a **list of sub-clips** — each with
  take swap + trim + optional label — and the **audio toggle** (první/mix/ticho).
- **Deferred to a later phase (variant 1):** on-frame region editing (click the quadrant in the
  preview to select that sub-clip). The list covers the reviewer's need; on-frame region-picking is
  the expensive part and is added later.

## Overlay model & extensibility

Overlays (captions, chevron, stat callouts, quote pulls, and future bespoke animated graphics) are
handled through an **overlay registry + common contract**, so new special overlays can be added
**without any editor work**.

- **Overlay lane on the timeline.** Above the segment track, an overlay lane shows each overlay as a
  time-ranged chip for **placement / visibility / selection**. Selecting a chip opens its panel in
  the inspector.
- **Common contract — every overlay satisfies it.** Each overlay exposes `{ id, type, startMs,
  durationMs, enabled, anchor? }`. From this alone the editor can always: drag its time range on the
  lane, toggle show/hide, and nudge its position (anchor pad) — for **any** type, known or not.
- **Registered types get bespoke panels.** Known types register a richer inspector panel (caption →
  text field + Akcent button; stat callout → its fields; etc.).
- **Unknown / special overlays degrade to the contract only.** A bespoke animated graphic with no
  registered panel is still fully render-correct in the live preview (the composition draws it) and
  gets timing / toggle / position from the contract. Its **internals** (content, animation, colours)
  are edited in Studio / Claude, not here. *(Chosen over render-only, and over auto-generating a Zod
  form: the contract keeps special elements genuinely usable without dragging "numbers" back in.)*

Implementation note: the template's overlay schemas must adopt the common-contract fields (some
already carry timing implicitly via their segment); reconciling this is part of the plan.

## Brand rules as live, non-blocking warnings

The editor reuses the `/toolkit:check-brand` logic to surface brand-rule violations inline (scene
< 3 s, accent on more than a few words, etc.) as **warnings, not blocks**. This is a deliberate
differentiator the generic Editor Starter cannot provide.

## MVP scope (hard boundary)

**In MVP:**
- Edit existing segments' reviewer fields (table above) for clip / broll / multi-clip.
- Transitions (junction popover).
- Multi-clip at list depth (variant 2).
- Overlay lane + registry + common contract, with graceful degradation for unregistered/special
  overlays (timing / toggle / position only; internals elsewhere).
- Live preview via `@remotion/player` mounting the real composition.
- Save via a local Node endpoint that rewrites the `Root.tsx` `defaultProps` literal by AST
  (browser sends JSON only). No `config.json`, no migration, Studio Save preserved.
- Brand-rule warnings (non-blocking).

**Out of MVP (stays in Studio / Claude):**
- Adding / deleting / reordering segments.
- `grade` (color correction), `kenBurns`, static crop presets beyond the drag rectangle.
- On-frame multi-clip region editing (variant 1 — later).
- **Final render** — stays on `/toolkit:render`.
- **Hosting / one-click launcher** — MVP launches via `npm run editor`.

## Config source & save (no migration)

1. **No template data change.** `campaign-reels` `src/Root.tsx` keeps its inlined
   `defaultProps={{…}}` literal. There is no `config.json` and nothing to migrate.
2. **Read:** the editor obtains the current props by importing the composition's registered
   `defaultProps` at load (the same object Remotion/Studio use), not by parsing TSX in the browser.
3. **Write:** Save POSTs the edited props (JSON) to the local Node endpoint, which rewrites the
   `defaultProps` literal in `src/Root.tsx` via AST (Remotion save-default-props, or a Babel/ts-morph
   fallback). `/toolkit:cut` and `/toolkit:fine-tune` are unchanged.

## Proposed file layout (core)

```
lib/editor/
├── app/              # the Player-based editor app (Vite or Remotion-hosted)
│   ├── Editor.tsx    # shell: preview + inspector + timeline (layout A)
│   ├── Timeline.tsx  # segment blocks, drag edges, transition junction badges
│   ├── Inspector/    # take picker, filmstrip trim, caption+accent, audio, transitions, multi-clip list
│   ├── overlays/     # overlay registry: common contract + per-type panels + unknown fallback
│   └── FrameOverlay.tsx  # focus dot + crop rectangle on the Player canvas
├── save-endpoint.ts  # local Node route: rewrites Root.tsx defaultProps literal via AST
├── brand-warnings.ts # reuse of check-brand rule detectors
└── README.md
```

Template wiring: `campaign-reels` `package.json` gains an `"editor"` script; `Root.tsx` is
unchanged.

## Data flow

1. `npm run editor` (in a project) → serves `lib/editor` app, pointed at the project's `src/` +
   `public/`.
2. App reads the composition's current `defaultProps` → renders `@remotion/player` with the project
   composition + those props → live preview.
3. Reviewer manipulates (drag / click / type) → updates in-memory props → Player re-renders live.
4. Brand-warning detectors run on the in-memory props → inline warnings.
5. Save → POST JSON to local endpoint → endpoint AST-rewrites `Root.tsx` `defaultProps` → (later)
   `/toolkit:render` produces MP4.

## Error handling & edge cases

- **Invalid config on load** (fails Zod): show a clear error + fall back to raw JSON view; do not
  crash the Player.
- **Trim/duration below minimums** (broll ≥ 3 s per brand rule; multi-clip `durationMs` ≥ 1000 ms):
  clamp at the drag handle; surface as a brand warning rather than silently accepting.
- **Missing take/source file** (referenced `source` not in `public/`): mark the take slot as
  missing; don't break preview.
- **Concurrent edits** (Studio open on the same `Root.tsx`): last-write-wins is acceptable for a
  single local user; note it, don't engineer locking in MVP.

## Testing

- **Unit:** trim/duration math incl. min-duration clamping; transition frames ↔ seconds/preset
  conversion; brand-warning detectors; the AST rewrite (props object → rewritten `Root.tsx` →
  re-parsed props equal the input).
- **Integration:** load a fixture reel → simulate drag edits + caption edit + transition change →
  Save → assert the rewritten `Root.tsx` still compiles and its `defaultProps` validates against the
  template's Zod schema and matches expected values.
- **Preview parity (manual/smoke):** the Player preview and a `/toolkit:render` of the same props
  agree visually on a sample reel.

## Later phases (not this spec)

- On-frame multi-clip region editing (variant 1).
- Inspector-side transition mirror (variant C).
- One-click launcher (npx / `.command`) so the reviewer never sees a terminal.
- In-editor render button wired to existing cloud GPU (Modal/RunPod) → R2 share link.
- Hosted editor (URL, config from R2/git) — true zero-terminal.
- Humanized Studio schema form (cheap parallel win for power users).

## Resolved architecture decisions

1. **Editor UI in core, running in project context** (mounts the project's composition). ✔
2. **Single source of truth stays the inlined `Root.tsx` `defaultProps` literal**; the editor saves
   by AST-rewriting it server-side (Studio Save preserved, no migration). ✔ *(Revised from the
   original `config.json` seam after finding it would break Studio Save.)*
