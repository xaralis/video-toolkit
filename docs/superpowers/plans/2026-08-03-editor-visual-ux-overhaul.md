# Editor Visual + UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the reel editor a distinctive graphite/violet identity, replace every decimal number box with an NLE-grade control, and formalise keyboard shortcuts behind a registry with a `?` overlay.

**Architecture:** Tailwind v4 is compiled **at core** into a committed stylesheet (`lib/editor/app/editor.css`) with the `ed:` prefix, so a brand repo needs no plugin — ROOST has no Tailwind and must keep working. Design tokens live in a `@theme` block and become both `ed:*` utilities and `--ed-color-*` custom properties. All gesture and parsing logic goes into pure functions tested directly, because jsdom delivers no pointer events and the timeline's rows are virtualised.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4 (`@tailwindcss/cli`), Vitest + Testing Library, `@xzdarcy/react-timeline-editor`, `@remotion/player` 4.0.498.

**Spec:** `docs/superpowers/specs/2026-08-03-editor-visual-ux-overhaul-design.md`

## Global Constraints

- **Tailwind is compiled at core, never by a brand.** `@tailwindcss/cli` is a `lib/editor` devDependency. A brand repo must need no plugin, no config and no content path. ROOST's editor config is `plugins: [react()]` and must remain untouched and working.
- **All utilities carry the `ed:` prefix** — `ed:flex`, `ed:bg-panel`. PP runs its own Tailwind in the same page; the prefix makes collision structurally impossible.
- **`editor.css` is generated and committed.** Staleness gate: `npm run editor:css && git diff --exit-code lib/editor/app/editor.css` must pass.
- **Token names are semantic, not numeric.** With `prefix(ed)`, Tailwind prefixes theme variables too: `@theme { --color-panel }` emits `--ed-color-panel` and the utility `ed:bg-panel`. Numeric names (`--ed-bg-2`) would produce `ed:bg-bg-2`. The spec's numeric table is superseded by the semantic names in Task 1.
- **Accent is `#7c5cff`.** `EDITOR_ACCENT` in `lib/editor/host/ui.ts` changes from `#b6ff5a`. The duplicate lime literal in `EditorShell.module.css` goes away with that file.
- **No lane may occupy the accent hue.** Load-bearing rule; holds even at the cost of lane separation. Selection is an accent ring, never a fill swap.
- **The editor's visible strings are English.**
- **Never add `Co-Authored-By` to a commit.** If signing fails, commit with `--no-gpg-sign` immediately and carry on.
- **Gates before the branch is done:** `cd lib/editor && npx vitest run --no-file-parallelism` (baseline **117 files / 1933 tests**, 1927 passed / 6 skipped); `cd lib/editor && npx tsc --noEmit ; echo "exit=$?"` (**3** pre-existing errors, compared by IDENTITY not count, exit code read separately — a grep count alone prints `0` when tsc crashes); `grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*'` (exactly **2** hits). The pixel harness, the example typecheck and the Python suite are untouched — this reaches neither `lib/render`, `lib/transitions` nor `video_toolkit` — skip with that reason stated.

## File Structure

**Created:**
- `lib/editor/app/editor.in.css` — Tailwind entry: `@import "tailwindcss" prefix(ed)`, `@source`, `@theme`.
- `lib/editor/app/editor.css` — **generated, committed**. Never hand-edited.
- `lib/editor/app/controls/scrub-value.ts` + `.test.ts` — pointer→value maths.
- `lib/editor/app/controls/timecode.ts` + `.test.ts` — `mm:ss.ff` parse/format.
- `lib/editor/app/controls/ScrubField.tsx`, `SliderField.tsx`, `TimecodeField.tsx`, `SegmentedField.tsx` + one `controls.test.tsx`.
- `lib/editor/app/shortcuts.ts` + `.test.ts` — the registry.
- `lib/editor/app/useShortcuts.ts` — the single keydown listener.
- `lib/editor/app/ShortcutOverlay.tsx` + `.test.tsx`.
- `lib/editor/app/project-summary.ts` + `.test.ts` — `aspectLabel`, `failedSources`.

**Modified:** `EditorShell.tsx` (+ delete its `.module.css`), `host/ui.ts`, `host/toolbar.tsx`, `host/EditorHost.tsx`, `host/MediaLoading.tsx`, `app/LayeredInspector.tsx`, `app/LayeredTimeline.tsx`, `app/AccentEditor.tsx` (+ `.module.css`), `app/FrameOverlay.tsx` (+ `.module.css`), `app/editor-meta.ts`, `lib/editor/package.json`.

---

## Phase 1 — Tailwind pipeline and repaint

> ### ⚠️ Cascade-layer hazard, binding on Tasks 3, 4 and 5
>
> Tailwind emits every utility into `@layer utilities`. **Unlayered CSS —
> which is what every surviving `*.module.css` compiles to — outranks any
> cascade layer regardless of specificity.** So the moment an element carries
> both a module class setting `background` and `ed:bg-panel`, the module wins
> and the utility appears to do nothing, with no build error and no failing
> test.
>
> The rule while converting: **convert an element's module class and its
> utilities in the same edit — never leave an element wearing both.** If a
> conversion looks like it had no effect, this is the first thing to check,
> not the token names.
>
> The window closes at the end of this phase: Task 5 deletes the last two
> `*.module.css` files.
>
> **Corrected after Task 5's review — do not read the line above as "nothing
> unlayered competes any more".** Deleting the modules closes the
> *module-shaped* instance of the hazard, not the hazard itself. Two unlayered
> stylesheets remain and genuinely compete: the vendor
> `@xzdarcy/react-timeline-editor` CSS (which styles `.timeline-editor` on the
> very node `LayeredTimeline` puts a `style` prop on), and `GRIP_CSS`, injected
> through a `<style>` element on purpose because it targets a third-party class
> no React element here renders. Where a vendor rule competes, the answer is an
> **inline style holding a `var(--ed-color-*)`** — inline still wins, and stays
> tokenised. A utility class there would lose silently.
>
> ### Token semantics: `ink-2` is for content, `ink-3` is for hints
>
> Discovered in Task 3's re-review, binding on every remaining task. Putting a
> numeric **readout** in `--ed-color-ink-3` (`#6a6a78`) measures ~3.5:1 against
> `--ed-color-shell` at 12px — **below WCAG AA for normal text**. `ink-3` is
> sized for micro-labels, section headings and one-line hints, where its
> quietness is the point and the text is not information anyone reads
> character by character.
>
> The rule: **a value the user reads goes in `--ed-color-ink-2` (`#a0a0ae`);
> `--ed-color-ink-3` is for labels about values, never the values themselves.**
> This matters most in Task 4, where the inspector is largely readouts.
>
> Related, same commit that introduced it: Phase 1 is also the first time
> Tailwind Preflight applies to the whole editor page. The unconverted surface
> was spot-checked and is safe (the inspector's fields all carry inline
> styles), with one cosmetic exception — the bare `<input type="checkbox">` at
> `LayeredInspector.tsx:179` loses its default background. Task 4 owns that
> file and should give the checkbox an explicit style while it is there.

### Task 1: Tailwind pipeline and design tokens

**Files:**
- Create: `lib/editor/app/editor.in.css`, `lib/editor/app/editor.css` (generated)
- Modify: `lib/editor/package.json`, `lib/editor/host/ui.ts`
- Test: `lib/editor/src/editor-css.test.ts` (create)

**Interfaces:**
- Produces: the `ed:` utility layer; CSS custom properties `--ed-color-{stage,shell,panel,control,line,line-strong,ink,ink-2,ink-3,accent,accent-ink,accent-soft,warn,danger}` and `--ed-font-mono`; `EDITOR_ACCENT = '#7c5cff'`; npm script `editor:css`.

- [ ] **Step 1: Add the Tailwind CLI dependency**

In `lib/editor/package.json`, add to `devDependencies`:

```json
"@tailwindcss/cli": "^4.0.0"
```

and to `scripts`:

```json
"editor:css": "tailwindcss -i app/editor.in.css -o app/editor.css --minify"
```

Then run `cd lib/editor && npm install`.

- [ ] **Step 2: Write the Tailwind entry file**

Create `lib/editor/app/editor.in.css`:

```css
@import "tailwindcss" prefix(ed);

@source "./**/*.tsx";
@source "../host/**/*.tsx";

@theme {
  --color-stage: #0e0e12;
  --color-shell: #131318;
  --color-panel: #1a1a21;
  --color-control: #22222b;
  --color-line: #2a2a35;
  --color-line-strong: #3a3a48;
  --color-ink: #e6e6ea;
  --color-ink-2: #a0a0ae;
  --color-ink-3: #6a6a78;
  --color-accent: #7c5cff;
  --color-accent-ink: #12101f;
  --color-accent-soft: #2e2547;
  --color-warn: #ffb454;
  --color-danger: #ff5c5c;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

Note the emitted names: with `prefix(ed)` these become `--ed-color-panel`, `--ed-font-mono`, and utilities `ed:bg-panel`, `ed:text-ink-2`, `ed:font-mono`.

- [ ] **Step 3: Generate the stylesheet and commit it**

Run: `cd lib/editor && npm run editor:css`
Expected: `lib/editor/app/editor.css` is created and non-empty.

- [ ] **Step 4: Write the staleness test**

Create `lib/editor/src/editor-css.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const CSS = path.resolve(__dirname, '../app/editor.css');

