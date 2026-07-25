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
- **NEVER convert `Root.tsx`'s inline `defaultProps={{…}}` to a reference** (e.g. `defaultProps={someImportedConst}`). Both Studio Save and the Plan-1 AST writer require the inline object literal at the `<Composition>`. The editor obtains the current props by running Plan-1's `readDefaultProps` on the `Root.tsx` **source, server-side** (a dev-server `GET /props`), and returning JSON to the browser — never by importing, exporting, or duplicating the props literal. `Root.tsx` is not modified by this plan at all.
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
- Create: `.editor/index.html`, `.editor/main.tsx`, `.editor/vite.config.mts`, `.editor/editor-plugin.mts`
- Modify: `package.json` (devDeps `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite`; script `"editor": "vite --config .editor/vite.config.mts --port 3100"`)
- **Not modified:** `src/Root.tsx` stays byte-for-byte unchanged.

**Interfaces:**
- Consumes: `EditorShell` from `@video-toolkit/lib/editor/app/EditorShell` and `readDefaultProps` from `@video-toolkit/lib/editor/save-endpoint`-adjacent module (`@video-toolkit/lib/editor/default-props-writer`) — both via the existing `@video-toolkit/lib` alias; `CampaignReel` composition + `buildReelConfig`/`fps`/`width`/`height`/`outroFrames` from the template's `src`; `totalDurationFrames` from `@video-toolkit/lib/reel-config-base/duration`.
- Produces: a running editor at `http://localhost:3100` showing the real reel in `<Player>` inside `EditorShell`, with the initial props read from `src/Root.tsx` server-side.

- [ ] **Step 1: Port the spike's `vite.config.mts`** into `.editor/vite.config.mts` — the proven config from `plan2-spike-report.md`: `root: __dirname` (the `.editor` dir), `plugins: [react(), tailwindcss(), editorPlugin()]` (the last from Step 4), `publicDir` → the template's `public/`, and manual `resolve.alias` for `@` (template `src`), `@video-toolkit/lib`, `@brand-lib`, `zod$` (via `createRequire(import.meta.url)`), with `__dirname` rebuilt from `import.meta.url`. Keep the `@video-toolkit/lib` alias PORTABLE (`path.resolve(templateRoot, '../../toolkit/lib')`) exactly as `remotion.config.ts` does — do not hardcode an absolute machine path.

- [ ] **Step 2: `.editor/editor-plugin.mts`** — a Vite plugin whose `configureServer(server)` adds a `GET /props` route: it reads the project's `src/Root.tsx` from disk, calls `readDefaultProps(source, { compositionId: 'CampaignReel' })`, and responds `200 application/json` with the props (or `500 {error}`). The project root is derived from the plugin's own known config path, not from the request. (Task 3 adds `POST /save` to this same plugin.)

- [ ] **Step 3: `.editor/main.tsx`** — import `global.css`; on load `fetch('/props')` → the current props; hold them in `useState`; render `createRoot(...).render(<EditorApp/>)` where `EditorApp` renders `<EditorShell projectName="campaign-reels" preview={<Player component={CampaignReel} inputProps={props} durationInFrames={totalDurationFrames(buildReelConfig(props).segments, fps, outroFrames)} compositionWidth={width} compositionHeight={height} fps={fps} controls style={{width:'100%'}}/>} onSave={() => {/* stub; wired in Task 3 */}} />`. Show a minimal "loading…" state until `/props` resolves. Do NOT import or duplicate the props literal from `Root.tsx` — they come only from `/props`.

- [ ] **Step 4: `.editor/index.html`** — trivial shell with `<div id="root">` + `<script type="module" src="./main.tsx">`.

- [ ] **Step 5: Add devDeps + script** in `package.json` (`npm install -D @vitejs/plugin-react @tailwindcss/vite vite` with Node 20; add the `"editor"` script).

- [ ] **Step 6: Browser-verify** — run `npm run editor`, load `http://localhost:3100` in the browser, confirm: `/props` returns the real props, the reel renders in the Player inside the EditorShell (header + placeholders visible around it), scrubbing works, no console "could not resolve import" / asset-404 errors. Capture a screenshot in the report. Confirm `src/Root.tsx` is unchanged (`git status` clean for it).

