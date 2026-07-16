import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'tests/**/*.test.ts',
      '../../lib/transcripts/**/*.test.ts',
      '../../lib/reel-config-base/**/*.test.ts',
    ],
    environment: 'node',
    // Dedupe zod so that schemas defined in ../../lib/reel-config-base share
    // the same module instance as schemas defined in src/config — otherwise
    // z.discriminatedUnion can't recognise the literal types from the lib
    // half (instanceof ZodLiteral fails across module duplicates).
    server: {
      deps: {
        inline: ['zod'],
      },
    },
  },
  resolve: {
    dedupe: ['zod'],
  },
});
