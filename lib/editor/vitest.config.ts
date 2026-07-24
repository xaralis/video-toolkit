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
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