describe('generated editor.css', () => {
  // The generated stylesheet is committed so a brand needs no Tailwind plugin.
  // These assertions catch the failure mode that choice creates: a stale
  // artifact styles nothing, and silently — unstyled markup throws no error.
  it('exists and is not empty', () => {
    expect(fs.existsSync(CSS)).toBe(true);
    expect(fs.readFileSync(CSS, 'utf8').length).toBeGreaterThan(1000);
  });

  it('carries the ed: prefix, so it cannot collide with a brand own Tailwind', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    expect(css).toContain('.ed\\:');
  });

  it('emits the prefixed theme variables the inline styles read', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    expect(css).toContain('--ed-color-accent');
    expect(css).toContain('#7c5cff');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `cd lib/editor && npx vitest run src/editor-css.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Point `EDITOR_ACCENT` at the new accent**

In `lib/editor/host/ui.ts`, change the constant and its comment:

```ts
/** The editor chrome's "on" accent — core's editor UI colour, NOT a brand
 *  colour. Mirrors `--ed-color-accent` in `app/editor.in.css`; kept as a JS
 *  string for the few consumers that cannot use a class (an SVG stroke, a
 *  spinner border). A brand's palette reaches the editor only through
 *  `accentSlots`. */
export const EDITOR_ACCENT = '#7c5cff';
```

- [ ] **Step 7: Verify the staleness gate itself works**

Run: `cd lib/editor && npm run editor:css && git diff --exit-code app/editor.css ; echo "exit=$?"`
Expected: `exit=0` — regenerating produces no diff.

- [ ] **Step 8: Commit**

```bash
git add lib/editor/package.json lib/editor/package-lock.json lib/editor/app/editor.in.css lib/editor/app/editor.css lib/editor/src/editor-css.test.ts lib/editor/host/ui.ts
git commit -m "feat(editor): compile Tailwind at core into a committed stylesheet"
```

---

### Task 2: Convert EditorShell to utilities

**Files:**
- Modify: `lib/editor/app/EditorShell.tsx`
- Delete: `lib/editor/app/EditorShell.module.css`
- Test: `lib/editor/app/EditorShell.test.tsx` (existing — adjust if it asserts class names)

**Interfaces:**
- Consumes: the `ed:` utility layer and `--ed-color-*` from Task 1.

- [ ] **Step 1: Import the generated stylesheet**

In `lib/editor/app/EditorShell.tsx`, replace `import styles from './EditorShell.module.css';` with:

```ts
import './editor.css';
```

- [ ] **Step 2: Check what the existing test asserts**

Run: `cd lib/editor && npx vitest run app/EditorShell.test.tsx`
Read the file first. If it queries by CSS-module class name, those queries must become role/text queries — a utility-class rewrite legitimately invalidates them. If it queries by role and text, it should keep passing unchanged.

- [ ] **Step 3: Replace every `styles.*` reference with utility classes**

The mapping, one line per former rule:

| Former | Utilities |
|---|---|
| `.shell` | `ed:flex ed:flex-col ed:h-screen ed:bg-shell ed:text-ink ed:font-sans` |
| `.header` | `ed:flex ed:items-center ed:justify-between ed:px-5 ed:py-3 ed:bg-panel ed:border-b ed:border-line ed:shrink-0` |
| `.projectName` | `ed:text-sm ed:font-semibold ed:text-ink` |
| `.saveGroup` | `ed:flex ed:items-center ed:gap-3` |
| `.unsavedIndicator` | `ed:text-xs ed:font-medium ed:text-warn` |
| `.saveButton` | `ed:bg-accent ed:text-accent-ink ed:border-0 ed:rounded-md ed:px-[18px] ed:py-2 ed:text-[13px] ed:font-semibold ed:cursor-pointer ed:disabled:bg-control ed:disabled:text-ink-3 ed:disabled:cursor-default` |
| `.saveButtonClean` | `ed:bg-control ed:text-ink-3 ed:cursor-default` |
| `.discardButton` | `ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-[14px] ed:py-2 ed:text-[13px] ed:cursor-pointer ed:hover:border-ink-3 ed:hover:text-ink ed:disabled:opacity-45 ed:disabled:cursor-default` |
| `.iconButton` | `ed:inline-flex ed:items-center ed:gap-1.5 ed:bg-transparent ed:text-ink-2 ed:border ed:border-line-strong ed:rounded-md ed:px-3 ed:py-[7px] ed:text-[13px] ed:cursor-pointer ed:hover:not-disabled:text-ink ed:disabled:opacity-40 ed:disabled:cursor-default` |
| `.divider` | `ed:w-px ed:h-[22px] ed:bg-line ed:mx-0.5` |
| `.main` | `ed:flex ed:flex-1 ed:min-h-0` |
| `.stage` | `ed:flex ed:items-center ed:justify-center ed:flex-1 ed:min-w-0 ed:bg-stage ed:p-6` |
| `.stageFrame` | `ed:h-full ed:max-w-full ed:bg-black ed:overflow-hidden ed:rounded ed:shadow-[0_0_0_1px_var(--ed-color-line)]` |
| `.inspector` | `ed:w-80 ed:shrink-0 ed:bg-panel ed:border-l ed:border-line ed:overflow-hidden ed:text-ink-3 ed:text-[13px]` |
| `.timeline` | `ed:h-[300px] ed:shrink-0 ed:bg-panel ed:border-t ed:border-line ed:flex ed:items-center ed:justify-center ed:text-ink-3 ed:text-[13px]` |

**Keep `aspectRatio` inline.** The existing comment on `.stageFrame` explains why it must come from the caller's composition dimensions and must not have a second source of truth — that reasoning is unchanged.

- [ ] **Step 4: Update the injected global reset**

The inline `<style>` in `EditorShell.tsx` stays (it resets `html, body, #root`, which no utility class can reach), but its background literal becomes the token:

```tsx
<style>{`html, body, #root { height: 100%; margin: 0; } body { background: var(--ed-color-stage); }`}</style>
```

- [ ] **Step 5: Delete the CSS module**

```bash
git rm lib/editor/app/EditorShell.module.css
```

- [ ] **Step 6: Regenerate and run the tests**

Run: `cd lib/editor && npm run editor:css && npx vitest run --no-file-parallelism`
Expected: same pass count as baseline (1927 passed / 6 skipped), or the EditorShell test adjusted in Step 2 and its new count stated.

- [ ] **Step 7: Commit**

```bash
git add -A lib/editor/app
git commit -m "feat(editor): restyle the shell onto Tailwind utilities"
```

---

### Task 3: Convert the toolbar and host chrome

**Files:**
- Modify: `lib/editor/host/ui.ts`, `lib/editor/host/toolbar.tsx`, `lib/editor/host/MediaLoading.tsx`

**Interfaces:**
- Consumes: the `ed:` layer, `EDITOR_ACCENT`.
- Produces: `zoomBtnClass: string` and `toggleBtnClass(on: boolean): string`, replacing the `CSSProperties` exports `zoomBtn` and `toggleBtn`.

- [ ] **Step 1: Replace the style constants with class strings**

In `lib/editor/host/ui.ts`, delete the `zoomBtn` and `toggleBtn` `CSSProperties` exports and the now-unused `CSSProperties` import, and add:

```ts
/** One button metric across the whole timeline toolbar. */
export const BTN_H = 28;
export const BTN_FONT = 12;

/** A square icon button (zoom, transport). */
export const zoomBtnClass =
  'ed:bg-control ed:text-ink ed:border ed:border-line ed:rounded ed:w-7 ed:h-7 ed:text-xs ed:leading-none ed:cursor-pointer ed:inline-flex ed:items-center ed:justify-center';

/** A pill toggle (Ripple / Snap / Beats): accented when on, neutral when off. */
export const toggleBtnClass = (on: boolean): string =>
  `ed:h-7 ed:px-3 ed:text-xs ed:rounded ed:border ed:border-line ed:cursor-pointer ${
    on ? 'ed:bg-accent ed:text-accent-ink' : 'ed:bg-control ed:text-ink'
  }`;
```

`BTN_H` and `BTN_FONT` stay — other call sites compute layout from them.

- [ ] **Step 2: Update every call site**

Run: `cd /Users/xaralis/Workspace/progpce/core && grep -rn 'zoomBtn\|toggleBtn' lib/ --include='*.tsx' --include='*.ts' | grep -v node_modules`

Convert each `style={zoomBtn}` to `className={zoomBtnClass}` and each `style={toggleBtn(x)}` to `className={toggleBtnClass(x)}`. Where a call site spread the object to override (e.g. `{...zoomBtn, width: 'auto', padding: '0 8px'}` in `EditorHost.tsx`), append the overriding utilities to the class string instead: `` className={`${zoomBtnClass} ed:w-auto ed:px-2`} `` and keep any dynamic `opacity` as an inline style, since it is data-driven.

- [ ] **Step 3: Convert MediaLoading**

In `lib/editor/host/MediaLoading.tsx`, replace the overlay's inline style object with:

```tsx
className="ed:absolute ed:inset-0 ed:z-[3] ed:flex ed:flex-col ed:items-center ed:justify-center ed:gap-2.5 ed:text-ink ed:text-xs ed:pointer-events-none ed:bg-[rgba(12,13,16,0.55)]"
```

and the spinner's with:

```tsx
className="ed:w-[22px] ed:h-[22px] ed:rounded-full ed:border-2 ed:border-white/20"
style={{ borderTopColor: EDITOR_ACCENT, animation: 'vt-spin 0.8s linear infinite' }}
```

The `borderTopColor` and `animation` stay inline — the keyframe is defined in the component's own `<style>` block and the accent is already a JS constant here. Keep the `<style>{SPIN_CSS}</style>` element and the `pointerEvents: 'none'` **semantics**: the existing test asserts `style.pointerEvents === 'none'`, so either keep that inline property or update the test to assert the class. Prefer updating the test — the class is now the mechanism:

```ts
it('never eats pointer events — it is a status, not a modal', () => {
  const { container } = render(<MediaLoadingOverlay loaded={0} total={2} buffering={false} />);
  expect((container.firstElementChild as HTMLElement).className).toContain('ed:pointer-events-none');
});
```

- [ ] **Step 4: Regenerate and run the tests**

Run: `cd lib/editor && npm run editor:css && npx vitest run --no-file-parallelism`
Expected: 1927 passed / 6 skipped.

- [ ] **Step 5: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): move the toolbar and host chrome onto utilities"
```

---

### Task 4: Convert the inspector's style objects

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx`

- [ ] **Step 1: Replace the ten shared style objects with class constants**

At the top of `LayeredInspector.tsx`, replace the `React.CSSProperties` constants with class strings:

```ts
const panelCls = 'ed:p-3 ed:w-full ed:h-full ed:overflow-y-auto ed:box-border';
const headingCls = 'ed:text-xs ed:text-ink ed:mb-2.5 ed:font-semibold';
const sectionCls = 'ed:text-[10px] ed:text-ink-3 ed:uppercase ed:tracking-wider ed:mt-2.5 ed:mb-1.5';
const fieldCls = 'ed:mb-2 ed:flex-1 ed:min-w-0';
const labelCls = 'ed:block ed:text-[11px] ed:text-ink-2 ed:mb-1';
const inputCls =
  'ed:w-full ed:box-border ed:bg-control ed:text-ink ed:border ed:border-line ed:rounded ed:px-2 ed:py-1 ed:text-xs';
const readonlyValueCls = 'ed:text-xs ed:text-ink ed:font-mono';
const noteCls = 'ed:text-[11px] ed:text-ink-3 ed:-mt-1 ed:mb-2';
const rowCls = 'ed:flex ed:gap-2';
const disabledCls = 'ed:opacity-45 ed:cursor-not-allowed';
```

Preserve the existing comments explaining `note` (a disabled control explaining itself) and `readonlyValue` (plain text, not a field box) — move them onto the new constants.

- [ ] **Step 2: Convert every consumer**

Change `style={panel}` → `className={panelCls}`, `style={field}` → `className={fieldCls}`, and so on for every one of the ten. For the two conditional cases:

- `NumberField`'s `style={disabled ? { ...input, opacity: 0.45, cursor: 'not-allowed' } : input}` becomes `` className={disabled ? `${inputCls} ${disabledCls}` : inputCls} ``.
- `CheckboxField`'s label merges `label` with flex properties: `className={`${labelCls} ed:flex ed:items-center ed:gap-1.5 ed:mb-0 ed:cursor-pointer`}` — note `ed:mb-0` must come after `labelCls` to win, which it does by source order in the generated sheet only if the utilities differ; they do (`mb-1` vs `mb-0` are distinct rules and Tailwind orders by property, so **verify visually** rather than assuming, or drop `ed:mb-1` from `labelCls` and add it per use).

Take the safer route: remove `ed:mb-1` from `labelCls` and add it explicitly at each non-checkbox use.

- [ ] **Step 3: Regenerate and run the tests**

Run: `cd lib/editor && npm run editor:css && npx vitest run --no-file-parallelism`
Expected: 1927 passed / 6 skipped. The inspector's tests query by `aria-label` and role, not class, so they should be unaffected — if any fail, read them before changing them.

- [ ] **Step 4: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): move the inspector onto utilities"
```

---

### Task 5: Convert the timeline, accent editor and frame overlay

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx`, `lib/editor/app/AccentEditor.tsx`, `lib/editor/app/FrameOverlay.tsx`
- Delete: `lib/editor/app/AccentEditor.module.css`, `lib/editor/app/FrameOverlay.module.css`

- [ ] **Step 1: Convert the two remaining CSS modules**

Replace `styles.*` references in `AccentEditor.tsx` and `FrameOverlay.tsx` with the equivalent `ed:` utilities, following the same token mapping used in Task 2 (`ed:bg-panel`, `ed:text-ink-2`, `ed:border-line`, …), then `git rm` both `.module.css` files.

- [ ] **Step 2: Convert the timeline's static inline styles**

In `LayeredTimeline.tsx`, convert inline style objects that hold **constant** values to classes. Leave inline **every** style that is computed per render — block colour, block width/offset, cursor position, the label's `textShadow`. Those are data, not design.

The label span keeps its existing behaviour exactly, expressed as classes plus the data-driven shadow:

```tsx
<span
  className="ed:relative ed:whitespace-nowrap ed:overflow-hidden ed:text-ellipsis ed:pointer-events-none"
  style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.65)' }}
>
```

Both the `pointer-events-none` (so the label never blocks the volume line) and the text shadow (so it reads over a waveform) are deliberate fixes — do not drop either.

- [ ] **Step 3: Keep `GRIP_CSS` as raw CSS**

`GRIP_CSS` styles `.timeline-editor-action`, a class the third-party timeline library owns and which no React element in this file renders. Utilities cannot reach it. Leave the raw CSS, but replace colour literals with `var(--ed-color-*)`.

- [ ] **Step 4: Regenerate, run the tests, and run the full gate set**

```bash
cd lib/editor && npm run editor:css && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "exit=$?"
cd /Users/xaralis/Workspace/progpce/core && grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*' | wc -l
```

Expected: 1927 passed / 6 skipped; **3** errors with `exit=2`, the same three files as the baseline (`LayeredInspector.tsx`, `derive-layered.test.ts`, `../theming/envelope.test.ts`) — compare by identity, and if a line number moved because this task edited the file, that is expected and must be stated; brand-leak count **2**.

- [ ] **Step 5: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): move the timeline and remaining panels onto utilities"
```

---

## Phase 2 — Lane colours

### Task 6: Harmonise lane colours with the accent

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx` (the `CORE_LANE_COLOR` map), `lib/editor/app/editor-meta.ts` (`stableColor`)
- Test: `lib/editor/app/lane-colors.test.ts` (create), `lib/editor/src/stable-color.test.ts` (existing — locate with `grep -rl stableColor lib/editor --include='*.test.*'`)

**Interfaces:**
- Produces: `ACCENT_HUE = 258`, `HUE_GUARD = 25`, `ARC = [190, 280]` exported from `lib/editor/app/lane-colors.ts` (create) and imported by both `LayeredTimeline.tsx` and `editor-meta.ts`, so the rule has one home.

- [ ] **Step 1: Write the failing rules test**

Create `lib/editor/app/lane-colors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CORE_LANE_COLOR } from './LayeredTimeline';
import { ACCENT_HUE, HUE_GUARD, ARC, hueOf } from './lane-colors';

