# Reel Editor — Skeleton (Player preview + shell + save wiring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. This plan's deliverables are browser-verified (not only unit-tested) — the reviewer/verifier drives the in-app browser.

**Goal:** Stand up the reel editor's browser skeleton: open a campaign-reels project, see its real composition play live in `@remotion/player` inside the layout-A editor shell, and persist a (trivial) edit back to `Root.tsx` via the Plan 1 save spine — all launched by `npm run editor`, no Studio, no terminal fiddling for the reviewer.

**Architecture:** Template-hosted (decided by the 2026-07-20 spike — see spec). Core `lib/editor` ships the reusable **editor UI** (`EditorShell`, layout A) + the Plan-1 save spine. The **template** (`video-toolkit/templates/campaign-reels`) carries a thin **Vite host** (`.editor/`: `index.html`, `main.tsx`, `vite.config.mts`) that imports the core shell + its own composition, wires aliases/Tailwind/publicDir (a near-1:1 port of `remotion.config.ts`), reads the current `defaultProps`, and mounts the Player. A tiny Vite dev-server middleware mounts the Plan-1 `createSaveHandler` on `POST /save`, with `resolve` confined to the project's `src/Root.tsx`.

**Tech Stack:** React 19 + `@remotion/player` (already in template), Vite 5 + `@vitejs/plugin-react` + `@tailwindcss/vite`, TypeScript ESM. Core editor logic from Plan 1 (`@video-toolkit/lib/editor`).

## Global Constraints

