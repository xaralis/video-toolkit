// Returns a PLAIN OBJECT, not defineConfig(...): core has no `vite` installed,
// so it cannot import defineConfig — which is an identity function anyway. The
// brand wraps it: `export default defineConfig(createToolkitVitestConfig({...}))`.
import { toolkitAliases } from './paths';

export interface ToolkitVitestOptions {
  /** The project root — in a vitest.config.ts, `path.dirname(fileURLToPath(import.meta.url))`. */
  projectRoot: string;
  brandLib?: boolean;
}

export function createToolkitVitestConfig(opts: ToolkitVitestOptions): Record<string, unknown> {
  return {
    test: {
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
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
