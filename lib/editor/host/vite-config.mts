import fs from 'fs';
import path from 'path';
import { toolkitAliases, resolveToolkitPaths, assertToolkitLib } from '../../project/paths';
import { defaultResolveZod } from '../../project/remotion-config';
import { warnOnZodMismatch, type ZodGuardOptions } from '../../project/zod-guard';
import { createEditorPlugin } from './editor-plugin.mts';

/**
 * Factory for a brand's `.editor/vite.config.mts`. Returns a plain object, NOT a value
 * wrapped in Vite's `defineConfig` — `defineConfig` is identity, and core has no `vite`
 * dependency to import it from. The brand's own config file imports this factory (by
 * relative path — see `lib/editor/host/README.md`) and passes the result straight to its
 * own `defineConfig`.
 *
 * Core also has no `@vitejs/plugin-react` or `@tailwindcss/vite`: those are brand-side
 * choices (some brands use Tailwind, some don't), so the caller
 * passes its own plugin instances in via `opts.plugins`.
 */
export interface EditorViteConfigOptions {
  /** Absolute path to the brand's `.editor/` directory — Vite's `root`. */
  editorDir: string;
  /** Remotion composition id the editor edits — a brand's own composition id, e.g. `LayeredCampaignReel`. */
  compositionId: string;
  /** Brand-supplied Vite plugins (e.g. `react()`, `tailwindcss()`), applied before the editor plugin. */
  plugins?: unknown[];
  /** Whether this brand has a `brand-lib/` tier to alias as `@brand-lib`. Defaults to false. */
  brandLib?: boolean;
  /** Extra CLI args appended to the render command (e.g. `['--gl=angle']`). */
  extraArgs?: string[];
  /** Dev-server port. Defaults to 3100. */
  port?: number;
  /** Seam for testing — same purpose as `applyToolkitWebpack`'s `resolveZod` option
   *  (`lib/project/remotion-config.ts`). Defaults to `defaultResolveZod`. */
  resolveZod?: (templateRoot: string) => string;
  /** Seam for testing — same purpose as `applyToolkitWebpack`'s `existsSync` option.
   *  Defaults to `fs.existsSync`. */
  existsSync?: (p: string) => boolean;
  /** Seams for the zod version warning. */
  zodGuard?: ZodGuardOptions;
}

