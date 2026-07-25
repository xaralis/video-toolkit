import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { resolveToolkitPaths, toolkitAliases, assertToolkitLib } from './paths';

export { resolveToolkitPaths, toolkitAliases };

/** Just the slice of @remotion/cli/config this uses — typed structurally so core
 *  needs no @remotion/cli dependency of its own. */
export interface ToolkitConfigApi {
  overrideWebpackConfig: (fn: (current: Record<string, any>) => Record<string, any>) => void;
}

export interface ApplyToolkitWebpackOptions {
  /** The project root. In a remotion.config.ts this is `process.cwd()` — NOT
   *  __dirname, which inside a Remotion config resolves to
   *  node_modules/@remotion/cli/dist. */
  projectRoot?: string;
  brandLib?: boolean;
  /** `enableTailwind` from @remotion/tailwind-v4, when the brand uses Tailwind.
   *  Passed in rather than imported: it is a brand dependency. */
  tailwind?: (config: Record<string, any>) => Record<string, any>;
  /** Seams for testing. */
  existsSync?: (p: string) => boolean;
  resolveZod?: (projectRoot: string) => string;
}

/** Exported so the test suite can exercise the real resolution path — every
 *  `applyToolkitWebpack` test injects `resolveZod`, so without a direct test
 *  this is the one line in the module nothing actually executes. */
export const defaultResolveZod = (projectRoot: string): string =>
  // Resolve FROM THE PROJECT: the alias exists to pin one zod instance shared
  // with the project's own src/. Resolving from core would create a second one
  // and bring back the "discriminator value for key `type` could not be
  // extracted" crash it prevents.
  createRequire(path.join(projectRoot, 'index.js')).resolve('zod');

export function applyToolkitWebpack(
  config: ToolkitConfigApi,
  opts: ApplyToolkitWebpackOptions = {},
): void {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const exists = opts.existsSync ?? fs.existsSync;
  const { toolkitLib, projectNodeModules } = resolveToolkitPaths(projectRoot);

  assertToolkitLib(toolkitLib, projectRoot, exists);

  const zodMain = (opts.resolveZod ?? defaultResolveZod)(projectRoot);
  const aliases = toolkitAliases(projectRoot, { brandLib: opts.brandLib });

  config.overrideWebpackConfig((current) => {
    const c = opts.tailwind ? opts.tailwind(current) : current;
    return {
      ...c,
      resolve: {
        ...c.resolve,
        // toolkit/lib is addressed by absolute-path alias and lives outside the
        // project tree, so resolution walking up from a toolkit/lib/** file never
        // reaches the project's node_modules — it stops at the filesystem root.
        // Needed since lib/render/at-cut-transitions.tsx runtime-imports
        // '@remotion/transitions/*', which is installed in the project.
        modules: [projectNodeModules, 'node_modules'],
        alias: { ...aliases, ...(c.resolve?.alias ?? {}), zod$: zodMain },
      },
    };
  });
}
