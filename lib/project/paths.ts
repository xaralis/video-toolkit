// The ONE place that knows a brand repo's layout.
//
//   <repo>/toolkit/            ← this repo, vendored as a submodule
//   <repo>/brand-lib/          ← optional shared brand components
//   <repo>/templates/<name>/   ← a template     (projectRoot)
//   <repo>/projects/<name>/    ← a video project (projectRoot)
//
// Both project locations are two hops below the repo root, which is why one
// resolver serves templates and projects alike.
import path from 'node:path';

export interface ToolkitPaths {
  toolkitLib: string;
  brandLib: string;
  projectNodeModules: string;
}

export function resolveToolkitPaths(projectRoot: string): ToolkitPaths {
  const repoRoot = path.resolve(projectRoot, '../..');
  return {
    toolkitLib: path.resolve(repoRoot, 'toolkit/lib'),
    brandLib: path.resolve(repoRoot, 'brand-lib'),
    projectNodeModules: path.resolve(projectRoot, 'node_modules'),
  };
}

/** The module aliases every toolkit build surface needs. `@brand-lib` is opt-in:
 *  not every brand has that tier, and an alias pointing at a directory that does
 *  not exist fails only later, at the first import that touches it. */
export function toolkitAliases(
  projectRoot: string,
  opts: { brandLib?: boolean } = {},
): Record<string, string> {
  const { toolkitLib, brandLib } = resolveToolkitPaths(projectRoot);
  return {
    '@video-toolkit/lib': toolkitLib,
    ...(opts.brandLib ? { '@brand-lib': brandLib } : {}),
  };
}
