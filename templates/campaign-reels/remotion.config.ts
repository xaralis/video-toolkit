import { Config } from '@remotion/cli/config';
import { enableTailwind } from '@remotion/tailwind-v4';

// Zod dual-instance fix: lib/reel-config-base and src/ both import zod.
// Aliasing to a single resolved instance prevents z.discriminatedUnion from
// crashing with "discriminator value for key `type` could not be extracted".
const zodMain = require.resolve('zod');

Config.overrideWebpackConfig((current) => {
  const c = enableTailwind(current);
  return {
    ...c,
    resolve: {
      ...c.resolve,
      alias: { ...(c.resolve?.alias ?? {}), 'zod$': zodMain },
    },
  };
});
Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
