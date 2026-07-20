import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveDefaultPropsToFile, createSaveHandler } from './save-endpoint';
import { readDefaultProps } from './default-props-writer';

const ROOT = `import { Composition } from 'remotion';
export const Root = () => (
  <Composition id="CampaignReel" component={C} defaultProps={{ topic: 'old', segments: [] }} fps={30} width={1} height={1} />
);
`;

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'reel-editor-'));
  const file = join(dir, 'Root.tsx');
  writeFileSync(file, ROOT, 'utf8');
  return file;
}

describe('saveDefaultPropsToFile', () => {
  it('persists new props to disk and leaves valid, re-readable source', async () => {
    const file = tmpRoot();
    const next = { topic: 'new', segments: [{ id: 's1', type: 'clip', source: 'a.mp4', trimIn: 0, trimOut: 3 }] };
    await saveDefaultPropsToFile(file, next);
    const written = readFileSync(file, 'utf8');
    expect(readDefaultProps(written)).toEqual(next);
    expect(written).toContain("import { Composition } from 'remotion'");
  });
});

describe('createSaveHandler', () => {
  it('resolves the target path and writes props', async () => {
    const file = tmpRoot();
    const handler = createSaveHandler((body) => ({ filePath: file, compositionId: body.compositionId }));
    const res = await handler({ rootPath: file, props: { topic: 'via-handler', segments: [] }, compositionId: 'CampaignReel' });
    expect(res).toEqual({ ok: true });
    expect(readDefaultProps(readFileSync(file, 'utf8'))).toEqual({ topic: 'via-handler', segments: [] });
  });

  it('rejects a malformed body', async () => {
    const handler = createSaveHandler(() => ({ filePath: '/nope' }));
    await expect(handler({ props: {} })).rejects.toThrow(/rootPath/);
  });
});