- **Template-host, not core-host.** The Vite host + `vite.config.mts` live in the template; core ships only importable UI/logic. Do not build a core-hosted Vite app that reaches into a project dir.
- **Aliases via manual `resolve.alias`** mirroring `remotion.config.ts` (`@video-toolkit/lib`, `@brand-lib`, `zod$`) — NOT `vite-tsconfig-paths` (it can't resolve brand-lib↔toolkit-lib imports outside any `src/` include glob).
- **Vite config MUST be `.mts`** (template `package.json` has no `"type":"module"`; the plugins are ESM-only). In it, reconstruct `__dirname`/`require` via `fileURLToPath(import.meta.url)` / `createRequire(import.meta.url)`.
- **Single source of truth stays `Root.tsx`'s inlined `defaultProps` literal.** Save goes through the Plan-1 spine (`saveDefaultPropsToFile` / `createSaveHandler`), which AST-rewrites it server-side. Never introduce `config.json`. Studio Save must keep working.
- **`resolve` is the entire path-confinement boundary.** The `POST /save` handler's `resolve` MUST map to the project's own `src/Root.tsx` and reject any client-supplied path escape (`..`, absolute paths, symlinks). The browser sends only `{ props }`.
- **compositionId is `"CampaignReel"`** (the `<Composition id>` in the template's `Root.tsx`).
- **Node 20+** for all npm/vite/test commands (shell default node may be a stale v10 via nvm).
- **Brand-repo policy for this autonomous run:** in `video-toolkit` you MAY create a branch and commit; do NOT push, merge, or delete. In `core`, feature branch only; no push/merge to main.
- **Reference:** the browser-verified spike wiring is captured in `core/.superpowers/sdd/plan2-spike-report.md` — the `vite.config.mts` there is the proven base for Task 2.

---

### Task 1: Core editor shell — `EditorShell` (layout A)

**Files:**
- Create: `lib/editor/app/EditorShell.tsx`
- Create: `lib/editor/app/EditorShell.module.css` (or inline styles — match whichever the file stays smallest with)
- Modify: `lib/editor/package.json` (add UI peer/dev deps: `react`, `react-dom`, `@remotion/player`, `@types/react`, `@types/react-dom`; keep them as devDependencies for the core package's own typecheck, and document that the template provides the real runtime copies)
- Modify: `lib/editor/tsconfig.json` (add `"jsx": "react-jsx"`, `"lib": ["ES2022","DOM"]`)
- Test: `lib/editor/app/EditorShell.test.tsx`

**Interfaces:**
- Produces: `EditorShell(props: { preview: React.ReactNode; projectName?: string; onSave?: () => void; saving?: boolean }): JSX.Element` — renders layout A: a top row with the `preview` node on the left (a fixed 9:16 stage) and an inspector placeholder panel on the right, and a full-width timeline placeholder strip below. Includes a header showing `projectName` and a "Save" button wired to `onSave` (disabled while `saving`). No editing logic yet — placeholders are literally labelled "Inspektor (příště)" / "Timeline (příště)". The `preview` node is supplied by the caller (the template mounts the `<Player>` there) so this component has no Remotion/composition dependency itself.

- [ ] **Step 1: Add UI deps + tsconfig jsx**

Edit `lib/editor/package.json` devDependencies to add `react`, `react-dom`, `@remotion/player`, `@types/react`, `@types/react-dom` (use `npm install -D react react-dom @remotion/player @types/react @types/react-dom` in `lib/editor`; pin to the majors the template uses — React 19, `@remotion/player` 4.0.x). Edit `lib/editor/tsconfig.json` compilerOptions: add `"jsx": "react-jsx"` and `"lib": ["ES2022", "DOM"]`. Add `vitest` jsdom env (`npm install -D jsdom @testing-library/react @testing-library/jest-dom`), and a `lib/editor/vitest.config.ts` with `test: { environment: 'jsdom' }`.

- [ ] **Step 2: Write the failing test**

Create `lib/editor/app/EditorShell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EditorShell } from './EditorShell';

describe('EditorShell', () => {
  it('renders the preview node, project name, and placeholders', () => {
    render(<EditorShell preview={<div data-testid="pv">PREVIEW</div>} projectName="my-reel" />);
    expect(screen.getByTestId('pv')).toBeInTheDocument();
    expect(screen.getByText('my-reel')).toBeInTheDocument();
    expect(screen.getByText(/Inspektor/i)).toBeInTheDocument();
    expect(screen.getByText(/Timeline/i)).toBeInTheDocument();
  });

  it('calls onSave when Save is clicked, and disables while saving', () => {
    const onSave = vi.fn();
    const { rerender } = render(<EditorShell preview={null} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    expect(onSave).toHaveBeenCalledOnce();
    rerender(<EditorShell preview={null} onSave={onSave} saving />);
    expect(screen.getByRole('button', { name: /Save/i })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run test → fails** (`cd lib/editor && npx vitest run app/EditorShell.test.tsx`; expected: cannot resolve `./EditorShell`).

- [ ] **Step 4: Implement `EditorShell.tsx`** — a presentational component matching the Interfaces contract and the layout-A mockup: header (project name + Save button), a flex row (9:16 preview stage left, inspector placeholder right), timeline placeholder strip below. Keep it dependency-light (only React). Use the approved brand-neutral dark styling from the mockups (lime accent `#b6ff5a` for the Save button is fine).

- [ ] **Step 5: Run test → passes** (`cd lib/editor && npx vitest run app/EditorShell.test.tsx`; then full `npx vitest run` to confirm the Plan-1 suite still passes; then `npx tsc --noEmit`).

- [ ] **Step 6: Commit** (`feat(editor): layout-A EditorShell component (preview slot + placeholders + Save)`) — commit only `lib/editor/**` (never `.superpowers/`).

---

### Task 2: Template Vite host — `npm run editor` mounts the real composition

**Files (in `video-toolkit/templates/campaign-reels`):**
- Create: `.editor/index.html`, `.editor/main.tsx`, `.editor/vite.config.mts`
- Modify: `package.json` (devDeps `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite`; script `"editor": "vite --config .editor/vite.config.mts --port 3100"`)

**Interfaces:**
- Consumes: `EditorShell` from `@video-toolkit/lib/editor/app/EditorShell` (core, via the existing `@video-toolkit/lib` alias); `CampaignReel` composition + `fps`/`width`/`height` from the template's `src`; the current props via a build-time read of `Root.tsx` (see step).
- Produces: a running editor at `http://localhost:3100` showing the real reel in `<Player>` inside `EditorShell`.

- [ ] **Step 1: Port the spike's `vite.config.mts`** into `.editor/vite.config.mts` — the proven config from `plan2-spike-report.md`: `root: __dirname` (the `.editor` dir), `plugins: [react(), tailwindcss()]`, `publicDir` → the template's `public/`, and manual `resolve.alias` for `@` (template `src`), `@video-toolkit/lib`, `@brand-lib`, `zod$` (via `createRequire(import.meta.url)`), with `__dirname` rebuilt from `import.meta.url`.

- [ ] **Step 2: `.editor/main.tsx`** — import `global.css`; read the current `defaultProps` for the composition. Preferred: expose them from the template without duplicating — import the same `defaultProps` object the composition uses. If `Root.tsx` only inlines them in JSX (not exported), add a minimal, non-breaking export in `src/Root.tsx` (`export const campaignReelDefaultProps = {…}` and reference it in the `<Composition defaultProps={campaignReelDefaultProps}>`) so both Studio and the editor read one literal — this keeps the single-source-of-truth intact and is Studio-Save-compatible (still an inlined object literal). Render `createRoot(...).render(<EditorApp/>)` where `EditorApp` holds the props in `useState`, renders `<EditorShell projectName="campaign-reels" preview={<Player component={CampaignReel} inputProps={props} durationInFrames={totalDurationFrames(...)} compositionWidth={width} compositionHeight={height} fps={fps} controls style={{width:'100%'}}/>} onSave={...} saving={...}/>`. (Save wired in Task 3 — for now `onSave` can be a no-op stub.)

- [ ] **Step 3: `.editor/index.html`** — trivial shell with `<div id="root">` + `<script type="module" src="./main.tsx">`.

- [ ] **Step 4: Add devDeps + script** in `package.json` (`npm install -D @vitejs/plugin-react @tailwindcss/vite vite` with Node 20; add `"editor"` script).

- [ ] **Step 5: Browser-verify** — run `npm run editor`, load `http://localhost:3100` in the browser, confirm: the reel renders in the Player inside the EditorShell (header + placeholders visible around it), scrubbing works, no console "could not resolve import" / asset-404 errors. Capture a screenshot in the report.

- [ ] **Step 6: Commit in the template repo** (branch `feat/reel-editor-skeleton` in `video-toolkit`; commit `.editor/**` + `package.json`/lock + the tiny `Root.tsx` export if added). **Do not push.**

---

### Task 3: Wire Save — `POST /save` round-trips props to `Root.tsx`

**Files:**
- Create: `.editor/save-plugin.mts` (a Vite plugin: `configureServer` mounting `POST /save`)
- Modify: `.editor/vite.config.mts` (add the plugin), `.editor/main.tsx` (Save button posts props, tracks `saving`)

**Interfaces:**
- Consumes: `createSaveHandler` from `@video-toolkit/lib/editor` (Plan 1). `resolve` returns `{ filePath: <abs path to this project's src/Root.tsx>, compositionId: 'CampaignReel' }` and ignores/validates any client `rootPath` (the path is derived server-side from the Vite config's known project root — the client cannot choose it).
- Produces: clicking Save persists the in-memory props to `src/Root.tsx` via the AST rewrite; the on-disk file updates and re-reads equal.

- [ ] **Step 1: `save-plugin.mts`** — a Vite plugin whose `configureServer(server)` adds a middleware: on `POST /save`, read the JSON body `{ props }`, call `createSaveHandler(() => ({ filePath: resolve(projectRoot, 'src/Root.tsx'), compositionId: 'CampaignReel' }))({ rootPath: 'ignored', props })`, respond `200 {ok:true}` or `500 {error}`. The project root is captured from the config, NOT from the request.

- [ ] **Step 2: main.tsx Save** — `onSave` POSTs `{ props }` to `/save`, sets `saving` true→false, surfaces errors (a simple alert/toast is fine for the skeleton).

- [ ] **Step 3: Browser-verify round-trip** — with `npm run editor` running: change one prop in memory (temporarily add a dev-only control, e.g. a text input bound to `props.topic`, OR trigger a known mutation), click Save, then confirm on disk that `src/Root.tsx`'s `defaultProps` reflects the change and still parses (run the template's typecheck/build or `readDefaultProps` on the file). Revert any dev-only control before committing if it's not part of the intended skeleton. Confirm Studio Save still works (open Studio once, confirm it loads the composition).

- [ ] **Step 4: Commit in the template repo** (`.editor/**` changes). **Do not push.**

---

## Verification & handoff (controller)

After Task 3: run the core `lib/editor` suite (`npx vitest run`) and `tsc --noEmit`; browser-verify the full loop (open → play → edit → Save → Root.tsx updated → Studio still opens). Then STOP — do not start Plans 3–4 (direct-manipulation editing / overlays); present the skeleton for the human's async review, with screenshots and the exact brand-repo commits (unpushed) listed.

## Self-Review

- **Spec coverage (skeleton slice):** live preview via Player mounting the real composition (Task 2) ✓; layout-A shell (Task 1) ✓; save via Plan-1 spine, browser sends JSON only, `resolve` confines the path (Task 3) ✓; template-host + exact wiring from spike (Global Constraints, Task 2) ✓; Studio Save preserved (Task 3 verify) ✓. Direct-manipulation editing, overlays, transitions, multi-clip, brand warnings are explicitly deferred to Plans 3–4.
- **Placeholder scan:** the shell's "Inspektor/Timeline (příště)" are intentional UI placeholders for this skeleton, not plan placeholders; every task has concrete files, code direction, and a browser-verify step.
- **Type consistency:** `EditorShell` prop shape identical across Task 1 Interfaces/impl/test and Task 2 usage; `createSaveHandler`/`saveDefaultPropsToFile` consumed exactly as Plan 1 defined them; `compositionId` is `"CampaignReel"` everywhere.