- [ ] **Step 7: Commit in the template repo** (create branch `feat/reel-editor-skeleton` in `video-toolkit` first; commit `.editor/**` + `package.json`/lock). **Do not push. Do not commit the `toolkit` submodule pointer change.**

---

### Task 3: Wire Save — `POST /save` round-trips props to `Root.tsx`

**Files:**
- Modify: `.editor/editor-plugin.mts` (add `POST /save` alongside the existing `GET /props`)
- Modify: `.editor/main.tsx` (Save button posts props, tracks `saving`; add a minimal dev-only `topic` text input so a change can be made and verified)

**Interfaces:**
- Consumes: `createSaveHandler` from `@video-toolkit/lib/editor/save-endpoint` (Plan 1). `resolve` returns `{ filePath: <this project's src/Root.tsx>, compositionId: 'CampaignReel' }` and ignores any client `rootPath` (path derived server-side from the plugin's known project root — the client cannot choose it).
- Produces: clicking Save persists the in-memory props to `src/Root.tsx` via the AST rewrite; the on-disk file updates and re-reads equal.

- [ ] **Step 1: add `POST /save` to `editor-plugin.mts`** — in the same `configureServer` middleware: on `POST /save`, read JSON body `{ props }`, call `createSaveHandler(() => ({ filePath: join(projectRoot, 'src/Root.tsx'), compositionId: 'CampaignReel' }))({ rootPath: 'ignored', props })`, respond `200 {ok:true}` or `500 {error}`. `projectRoot` comes from the plugin config, NOT the request.

- [ ] **Step 2: main.tsx Save + minimal editing** — add a small `topic` text input bound to `props` state (this is the one concrete edit the skeleton exercises); `onSave` POSTs `{ props }` to `/save`, sets `saving` true→false, surfaces errors (a simple alert is fine).

- [ ] **Step 3: Browser-verify round-trip** — with `npm run editor` running: edit the `topic` input, click Save, confirm `200 {ok:true}`; then confirm on disk that `src/Root.tsx`'s `defaultProps.topic` reflects the change AND the file still parses (run `readDefaultProps` on it, or the template's typecheck). Confirm the inline `defaultProps={{…}}` literal is STILL an inline literal (not a reference) so Studio Save remains intact; open Studio once and confirm it loads the composition. Screenshot the round-trip in the report.

- [ ] **Step 4: Commit in the template repo** (`.editor/**` + any `Root.tsx` change from Save — note: Save legitimately rewrites `Root.tsx`'s literal; that on-disk change from a verification save may be left or reverted, your call, but do not hand-edit `Root.tsx`). **Do not push. Do not commit the `toolkit` submodule pointer.**

---

## Verification & handoff (controller)

After Task 3: run the core `lib/editor` suite (`npx vitest run`) and `tsc --noEmit`; browser-verify the full loop (open → play → edit → Save → Root.tsx updated → Studio still opens). Then STOP — do not start Plans 3–4 (direct-manipulation editing / overlays); present the skeleton for the human's async review, with screenshots and the exact brand-repo commits (unpushed) listed.

## Self-Review

- **Spec coverage (skeleton slice):** live preview via Player mounting the real composition (Task 2) ✓; layout-A shell (Task 1) ✓; save via Plan-1 spine, browser sends JSON only, `resolve` confines the path (Task 3) ✓; template-host + exact wiring from spike (Global Constraints, Task 2) ✓; Studio Save preserved (Task 3 verify) ✓. Direct-manipulation editing, overlays, transitions, multi-clip, brand warnings are explicitly deferred to Plans 3–4.
- **Placeholder scan:** the shell's "Inspektor/Timeline (příště)" are intentional UI placeholders for this skeleton, not plan placeholders; every task has concrete files, code direction, and a browser-verify step.
- **Type consistency:** `EditorShell` prop shape identical across Task 1 Interfaces/impl/test and Task 2 usage; `createSaveHandler`/`saveDefaultPropsToFile` consumed exactly as Plan 1 defined them; `compositionId` is `"CampaignReel"` everywhere.
