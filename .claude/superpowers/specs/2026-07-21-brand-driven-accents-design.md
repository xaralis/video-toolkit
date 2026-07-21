# Brand-driven accent palette

**Date:** 2026-07-21
**Status:** Design + safe foundation landed; full rollout = follow-up

## Problem

The text-accent system hardcodes two slots, `lime` and `teal`, in core:
`lib/transcripts/accent-parser.ts` (`type AccentColor = 'lime' | 'teal'`, regex `/\{(lime|teal):…\}/`,
and `applyBrandEndpoint` auto-wrapping a trailing `.` as `{teal:.}`), the template schema enums
(stat-callout `color`, wipe `color`), and — until this change — the editor's accent buttons. This
bakes **Progresivní Pardubice's** identity (PP was the first brand) into the shared core. Another
brand may want a **different number** of accent slots with **different names/colors**.

## Design (cleanest architecture)

**Accent slots are declared by the brand, not the toolkit.**

1. **Brand declares slots.** `brands/<brand>/brand.json` gains:
   ```json
   "accents": [
     { "key": "lime", "label": "Lime", "color": "#c6f432" },
     { "key": "teal", "label": "Teal", "color": "#4bbfb0" }
   ],
   "endpointAccentKey": "teal"   // optional: the slot used by the trailing-"." brand rule; omit to disable
   ```
   `brands/default` ships a neutral 1–2 slot default. The `{ <key>:phrase }` syntax stays; only the
   **set of valid keys** and their colors/labels are per-brand. PP keeps `lime`/`teal` for
   back-compat with all existing content.

2. **Core parser is slot-agnostic** (`accent-parser.ts`): parse `{ <key>:phrase }` for any
   identifier key (`/\{(\w+):([^}]+)\}/`); `type AccentColor = string`; `applyBrandEndpoint(text,
   endpointKey?)` takes the endpoint key (no hardcoded `teal`). **Backward-compatible**: existing
   lime/teal content parses unchanged; an omitted endpoint key leaves the text alone.

3. **Rendering maps key → brand color** in the template/composition layer (where accents are
   actually rendered — core `lib/` only produces `{text, color}` tokens). The template's accent
   renderer looks the token's `color` (key) up in the brand's `accents` (→ hex / `var(--color-<key>)`),
   defaulting gracefully for an unknown key.

4. **Editor reads the brand's slots.** The `AccentEditor` already takes a data-driven
   `colors: Array<{ key, label }>` prop and the Inspector passes it through; the dev-server exposes
   the active brand's accent slots (a `/brand` endpoint reading `brand.json`), so the accent buttons
   and the endpoint rule reflect the brand — not hardcoded Lime/Teal.

## Landed now (safe, backward-compatible foundation)

- `accent-parser.ts` generalized to arbitrary keys + parameterized endpoint (lime/teal still work).
- `AccentEditor.colors` is already data-driven (built during the UX pass).

## Follow-up (not landed — needs care / touches brand repo + render)

- `brands/<brand>/brand.json` `accents` + `endpointAccentKey` schema, core `brand.ts` loader
  exposing them, `brands/default` default.
- Template accent renderer: map arbitrary key → brand color (currently branches on lime/teal).
- Dev-server `/brand` (or extend `/props`) → editor feeds real brand slots into AccentEditor + the
  endpoint rule; buttons labelled/coloured per brand.
- **Schema enums** for the *other* (non-text-accent) color fields — stat-callout `color`,
  wipe `color` — are a separate concern (sweep/number colours, not text accents); relax/brand-drive
  them separately.
- Migration: none needed for PP (lime/teal preserved); a new brand simply declares its slots.

## Non-goals

Transition sweep colours and card variants are out of scope here — this spec is the **text-accent**
palette only.
