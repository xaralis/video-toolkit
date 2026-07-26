import fs from 'fs';
import path from 'path';
import { Config } from '@remotion/cli/config';

// Shared lib addressed by name — the same `@video-toolkit/lib/*` specifier the brand
// projects use; only the resolution differs (here it points at this repo's own lib/).
// Webpack does not read tsconfig paths, so this must mirror tsconfig.json.
const toolkitLib = path.resolve(process.cwd(), '../../lib');
if (!fs.existsSync(toolkitLib)) {
  throw new Error(`lib not found at ${toolkitLib} (cwd=${process.cwd()}). Run from the showcase root.`);
}

Config.setEntryPoint('./src/index.ts');
Config.overrideWebpackConfig((current) => ({
  ...current,
  resolve: {
    ...current.resolve,
    // REQUIRED, not optional: the gallery component now lives in lib/transitions/ and
    // imports '@remotion/transitions' at runtime. Files under lib/ live OUTSIDE this
    // project's tree, so webpack's default upward walk from lib/ never reaches the
    // node_modules where that package is installed. Without this line the bundle fails
    // with "Can't resolve '@remotion/transitions' in .../lib/transitions".
    modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules'],
    alias: { ...(current.resolve?.alias ?? {}), '@video-toolkit/lib': toolkitLib },
  },
}));
