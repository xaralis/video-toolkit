import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@video-toolkit/lib/*" tsconfig path mapping (see
      // tsconfig.json) so cross-package imports (e.g. reel-config-base's
      // segmentDurationFrames) resolve the same way under vitest/vite.
      '@video-toolkit/lib': fileURLToPath(new URL('..', import.meta.url)),
      // Make React and React DOM available to aliased lib imports
      'react': fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
      // 'remotion' is only hoisted into lib/editor/node_modules (as a transitive
      // dependency of @remotion/player); components under lib/components import it
      // directly but live outside that node_modules ancestry, so Vite can't resolve
      // the bare specifier even when the module is mocked via vi.mock('remotion', ...)
      // — mocking substitutes the module's contents, not the resolution step.
      'remotion': fileURLToPath(new URL('./node_modules/remotion', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
