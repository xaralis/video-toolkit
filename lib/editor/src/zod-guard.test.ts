import { describe, expect, it, vi } from 'vitest';
import { warnOnZodMismatch, REQUIRED_ZOD } from '@video-toolkit/lib/project/zod-guard';
import { applyToolkitWebpack } from '@video-toolkit/lib/project/remotion-config';
import { createEditorViteConfig } from '@video-toolkit/lib/editor/host/vite-config.mts';

const run = (version: string | null) => {
  const warn = vi.fn();
  const seen = warnOnZodMismatch('/repo/projects/p', { readVersion: () => version, warn });
  return { warn, seen, message: warn.mock.calls[0]?.[0] as string | undefined };
};

describe('warnOnZodMismatch', () => {
  it('says nothing when the version is exactly the required one', () => {
    const { warn, seen } = run(REQUIRED_ZOD);
    expect(seen).toBe(REQUIRED_ZOD);
    expect(warn).not.toHaveBeenCalled();
  });

  it('says nothing when zod cannot be resolved at all', () => {
    // Not this guard's business: applyToolkitWebpack and createEditorViteConfig
    // both already throw on unresolvable zod, earlier and with a better message.
    const { warn, seen } = run(null);
    expect(seen).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns on a different zod 3, and grades it as hygiene', () => {
    const { warn, message } = run('3.25.76');
    expect(warn).toHaveBeenCalledOnce();
    expect(message).toContain('3.25.76');
    expect(message).toContain(REQUIRED_ZOD);
    expect(message).toContain('hygiene');
  });

  it('warns harder on a different MAJOR, naming it', () => {
    const { message } = run('4.3.6');
    expect(message).toContain('Major 4 is NOT');
    expect(message).not.toContain('hygiene');
  });

  it.each(['3.25.76', '4.3.6'])('NEVER throws — %s only warns', (version) => {
    // The whole point of the file. A hard assertion would turn a routine
    // `git submodule update` into a hard stop on a repo that still renders fine.
    expect(() => run(version)).not.toThrow();
  });

  it('points at the doc that actually owns the decision', () => {
    expect(run('4.3.6').message).toContain('docs/zod-version.md');
  });
});

describe('the guard is wired into both build surfaces', () => {
  // Neither call site can be reached by a brand's tsc, and a guard nobody calls
  // is the same as no guard — so assert the wiring, not just the helper.
  it('applyToolkitWebpack warns without blocking the config it returns', () => {
    const warn = vi.fn();
    const config = { overrideWebpackConfig: vi.fn() };
    expect(() =>
      applyToolkitWebpack(config, {
        projectRoot: '/repo/projects/p',
        existsSync: () => true,
        resolveZod: () => '/fake/zod/index.js',
        zodGuard: { readVersion: () => '4.3.6', warn },
      }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
    expect(config.overrideWebpackConfig).toHaveBeenCalledOnce();
  });

  it('createEditorViteConfig warns without blocking the config it returns', () => {
    const warn = vi.fn();
    const cfg = createEditorViteConfig({
      editorDir: '/repo/templates/t/.editor',
      compositionId: 'X',
      existsSync: () => true,
      resolveZod: () => '/fake/zod/index.js',
      zodGuard: { readVersion: () => '4.3.6', warn },
    }) as Record<string, unknown>;
    expect(warn).toHaveBeenCalledOnce();
    expect(cfg.root).toBe('/repo/templates/t/.editor');
  });

  it('stays silent on both surfaces when the pin is correct', () => {
    const warn = vi.fn();
    applyToolkitWebpack(
      { overrideWebpackConfig: vi.fn() },
      {
        projectRoot: '/repo/projects/p',
        existsSync: () => true,
        resolveZod: () => '/fake/zod/index.js',
        zodGuard: { readVersion: () => REQUIRED_ZOD, warn },
      },
    );
    createEditorViteConfig({
      editorDir: '/repo/templates/t/.editor',
      compositionId: 'X',
      existsSync: () => true,
      resolveZod: () => '/fake/zod/index.js',
      zodGuard: { readVersion: () => REQUIRED_ZOD, warn },
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
