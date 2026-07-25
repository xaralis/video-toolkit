import path from 'path';
import { createRequire } from 'module';
import { toolkitAliases, resolveToolkitPaths } from '../../project/paths';
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
}

export function createEditorViteConfig(opts: EditorViteConfigOptions): Record<string, unknown> {
  const { editorDir, compositionId, plugins = [], brandLib = false, extraArgs = [], port = 3100 } = opts;

  // .editor/ lives at templates/<name>/.editor (or projects/<name>/.editor) — one hop
  // up is the project root, matching remotion.config.ts's own layout assumptions.
  const templateRoot = path.resolve(editorDir, '..');
  const { projectNodeModules } = resolveToolkitPaths(templateRoot);

  // Resolve FROM THE PROJECT, not from core: the alias exists to pin one zod instance
  // shared with the project's own src/ (mirrors lib/project/remotion-config.ts's
  // `defaultResolveZod` — same rule, same reason: resolving from core would create a
  // second zod instance and bring back the "discriminator value for key `type` could
  // not be extracted" crash it prevents). Tolerate a template root that doesn't exist
  // (a caller under test, with a synthetic `editorDir`) by omitting the alias rather
  // than throwing — a real brand's template root always exists and has zod installed,
  // so this only ever engages in that synthetic case.
  let zodMain: string | undefined;
  try {
    zodMain = createRequire(path.join(templateRoot, 'index.js')).resolve('zod');
  } catch {
    zodMain = undefined;
  }

  // The shared at-cut engine (toolkit/lib/render) runtime-imports
  // @remotion/transitions/* from OUTSIDE this project's tree, so Vite's normal
  // node-resolution walk-up from the toolkit submodule can't find it. Re-resolve
  // those specifiers as if imported from the project root — this honours the
  // package's exports map, which some subpaths (iris, wipe) rely on entirely
  // (ESM-only via exports, not root .js files, so a plain dir alias breaks them).
  // Mirrors remotion.config.ts's webpack resolve.modules fix on the render side.
  const resolveRemotionTransitionsFromProject = {
    name: 'resolve-remotion-transitions-from-project',
    enforce: 'pre' as const,
    async resolveId(
      this: { resolve: (s: string, i: string, o: { skipSelf: boolean }) => Promise<{ id: string } | null> },
      source: string,
    ) {
      if (source.startsWith('@remotion/transitions')) {
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
      resolveRemotionTransitionsFromProject,
      createEditorPlugin({ templateRoot, compositionId, extraArgs }),
    ],
    publicDir: path.resolve(templateRoot, 'public'),
    server: {
      port,
    },
    resolve: {
      alias: {
        '@': path.resolve(templateRoot, 'src'),
        ...toolkitAliases(templateRoot, { brandLib }),
        ...(zodMain ? { zod$: zodMain } : {}),
        // The timeline component lives in the toolkit submodule, whose node_modules
        // walk can't reach this project's siblings — alias its bare deps to the
        // project's installed copies (dir aliases so /dist/*.css subpaths resolve).
        '@xzdarcy/react-timeline-editor': path.resolve(projectNodeModules, '@xzdarcy/react-timeline-editor'),
        '@xzdarcy/timeline-engine': path.resolve(projectNodeModules, '@xzdarcy/timeline-engine'),
      },
    },
  };
}
