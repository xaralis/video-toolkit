# Reel Editor — Save Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side "save" spine for the reel editor: a Node module that persists edited reel props by AST-rewriting the inlined `defaultProps={{…}}` literal in a template's `src/Root.tsx`, plus the local endpoint that drives it — so the browser editor (later plans) only ever sends plain JSON.

**Architecture:** New self-contained core sub-package `lib/editor` (own `package.json`, vitest, ts-morph). A pure function `rewriteDefaultProps(source, props, opts)` uses ts-morph to locate the `<Composition>` `defaultProps` JSX attribute and replace its object literal with the new props, preserving the rest of the file. A thin `saveDefaultPropsToFile(filePath, props, opts)` wraps it with fs read/write, and a minimal HTTP route factory exposes it locally. No `config.json`, no migration — the inlined literal stays the single source of truth, so Remotion Studio Save keeps working alongside the editor.

**Tech Stack:** TypeScript (ESM), ts-morph (TS AST), vitest. Targets templates on Remotion 4.0.425.

## Global Constraints

- **Single source of truth:** the inlined `defaultProps={{…}}` literal in the template's `src/Root.tsx`. Never introduce `config.json`. The rewrite MUST preserve all other file content (imports, `calculateMetadata`, comments) so Studio Save continues to work.
- **Browser sends JSON only:** all TS/TSX AST work happens server-side in this package; nothing here runs in a browser.
- **Editor is a self-contained core sub-package:** everything in this plan lives under `lib/editor/` with its own `package.json`, tested by its own vitest. Do not wire it into a template in this plan.
- **Props are plain JSON data:** reel `defaultProps` are pure data (no functions/undefined). Serialize with `JSON.stringify`.
- **Package manager / runner:** `npm` + `npx vitest`, run from inside `lib/editor/`.

---

### Task 1: `lib/editor` package + `rewriteDefaultProps` / `readDefaultProps`

**Files:**
- Create: `lib/editor/package.json`
- Create: `lib/editor/tsconfig.json`
- Create: `lib/editor/src/default-props-writer.ts`
- Test: `lib/editor/src/default-props-writer.test.ts`

**Interfaces:**
- Produces:
  - `rewriteDefaultProps(source: string, props: unknown, opts?: { compositionId?: string }): string` — returns new `Root.tsx` source with the `defaultProps` object replaced by `props`.
  - `readDefaultProps(source: string, opts?: { compositionId?: string }): unknown` — parses a source whose `defaultProps` is JSON-compatible (i.e. one produced by `rewriteDefaultProps`) and returns the props object. Used by tests and later by the save endpoint's verification.
  - Both throw `Error` with a clear message when no matching `<Composition defaultProps={…}>` is found, or when multiple `<Composition>` exist and no `compositionId` disambiguates.

- [ ] **Step 1: Create the package harness**

Create `lib/editor/package.json`:

```json
{
  "name": "@video-toolkit/editor",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "ts-morph": "^24.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

Create `lib/editor/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd lib/editor && npm install`
Expected: installs ts-morph, vitest, typescript; creates `lib/editor/node_modules` and `package-lock.json`; exits 0.

- [ ] **Step 3: Write the failing test (happy-path round-trip)**

Create `lib/editor/src/default-props-writer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { rewriteDefaultProps, readDefaultProps } from './default-props-writer';

const ROOT = `import { Composition } from 'remotion';
import { CampaignReel } from './CampaignReel';

export const RemotionRoot = () => {
  return (
    <Composition
      id="CampaignReel"
      component={CampaignReel}
      defaultProps={{
        topic: 'Demo',
        segments: [
          { id: 'seg-001', type: 'clip', source: 'sample.mp4', trimIn: 0, trimOut: 3 },
        ],
      }}
      calculateMetadata={({ props }) => ({ durationInFrames: 300 })}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
`;

