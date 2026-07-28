# Phase 4 — brand migration notes

Phase 4 is **core-only**. Nothing here has been applied to a brand repo; each
item says what a brand will need to do on the submodule pin bump that brings
these commits in, and is graded **parity-preserving** (restores or keeps
existing behaviour) or **deliberate look change**.

Brand repos, both read-only for this phase and both on `main` at core `9202e79`:

- PP: `/Users/xaralis/Workspace/progpce/video-toolkit`
- roost: `/Users/xaralis/Workspace/roost/video-toolkit`

---

## Task 1.0 — the transition schema opened to brand kinds

### 1.0-a `TransitionSchema.options` no longer enumerates kinds

**Grade: parity-preserving** (compile-time only).

`TransitionSchema` is now a two-branch `z.union`, so `.options` are the two
branches rather than the catalog's kinds. Anything enumerating kinds must read
`CoreTransitionSchema.options`.

**Neither brand repo does this today** (checked). No action expected.

### 1.0-b `withTransitionOverrides` regained its excess-property check

**Grade: parity-preserving** (it restores pre-Phase-4 behaviour).

roost's call site is the only real consumer. A misspelled override key there will
now fail to compile rather than silently no-op — which is what it did before
Phase 4 opened the union. If the brand wants to override a *brand* kind's own
params, that needs a brand-side typed helper; core cannot name those keys and so
cannot check them.

---

## Task 1.1 — one `ParamField` for both axes

### 1.1-a `SubOption.kind` is now `ParamField.type`

**Grade: parity-preserving** (compile-time only; rename, not a behaviour change).

The transition axis' `SubOption` and the effect axis' `ParamField` were two
incompatible parameter vocabularies. They are now one descriptor, defined in
`lib/reel-config-base/param-field.ts`. `SubOption` and `SubOptionChoice` survive
as **deprecated type aliases**, so an import of either still resolves — but the
field formerly spelled `kind` is spelled `type`, matching the effect axis and
freeing `kind` for what it means everywhere else in the transition schema.

**Who is affected:** anything reading `subOptionsFor(kind)[n].kind`. In core that
was `LayeredInspector` and two test files. **Neither brand repo calls
`subOptionsFor` or `subOptionForField`** (checked) — the editor is core's, and a
brand consumes it rather than re-implementing its dispatch. No action expected.

### 1.1-b `options` accepts both declaration styles

**Grade: parity-preserving.**

`ParamField.options` is `readonly (string | {value,label})[]`. Every existing
brand declaration is a bare string list and keeps working **unchanged**, with the
label still rendered raw (a bare string's label is the string itself —
deliberately not humanized, or every existing dropdown would silently relabel).
The spelled-out form is new capability, not a requirement. Normalise with
`paramChoices()` if you read an options list yourself.

### 1.1-c burn's `glowColor` is now `ColorHex`, not a bare `z.string()`

**Grade: parity-preserving.** Validation is byte-identical (`ColorHex` is a
marked `z.string()` and rejects exactly what a plain one rejects). The marking
exists so the *editor* gives the field a colour control; nothing about parsing,
rendering or the baked literals changes. All 13 transition literals across both
brand repos parse unchanged.

### 1.1-d new editor controls appear for fields that had none

**Grade: deliberate — but additive, and it moves zero pixels.**

A brand's inspector will show controls it did not show before:

- **`burn.mask`** — a text field. Previously invisible.
- **`burn.glowColor`** — a colour swatch + text field. Previously invisible.
- an **`accent`**-typed *declared* param (`EditorMeta.videoProps` / effect
  `params` / any registration's `params`) now renders as a brand-palette
  dropdown. Previously the declared-params path had no `accent`, so such a field
  fell through to a text box.
- **`percent`** and **`angle`** types are available to a brand's declarations.
  Neither converts the stored value — they change the control only (a bounded
  0–100 field, a whole-degree step).
- any numeric transition param now carries the **schema's own min/max** into the
  control (e.g. `light-leak.intensity` is bounded 0–1 in the UI), without anyone
  restating the range.

Nothing is written into a config that was not written before, so no render
changes. Verified: `npm run pixel-gate:strict` in `examples/layered-minimal`.

### 1.1-e `Animatable` ships unused

**Grade: no action.** `Animatable<T>` / `sampleAnimatable` land as a mechanism
with no caller. `ken-burns` is deliberately NOT migrated onto it (Task 3.2
depends on `kenBurnsStyle` keeping its exact signature). Keyframe editing UI is
out of scope for Phase 4; the editor exposes constants only.
