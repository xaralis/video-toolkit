import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyToolkitWebpack,
  toolkitAliases,
  resolveToolkitPaths,
} from '@video-toolkit/lib/project/remotion-config';
import { createToolkitVitestConfig } from '@video-toolkit/lib/project/vitest-config';

// A template lives at <repo>/templates/<name>/ or <repo>/projects/<name>/, with
// the toolkit vendored at <repo>/toolkit/ — two hops up in both layouts.
const PROJECT = '/repo/templates/campaign-reels';

describe('resolveToolkitPaths', () => {
  it('finds toolkit/lib and brand-lib two hops above the project', () => {
    expect(resolveToolkitPaths(PROJECT)).toEqual({
      toolkitLib: path.resolve('/repo/toolkit/lib'),
      brandLib: path.resolve('/repo/brand-lib'),
      projectNodeModules: path.resolve(PROJECT, 'node_modules'),
    });
  });
});

describe('toolkitAliases', () => {
  it('maps the core lib alias', () => {
    expect(toolkitAliases(PROJECT)['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
  });

  it('omits @brand-lib unless the brand asks for it', () => {
    // Roost has no brand-lib tier; a dangling alias to a nonexistent directory
    // is a resolution failure waiting for the first import that touches it.
    expect(toolkitAliases(PROJECT)).not.toHaveProperty('@brand-lib');
    expect(toolkitAliases(PROJECT, { brandLib: true })['@brand-lib']).toBe(path.resolve('/repo/brand-lib'));
  });
});

describe('applyToolkitWebpack', () => {
  const fakeConfig = () => {
    const calls: Array<(c: Record<string, any>) => Record<string, any>> = [];
    return {
      calls,
      api: { overrideWebpackConfig: (fn: (c: Record<string, any>) => Record<string, any>) => calls.push(fn) },
    };
  };

  it('registers exactly one webpack override', () => {
    const { calls, api } = fakeConfig();
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod: () => '/z/zod.js' });
    expect(calls).toHaveLength(1);
  });

  it('adds the project node_modules first in resolve.modules', () => {
    // toolkit/lib lives OUTSIDE the project tree, so node resolution walking up
    // from a toolkit file never reaches the project's node_modules — it stops at
    // the filesystem root. This is what makes @remotion/transitions resolvable.
    const { calls, api } = fakeConfig();
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod: () => '/z/zod.js' });
    const out = calls[0]({ resolve: { alias: { existing: '/keep' } } });
    expect(out.resolve.modules[0]).toBe(path.resolve(PROJECT, 'node_modules'));
    expect(out.resolve.modules).toContain('node_modules');
  });

  it('keeps aliases already on the incoming config', () => {
    const { calls, api } = fakeConfig();
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod: () => '/z/zod.js' });
    const out = calls[0]({ resolve: { alias: { existing: '/keep' } } });
    expect(out.resolve.alias.existing).toBe('/keep');
    expect(out.resolve.alias['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
  });

  it('pins zod to one instance, resolved from the PROJECT', () => {
    const { calls, api } = fakeConfig();
    const resolveZod = vi.fn(() => '/repo/templates/campaign-reels/node_modules/zod/index.js');
    applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => true, resolveZod });
    const out = calls[0]({ resolve: {} });
    expect(resolveZod).toHaveBeenCalledWith(PROJECT);
    expect(out.resolve.alias['zod$']).toBe('/repo/templates/campaign-reels/node_modules/zod/index.js');
  });

  it('throws a diagnosable error when toolkit/lib is not where it should be', () => {
    const { api } = fakeConfig();
    expect(() =>
      applyToolkitWebpack(api, { projectRoot: PROJECT, existsSync: () => false, resolveZod: () => '/z' }),
    ).toThrow(/toolkit\/lib not found/);
  });

  it('runs the caller-supplied tailwind wrapper before the alias merge', () => {
    // enableTailwind is @remotion/tailwind-v4's, a BRAND dependency — core takes
    // it as a parameter rather than importing it (core has no remotion deps).
    const { calls, api } = fakeConfig();
    const tailwind = vi.fn((c: Record<string, any>) => ({ ...c, tailwindApplied: true }));
    applyToolkitWebpack(api, {
      projectRoot: PROJECT,
      existsSync: () => true,
      resolveZod: () => '/z',
      tailwind,
    });
    const out = calls[0]({ resolve: {} });
    expect(tailwind).toHaveBeenCalled();
    expect(out.tailwindApplied).toBe(true);
    expect(out.resolve.alias['@video-toolkit/lib']).toBeDefined();
  });
});

describe('createToolkitVitestConfig', () => {
  it('inlines and dedupes zod so lib and src schemas share one module instance', () => {
    // Without this, z.discriminatedUnion cannot recognise literals defined in the
    // lib half: instanceof ZodLiteral fails across duplicate module instances.
    const cfg = createToolkitVitestConfig({ projectRoot: PROJECT }) as any;
    expect(cfg.test.server.deps.inline).toContain('zod');
    expect(cfg.resolve.dedupe).toContain('zod');
  });

  it('aliases the core lib and includes only src tests', () => {
    const cfg = createToolkitVitestConfig({ projectRoot: PROJECT }) as any;
    expect(cfg.resolve.alias['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
    expect(cfg.test.include).toEqual(['src/**/*.test.ts', 'src/**/*.test.tsx']);
  });
});
