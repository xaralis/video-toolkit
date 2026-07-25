import fs from 'fs';
import path from 'path';
import { Config } from '@remotion/cli/config';

// The shared core, addressed by the same `@video-toolkit/lib/*` specifier a brand
// project uses; only the resolution differs (here it points at this repo's own
// lib/, there at toolkit/lib/). Webpack does not read tsconfig paths, so this must
// mirror tsconfig.json. __dirname is unusable in a Remotion config (it resolves
// inside @remotion/cli), so resolve from the working directory — the example root
// when Studio / render run.
const toolkitLib = path.resolve(process.cwd(), '../../lib');
if (!fs.existsSync(toolkitLib)) {
  throw new Error(`lib not found at ${toolkitLib} (cwd=${process.cwd()}). Run from the example root.`);
}

Config.overrideWebpackConfig((current) => ({
  ...current,
  resolve: {
    ...current.resolve,
    // REQUIRED, not optional (see lib/render/README.md): lib/render does a runtime
    // import of @remotion/transitions, and files under lib/ live OUTSIDE this
    // project's tree — so webpack's default upward walk never reaches the
    // node_modules where those packages are installed. Every consuming project
    // needs this line, or the bundle fails with "Can't resolve '@remotion/transitions/…'".
    modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules'],
    alias: { ...(current.resolve?.alias ?? {}), '@video-toolkit/lib': toolkitLib },
  },
}));
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