describe('rewriteDefaultProps', () => {
  it('replaces defaultProps and round-trips through readDefaultProps', () => {
    const next = {
      topic: 'Nájmy',
      segments: [
        { id: 'seg-001', type: 'clip', source: 'a.mp4', trimIn: 1, trimOut: 4 },
        { id: 'seg-002', type: 'broll', source: 'b.mp4', trimIn: 0, trimOut: 3, audioMode: 'silent' },
      ],
    };
    const out = rewriteDefaultProps(ROOT, next);
    expect(readDefaultProps(out)).toEqual(next);
  });

  it('preserves the rest of the file', () => {
    const out = rewriteDefaultProps(ROOT, { topic: 'X', segments: [] });
    expect(out).toContain("import { CampaignReel } from './CampaignReel'");
    expect(out).toContain('calculateMetadata');
    expect(out).toContain('width={1080}');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd lib/editor && npx vitest run src/default-props-writer.test.ts`
Expected: FAIL — cannot resolve `./default-props-writer` / `rewriteDefaultProps is not a function`.

- [ ] **Step 5: Implement `default-props-writer.ts`**

Create `lib/editor/src/default-props-writer.ts`:

```ts
import { Project, SyntaxKind } from 'ts-morph';
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement } from 'ts-morph';

type CompositionEl = JsxSelfClosingElement | JsxOpeningElement;

function compositionElements(sf: ReturnType<Project['createSourceFile']>): CompositionEl[] {
  return [
    ...sf.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ].filter((el) => el.getTagNameNode().getText() === 'Composition');
}

function idOf(el: CompositionEl): string | undefined {
  const attr = el.getAttributes().find(
    (a): a is JsxAttribute =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      (a as JsxAttribute).getNameNode().getText() === 'id',
  );
  const init = attr?.getInitializer();
  if (!init) return undefined;
  if (init.getKind() === SyntaxKind.StringLiteral) {
    return init.asKindOrThrow(SyntaxKind.StringLiteral).getLiteralValue();
  }
  const expr = init.asKind(SyntaxKind.JsxExpression)?.getExpression();
  return expr?.asKind(SyntaxKind.StringLiteral)?.getLiteralValue();
}

function findDefaultPropsAttr(source: string, compositionId?: string): JsxAttribute {
  const project = new Project({ useInMemoryFileSystem: true });
  const sf = project.createSourceFile('Root.tsx', source, { overwrite: true });
  let comps = compositionElements(sf);
  if (comps.length === 0) {
    throw new Error('rewriteDefaultProps: no <Composition> element found in source.');
  }
  if (compositionId) {
    comps = comps.filter((el) => idOf(el) === compositionId);
    if (comps.length === 0) {
      throw new Error(`rewriteDefaultProps: no <Composition> with id="${compositionId}".`);
    }
  } else if (comps.length > 1) {
    throw new Error(
      'rewriteDefaultProps: multiple <Composition> elements; pass opts.compositionId to disambiguate.',
    );
  }
  const attr = comps[0].getAttributes().find(
    (a): a is JsxAttribute =>
      a.getKind() === SyntaxKind.JsxAttribute &&
      (a as JsxAttribute).getNameNode().getText() === 'defaultProps',
  );
  if (!attr) {
    throw new Error('rewriteDefaultProps: <Composition> has no defaultProps attribute.');
  }
  return attr;
}

export function rewriteDefaultProps(
  source: string,
  props: unknown,
  opts: { compositionId?: string } = {},
): string {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const json = JSON.stringify(props, null, 2);
  attr.setInitializer(`{${json}}`);
  return attr.getSourceFile().getFullText();
}

export function readDefaultProps(
  source: string,
  opts: { compositionId?: string } = {},
): unknown {
  const attr = findDefaultPropsAttr(source, opts.compositionId);
  const expr = attr
    .getInitializer()
    ?.asKind(SyntaxKind.JsxExpression)
    ?.getExpression();
  if (!expr) {
    throw new Error('readDefaultProps: defaultProps initializer is not a JSX expression.');
  }
  return JSON.parse(expr.getText());
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd lib/editor && npx vitest run src/default-props-writer.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 7: Add tests for disambiguation and errors**

Append to `lib/editor/src/default-props-writer.test.ts`:

```ts
const TWO_COMPS = `import { Composition } from 'remotion';
export const Root = () => (
  <>
    <Composition id="A" component={A} defaultProps={{ topic: 'a' }} fps={30} width={1} height={1} />
    <Composition id="B" component={B} defaultProps={{ topic: 'b' }} fps={30} width={1} height={1} />
  </>
);
`;

describe('rewriteDefaultProps disambiguation & errors', () => {
  it('rewrites only the composition matching compositionId', () => {
    const out = rewriteDefaultProps(TWO_COMPS, { topic: 'B2' }, { compositionId: 'B' });
    expect(readDefaultProps(out, { compositionId: 'B' })).toEqual({ topic: 'B2' });
    expect(readDefaultProps(out, { compositionId: 'A' })).toEqual({ topic: 'a' });
  });

  it('throws when ambiguous and no compositionId given', () => {
    expect(() => rewriteDefaultProps(TWO_COMPS, { topic: 'x' })).toThrow(/disambiguate/);
  });

  it('throws when compositionId does not exist', () => {
    expect(() => rewriteDefaultProps(TWO_COMPS, { topic: 'x' }, { compositionId: 'Z' })).toThrow(
      /no <Composition> with id="Z"/,
    );
  });

  it('throws when there is no Composition at all', () => {
    expect(() => rewriteDefaultProps('export const x = 1;', {})).toThrow(/no <Composition>/);
  });
});
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `cd lib/editor && npx vitest run src/default-props-writer.test.ts`
Expected: PASS — all six tests green. (The implementation from Step 5 already satisfies these; if any fail, fix the implementation, do not weaken the tests.)

- [ ] **Step 9: Commit**

```bash
git add lib/editor/package.json lib/editor/package-lock.json lib/editor/tsconfig.json \
        lib/editor/src/default-props-writer.ts lib/editor/src/default-props-writer.test.ts
git commit -m "feat(editor): AST writer for Root.tsx defaultProps literal"
```

---

### Task 2: `saveDefaultPropsToFile` + local save route

**Files:**
- Create: `lib/editor/src/save-endpoint.ts`
- Test: `lib/editor/src/save-endpoint.test.ts`

**Interfaces:**
- Consumes: `rewriteDefaultProps`, `readDefaultProps` from `./default-props-writer`.
- Produces:
  - `saveDefaultPropsToFile(filePath: string, props: unknown, opts?: { compositionId?: string }): Promise<void>` — reads the file, rewrites its `defaultProps`, writes it back atomically.
  - `createSaveHandler(resolve: (body: { rootPath: string; props: unknown; compositionId?: string }) => { filePath: string; compositionId?: string }): (body: unknown) => Promise<{ ok: true }>` — a transport-agnostic handler the dev server (a later plan) mounts on an HTTP route. `resolve` maps a validated request body to an absolute file path, letting the caller confine writes to the project directory.

- [ ] **Step 1: Write the failing test**

Create `lib/editor/src/save-endpoint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveDefaultPropsToFile } from './save-endpoint';
import { readDefaultProps } from './default-props-writer';

const ROOT = `import { Composition } from 'remotion';
export const Root = () => (
  <Composition id="CampaignReel" component={C} defaultProps={{ topic: 'old', segments: [] }} fps={30} width={1} height={1} />
);
`;

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reel-editor-'));
  const file = join(dir, 'Root.tsx');
  writeFileSync(file, ROOT, 'utf8');
  return file;
}

describe('saveDefaultPropsToFile', () => {
  it('persists new props to disk and leaves valid, re-readable source', async () => {
    const file = tmpRoot();
    const next = { topic: 'new', segments: [{ id: 's1', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3 }] };
    await saveDefaultPropsToFile(file, next);
    const written = readFileSync(file, 'utf8');
    expect(readDefaultProps(written)).toEqual(next);
    expect(written).toContain("import { Composition } from 'remotion'");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd lib/editor && npx vitest run src/save-endpoint.test.ts`
Expected: FAIL — cannot resolve `./save-endpoint` / `saveDefaultPropsToFile is not a function`.

- [ ] **Step 3: Implement `save-endpoint.ts`**

Create `lib/editor/src/save-endpoint.ts`:

```ts
import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { rewriteDefaultProps } from './default-props-writer';

export async function saveDefaultPropsToFile(
  filePath: string,
  props: unknown,
  opts: { compositionId?: string } = {},
): Promise<void> {
  const source = await readFile(filePath, 'utf8');
  const next = rewriteDefaultProps(source, props, opts);
  // Atomic write: write a temp sibling, then rename over the target.
  const tmp = join(dirname(filePath), `.${Date.now().toString(36)}.Root.tsx.tmp`);
  await writeFile(tmp, next, 'utf8');
  await rename(tmp, filePath);
}

export interface SaveRequest {
  rootPath: string;
  props: unknown;
  compositionId?: string;
}

export function createSaveHandler(
  resolve: (body: SaveRequest) => { filePath: string; compositionId?: string },
): (body: unknown) => Promise<{ ok: true }> {
  return async (body: unknown) => {
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as SaveRequest).rootPath !== 'string' ||
      !('props' in body)
    ) {
      throw new Error('save handler: body must be { rootPath: string, props: unknown }.');
    }
    const req = body as SaveRequest;
    const { filePath, compositionId } = resolve(req);
    await saveDefaultPropsToFile(filePath, req.props, { compositionId });
    return { ok: true };
  };
}
```

> Note on the atomic write: `Date.now()` is used only at runtime inside the save endpoint. It is NOT used in any test (tests are deterministic). Do not add timestamps to test assertions.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd lib/editor && npx vitest run src/save-endpoint.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a test for `createSaveHandler`**

Append to `lib/editor/src/save-endpoint.test.ts`:

```ts
import { createSaveHandler } from './save-endpoint';

describe('createSaveHandler', () => {
  it('resolves the target path and writes props', async () => {
    const file = tmpRoot();
    const handler = createSaveHandler((body) => ({ filePath: file, compositionId: body.compositionId }));
    const res = await handler({ rootPath: file, props: { topic: 'via-handler', segments: [] }, compositionId: 'CampaignReel' });
    expect(res).toEqual({ ok: true });
    expect(readDefaultProps(readFileSync(file, 'utf8'))).toEqual({ topic: 'via-handler', segments: [] });
  });

  it('rejects a malformed body', async () => {
    const handler = createSaveHandler(() => ({ filePath: '/nope' }));
    await expect(handler({ props: {} })).rejects.toThrow(/rootPath/);
  });
});
```

- [ ] **Step 6: Run all tests to verify they pass**

Run: `cd lib/editor && npx vitest run`
Expected: PASS — all tests in both files green.

- [ ] **Step 7: Commit**

```bash
git add lib/editor/src/save-endpoint.ts lib/editor/src/save-endpoint.test.ts
git commit -m "feat(editor): local save endpoint that persists props via AST rewrite"
```

---

## Notes for the next plan (not this plan)

- **Studio save API check:** `@remotion/studio` exports `saveDefaultProps` / `updateDefaultProps`, but their signatures (`{ compositionId, defaultProps }` → Promise, living in `@remotion/studio`) indicate they drive a **running Studio server**, not a headless call. This plan therefore ships our own ts-morph writer as the primary path, as the spec anticipated. If a future need arises to reuse Remotion's exact formatting, revisit — but do not block the editor on it.
- Plan 2 (Editor skeleton) will: scaffold the `@remotion/player` app under `lib/editor/app/`, mount the template composition with its current `defaultProps`, render layout A shell, add the dev server that mounts `createSaveHandler` on a `POST /save` route confined to the project dir, and add the template's `npm run editor` proxy script.

## Self-Review

- **Spec coverage (save spine slice):** "Single source of truth stays the inlined `Root.tsx` literal" → Task 1 writer preserves the file; "editor saves by AST-rewriting it server-side" → Tasks 1–2; "browser sends JSON only" → `createSaveHandler` takes a JSON body; "no config.json / no migration" → nothing here reads or writes `config.json`. Remaining spec areas (Player preview, direct-manipulation UI, overlays, brand warnings) are explicitly deferred to later plans in the decomposition.
- **Placeholder scan:** no TBD/TODO; every code step contains full code; every run step has an exact command + expected result.
- **Type consistency:** `rewriteDefaultProps` / `readDefaultProps` signatures are identical in the Interfaces block, implementation, and tests; `saveDefaultPropsToFile` and `createSaveHandler` signatures match between Interfaces, implementation, and tests; `SaveRequest` shape is consistent across handler and tests.