export function createEditorViteConfig(opts: EditorViteConfigOptions): Record<string, unknown> {
  const { editorDir, compositionId, plugins = [], brandLib = false, extraArgs = [], port = 3100 } = opts;
  const exists = opts.existsSync ?? fs.existsSync;

  // .editor/ lives at templates/<name>/.editor (or projects/<name>/.editor) — one hop
  // up is the project root, matching remotion.config.ts's own layout assumptions.
  const templateRoot = path.resolve(editorDir, '..');
  const { toolkitLib, projectNodeModules } = resolveToolkitPaths(templateRoot);

  // Mirrors applyToolkitWebpack's guard (lib/project/remotion-config.ts): without it, a
  // layout mismatch resolves toolkitLib to a nonexistent directory silently, and the
  // failure only surfaces later as a confusing "module not found" at the first import
  // that touches it, far from the actual cause.
  assertToolkitLib(toolkitLib, templateRoot, exists);

  // Resolve FROM THE PROJECT, not from core: the alias exists to pin one zod instance
  // shared with the project's own src/ (mirrors lib/project/remotion-config.ts's
  // `defaultResolveZod` — same rule, same reason: resolving from core would create a
  // second zod instance and bring back the "discriminator value for key `type` could
  // not be extracted" crash it prevents). Set unconditionally: a real brand's template
  // root always has zod installed, so a resolution failure here is an actual layout
  // problem (missing/hoisted zod) that should throw loudly, not be swallowed into a
  // silently-omitted alias — an omitted alias lets Vite fall back to resolving zod from
  // the toolkit submodule instead, which is exactly the dual-instance crash this alias
  // exists to prevent, just deferred to a much more confusing point at runtime.
  const zodMain = (opts.resolveZod ?? defaultResolveZod)(templateRoot);
  // Warns only — see lib/project/zod-guard.ts for why this must never throw.
  warnOnZodMismatch(templateRoot, opts.zodGuard);

  // Everything under toolkit/lib that this editor loads — the host itself
  // (@remotion/player), the shared at-cut engine (remotion,
  // @remotion/transitions/*) — imports Remotion by BARE specifier from OUTSIDE
  // this project's tree, so Vite's normal node-resolution walk-up from the
  // toolkit submodule can't find it: it climbs to the brand repo root and stops.
  // Re-resolve those specifiers as if imported from the project root.
  //
  // Resolution, not a dir alias, on purpose: it honours each package's exports
  // map, which some @remotion/transitions subpaths (iris, wipe) rely on entirely
  // (ESM-only via exports, no root .js file, so a plain dir alias breaks them).
  // Mirrors remotion.config.ts's webpack resolve.modules fix on the render side.
  //
  // The scope is every Remotion specifier, not just @remotion/transitions. It was
  // originally only the latter, from when the editor host still lived in the
  // brand's own .editor/main.tsx and its `import { Player } from
  // '@remotion/player'` resolved through the project's own node_modules. Phase 2
  // moved the host into lib/editor/host/EditorHost.tsx, out of the project tree,
  // and that import stopped resolving: the dev server still served / and /props,
  // but the app never mounted and the only symptom was one line in the Vite log.
  // Widening it here is what makes a core-owned host work in a brand repo at all.
  const isRemotionSpecifier = (source: string) =>
    source === 'remotion' || source.startsWith('remotion/') || source.startsWith('@remotion/');

  const resolveRemotionFromProject = {
    name: 'resolve-remotion-from-project',
    enforce: 'pre' as const,
    async resolveId(
      this: { resolve: (s: string, i: string, o: { skipSelf: boolean }) => Promise<{ id: string } | null> },
      source: string,
    ) {
      if (isRemotionSpecifier(source)) {
        const resolved = await this.resolve(source, path.join(templateRoot, 'index.js'), { skipSelf: true });
        if (resolved) return resolved.id;
      }
      return null;
    },
  };

  return {
    root: editorDir,
    plugins: [
      ...plugins,
      resolveRemotionFromProject,
      createEditorPlugin({ templateRoot, compositionId, extraArgs }),
    ],
    publicDir: path.resolve(templateRoot, 'public'),
    server: {
      port,
      // The editor's own source is served from the TOOLKIT submodule over
      // `/@fs/…`, which Vite guards with `server.fs.allow`. Left unset, that
      // list is whatever `searchForWorkspaceRoot` infers by walking up from
      // `root` (`.editor/`) — and across a submodule boundary it infers the
      // PROJECT directory, so every toolkit file 403s:
      //
      //   The request url "…/toolkit/lib/editor/host/EditorHost.tsx" is
      //   outside of Vite serving allow list.
      //   - …/projects/<name>
      //
      // Declaring the list explicitly removes the guesswork. The brand-repo
      // root is derived from `toolkitLib` rather than by counting `..` from
      // `templateRoot`, so it holds whether `.editor/` sits under `projects/`
      // or `templates/`. `templateRoot` and the toolkit root are listed too:
      // they are inside the repo root in the normal layout, but a toolkit
      // checked out elsewhere would otherwise silently break the same way.
      //
      // `strict` is deliberately left at its default (on) — this widens the
      // allow list to what the editor genuinely needs, it does not disable
      // the protection.
      fs: {
        allow: [path.resolve(toolkitLib, '../..'), path.resolve(toolkitLib, '..'), templateRoot],
      },
    },
    resolve: {
      // The editor's own components are served from the TOOLKIT submodule
      // (`@fs/…/toolkit/lib/editor/…`) while the app they mount into resolves
      // from the PROJECT — two module graphs that can each reach a different
      // `react`, which React reports as "Invalid hook call … more than one copy
      // of React" and which kills the timeline outright. Deduping pins one copy
      // for both graphs.
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(templateRoot, 'src'),
        ...toolkitAliases(templateRoot, { brandLib }),
        zod$: zodMain,
        // The timeline component lives in the toolkit submodule, whose node_modules
        // walk can't reach this project's siblings — alias its bare deps to the
        // project's installed copies (dir aliases so /dist/*.css subpaths resolve).
        '@xzdarcy/react-timeline-editor': path.resolve(projectNodeModules, '@xzdarcy/react-timeline-editor'),
        '@xzdarcy/timeline-engine': path.resolve(projectNodeModules, '@xzdarcy/timeline-engine'),
      },
    },
  };
}
