import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

// Shared lib/ (../../../lib) and src/ both import 'zod'. Without forcing one
// path they resolve to two different zod module instances, and
// z.discriminatedUnion then rejects lib-built member schemas
// ("discriminator value for key `type` could not be extracted"). Pin every
// bare 'zod' import to the project's single copy.
const zodMain = require.resolve('zod');

Config.overrideWebpackConfig((current) => {
  const c = enableTailwind(current);
  return {
    ...c,
    resolve: {
      ...c.resolve,
      alias: { ...(c.resolve?.alias ?? {}), zod$: zodMain },
    },
  };
});
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