describe('lane colours', () => {
  const entries = Object.entries(CORE_LANE_COLOR);

  it('has at least one entry per core lane kind', () => {
    expect(entries.length).toBeGreaterThanOrEqual(10);
  });

  // Rule 1, load-bearing: the accent means "selected". A lane permanently
  // wearing it destroys that signal.
  it('never puts a lane on the accent hue', () => {
    for (const [id, hex] of entries) {
      const h = hueOf(hex);
      if (h === null) continue; // a neutral slate has no meaningful hue
      const d = Math.min(Math.abs(h - ACCENT_HUE), 360 - Math.abs(h - ACCENT_HUE));
      expect(d, `${id} (${hex}) is ${d.toFixed(0)}deg from the accent`).toBeGreaterThanOrEqual(HUE_GUARD);
    }
  });

  it('draws every coloured lane from the declared arc', () => {
    for (const [id, hex] of entries) {
      const h = hueOf(hex);
      if (h === null) continue;
      expect(h, `${id} (${hex})`).toBeGreaterThanOrEqual(ARC[0]);
      expect(h, `${id} (${hex})`).toBeLessThanOrEqual(ARC[1]);
    }
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `cd lib/editor && npx vitest run app/lane-colors.test.ts`
Expected: FAIL — `./lane-colors` does not exist, and once it does, `music` (`#7a5cae`) and `video-multi-clip` (`#6a4fa5`) violate rule 1 while gold (`#8a6d1f`) and green (`#2f7d4f`) fall outside the arc.

- [ ] **Step 3: Create the rule module**

Create `lib/editor/app/lane-colors.ts`:

```ts
/** The lane-colour rules, in one place because both the core map
 *  (LayeredTimeline) and the fallback generator (editor-meta) must obey them.
 *
 *  Rule 1 is load-bearing: the accent means active/selected, so no lane may
 *  wear it — this holds even when it costs separation between lanes.
 *  Rule 2 keeps the set harmonious: one cool arc, adjacent to the accent,
 *  minus a guard band around the accent itself. */
export const ACCENT_HUE = 258;
export const HUE_GUARD = 25;
export const ARC: readonly [number, number] = [190, 280];

/** Hue in degrees, or null for an achromatic colour (a neutral slate), which
 *  is exempt from both rules — it has no hue to clash with. */
export function hueOf(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.04) return null; // achromatic
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
```

- [ ] **Step 4: Re-site the lane colours**

In `LayeredTimeline.tsx`, export the map (the test imports it) and replace its values. Every hue lands inside `[190, 280]` and at least `25°` from `258`:

```ts
export const CORE_LANE_COLOR: Record<string, string> = {
  'video-clip': '#3b6ea5',       // 212 — unchanged, already correct
  'video-broll': '#2f7d8a',      // 190 — was green #2f7d4f
  'video-photo': '#3f6a7d',      // 199 — unchanged
  'video-multi-clip': '#4a5fa5', // 226 — was #6a4fa5, which sat on the accent
  'video-card': '#5a6f9e',       // 222 — was gold #8a6d1f
  'video-outro': '#4a4c54',      // achromatic slate — exempt
  audio: '#2a8f8f',              // 180 -> re-sited to #2a7f8f (194)
  music: '#3f7fae',              // 203 — was #7a5cae, which sat on the accent
  'brand-watermark': '#4a4c54',  // achromatic slate — exempt
  'brand-disclaimer': '#4a4c54', // achromatic slate — exempt
};
```

Set `audio` to `#2a7f8f` so it lands at 194, inside the arc.

- [ ] **Step 5: Constrain the fallback generator**

In `lib/editor/app/editor-meta.ts`, `stableColor` currently spreads hue across the full 360°. Import the rule module and map the mixed hash into the arc, skipping the guard band:

```ts
import { ACCENT_HUE, HUE_GUARD, ARC } from './lane-colors';

// The usable hue span is the arc minus the guard band around the accent.
// Mapping into it (rather than modulo 360) is what keeps a brand's unknown
// lane kind inside the palette instead of clashing with it.
const GUARD_LO = ACCENT_HUE - HUE_GUARD;
const GUARD_HI = ACCENT_HUE + HUE_GUARD;
const USABLE = (ARC[1] - ARC[0]) - (Math.min(GUARD_HI, ARC[1]) - Math.max(GUARD_LO, ARC[0]));

function hueInArc(mixed: number): number {
  const t = (mixed >>> 8) % Math.round(USABLE);
  const h = ARC[0] + t;
  return h >= GUARD_LO ? h + (GUARD_HI - GUARD_LO) : h;
}
```

and use `hueInArc(...)` where the hue was previously `hash % 360`.

- [ ] **Step 6: Restate the separation threshold deliberately**

Find the existing separation assertion (`grep -rn 'separation\|minSep\|Math.min' lib/editor --include='*.test.*' | grep -i color`). Its minimum hue distance no longer fits a ~65°-usable arc. Lower the threshold to a value the new arc can actually satisfy and **state the reasoning in the test**, e.g.:

```ts
// The usable hue arc narrowed from 360deg to ~65deg when lane colours were
// harmonised with the accent (lane-colors.ts), so hue alone can no longer
// carry the separation this guards. The threshold drops from 24deg to 8deg
// and the saturation/lightness axes take up the slack — the guarantee is
// unchanged (two kinds must not read as one colour), only its budget moved.
const MIN_HUE_SEPARATION = 8;
```

**Do not delete the assertion.** It guards a real defect that already happened — two overlay kinds once landed 6° apart and read as one colour. If 8° still cannot be met, widen `SATURATIONS`/`LIGHTNESSES` rather than lowering further.

- [ ] **Step 7: Make selection a ring, not a fill swap**

In `LayeredTimeline.tsx`, find where a selected block's background is set. Selection must not replace the block's fill — the fill now carries lane identity, and swapping it to the accent would violate rule 1. Render selection as an outline instead:

```tsx
style={{ background: blockColor(action, reel, meta), outline: selected ? `2px solid ${EDITOR_ACCENT}` : undefined, outlineOffset: -2 }}
```

- [ ] **Step 8: Run the tests**

Run: `cd lib/editor && npx vitest run --no-file-parallelism`
Expected: the three new `lane-colors` tests pass; the `stableColor` separation test passes at its restated threshold; total is baseline **+3** (1930 passed / 6 skipped), and any change beyond +3 must be accounted for per file.

- [ ] **Step 9: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): harmonise lane colours with the accent"
```

---

## Phase 3 — Controls

### Task 7: `scrubValue`

**Files:**
- Create: `lib/editor/app/controls/scrub-value.ts`, `lib/editor/app/controls/scrub-value.test.ts`

**Interfaces:**
- Produces: `scrubValue(start: number, dx: number, step: number, opts?: { min?: number; max?: number; fine?: boolean }): number` and `PX_PER_STEP = 4`.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/app/controls/scrub-value.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scrubValue, PX_PER_STEP } from './scrub-value';

describe('scrubValue', () => {
  it('moves one step per 4px of travel', () => {
    expect(PX_PER_STEP).toBe(4);
    expect(scrubValue(1, 4, 0.05)).toBeCloseTo(1.05, 10);
    expect(scrubValue(1, 40, 0.05)).toBeCloseTo(1.5, 10);
  });

  it('moves backwards on negative travel', () => {
    expect(scrubValue(1, -8, 0.05)).toBeCloseTo(0.9, 10);
  });

  it('snaps to the step grid, so no float dust reaches the config', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in raw float maths.
    expect(scrubValue(0.1, 8, 0.1)).toBe(0.3);
    expect(String(scrubValue(0.1, 8, 0.1))).not.toContain('0000');
  });

  it('divides the rate by ten in fine mode', () => {
    expect(scrubValue(1, 40, 0.05, { fine: true })).toBeCloseTo(1.05, 10);
  });

  it('clamps to min and max when they are given', () => {
    expect(scrubValue(0.9, 400, 0.05, { max: 1 })).toBe(1);
    expect(scrubValue(0.1, -400, 0.05, { min: 0 })).toBe(0);
  });

  it('is unbounded when no range is given — the case a slider cannot serve', () => {
    expect(scrubValue(0, 4000, 1)).toBe(1000);
    expect(scrubValue(0, -4000, 1)).toBe(-1000);
  });

  it('returns the start value for zero travel', () => {
    expect(scrubValue(0.85, 0, 0.05)).toBe(0.85);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/controls/scrub-value.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/editor/app/controls/scrub-value.ts`:

```ts
/** Pixels of horizontal travel per `step` of value change. Four is tuned so a
 *  0.05-step field crosses its usual 0–2 working range in a comfortable drag
 *  rather than a flick. */
export const PX_PER_STEP = 4;

/** The value a scrub gesture lands on.
 *
 *  Pure on purpose: jsdom delivers no pointer events, so this is where the
 *  gesture's correctness is actually pinned. The component around it only
 *  translates events into `dx`.
 *
 *  Snapping to the `step` grid is not cosmetic — it is what keeps
 *  `0.30000000000000004` out of the saved config. Clamping applies only where
 *  a bound is declared; an unbounded parameter is exactly the case a slider
 *  cannot serve and this control exists for. */
export function scrubValue(
  start: number,
  dx: number,
  step: number,
  opts: { min?: number; max?: number; fine?: boolean } = {},
): number {
  const rate = opts.fine ? PX_PER_STEP * 10 : PX_PER_STEP;
  const steps = Math.round(dx / rate);
  const raw = start + steps * step;
  // Snap to the grid the step defines, anchored at zero.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  let v = Number((Math.round(raw / step) * step).toFixed(decimals));
  if (opts.min !== undefined) v = Math.max(opts.min, v);
  if (opts.max !== undefined) v = Math.min(opts.max, v);
  return v;
}
```

- [ ] **Step 4: Run the test**

Run: `cd lib/editor && npx vitest run app/controls/scrub-value.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/editor/app/controls
git commit -m "feat(editor): add scrubValue, the pointer-to-value maths"
```

---

### Task 8: Timecode parse and format

**Files:**
- Create: `lib/editor/app/controls/timecode.ts`, `lib/editor/app/controls/timecode.test.ts`

**Interfaces:**
- Produces: `parseTimecode(text: string, fps: number): number | null` (→ ms), `formatTimecode(ms: number, fps: number): string`.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/app/controls/timecode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTimecode, formatTimecode } from './timecode';

const FPS = 30;

describe('formatTimecode', () => {
  it('formats as mm:ss.ff', () => {
    expect(formatTimecode(0, FPS)).toBe('0:00.00');
    expect(formatTimecode(62_500, FPS)).toBe('1:02.15');
    expect(formatTimecode(3_600_000, FPS)).toBe('60:00.00');
  });

  it('pads seconds and frames but not minutes', () => {
    expect(formatTimecode(2_033, FPS)).toBe('0:02.01');
  });
});

describe('parseTimecode', () => {
  it('reads the canonical form', () => {
    expect(parseTimecode('1:02.15', FPS)).toBe(62_500);
  });

  it('reads bare seconds', () => {
    expect(parseTimecode('90', FPS)).toBe(90_000);
    expect(parseTimecode('62.5', FPS)).toBe(62_500);
  });

  it('reads a leading colon as zero minutes', () => {
    expect(parseTimecode(':02', FPS)).toBe(2_000);
  });

  it('round-trips through format', () => {
    for (const ms of [0, 1_000, 62_500, 599_999]) {
      const rt = parseTimecode(formatTimecode(ms, FPS), FPS);
      expect(Math.abs((rt as number) - ms)).toBeLessThan(1000 / FPS + 1);
    }
  });

  // Load-bearing: a rejected parse must NOT become 0, or a typo silently
  // zeroes a trim and the clip changes length under the author.
  it('returns null for nonsense rather than zero', () => {
    expect(parseTimecode('', FPS)).toBeNull();
    expect(parseTimecode('abc', FPS)).toBeNull();
    expect(parseTimecode('1:2:3:4', FPS)).toBeNull();
  });

  it('rejects a frame count the fps cannot hold', () => {
    expect(parseTimecode('0:00.30', 30)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/controls/timecode.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/editor/app/controls/timecode.ts`:

```ts
/** `mm:ss.ff` — the form an NLE shows and the reason the inspector stops
 *  asking anyone to type `1.35` seconds. */
export function formatTimecode(ms: number, fps: number): string {
  const total = Math.max(0, Math.round((ms / 1000) * fps));
  const frames = total % fps;
  const totalSec = Math.floor(total / fps);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  return `${min}:${String(sec).padStart(2, '0')}.${String(frames).padStart(2, '0')}`;
}

/** Permissive parse. Accepts `1:02.15`, `:02`, `62.5` and `90`.
 *
 *  Returns `null` — never `0` — for anything it cannot read. That distinction
 *  is load-bearing: a caller must leave the value untouched on a bad parse,
 *  and a `0` would silently zero a trim mid-typing. */
export function parseTimecode(text: string, fps: number): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d*):(\d{1,2})(?:\.(\d{1,2}))?$/.exec(t);
  if (m) {
    const frames = m[3] === undefined ? 0 : Number(m[3]);
    if (frames >= fps) return null;
    const min = m[1] === '' ? 0 : Number(m[1]);
    return Math.round(((min * 60 + Number(m[2])) + frames / fps) * 1000);
  }
  // Bare seconds, integer or decimal.
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 1000);
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `cd lib/editor && npx vitest run app/controls/timecode.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/editor/app/controls
git commit -m "feat(editor): add mm:ss.ff timecode parse and format"
```

---

### Task 9: The four control components

**Files:**
- Create: `lib/editor/app/controls/ScrubField.tsx`, `SliderField.tsx`, `TimecodeField.tsx`, `SegmentedField.tsx`, `controls.test.tsx`
- Modify: `lib/editor/app/LayeredInspector.tsx` (export `useLiveField` so the controls can share it, or move it into `controls/use-live-field.ts` and import it back — prefer moving it)

**Interfaces:**
- Consumes: `scrubValue`, `PX_PER_STEP`, `parseTimecode`, `formatTimecode`.
- Produces, all with the same commit contract as the existing `NumberField` (`onCommit` fires on every valid change, not on blur):
  - `ScrubField({ lbl, value, step?, min?, max?, onCommit, disabled?, title? })`
  - `SliderField({ lbl, value, min, max, step, onCommit, disabled?, title? })`
  - `TimecodeField({ lbl, ms, fps, onCommit, disabled?, title? })` — `onCommit(ms: number)`
  - `SegmentedField({ lbl, value, options, onChange, optionLabel? })` — `options: string[]`

- [ ] **Step 1: Move `useLiveField` and the field classes into the controls directory**

Cut `useLiveField` (and its explanatory comment) from `LayeredInspector.tsx` into `lib/editor/app/controls/use-live-field.ts`, export it, and import it back into `LayeredInspector.tsx`. Its contract is unchanged: controlled local text, commit on every valid keystroke, resync from the external value only while unfocused.

Do the same for the shared class constants Task 4 introduced — move `fieldCls`, `labelCls`, `inputCls`, `rowCls`, `disabledCls` and `readonlyValueCls` into `lib/editor/app/controls/field-classes.ts` and import them from both `LayeredInspector.tsx` and every control below. **Do not redeclare them per control file** — two copies of `inputCls` is exactly the drift that makes one field look different from its neighbour after a later edit. The code blocks in the steps that follow show them inline for readability; import them instead.

- [ ] **Step 2: Write the failing component test**

Create `lib/editor/app/controls/controls.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScrubField } from './ScrubField';
import { SliderField } from './SliderField';
import { TimecodeField } from './TimecodeField';
import { SegmentedField } from './SegmentedField';

describe('ScrubField', () => {
  it('commits a typed value on every valid keystroke', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: '1.5' } });
    expect(onCommit).toHaveBeenCalledWith(1.5);
  });

  it('ignores an unparseable entry instead of committing zero', () => {
    const onCommit = vi.fn();
    render(<ScrubField lbl="Zoom" value={1} step={0.05} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Zoom'), { target: { value: 'abc' } });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('SliderField', () => {
  it('renders a range input bounded by min and max', () => {
    render(<SliderField lbl="Opacity" value={0.8} min={0} max={1} step={0.05} onCommit={() => {}} />);
    const el = screen.getByLabelText('Opacity') as HTMLInputElement;
    expect(el.type).toBe('range');
    expect(el.min).toBe('0');
    expect(el.max).toBe('1');
  });

  it('commits as it is dragged', () => {
    const onCommit = vi.fn();
    render(<SliderField lbl="Opacity" value={0.8} min={0} max={1} step={0.05} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Opacity'), { target: { value: '0.5' } });
    expect(onCommit).toHaveBeenCalledWith(0.5);
  });
});

describe('TimecodeField', () => {
  it('shows milliseconds as mm:ss.ff', () => {
    render(<TimecodeField lbl="Fade in" ms={62_500} fps={30} onCommit={() => {}} />);
    expect((screen.getByLabelText('Fade in') as HTMLInputElement).value).toBe('1:02.15');
  });

  it('commits milliseconds parsed from what was typed', () => {
    const onCommit = vi.fn();
    render(<TimecodeField lbl="Fade in" ms={0} fps={30} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Fade in'), { target: { value: '0:02.00' } });
    expect(onCommit).toHaveBeenCalledWith(2000);
  });

  // The whole point of parseTimecode returning null.
  it('does not commit while the entry is still nonsense', () => {
    const onCommit = vi.fn();
    render(<TimecodeField lbl="Fade in" ms={5000} fps={30} onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText('Fade in'), { target: { value: 'x' } });
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('SegmentedField', () => {
  it('renders one button per option and marks the active one', () => {
    render(<SegmentedField lbl="Fit" value="cover" options={['cover', 'blur-pad']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'cover' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'blur-pad' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the option that was clicked', () => {
    const onChange = vi.fn();
    render(<SegmentedField lbl="Fit" value="cover" options={['cover', 'blur-pad']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'blur-pad' }));
    expect(onChange).toHaveBeenCalledWith('blur-pad');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/controls/controls.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `ScrubField`**

Create `lib/editor/app/controls/ScrubField.tsx`. It renders a text input (not `type="number"` — the spinner and locale-decimal behaviour are what is being removed) plus a drag handle on the label:

```tsx
import { useRef } from 'react';
import { useLiveField } from './use-live-field';
import { scrubValue } from './scrub-value';

const fieldCls = 'ed:mb-2 ed:flex-1 ed:min-w-0';
const labelCls = 'ed:block ed:text-[11px] ed:text-ink-2 ed:mb-1 ed:cursor-ew-resize ed:select-none';
const inputCls =
  'ed:w-full ed:box-border ed:bg-control ed:text-ink ed:font-mono ed:border ed:border-line ed:rounded ed:px-2 ed:py-1 ed:text-xs';

export function ScrubField({
  lbl, value, step = 1, min, max, onCommit, disabled, title,
}: {
  lbl: string; value: number | undefined; step?: number; min?: number; max?: number;
  onCommit: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const f = useLiveField(value === undefined ? '' : String(value));
  const drag = useRef<{ x0: number; v0: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || value === undefined) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, v0: value };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    onCommit(scrubValue(d.v0, e.clientX - d.x0, step, { min, max, fine: e.shiftKey }));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current) (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  return (
    <div className={fieldCls} title={title}>
      <label
        className={labelCls}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {lbl}
      </label>
      <input
        aria-label={lbl}
        className={disabled ? `${inputCls} ed:opacity-45 ed:cursor-not-allowed` : inputCls}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={f.text}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onChange={(e) => {
          f.setText(e.target.value);
          const raw = e.target.value.trim();
          if (raw === '') return;
          const n = Number(raw);
          if (!Number.isNaN(n)) onCommit(n);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Implement `SliderField`**

Create `lib/editor/app/controls/SliderField.tsx` — a range input plus a mono readout, sharing the same label/field classes:

```tsx
export function SliderField({
  lbl, value, min, max, step, onCommit, disabled, title,
}: {
  lbl: string; value: number | undefined; min: number; max: number; step: number;
  onCommit: (n: number) => void; disabled?: boolean; title?: string;
}) {
  const v = value ?? min;
  return (
    <div className="ed:mb-2 ed:flex-1 ed:min-w-0" title={title}>
      <div className="ed:flex ed:justify-between ed:mb-1">
        <label htmlFor={`sl-${lbl}`} className="ed:text-[11px] ed:text-ink-2">{lbl}</label>
        <span className="ed:text-[11px] ed:text-ink ed:font-mono ed:tabular-nums">{v}</span>
      </div>
      <input
        id={`sl-${lbl}`}
        aria-label={lbl}
        type="range"
        className="ed:w-full ed:accent-accent"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={v}
        onChange={(e) => onCommit(Number(e.target.value))}
      />
    </div>
  );
}
```

- [ ] **Step 6: Implement `TimecodeField`**

Create `lib/editor/app/controls/TimecodeField.tsx`:

```tsx
import { useLiveField } from './use-live-field';
import { parseTimecode, formatTimecode } from './timecode';

export function TimecodeField({
  lbl, ms, fps, onCommit, disabled, title,
}: {
  lbl: string; ms: number | undefined; fps: number;
  onCommit: (ms: number) => void; disabled?: boolean; title?: string;
}) {
  const f = useLiveField(ms === undefined ? '' : formatTimecode(ms, fps));
  const inputCls =
    'ed:w-full ed:box-border ed:bg-control ed:text-ink ed:font-mono ed:tabular-nums ed:border ed:border-line ed:rounded ed:px-2 ed:py-1 ed:text-xs';
  return (
    <div className="ed:mb-2 ed:flex-1 ed:min-w-0" title={title}>
      <label className="ed:block ed:text-[11px] ed:text-ink-2 ed:mb-1">{lbl}</label>
      <input
        aria-label={lbl}
        className={disabled ? `${inputCls} ed:opacity-45 ed:cursor-not-allowed` : inputCls}
        type="text"
        disabled={disabled}
        value={f.text}
        onFocus={f.onFocus}
        onBlur={f.onBlur}
        onChange={(e) => {
          f.setText(e.target.value);
          // null means "not readable yet" — leave the value alone rather than
          // zeroing a trim while the author is still typing.
          const parsed = parseTimecode(e.target.value, fps);
          if (parsed !== null) onCommit(parsed);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Implement `SegmentedField`**

Create `lib/editor/app/controls/SegmentedField.tsx`:

```tsx
export function SegmentedField({
  lbl, value, options, onChange, optionLabel,
}: {
  lbl: string; value: string | undefined; options: string[];
  onChange: (s: string) => void; optionLabel?: (v: string) => string;
}) {
  return (
    <div className="ed:mb-2 ed:flex-1 ed:min-w-0">
      <label className="ed:block ed:text-[11px] ed:text-ink-2 ed:mb-1">{lbl}</label>
      <div className="ed:flex ed:gap-1" role="group" aria-label={lbl}>
        {options.map((o) => {
          const on = o === value;
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o)}
              className={`ed:flex-1 ed:min-w-0 ed:truncate ed:h-7 ed:px-2 ed:text-[11px] ed:rounded ed:border ed:border-line ed:cursor-pointer ${
                on ? 'ed:bg-accent ed:text-accent-ink' : 'ed:bg-control ed:text-ink-2'
              }`}
            >
              {optionLabel ? optionLabel(o) : o}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Run the test**

Run: `cd lib/editor && npm run editor:css && npx vitest run app/controls/controls.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 9: Commit**

```bash
git add -A lib/editor/app
git commit -m "feat(editor): add scrub, slider, timecode and segmented controls"
```

---

### Task 10: Convert the inspector's call sites

**Files:**
- Modify: `lib/editor/app/LayeredInspector.tsx`

**Interfaces:**
- Consumes: all four controls from Task 9.

- [ ] **Step 1: Convert the grade fields to sliders**

In `GradeFields`, replace each `NumberField` per the spec's table:

```tsx
<Row>
  <SliderField lbl="Brightness" min={0} max={2} step={0.05} value={g.brightness ?? 1} disabled={disabled} onCommit={(n) => onPatch({ brightness: n })} />
  <SliderField lbl="Contrast" min={0} max={2} step={0.05} value={g.contrast ?? 1} disabled={disabled} onCommit={(n) => onPatch({ contrast: n })} />
</Row>
<Row>
  <SliderField lbl="Saturation" min={0} max={2} step={0.05} value={g.saturation ?? 1} disabled={disabled} onCommit={(n) => onPatch({ saturation: n })} />
  <SliderField lbl="Temperature" min={-1} max={1} step={0.05} value={g.temperature ?? 0} disabled={disabled} onCommit={(n) => onPatch({ temperature: n })} />
</Row>
<Row>
  <SliderField lbl="Tint" min={-1} max={1} step={0.05} value={g.tint ?? 0} disabled={disabled} onCommit={(n) => onPatch({ tint: n })} />
  <SliderField lbl="Sepia" min={0} max={1} step={0.05} value={g.sepia ?? 0} disabled={disabled} onCommit={(n) => onPatch({ sepia: n })} />
</Row>
{/* -180..180, NOT 0..360: GradeSchema declares .min(-180).max(180), and a
    0..360 slider would make the whole negative half unreachable and destroy
    an authored negative shift on the first click. Corrected in Task 10 review. */}
<SliderField lbl="Hue rotate (deg)" min={-180} max={180} step={1} value={g.hueRotateDeg ?? 0} disabled={disabled} onCommit={(n) => onPatch({ hueRotateDeg: n })} />
```

- [ ] **Step 2: Convert the Ken Burns and crop fields**

- `fromX` / `toX` → `SliderField min={0} max={1} step={0.01}`
- `fromScale` / `toScale` → `ScrubField min={0.5} step={0.05}`
- Ken Burns `direction` → `SegmentedField options={['in', 'left', 'up']}`
- Crop zoom → `ScrubField min={1} step={0.05}` (keep the existing rounding comment and the `1/width` round-trip logic exactly)
- `focalX` / `focalY` → `SliderField min={0} max={1} step={0.01}`
- `backdropBlur` → `SliderField min={0} max={80} step={1}`
- `backdropDim` → `SliderField min={0} max={1} step={0.05}`
- `fit` → `SegmentedField options={['cover', 'blur-pad']}` with the existing `optionLabel` and the existing `onChange` that clears the field for `cover` (keep that comment — it explains why an untouched item must not grow a `fit: 'cover'` key)

- [ ] **Step 3: Convert every millisecond field to `TimecodeField`**

`LayeredInspector` must now receive `fps`. Add it to the component's props and thread it from `EditorHost` (which already has `fps`). Then convert, dropping the `/1000` and `Math.round(n * 1000)` conversions since `TimecodeField` speaks milliseconds directly:

```tsx
<TimecodeField lbl="Trim in" ms={v.sourceInMs} fps={fps} onCommit={(ms) => patchItem('video', id, { sourceInMs: ms })} />
```

Apply to: video `sourceInMs`/`sourceOutMs`; overlay `startMs`/`endMs`; audio `sourceInMs`/`sourceOutMs`/`fadeInMs`/`fadeOutMs`; music `fadeInMs`/`fadeOutMs`; brand `startMs`/`endMs`.

**Preserve the optional-field semantics.** The fades currently write `undefined` when the value is zero, so an untouched item does not grow a key. Keep that: `onCommit={(ms) => patchItem('audio', id, { fadeInMs: ms > 0 ? ms : undefined })}`.

**Preserve the disabled + title on linked audio.** The `followsVideoId` guard and its explanatory `title` must survive the conversion.

- [ ] **Step 4: Convert the remaining scalars**

- `volumeDb` → `SliderField min={-60} max={12} step={0.5}`
- `fontSize` → `ScrubField min={8} step={1}` (keep the `Math.round`)

- [ ] **Step 5: Route declared brand params through the new controls**

In `renderParamControl` (the `ParamField` dispatch), the numeric branch becomes:

```tsx
// A declaration with BOTH bounds gets a slider; anything else gets a scrub,
// which needs no range. Zero core catalog fields declare min/max today, so
// the scrub path is the one that actually runs — that is why it is the
// foundation rather than an extra.
field.min !== undefined && field.max !== undefined
  ? <SliderField lbl={label} min={field.min} max={field.max} step={field.step ?? 0.01} value={v} onCommit={commit} />
  : <ScrubField lbl={label} step={field.step ?? 1} min={field.min} max={field.max} value={v} onCommit={commit} />
```

Also route an `enum` with **4 or fewer** choices to `SegmentedField` and leave the rest on `SelectField`.

- [ ] **Step 6: Delete `NumberField`**

Once no call site remains (`grep -n 'NumberField' lib/editor/app/LayeredInspector.tsx` returns nothing), delete the component.

- [ ] **Step 7: Run the tests**

Run: `cd lib/editor && npm run editor:css && npx vitest run --no-file-parallelism`
Expected: existing inspector tests query by `aria-label`, which every new control preserves, so they should pass. Any test that asserted `type="number"` legitimately fails and must be updated to the new control — state which, and why, in the report.

- [ ] **Step 8: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): replace every decimal box with an NLE control"
```

---

## Phase 4 — Shortcuts

### Task 11: The registry and the hook

**Files:**
- Create: `lib/editor/app/shortcuts.ts`, `lib/editor/app/shortcuts.test.ts`, `lib/editor/app/useShortcuts.ts`
- Modify: `lib/editor/host/EditorHost.tsx`, `lib/editor/app/EditorShell.tsx`

**Interfaces:**
- Produces: `SHORTCUTS: readonly Shortcut[]`, `interface Shortcut { id; keys; match(e); label; group }`, `type ShortcutGroup = 'Playback' | 'Editing' | 'Timeline' | 'File' | 'Help'`, and `useShortcuts(handlers: Partial<Record<string, () => void>>): void`.

- [ ] **Step 1: Write the failing registry test**

Create `lib/editor/app/shortcuts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SHORTCUTS } from './shortcuts';

const ev = (init: Partial<KeyboardEvent>) => ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...init }) as KeyboardEvent;

describe('the shortcut registry', () => {
  it('gives every entry a unique id', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Checked across the WHOLE registry, not per group: grouping is a display
  // concern, and a Timeline binding shadowing an Editing one is exactly the
  // collision worth catching.
  it('has no two shortcuts matching the same event', () => {
    const probes = [
      ev({ key: 's', metaKey: true }), ev({ key: ' ' }), ev({ key: 'Escape' }),
      ev({ key: 'z', metaKey: true }), ev({ key: 'z', metaKey: true, shiftKey: true }),
      ev({ key: 'Delete' }), ev({ key: 'Backspace' }), ev({ key: 'ArrowLeft' }),
      ev({ key: 'ArrowRight' }), ev({ key: 'ArrowLeft', shiftKey: true }),
      ev({ key: 'ArrowRight', shiftKey: true }), ev({ key: 'Home' }), ev({ key: 'End' }),
      ev({ key: 's' }), ev({ key: 'd', metaKey: true }), ev({ key: '+' }), ev({ key: '-' }),
      ev({ key: '?' }),
    ];
    for (const e of probes) {
      const hits = SHORTCUTS.filter((s) => s.match(e)).map((s) => s.id);
      expect(hits.length, `${e.key} matched ${hits.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });

  it('registers the key that opens the overlay', () => {
    expect(SHORTCUTS.find((s) => s.id === 'help')).toBeDefined();
  });

  it('gives every entry a display form and a label', () => {
    for (const s of SHORTCUTS) {
      expect(s.keys.length, s.id).toBeGreaterThan(0);
      expect(s.label.length, s.id).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/shortcuts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the registry**

Create `lib/editor/app/shortcuts.ts`. The order matters only for display; `match` must be mutually exclusive. Note `⌘Z` and `⌘⇧Z` are distinguished by `shiftKey`, and plain `s` must not match while a modifier is held (or it would fire alongside `⌘S`):

```ts
export type ShortcutGroup = 'Playback' | 'Editing' | 'Timeline' | 'File' | 'Help';

export interface Shortcut {
  id: string;
  /** Display form, e.g. '⌘Z'. */
  keys: string;
  match: (e: KeyboardEvent) => boolean;
  label: string;
  group: ShortcutGroup;
}

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
const bare = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey && !e.altKey;

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'save', keys: '⌘S', group: 'File', label: 'Save', match: (e) => mod(e) && e.key.toLowerCase() === 's' },
  { id: 'play', keys: 'Space', group: 'Playback', label: 'Play / pause', match: (e) => bare(e) && (e.key === ' ' || e.code === 'Space') },
  { id: 'stepBack', keys: '←', group: 'Playback', label: 'Back 1 frame', match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowLeft' },
  { id: 'stepFwd', keys: '→', group: 'Playback', label: 'Forward 1 frame', match: (e) => bare(e) && !e.shiftKey && e.key === 'ArrowRight' },
  { id: 'jumpBack', keys: '⇧←', group: 'Playback', label: 'Back 10 frames', match: (e) => bare(e) && e.shiftKey && e.key === 'ArrowLeft' },
  { id: 'jumpFwd', keys: '⇧→', group: 'Playback', label: 'Forward 10 frames', match: (e) => bare(e) && e.shiftKey && e.key === 'ArrowRight' },
  { id: 'toStart', keys: 'Home', group: 'Playback', label: 'Jump to start', match: (e) => bare(e) && e.key === 'Home' },
  { id: 'toEnd', keys: 'End', group: 'Playback', label: 'Jump to end', match: (e) => bare(e) && e.key === 'End' },
  { id: 'undo', keys: '⌘Z', group: 'Editing', label: 'Undo', match: (e) => mod(e) && !e.shiftKey && e.key.toLowerCase() === 'z' },
  { id: 'redo', keys: '⌘⇧Z', group: 'Editing', label: 'Redo', match: (e) => mod(e) && e.shiftKey && e.key.toLowerCase() === 'z' },
  { id: 'delete', keys: '⌫', group: 'Editing', label: 'Delete selected', match: (e) => bare(e) && (e.key === 'Delete' || e.key === 'Backspace') },
  { id: 'split', keys: 'S', group: 'Editing', label: 'Split at playhead', match: (e) => bare(e) && !e.shiftKey && e.key.toLowerCase() === 's' },
  { id: 'duplicate', keys: '⌘D', group: 'Editing', label: 'Duplicate selected', match: (e) => mod(e) && e.key.toLowerCase() === 'd' },
  { id: 'deselect', keys: 'Esc', group: 'Editing', label: 'Deselect', match: (e) => bare(e) && e.key === 'Escape' },
  { id: 'zoomIn', keys: '+', group: 'Timeline', label: 'Zoom in', match: (e) => bare(e) && (e.key === '+' || e.key === '=') },
  { id: 'zoomOut', keys: '-', group: 'Timeline', label: 'Zoom out', match: (e) => bare(e) && e.key === '-' },
  { id: 'help', keys: '?', group: 'Help', label: 'Show shortcuts', match: (e) => bare(e) && e.key === '?' },
];
```

**Two collisions to be aware of, both handled above:** `⌘S` uses `mod(e)` while `split` requires `bare(e)`, so they cannot both fire; `undo`/`redo` are split by `shiftKey`.

Non-keyboard gestures (`⌘`+wheel zoom, `⌥`+drag slip) are **not** in this registry — they are not keydown events. They are listed in the overlay separately in Task 12.

- [ ] **Step 4: Run the registry test**

Run: `cd lib/editor && npx vitest run app/shortcuts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the hook**

Create `lib/editor/app/useShortcuts.ts`:

```ts
import { useEffect, useRef } from 'react';
import { SHORTCUTS } from './shortcuts';

/** One keydown listener for the whole editor, dispatching through the registry.
 *
 *  The typing guard lives here so no call site can forget it — except for
 *  `save`, which deliberately fires even while a field has focus (and always
 *  suppresses the browser's own save dialog). */
export function useShortcuts(handlers: Partial<Record<string, () => void>>): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable;
      for (const s of SHORTCUTS) {
        if (!s.match(e)) continue;
        if (typing && s.id !== 'save') return;
        const fn = ref.current[s.id];
        if (!fn) return;
        e.preventDefault();
        fn();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

- [ ] **Step 6: Replace the two scattered listeners**

In `EditorHost.tsx`, delete the `keydown` effect at line ~128 and call the hook instead, wiring every id it previously handled plus the new ones:

```ts
useShortcuts({
  deselect: () => setSelectedId(null),
  play: () => playerRef.current?.toggle(),
  undo,
  redo,
  delete: () => selectedId && handleDelete(),
  stepBack: () => playerRef.current?.seekTo(Math.max(0, (playerRef.current?.getCurrentFrame() ?? 0) - 1)),
  stepFwd: () => playerRef.current?.seekTo(Math.min(durationInFrames - 1, (playerRef.current?.getCurrentFrame() ?? 0) + 1)),
  jumpBack: () => playerRef.current?.seekTo(Math.max(0, (playerRef.current?.getCurrentFrame() ?? 0) - 10)),
  jumpFwd: () => playerRef.current?.seekTo(Math.min(durationInFrames - 1, (playerRef.current?.getCurrentFrame() ?? 0) + 10)),
  toStart: () => playerRef.current?.seekTo(0),
  toEnd: () => playerRef.current?.seekTo(Math.max(0, durationInFrames - 1)),
  split: () => selectedId && setReel(splitItem(reel, selectedId, playerRef.current?.getCurrentFrame() ?? 0, fps)),
  duplicate: () => selectedId && setReel(duplicateItem(reel, selectedId)),
  zoomIn: () => zoomBy(1.25),
  zoomOut: () => zoomBy(1 / 1.25),
  save: () => !saving && handleSave(),
});
```

Import `splitItem` and `duplicateItem` from `../src/timeline/layered-adapter`. Use the actual local names for `setReel`, `handleSave` and `saving` as they appear in the file.

In `EditorShell.tsx`, delete its own `⌘S` effect — the hook now owns it. `EditorShell` keeps its `onSave` prop; the host wires `save` to the same handler it passes down.

- [ ] **Step 7: Run the full suite**

Run: `cd lib/editor && npx vitest run --no-file-parallelism`
Expected: baseline **+4** from the registry tests, plus whatever Phase 2/3 added. Any `EditorShell` test asserting its own `⌘S` listener now fails legitimately — move that assertion to the host or the registry and say so.

- [ ] **Step 8: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): put every shortcut behind one registry and hook"
```

---

### Task 12: The `?` overlay and the timeline legend

**Files:**
- Create: `lib/editor/app/ShortcutOverlay.tsx`, `lib/editor/app/ShortcutOverlay.test.tsx`
- Modify: `lib/editor/host/EditorHost.tsx`, `lib/editor/app/LayeredTimeline.tsx` (the legend at ~line 994)

**Interfaces:**
- Consumes: `SHORTCUTS`, `Shortcut`, `ShortcutGroup`.
- Produces: `ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void })` and `GESTURES: readonly { keys: string; label: string }[]`.

- [ ] **Step 1: Write the failing overlay test**

Create `lib/editor/app/ShortcutOverlay.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShortcutOverlay } from './ShortcutOverlay';
import { SHORTCUTS } from './shortcuts';

describe('ShortcutOverlay', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<ShortcutOverlay open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  // The anti-drift guarantee, asserted rather than promised: the overlay is
  // generated FROM the registry, so a shortcut cannot exist unlisted.
  it('lists every registered shortcut', () => {
    render(<ShortcutOverlay open onClose={() => {}} />);
    for (const s of SHORTCUTS) {
      expect(screen.getByText(s.label), s.id).toBeInTheDocument();
    }
  });

  it('shows the key for each one', () => {
    render(<ShortcutOverlay open onClose={() => {}} />);
    for (const s of SHORTCUTS) {
      expect(screen.getAllByText(s.keys).length, s.id).toBeGreaterThan(0);
    }
  });

  it('closes on a backdrop click', () => {
    const onClose = vi.fn();
    render(<ShortcutOverlay open onClose={onClose} />);
    fireEvent.click(screen.getByTestId('shortcut-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/ShortcutOverlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the overlay**

Create `lib/editor/app/ShortcutOverlay.tsx`:

```tsx
import { SHORTCUTS, type ShortcutGroup } from './shortcuts';

/** Pointer gestures. Not in SHORTCUTS because they are not keydown events —
 *  but they belong in the same list, because "what can I do here" does not
 *  care which event type carries it. */
export const GESTURES: readonly { keys: string; label: string }[] = [
  { keys: '⌘ + scroll', label: 'Zoom the timeline' },
  { keys: '⌥ + drag', label: 'Slip the shot inside its window' },
];

const ORDER: ShortcutGroup[] = ['Playback', 'Editing', 'Timeline', 'File', 'Help'];

export function ShortcutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      data-testid="shortcut-backdrop"
      onClick={onClose}
      className="ed:fixed ed:inset-0 ed:z-50 ed:flex ed:items-center ed:justify-center ed:bg-black/60"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ed:bg-panel ed:border ed:border-line ed:rounded-xl ed:p-6 ed:max-h-[80vh] ed:overflow-y-auto ed:min-w-[420px]"
      >
        <h2 className="ed:text-sm ed:font-semibold ed:text-ink ed:mb-4">Keyboard shortcuts</h2>
        {ORDER.map((g) => {
          const rows = SHORTCUTS.filter((s) => s.group === g);
          if (!rows.length) return null;
          return (
            <div key={g} className="ed:mb-4">
              <div className="ed:text-[10px] ed:text-ink-3 ed:uppercase ed:tracking-wider ed:mb-1.5">{g}</div>
              {rows.map((s) => (
                <div key={s.id} className="ed:flex ed:justify-between ed:gap-6 ed:py-0.5">
                  <span className="ed:text-xs ed:text-ink-2">{s.label}</span>
                  <span className="ed:text-xs ed:text-ink ed:font-mono">{s.keys}</span>
                </div>
              ))}
            </div>
          );
        })}
        <div>
          <div className="ed:text-[10px] ed:text-ink-3 ed:uppercase ed:tracking-wider ed:mb-1.5">Gestures</div>
          {GESTURES.map((g) => (
            <div key={g.keys} className="ed:flex ed:justify-between ed:gap-6 ed:py-0.5">
              <span className="ed:text-xs ed:text-ink-2">{g.label}</span>
              <span className="ed:text-xs ed:text-ink ed:font-mono">{g.keys}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire it into the host**

In `EditorHost.tsx`, add `const [helpOpen, setHelpOpen] = useState(false);`, add `help: () => setHelpOpen((v) => !v)` to the `useShortcuts` map, and render `<ShortcutOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />` inside the shell.

Also make `Esc` close it: change the `deselect` handler to `() => (helpOpen ? setHelpOpen(false) : setSelectedId(null))`.

- [ ] **Step 5: Replace the timeline legend**

In `LayeredTimeline.tsx`, replace the hand-written legend block (~line 994, the one naming `⌥/Alt + drag a clip`) with a compact line derived from the same data — the Timeline group plus `GESTURES`:

```tsx
{/* Derived from the shortcut registry, so it cannot drift from the bindings. */}
<div className="ed:flex ed:gap-4 ed:text-[11px] ed:text-ink-3 ed:px-3 ed:py-1">
  {[...SHORTCUTS.filter((s) => s.group === 'Timeline'), ...GESTURES].map((s) => (
    <span key={s.keys}>
      <span className="ed:font-mono ed:text-ink-2">{s.keys}</span> — {s.label}
    </span>
  ))}
  <span><span className="ed:font-mono ed:text-ink-2">?</span> — all shortcuts</span>
</div>
```

- [ ] **Step 6: Run the tests**

Run: `cd lib/editor && npm run editor:css && npx vitest run --no-file-parallelism`
Expected: **+4** from the overlay tests.

- [ ] **Step 7: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): generate the shortcut overlay and legend from the registry"
```

---

## Phase 5 — Zoom anchoring and the project panel

### Task 13: Anchor zoom on the pointer

**Files:**
- Modify: `lib/editor/app/LayeredTimeline.tsx`, `lib/editor/host/EditorHost.tsx`
- Test: `lib/editor/app/LayeredTimeline.test.tsx` (existing)

**Interfaces:**
- Produces: `zoomAnchorScrollLeft(anchorX: number, view: { scrollLeft: number; scrollWidth: number; clientWidth: number }, factor: number): number`, exported from `LayeredTimeline.tsx` beside `zoomFactorFor` and `followScrollLeft`.
- **Also export `TIMELINE_START_LEFT`** from the same file — it is currently a module-private const, and the test below asserts the invariant in terms of it. Exporting it is what lets the test express the contract rather than hard-coding `12`.

- [ ] **Step 1: Write the failing test**

Append to `lib/editor/app/LayeredTimeline.test.tsx`:

```ts
describe('zoomAnchorScrollLeft', () => {
  const view = { scrollLeft: 400, scrollWidth: 4000, clientWidth: 800 };

  // The whole contract: what was under the pointer stays under the pointer.
  it('keeps the content under the anchor fixed', () => {
    for (const factor of [1.25, 2, 0.8, 0.5]) {
      for (const anchorX of [100, 400, 700]) {
        const next = zoomAnchorScrollLeft(anchorX, view, factor);
        const before = view.scrollLeft + anchorX - TIMELINE_START_LEFT;
        const after = next + anchorX - TIMELINE_START_LEFT;
        expect(after / before, `factor ${factor} anchor ${anchorX}`).toBeCloseTo(factor, 4);
      }
    }
  });

  it('never returns a negative scroll position', () => {
    expect(zoomAnchorScrollLeft(700, { scrollLeft: 0, scrollWidth: 4000, clientWidth: 800 }, 0.25)).toBeGreaterThanOrEqual(0);
  });

  it('never scrolls past the new maximum', () => {
    const factor = 2;
    const next = zoomAnchorScrollLeft(700, view, factor);
    expect(next).toBeLessThanOrEqual(view.scrollWidth * factor - view.clientWidth);
  });

  it('is a no-op at factor 1', () => {
    expect(zoomAnchorScrollLeft(400, view, 1)).toBe(view.scrollLeft);
  });

  it('does not divide by zero on an unmeasured viewport', () => {
    expect(Number.isFinite(zoomAnchorScrollLeft(0, { scrollLeft: 0, scrollWidth: 0, clientWidth: 0 }, 2))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx`
Expected: FAIL — `zoomAnchorScrollLeft` is not exported.

- [ ] **Step 3: Implement**

In `LayeredTimeline.tsx`, beside `followScrollLeft`:

```ts
/** Where to scroll so a zoom keeps the content under `anchorX` in place.
 *
 *  Without this the timeline grows around its LEFT EDGE, so the playhead
 *  slides out of view on every zoom step and has to be chased with a scroll.
 *
 *  Pure so the invariant is testable — jsdom runs no layout, so the effect
 *  that APPLIES this (see the layout effect keyed on `scaleWidth`) is a
 *  hand-verification item, not something a unit test can pin. */
export function zoomAnchorScrollLeft(
  anchorX: number,
  view: { scrollLeft: number; scrollWidth: number; clientWidth: number },
  factor: number,
): number {
  const offset = anchorX - TIMELINE_START_LEFT;
  const content = view.scrollLeft + offset;
  const max = Math.max(0, view.scrollWidth * factor - view.clientWidth);
  return Math.min(max, Math.max(0, Math.round(content * factor - offset)));
}
```

- [ ] **Step 4: Run the test**

Run: `cd lib/editor && npx vitest run app/LayeredTimeline.test.tsx`
Expected: PASS (5 new tests).

- [ ] **Step 5: Apply it after re-layout, not in the wheel handler**

In `LayeredTimeline.tsx`, record the anchor in the wheel handler and apply it in a layout effect keyed on `scaleWidth`:

```ts
// The anchor a pending zoom must preserve. Applied in the layout effect below,
// NOT here: scaleWidth lives in the host, so the DOM has not re-laid-out yet
// and a scroll write in this tick would be clamped against the OLD scrollWidth
// — which looks exactly like the drift this fixes.
const pendingZoom = useRef<{ anchorX: number; factor: number } | null>(null);

// inside the wheel handler, after computing `factor`:
const el = scrollEl();
if (el) {
  const rect = el.getBoundingClientRect();
  pendingZoom.current = { anchorX: e.clientX - rect.left, factor };
}

useLayoutEffect(() => {
  const p = pendingZoom.current;
  pendingZoom.current = null;
  const el = scrollEl();
  if (!p || !el) return;
  stateRef.current?.setScrollLeft(
    zoomAnchorScrollLeft(p.anchorX, { scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }, p.factor),
  );
}, [scaleWidth]);
```

**Record the PRE-zoom geometry in the wheel handler, not in the effect.** By the
time the layout effect runs, the DOM has already re-laid-out at the new scale,
so `el.scrollWidth` there is the *new* width — feeding it to a function that
then multiplies by `factor` would apply the zoom twice. The handler captures
the geometry the formula expects:

```ts
pendingZoom.current = {
  anchorX: e.clientX - rect.left,
  factor,
  view: { scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth },
};
```

and the effect uses that captured view rather than re-measuring:

```ts
stateRef.current?.setScrollLeft(zoomAnchorScrollLeft(p.anchorX, p.view, p.factor));
```

- [ ] **Step 6: Give keyboard zoom a centre anchor**

`zoomIn`/`zoomOut` in `EditorHost` call `zoomBy`, which changes `scaleWidth` and therefore triggers the same layout effect. Set `pendingZoom` to `{ anchorX: clientWidth / 2, factor }` for those — expose a small imperative hook on the timeline, or lift `pendingZoom` into a ref the host can set. Prefer the former: add an optional `zoomAnchor?: 'pointer' | 'center'` prop that defaults to `'pointer'` and have the host set `'center'` before calling `zoomBy` from a shortcut.

- [ ] **Step 7: Run the tests and hand-verify**

Run: `cd lib/editor && npx vitest run --no-file-parallelism`
Expected: **+5**.

Hand-verification (state the result in the report): open the editor, put the playhead mid-timeline, `⌘`+scroll both directions over the playhead, and confirm it stays under the cursor rather than drifting.

- [ ] **Step 8: Commit**

```bash
git add -A lib/editor
git commit -m "fix(editor): anchor timeline zoom on the pointer"
```

---

### Task 14: The project overview panel

**Files:**
- Create: `lib/editor/app/project-summary.ts`, `lib/editor/app/project-summary.test.ts`
- Modify: `lib/editor/app/LayeredInspector.tsx` (the `!selectedId` branch at ~line 820), `lib/editor/host/EditorHost.tsx`

**Interfaces:**
- Produces: `aspectLabel(width: number, height: number): string`, `failedSources(sources: string[], durations: Record<string, number>): string[]`.
- Consumes: `formatTimecode` from Task 8.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/app/project-summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aspectLabel, failedSources } from './project-summary';

describe('aspectLabel', () => {
  it('reduces by the greatest common divisor', () => {
    expect(aspectLabel(1080, 1920)).toBe('9:16');
    expect(aspectLabel(1920, 1080)).toBe('16:9');
    expect(aspectLabel(1000, 1000)).toBe('1:1');
  });

  it('handles a ratio that does not reduce cleanly', () => {
    expect(aspectLabel(1001, 1000)).toBe('1001:1000');
  });

  it('does not divide by zero', () => {
    expect(aspectLabel(0, 0)).toBe('—');
  });
});

describe('failedSources', () => {
  // The hook writes 0 for a file it could not read — the same distinction
  // pendingSources relies on. A source with NO entry is still being probed,
  // not failed.
  it('reports only sources that resolved to zero', () => {
    expect(failedSources(['a.mp4', 'b.mp4', 'c.mp4'], { 'a.mp4': 3000, 'b.mp4': 0 })).toEqual(['b.mp4']);
  });

  it('is empty while everything is still probing', () => {
    expect(failedSources(['a.mp4'], {})).toEqual([]);
  });

  it('is empty for a healthy project', () => {
    expect(failedSources(['a.mp4'], { 'a.mp4': 3000 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd lib/editor && npx vitest run app/project-summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/editor/app/project-summary.ts`:

```ts
/** `1080x1920` → `9:16`. Returns an em dash rather than throwing on a
 *  composition whose dimensions have not arrived yet. */
export function aspectLabel(width: number, height: number): string {
  if (!width || !height) return '—';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  return `${width / d}:${height / d}`;
}

/** Sources the editor probed and could not read.
 *
 *  The metadata hook writes `0` for a failed decode — the same distinction
 *  `pendingSources` relies on to avoid spinning forever. A source with no
 *  entry at all is still in flight, NOT failed; conflating the two would
 *  report every source as broken for the first seconds of every session. */
export function failedSources(sources: string[], durations: Record<string, number>): string[] {
  return sources.filter((s) => durations[s] === 0);
}
```

- [ ] **Step 4: Run the test**

Run: `cd lib/editor && npx vitest run app/project-summary.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Thread the composition facts into the inspector**

`LayeredInspector` already gains `fps` in Task 10. Add `width: number`, `height: number` and `sourceDurations: Record<string, number>` to its props and pass them from `EditorHost`, which already holds all three (`EditorHost.tsx:26-28` for the dimensions; the durations map is what feeds `pendingSources`).

- [ ] **Step 6: Rewrite the no-selection branch**

Replace the `!selectedId` block's body. Keep every existing row and add the new ones, grouped:

```tsx
const sources = Array.from(new Set([
  ...reel.tracks.video.map((v) => (v as { source?: string }).source).filter(Boolean) as string[],
  ...reel.tracks.audio.map((a) => a.source),
]));
const failed = failedSources(sources, sourceDurations);

return (
  <div className={panelCls}>
    <h3 className={headingCls}>Reel</h3>

    <div className={sectionCls}>Format</div>
    <Row>
      <div className={fieldCls}><label className={labelCls}>Resolution</label><div className={readonlyValueCls}>{width} × {height}</div></div>
      <div className={fieldCls}><label className={labelCls}>Aspect</label><div className={readonlyValueCls}>{aspectLabel(width, height)}</div></div>
    </Row>
    <Row>
      <div className={fieldCls}><label className={labelCls}>Frame rate</label><div className={readonlyValueCls}>{fps} fps</div></div>
      <div className={fieldCls}><label className={labelCls}>Frames</label><div className={readonlyValueCls}>{framesForReel(reel, fps)}</div></div>
    </Row>

    <div className={sectionCls}>Content</div>
    <div className={fieldCls}><label className={labelCls}>Topic</label><div className={readonlyValueCls}>{reel.meta.topic}</div></div>
    <div className={fieldCls}><label className={labelCls}>Duration</label><div className={readonlyValueCls}>{formatTimecode(reel.meta.totalDurationMs, fps)}</div></div>
    <div className={fieldCls}><label className={labelCls}>Media sources</label><div className={readonlyValueCls}>{sources.length}</div></div>
    <div className={fieldCls}><label className={labelCls}>Music</label><div className={readonlyValueCls}>{reel.tracks.music.source ?? '(none)'} · base {reel.tracks.music.baseVolumeDb}dB</div></div>

    {/* Omitted entirely when healthy — a project with nothing wrong shows no
        diagnostic, matching the header badge's behaviour. */}
    {failed.length > 0 && (
      <div className={fieldCls}>
        <label className={labelCls}>Failed to load</label>
        <div className="ed:text-xs ed:text-warn ed:font-mono">{failed.join(', ')}</div>
      </div>
    )}

    <div className="ed:text-[11px] ed:text-ink-3 ed:mt-2">
      {reel.tracks.video.length} video · {reel.tracks.overlays.length} overlays · {reel.tracks.audio.length} audio · {reel.tracks.brand.length} brand
    </div>
    <div className="ed:text-[11px] ed:text-ink-3 ed:mt-2.5">Select a timeline item to edit it.</div>
  </div>
);
```

Import `framesForReel` from `../host/host-duration` and `formatTimecode` from `./controls/timecode`.

- [ ] **Step 6b: Convert the last orphaned inline colour while you are in this file**

`LayeredInspector.tsx` still has one hardcoded note colour that no other task's
scope reaches: the `"No editable params."` fallback, `color: '#7a7d85'` — 4.20:1
on `bg-panel` at 11px, a marginal AA fail. It is the same content-class string
as `noteCls`, so give it `ed:text-[11px] ed:text-ink-2`. (Find it with
`grep -n "No editable params" lib/editor/app/LayeredInspector.tsx` — the line
number has moved repeatedly.)

The two other survivors, the reel-summary counts and
`"Select a timeline item to edit it."`, are inside the `!selectedId` block Step 6
rewrites wholesale, so they are already handled — do not convert them separately.

- [ ] **Step 7: Pin the omitted-when-healthy behaviour**

Add to the inspector's existing test file:

```tsx
it('shows no diagnostic row when every source loaded', () => {
  render(<LayeredInspector reel={reelWithTwoClips} fps={30} width={1080} height={1920}
    sourceDurations={{ 'a.mp4': 3000, 'b.mp4': 4000 }} selectedId={null} /* plus this file's usual props */ />);
  expect(screen.queryByText('Failed to load')).toBeNull();
});

it('names the sources that failed to load', () => {
  render(<LayeredInspector reel={reelWithTwoClips} fps={30} width={1080} height={1920}
    sourceDurations={{ 'a.mp4': 0, 'b.mp4': 4000 }} selectedId={null} /* plus this file's usual props */ />);
  expect(screen.getByText('a.mp4')).toBeInTheDocument();
});
```

Read the existing test file first and match its fixture and prop conventions rather than inventing new ones.

- [ ] **Step 8: Run the full gate set**

```bash
cd lib/editor && npm run editor:css && git diff --exit-code app/editor.css ; echo "css-exit=$?"
cd lib/editor && npx vitest run --no-file-parallelism
cd lib/editor && npx tsc --noEmit ; echo "tsc-exit=$?"
cd /Users/xaralis/Workspace/progpce/core && grep -riE 'lime|teal|roost|progresivn|sand-brown' lib/ --exclude-dir=node_modules --exclude='*.test.*' | wc -l
```

Expected: `css-exit=0`; the suite green with the cumulative count re-derived per file, not carried forward; **3** tsc errors compared by identity with `tsc-exit=2`; brand-leak count **2**.

- [ ] **Step 9: Commit**

```bash
git add -A lib/editor
git commit -m "feat(editor): show format and failed sources on the project screen"
```

---

## Final verification

Before the branch is finished:

1. **Regenerate the stylesheet one last time** and confirm no diff — the single most likely stale artifact in this whole plan.
2. **Verify ROOST still works.** Its editor config is `plugins: [react()]` with no Tailwind. The generated `editor.css` must carry every style the editor needs, imported by `EditorShell`, with no brand-side build step. Confirm by reading `EditorShell.tsx`'s import and checking that no editor file expects a Tailwind plugin at runtime.
3. **Re-derive the test count per file** rather than carrying a number forward — this repo's gate row has been misreported five times for exactly that reason.
4. Update `CLAUDE.md`'s Editor-tests gate row with the new file/test counts and a one-line note on what moved them.
