# Proactive core-upstreaming from brand repos — design

**Date:** 2026-07-18
**Status:** approved, ready for implementation
**Scope:** a behavioural convention (CLAUDE.md instructions + a small marker convention), no runtime code

## Context

The toolkit is split into a shared public core (`xaralis/video-toolkit`) consumed by
per-brand repos (`progpce/video-toolkit`, `roost/video-toolkit`) as a pinned
`toolkit/` submodule + Claude Code plugin. The core/brand line is settled: anything
reusable by *any* brand belongs in core; brand-specific material stays local
(see the split spec's §3, and memory `feedback_core_brand_boundary.md`).

Today that line is enforced *reactively* — a person has to notice and run
`/toolkit:contribute`. When work happens inside a brand repo, reusable functionality
tends to get built locally and silently stays there, never reaching the other brands.

## Goal

When work in a brand repo produces something reusable across repos that use the
toolkit, Claude **recognises it as core chassis and proposes upstreaming** — without
blocking the person's current task, and leaving an easy path to replace the local
copy with the core one once it lands.

## The criterion (unchanged, restated)

Not limited to reel/video primitives — **any functionality**: a component, a Python
tool, a skill, a helper, a pattern. The test is ownership by *nature*, not by who
needs it today: *would this help any brand/repo using the toolkit, independent of
this brand?* If yes → core. (Authoritative statement lives in core `CLAUDE.md`;
memory `feedback_core_brand_boundary.md` records the rule.)

## Decisions

### 1. Non-blocking — local first, propose alongside

Recognising core-worthiness is **not a gate before the work**. The order is:

1. **Implement it locally** so the person keeps moving — never stall the current task
   waiting on an upstream decision.
2. **Then** surface it, plainly and non-technically (below).
3. **Leave an easy swap path** so replacing the local copy with core's is mechanical
   once core has it.

### 2. The proposal — non-technical, after the local implementation

Claude asks in plain terms (the operator need not know "push access", "PR", or
"submodule"):

> "Mimochodem — tohle by se hodilo i jinde, ne jen tady. Nechal jsem to zatím
> lokálně, ať nejsi blokovaný. Mám s tím dál něco udělat?"
>
> 1. **Dej to rovnou do core** — for someone who can put it there. Claude moves it to
>    core, bumps this repo's submodule, and the repo consumes it from core — no local
>    copy, no later swap. If pushing to core turns out not to work (no access), Claude
>    says so plainly and falls back to option 2.
> 2. **Připrav návrh + cestu k náhradě** — the local copy stays (unblocked); alongside,
>    a PR against core via `/toolkit:contribute`, plus the swap markers (§3).
> 3. **Jen poznámka zatím** — local marker + one line in core `_internal/BACKLOG.md`
>    (via `/toolkit:contribute`), so it is not forgotten.

Detection of "can put it in core" is not magic: Claude asks (option 1 vs 2); whether
a push actually succeeds is resolved at execution time, with a graceful fallback to a
PR.

### 3. The swap path — how local→core stays trivial

The local addition is built to the **same API / import shape it will have in core**,
so swapping later is: delete the local file, repoint the import to `@video-toolkit/lib`
(or the plugin), bump the submodule. Two markers make the pending state visible:

- **Inline, at the code** (authoritative — drives the swap):
  ```ts
  // UPSTREAM-PENDING: core-worthy; PR <link/#>. When merged: delete this file and
  // import { X } from '@video-toolkit/lib/…' (bump the toolkit submodule).
  ```
- **`UPSTREAM.md` at the brand repo root** (index — all pending items at a glance):
  one line per pending item → what it is, where the code is, the PR, the swap step.

Both are added when flagging and removed when the swap completes. The inline marker is
the source of truth; `UPSTREAM.md` is the roll-up so pending upstreams are visible
without grepping.

### 4. Where the instruction lives

- **core `CLAUDE.md`** — the authoritative criterion + the convention (applies when
  working in core too; public, so any toolkit consumer sees it).
- **brand `CLAUDE.md`** (PP, ROOST) — upgrade the existing passive "Toolkit vs Project
  Work" section to the active rule above. This is what fires when working in a brand
  repo.
- Reuses `/toolkit:contribute` for the PR / BACKLOG paths — no new command.
- Memory: a `feedback` entry so the behaviour persists across sessions.

## Out of scope

- No hook. Recognising core-worthiness is a judgement call; a hook can only run
  commands, not judge. The vehicle is the CLAUDE.md instruction, applied by Claude.
- No change to the criterion itself (settled) or to `/toolkit:contribute` (reused).
- Brand-specific work is unaffected — it stays local, unflagged.

## Success criteria

- Working in a brand repo and building something reusable, Claude flags it *after*
  keeping the person unblocked, in plain language, with the three options.
- Choosing "prepare a PR" leaves a working local copy, a PR, an inline `UPSTREAM-PENDING`
  marker, and a `UPSTREAM.md` line.
- Once the feature is in core, the marker tells you exactly what to delete and repoint;
  the swap is a few mechanical steps.
