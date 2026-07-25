// Returns a PLAIN OBJECT, not defineConfig(...): core has no `vite` installed,
// so it cannot import defineConfig — which is an identity function anyway. The
// brand wraps it: `export default defineConfig(createToolkitVitestConfig({...}))`.
import { resolveToolkitPaths, toolkitAliases, assertToolkitLib } from './paths';

export interface ToolkitVitestOptions {
  /** The project root — in a vitest.config.ts, `path.dirname(fileURLToPath(import.meta.url))`. */
  projectRoot: string;
  brandLib?: boolean;
  /** Extra glob(s) to test alongside the default `src/**` include — e.g. a
   *  project with a top-level `tests/` dir. Appended, not a replacement, so
   *  the caller never has to reconstruct (and risk dropping) the default. */
  extraTestInclude?: string[];
  /** Seam for testing. */
  existsSync?: (p: string) => boolean;
}

export function createToolkitVitestConfig(opts: ToolkitVitestOptions): Record<string, unknown> {
  const { toolkitLib } = resolveToolkitPaths(opts.projectRoot);
  assertToolkitLib(toolkitLib, opts.projectRoot, opts.existsSync);

  return {
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', ...(opts.extraTestInclude ?? [])],
      environment: 'node',
      // Dedupe zod so schemas from @video-toolkit/lib/reel-config-base share the
      // module instance used by src/config — otherwise z.discriminatedUnion can't
      // recognise the lib half's literals (instanceof ZodLiteral fails across
      // duplicate module instances).
      server: { deps: { inline: ['zod'] } },
    },
    resolve: {
      alias: toolkitAliases(opts.projectRoot, { brandLib: opts.brandLib }),
      dedupe: ['zod'],
    },
  };
}
