import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const requireFromHere = createRequire(import.meta.url);

// `@remotion/transitions` is a declared lib/editor devDependency, but the file
// that imports it — lib/render/at-cut-transitions.tsx — sits OUTSIDE
// lib/editor's node_modules ancestry, so Vite resolves the specifier from
// lib/render and never finds it. The plain string alias used for 'remotion'
// below cannot fix this one: the package publishes its subpaths through an
// exports map ('@remotion/transitions/fade' → dist/presentations/fade.js), so
// a prefix rewrite to a directory produces a path that doesn't exist. Resolve
// each specifier from HERE instead, which is the same class of workaround the
// consuming side already needs (webpack `resolve.modules` and tsconfig
// `paths` — see lib/render/README.md).
const remotionTransitionsFromEditor = (): Plugin => ({
  name: 'resolve-remotion-transitions-from-editor',
  enforce: 'pre',
  resolveId(source) {
    if (source !== '@remotion/transitions' && !source.startsWith('@remotion/transitions/')) return null;
    try {
      return requireFromHere.resolve(source);
    } catch {
      return null;
    }
  },
});

export default defineConfig({
  plugins: [remotionTransitionsFromEditor()],
  // The AUTOMATIC JSX runtime, matching what Remotion's own bundler and the
  // tsconfigs use ("jsx": "react-jsx"). Vite's default here is the classic
  // runtime, which needs `React` in lexical scope — so a lib file that uses
  // JSX without importing React (lib/render/at-cut-transitions.tsx does not,
  // and is correct not to) threw `React is not defined` at mount time only
  // under the test runner.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      // Mirrors the "@video-toolkit/lib/*" tsconfig path mapping (see
      // tsconfig.json) so cross-package imports (e.g. reel-config-base's
      // segmentDurationFrames) resolve the same way under vitest/vite.
      '@video-toolkit/lib': fileURLToPath(new URL('..', import.meta.url)),
      // Make React and React DOM available to aliased lib imports
      'react': fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url)),
      // 'remotion' is a declared lib/editor devDependency, installed into
      // lib/editor/node_modules; components under lib/components import it directly
      // but live outside that node_modules ancestry, so Vite can't resolve the bare
      // specifier even when the module is mocked via vi.mock('remotion', ...) —
      // mocking substitutes the module's contents, not the resolution step.
      'remotion': fileURLToPath(new URL('./node_modules/remotion', import.meta.url)),
      // Same problem, same fix, for lib/render/layered-composition-props.ts's
      // `getVideoMetadata` import: `@remotion/media-utils` is a declared
      // lib/editor devDependency (installed for this reason, not for its own
      // sake — lib/editor has no composition of its own), but the importing
      // file lives outside lib/editor's node_modules ancestry. No exports map
      // to worry about here (plain `main`/`types`, unlike `@remotion/transitions`
      // above), so the simple directory alias `remotion` itself uses is enough.
      '@remotion/media-utils': fileURLToPath(new URL('./node_modules/@remotion/media-utils', import.meta.url)),
    },
  },
  // Vite only serves files under the project root by default; the sibling lib
  // packages whose tests we now include live above it.
  server: { fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } },
  test: {
    // Cover the sibling core lib packages too, not just lib/editor: their tests
    // (reel-config-base, theming, transcripts, render) previously sat outside the
    // runner's root and never executed.
    include: [
      '{app,src,host}/**/*.test.{ts,tsx}',
      '../{reel-config-base,theming,transcripts,render}/**/*.test.{ts,tsx}',
    ],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
