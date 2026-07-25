import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEditorViteConfig } from '@video-toolkit/lib/editor/host/vite-config.mts';

const EDITOR_DIR = '/repo/templates/campaign-reels/.editor';
const TEMPLATE = '/repo/templates/campaign-reels';

const cfg = (over: Record<string, unknown> = {}) =>
  createEditorViteConfig({ editorDir: EDITOR_DIR, compositionId: 'X', ...over }) as any;

describe('createEditorViteConfig', () => {
  it('roots Vite at the .editor dir and serves the project public dir', () => {
    expect(cfg().root).toBe(EDITOR_DIR);
    expect(cfg().publicDir).toBe(path.resolve(TEMPLATE, 'public'));
  });

  it('aliases @, the core lib and the timeline deps from the PROJECT node_modules', () => {
    // The timeline component lives in the toolkit submodule, whose node_modules
    // walk cannot reach the project's siblings.
    const a = cfg().resolve.alias;
    expect(a['@']).toBe(path.resolve(TEMPLATE, 'src'));
    expect(a['@video-toolkit/lib']).toBe(path.resolve('/repo/toolkit/lib'));
    expect(a['@xzdarcy/react-timeline-editor']).toBe(path.resolve(TEMPLATE, 'node_modules/@xzdarcy/react-timeline-editor'));
    expect(a['@xzdarcy/timeline-engine']).toBe(path.resolve(TEMPLATE, 'node_modules/@xzdarcy/timeline-engine'));
  });

  it('omits @brand-lib unless asked', () => {
    expect(cfg().resolve.alias).not.toHaveProperty('@brand-lib');
    expect(cfg({ brandLib: true }).resolve.alias['@brand-lib']).toBe(path.resolve('/repo/brand-lib'));
  });

  it('appends the caller plugins before the editor plugin', () => {
    const mine = { name: 'mine' };
    const names = cfg({ plugins: [mine] }).plugins.map((p: any) => p?.name);
    expect(names).toContain('mine');
    expect(names).toContain('video-toolkit-editor');
    expect(names.indexOf('mine')).toBeLessThan(names.indexOf('video-toolkit-editor'));
  });

  it('ships the @remotion/transitions re-resolver as a pre-enforced plugin', () => {
    // lib/render/at-cut-transitions.tsx runtime-imports @remotion/transitions/*
    // from outside the project tree. A plain dir alias breaks the ESM-only
    // subpaths (iris, wipe) that exist only via the package exports map, so this
    // has to be a resolveId hook, not an alias.
    const p = cfg().plugins.find((x: any) => x?.name === 'resolve-remotion-transitions-from-project');
    expect(p.enforce).toBe('pre');
  });

  it('defaults the dev-server port to 3100 and honours an override', () => {
    expect(cfg().server.port).toBe(3100);
    expect(cfg({ port: 3200 }).server.port).toBe(3200);
  });
});
